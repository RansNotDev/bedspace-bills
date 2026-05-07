const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Bedspace = require('../models/Bedspace');
const { protect, staffOnly, superAdminOnly } = require('../middleware/authMiddleware');
const { sendAdminPasswordResetOtp } = require('../utils/emailSender');
const {
  isStaffRole,
  isSuperAdminRole,
  effectiveTenantPortalVisibility,
} = require('../utils/roles');

const ADMIN_LOCK_AFTER = 3;
const OTP_TTL_MS = 15 * 60 * 1000;

/**
 * JWT includes optional `bedspaceId` for staff: super admin after choosing a property,
 * or mini admin (fixed to their property). Tenants omit bedspace in the token.
 * @param {*} user persisted user doc
 * @param {import('mongoose').Types.ObjectId|string|null|undefined} superSelectedBedspaceId — for landlord only
 */
function signToken(user, superSelectedBedspaceId) {
  let bedspaceId = null;

  if (isSuperAdminRole(user.role)) {
    if (superSelectedBedspaceId !== undefined && superSelectedBedspaceId !== null) {
      bedspaceId = superSelectedBedspaceId.toString();
    }
  } else if (user.role === 'mini_admin' && user.bedspaceId) {
    bedspaceId = user.bedspaceId.toString();
  }

  return jwt.sign(
    { id: user._id, role: user.role, bedspaceId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function userResponse(user, extras = {}) {
  return {
    _id: user._id,
    nickname: user.nickname,
    role: user.role,
    roomType: user.roomType,
    moveInDate: user.moveInDate,
    email: user.email,
    bedspaceId: user.bedspaceId || null,
    monthlyRent: user.monthlyRent != null ? user.monthlyRent : 0,
    miniAdminPermissions: user.miniAdminPermissions,
    tenantPortalVisibility: effectiveTenantPortalVisibility(user),
    ...extras,
  };
}

/**
 * POST /api/auth/preflight
 * Whether this nickname needs a password (landlord or mini admin).
 */
router.post('/preflight', async (req, res) => {
  try {
    const nick = req.body.nickname && String(req.body.nickname).trim();
    if (!nick) {
      return res.status(400).json({ message: 'Nickname is required' });
    }

    const user = await User.findOne({ nickname: nick, isActive: true });
    if (!user) {
      return res.json({ found: false, requiresPassword: false });
    }

    return res.json({
      found: true,
      requiresPassword: isStaffRole(user.role) && user.role !== 'tenant',
    });
  } catch (err) {
    console.error('Preflight error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/auth/login
 * Tenants: nickname only. Landlord / mini admin: nickname + password.
 */
router.post('/login', async (req, res) => {
  try {
    const nickname = req.body.nickname && String(req.body.nickname).trim();
    const password = req.body.password;

    if (!nickname) {
      return res.status(400).json({ message: 'Nickname is required' });
    }

    const user = await User.findOne({ nickname, isActive: true }).select(
      '+passwordHash +adminLoginFailures +adminResetOtpHash +adminResetOtpExpires'
    );

    if (!user) {
      return res.status(401).json({ message: 'Nickname not found or account inactive' });
    }

    if (user.role === 'tenant') {
      if (!user.bedspaceId) {
        return res.status(403).json({
          message: 'Tenant is not assigned to a bedspace. Ask your landlord to fix this in the admin panel.',
        });
      }
      const token = signToken(user);
      return res.json({ token, user: userResponse(user) });
    }

    if (!isStaffRole(user.role)) {
      return res.status(403).json({ message: 'This account cannot sign in here' });
    }

    if (!password || !String(password).length) {
      return res.status(400).json({ message: 'Password required for staff login' });
    }

    if (user.role === 'mini_admin' && !user.bedspaceId) {
      return res.status(403).json({
        message: 'Mini admin is not assigned to a bedspace. Ask your landlord.',
      });
    }

    if (!user.passwordHash) {
      return res.status(503).json({
        message:
          'Password not set for this staff account. Your landlord must set a password or re-create the account.',
      });
    }

    if (user.adminLoginFailures >= ADMIN_LOCK_AFTER) {
      return res.status(403).json({
        code: 'ADMIN_LOCKED',
        message: 'Too many failed password attempts. Use “Reset password” below.',
        failures: user.adminLoginFailures,
      });
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash);

    if (!ok) {
      user.adminLoginFailures = (user.adminLoginFailures || 0) + 1;
      await user.save();

      if (user.adminLoginFailures >= ADMIN_LOCK_AFTER) {
        return res.status(403).json({
          code: 'ADMIN_LOCKED',
          message: 'Too many failed password attempts. Use “Reset password” below.',
          failures: user.adminLoginFailures,
        });
      }

      return res.status(401).json({
        message: 'Invalid password',
        failures: user.adminLoginFailures,
        attemptsRemaining: ADMIN_LOCK_AFTER - user.adminLoginFailures,
      });
    }

    user.adminLoginFailures = 0;
    user.adminResetOtpHash = null;
    user.adminResetOtpExpires = null;
    await user.save();

    if (isSuperAdminRole(user.role)) {
      const bedspaces = await Bedspace.find({ ownerId: user._id }).sort({ name: 1 }).lean();

      let selectedId = null;
      let activeBedspaceName = null;
      if (bedspaces.length === 1) {
        selectedId = bedspaces[0]._id;
        activeBedspaceName = bedspaces[0].name;
      }

      const token = signToken(user, selectedId);
      const needsBedspaceSelection = bedspaces.length > 1 && !selectedId;

      return res.json({
        token,
        user: userResponse(user, {
          bedspaces: bedspaces.map((b) => ({ _id: b._id, name: b.name, locationName: b.locationName || '' })),
          needsBedspaceSelection,
          activeBedspaceId: selectedId ? String(selectedId) : null,
          activeBedspaceName,
        }),
      });
    }

    // mini_admin
    const token = signToken(user);
    let spaceName = null;
    if (user.bedspaceId) {
      const b = await Bedspace.findById(user.bedspaceId).select('name').lean();
      spaceName = b?.name || null;
    }
    return res.json({
      token,
      user: userResponse(user, {
        needsBedspaceSelection: false,
        activeBedspaceId: user.bedspaceId ? String(user.bedspaceId) : null,
        activeBedspaceName: spaceName,
      }),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/auth/select-bedspace
 * Landlord only: issue a new JWT scoped to a bedspace they own.
 * Body: { bedspaceId }
 */
router.post('/select-bedspace', protect, superAdminOnly, async (req, res) => {
  try {
    const raw = req.body.bedspaceId && String(req.body.bedspaceId).trim();
    if (!raw || !mongoose.isValidObjectId(raw)) {
      return res.status(400).json({ message: 'Valid bedspaceId is required' });
    }

    const bed = await Bedspace.findOne({ _id: raw, ownerId: req.user._id });
    if (!bed) {
      return res.status(404).json({ message: 'Bedspace not found' });
    }

    const bedspaces = await Bedspace.find({ ownerId: req.user._id }).sort({ name: 1 }).lean();
    const token = signToken(req.user, bed._id);

    res.json({
      token,
      user: userResponse(req.user, {
        bedspaces: bedspaces.map((b) => ({ _id: b._id, name: b.name, locationName: b.locationName || '' })),
        needsBedspaceSelection: false,
        activeBedspaceId: String(bed._id),
        activeBedspaceName: bed.name,
      }),
    });
  } catch (err) {
    console.error('Select bedspace error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

const STAFF_ROLES_WITH_LOCKOUT = ['admin', 'super_admin', 'mini_admin'];

/**
 * POST /api/auth/admin/request-reset-otp
 * After lockout: email a one-time code (landlord or mini admin).
 */
router.post('/admin/request-reset-otp', async (req, res) => {
  try {
    const nickname = req.body.nickname && String(req.body.nickname).trim();
    if (!nickname) {
      return res.status(400).json({ message: 'Nickname is required' });
    }

    const user = await User.findOne({
      nickname,
      isActive: true,
      role: { $in: STAFF_ROLES_WITH_LOCKOUT },
    }).select('+adminLoginFailures +adminResetOtpHash +adminResetOtpExpires +passwordHash');

    if (!user || !user.passwordHash) {
      return res.status(404).json({ message: 'Staff account not found' });
    }

    if (user.adminLoginFailures < ADMIN_LOCK_AFTER) {
      return res.status(400).json({
        message: `Reset is only available after ${ADMIN_LOCK_AFTER} failed password attempts.`,
      });
    }

    const toEmail = process.env.ADMIN_PASSWORD_RESET_EMAIL || user.email;
    if (!toEmail) {
      return res.status(400).json({
        message:
          'No email for reset. Set ADMIN_PASSWORD_RESET_EMAIL in .env or add an email to this account.',
      });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const hash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex');

    user.adminResetOtpHash = hash;
    user.adminResetOtpExpires = new Date(Date.now() + OTP_TTL_MS);
    await user.save();

    await sendAdminPasswordResetOtp({ toEmail, otp, nickname: user.nickname });

    res.json({
      message: `A 6-digit code was sent to ${toEmail.replace(/(.{2}).*(@.*)/, '$1***$2')}. It expires in 15 minutes.`,
    });
  } catch (err) {
    console.error('Request reset OTP error:', err);
    res.status(500).json({ message: err.message || 'Could not send reset email' });
  }
});

/**
 * POST /api/auth/admin/reset-password
 */
router.post('/admin/reset-password', async (req, res) => {
  try {
    const nickname = req.body.nickname && String(req.body.nickname).trim();
    const otp = req.body.otp && String(req.body.otp).trim();
    const newPassword = req.body.newPassword && String(req.body.newPassword);

    if (!nickname || !otp || !newPassword) {
      return res.status(400).json({ message: 'Nickname, OTP, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const user = await User.findOne({
      nickname,
      isActive: true,
      role: { $in: STAFF_ROLES_WITH_LOCKOUT },
    }).select('+passwordHash +adminLoginFailures +adminResetOtpHash +adminResetOtpExpires');

    if (!user) {
      return res.status(404).json({ message: 'Staff account not found' });
    }

    if (!user.adminResetOtpHash || !user.adminResetOtpExpires) {
      return res.status(400).json({ message: 'No reset code pending. Request a new code first.' });
    }

    if (user.adminResetOtpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Reset code expired. Request a new one.' });
    }

    const verifyHash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex');
    if (verifyHash !== user.adminResetOtpHash) {
      return res.status(400).json({ message: 'Invalid code' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.adminLoginFailures = 0;
    user.adminResetOtpHash = null;
    user.adminResetOtpExpires = null;
    await user.save();

    res.json({ message: 'Password updated. You can sign in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/auth/change-password
 * Logged-in staff (landlord or mini admin).
 */
router.post('/change-password', protect, staffOnly, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !user.passwordHash) {
      return res.status(400).json({ message: 'Password not set on this account' });
    }

    const ok = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', protect, async (req, res) => {
  try {
    const payload = {
      _id: req.user._id,
      nickname: req.user.nickname,
      role: req.user.role,
      roomType: req.user.roomType,
      moveInDate: req.user.moveInDate,
      email: req.user.email,
      isActive: req.user.isActive,
      bedspaceId: req.user.bedspaceId || null,
      monthlyRent: req.user.monthlyRent != null ? req.user.monthlyRent : 0,
      miniAdminPermissions: req.user.miniAdminPermissions,
      tenantPortalVisibility: effectiveTenantPortalVisibility(req.user),
      activeBedspaceId: req.bedspaceContextId ? String(req.bedspaceContextId) : null,
    };

    if (isSuperAdminRole(req.user.role)) {
      const list = await Bedspace.find({ ownerId: req.user._id }).sort({ name: 1 }).lean();
      payload.bedspaces = list.map((b) => ({
        _id: b._id,
        name: b.name,
        locationName: b.locationName || '',
      }));
      payload.needsBedspaceSelection = list.length > 1 && !req.bedspaceContextId;
    }

    res.json(payload);
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
