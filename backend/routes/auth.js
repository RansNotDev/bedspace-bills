const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { sendAdminPasswordResetOtp } = require('../utils/emailSender');

const ADMIN_LOCK_AFTER = 3;
const OTP_TTL_MS = 15 * 60 * 1000;

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function userResponse(user) {
  return {
    _id: user._id,
    nickname: user.nickname,
    role: user.role,
    roomType: user.roomType,
    moveInDate: user.moveInDate,
    email: user.email,
  };
}

/**
 * POST /api/auth/preflight
 * Whether this nickname needs a password (admin / landlord only).
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
      requiresPassword: user.role === 'admin',
    });
  } catch (err) {
    console.error('Preflight error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/auth/login
 * Tenants: nickname only. Admin: nickname + password.
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
      const token = signToken(user);
      return res.json({ token, user: userResponse(user) });
    }

    // Admin
    if (!password || !String(password).length) {
      return res.status(400).json({ message: 'Password required for landlord login' });
    }

    if (!user.passwordHash) {
      return res.status(503).json({
        message:
          'Landlord password not set. Run: node scripts/seed.js (set ADMIN_INITIAL_PASSWORD in .env first).',
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

    const token = signToken(user);
    res.json({ token, user: userResponse(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/auth/admin/request-reset-otp
 * After lockout: email a one-time code to ADMIN_PASSWORD_RESET_EMAIL or the admin user's email.
 */
router.post('/admin/request-reset-otp', async (req, res) => {
  try {
    const nickname = req.body.nickname && String(req.body.nickname).trim();
    if (!nickname) {
      return res.status(400).json({ message: 'Nickname is required' });
    }

    const user = await User.findOne({ nickname, role: 'admin', isActive: true }).select(
      '+adminLoginFailures +adminResetOtpHash +adminResetOtpExpires +passwordHash'
    );

    if (!user || !user.passwordHash) {
      return res.status(404).json({ message: 'Landlord account not found' });
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
          'No email for reset. Set ADMIN_PASSWORD_RESET_EMAIL in .env or add an email to the landlord account in the database.',
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
 * Complete reset with OTP + new password (after lockout).
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

    const user = await User.findOne({ nickname, role: 'admin', isActive: true }).select(
      '+passwordHash +adminLoginFailures +adminResetOtpHash +adminResetOtpExpires'
    );

    if (!user) {
      return res.status(404).json({ message: 'Landlord account not found' });
    }

    if (!user.adminResetOtpHash || !user.adminResetOtpExpires) {
      return res.status(400).json({ message: 'No reset code pending. Request a new code first.' });
    }

    if (user.adminResetOtpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Reset code expired. Request a new one.' });
    }

    const hash = crypto.createHmac('sha256', process.env.JWT_SECRET).update(otp).digest('hex');
    if (hash !== user.adminResetOtpHash) {
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
 * Logged-in landlord: change password whenalready signed in.
 */
router.post('/change-password', protect, adminOnly, async (req, res) => {
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
  res.json({
    _id: req.user._id,
    nickname: req.user.nickname,
    role: req.user.role,
    roomType: req.user.roomType,
    moveInDate: req.user.moveInDate,
    email: req.user.email,
    isActive: req.user.isActive,
  });
});

module.exports = router;
