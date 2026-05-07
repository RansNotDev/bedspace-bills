/** Helpers for roles and effective mini-admin permissions (kept in sync with backend defaults). */

export const DEFAULT_MINI_ADMIN_PERMISSIONS = {
  manageTenants: true,
  manageBillCycles: true,
  generateBills: true,
  sendPaymentLinks: true,
  markPaid: true,
  uploadQR: true,
  viewReports: true,
  viewCalendar: true,
};

export function isSuperAdmin(user) {
  if (!user) return false;
  return user.role === 'super_admin' || user.role === 'admin';
}

export function isMiniAdmin(user) {
  return user?.role === 'mini_admin';
}

export function isStaff(user) {
  return isSuperAdmin(user) || isMiniAdmin(user);
}

/** Landlord sees full powers; mini admin uses merged permission flags. */
export function effectiveMiniPerms(user) {
  if (!user || isSuperAdmin(user)) {
    return { ...DEFAULT_MINI_ADMIN_PERMISSIONS };
  }
  if (!isMiniAdmin(user)) {
    return { ...DEFAULT_MINI_ADMIN_PERMISSIONS };
  }
  const stored = user.miniAdminPermissions || {};
  const out = { ...DEFAULT_MINI_ADMIN_PERMISSIONS };
  for (const key of Object.keys(DEFAULT_MINI_ADMIN_PERMISSIONS)) {
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      out[key] = !!stored[key];
    }
  }
  return out;
}

/** Top sidebar: dashboard, calendar, rules, reports (billing is listed under Property). */
export function getStaffMainNav(user) {
  const p = effectiveMiniPerms(user);
  const items = [{ path: '/admin', label: 'Dashboard', icon: '📊' }];
  if (p.viewCalendar) {
    items.push({ path: '/admin/calendar', label: 'Calendar', icon: '📅' });
  }
  items.push({ path: '/admin/rules', label: 'Rules', icon: '📋' });
  if (p.viewReports) {
    items.push({ path: '/admin/reports', label: 'Reports', icon: '📄' });
  }
  return items;
}

/**
 * Property-scoped billing links (same JWT bedspace as Dashboard). Respects mini-admin permissions.
 */
export function getStaffBillingNav(user) {
  const p = effectiveMiniPerms(user);
  const items = [];
  if (p.generateBills) {
    items.push({ path: '/admin/billing/generate', label: 'Generate cycle', icon: '⚡' });
  }
  if (p.manageBillCycles) {
    items.push({ path: '/admin/billing/electricity', label: 'Electricity', icon: '⚡' });
    items.push({ path: '/admin/billing/water', label: 'Water', icon: '💧' });
    items.push({ path: '/admin/billing/drinking-trash', label: 'Drinking water & trash', icon: '🚰' });
    items.push({ path: '/admin/billing/details', label: 'All tenant bills', icon: '📋' });
  }
  if (p.uploadQR) {
    items.push({ path: '/admin/billing/gcash-electricity', label: 'GCash · electricity', icon: '📱' });
    items.push({ path: '/admin/billing/gcash-water', label: 'GCash · water', icon: '📱' });
    items.push({ path: '/admin/billing/gcash-pools', label: 'GCash · drinks & trash', icon: '📱' });
  }
  return items;
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
