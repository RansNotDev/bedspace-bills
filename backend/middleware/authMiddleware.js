const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { isSuperAdminRole, isStaffRole, effectiveMiniAdminPermissions } = require('../utils/roles');

// Verify JWT and attach user + bedspace context from the token payload
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-__v');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    req.user = user;
    req.tokenPayload = decoded;

    const bid = decoded.bedspaceId;
    req.bedspaceContextId =
      bid && mongoose.isValidObjectId(bid) ? new mongoose.Types.ObjectId(bid) : null;

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token invalid' });
  }
};

/** Landlord (super) or mini admin — anything that can open the staff dashboard */
const staffOnly = (req, res, next) => {
  if (req.user && isStaffRole(req.user.role)) {
    return next();
  }
  return res.status(403).json({ message: 'Staff access required' });
};

/** Landlord only: manage bedspaces, create mini admins, set tenant visibility */
const superAdminOnly = (req, res, next) => {
  if (req.user && isSuperAdminRole(req.user.role)) {
    return next();
  }
  return res.status(403).json({ message: 'Landlord access required' });
};

/**
 * Staff routes that are scoped to one bedspace must call this after `protect` + `staffOnly`.
 * Super admins get `bedspaceContextId` only after they pick a bedspace (JWT includes it).
 */
const requireBedspaceContext = (req, res, next) => {
  if (!req.bedspaceContextId) {
    return res.status(403).json({
      code: 'BEDSPACE_REQUIRED',
      message: 'Choose a bedspace to continue',
    });
  }
  next();
};

/**
 * For mini admins: checks one permission flag (landlord always passes).
 * @param {string} permissionKey — key on miniAdminPermissions / defaults
 */
function requireMiniAdminPermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }
    if (isSuperAdminRole(req.user.role)) {
      return next();
    }
    if (req.user.role !== 'mini_admin') {
      return res.status(403).json({ message: 'Mini admin access required' });
    }
    const perms = effectiveMiniAdminPermissions(req.user);
    if (!perms[permissionKey]) {
      return res.status(403).json({ message: 'You do not have permission for this action' });
    }
    next();
  };
}

/** @deprecated Use staffOnly — kept for files not yet migrated */
const adminOnly = staffOnly;

module.exports = {
  protect,
  staffOnly,
  adminOnly,
  superAdminOnly,
  requireBedspaceContext,
  requireMiniAdminPermission,
};
