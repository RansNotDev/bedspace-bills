/**
 * Role helpers for landlord (super admin), mini admin, and tenant.
 * Legacy `admin` in the database is treated the same as `super_admin`.
 */

const LEGACY_ADMIN = 'admin';
const SUPER_ADMIN = 'super_admin';
const MINI_ADMIN = 'mini_admin';
const TENANT = 'tenant';

/** @param {string} role */
function isSuperAdminRole(role) {
  return role === SUPER_ADMIN || role === LEGACY_ADMIN;
}

/** @param {string} role */
function isStaffRole(role) {
  return isSuperAdminRole(role) || role === MINI_ADMIN;
}

const DEFAULT_MINI_ADMIN_PERMISSIONS = {
  manageTenants: true,
  manageBillCycles: true,
  generateBills: true,
  sendPaymentLinks: true,
  markPaid: true,
  uploadQR: true,
  viewReports: true,
  viewCalendar: true,
};

const DEFAULT_TENANT_PORTAL_VISIBILITY = {
  showCurrentBill: true,
  showBillHistory: true,
  showPaymentUpload: true,
};

/**
 * Merges stored permission object with defaults (missing keys default to allowed / visible).
 * @param {Record<string, boolean> | null | undefined} stored
 * @param {Record<string, boolean>} defaults
 */
function mergePermissionMap(stored, defaults) {
  const out = { ...defaults };
  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(defaults)) {
      if (Object.prototype.hasOwnProperty.call(stored, key)) {
        out[key] = !!stored[key];
      }
    }
  }
  return out;
}

/**
 * Effective mini-admin permissions for middleware (super admin always passes separately).
 * @param {import('mongoose').Document | null} userDoc
 */
function effectiveMiniAdminPermissions(userDoc) {
  if (!userDoc || userDoc.role !== MINI_ADMIN) {
    return { ...DEFAULT_MINI_ADMIN_PERMISSIONS };
  }
  return mergePermissionMap(userDoc.miniAdminPermissions, DEFAULT_MINI_ADMIN_PERMISSIONS);
}

/**
 * @param {import('mongoose').Document | null} userDoc
 */
function effectiveTenantPortalVisibility(userDoc) {
  if (!userDoc || userDoc.role !== TENANT) {
    return { ...DEFAULT_TENANT_PORTAL_VISIBILITY };
  }
  return mergePermissionMap(userDoc.tenantPortalVisibility, DEFAULT_TENANT_PORTAL_VISIBILITY);
}

module.exports = {
  LEGACY_ADMIN,
  SUPER_ADMIN,
  MINI_ADMIN,
  TENANT,
  isSuperAdminRole,
  isStaffRole,
  DEFAULT_MINI_ADMIN_PERMISSIONS,
  DEFAULT_TENANT_PORTAL_VISIBILITY,
  mergePermissionMap,
  effectiveMiniAdminPermissions,
  effectiveTenantPortalVisibility,
};
