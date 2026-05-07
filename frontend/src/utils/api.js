import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — redirect to login (except on auth endpoints)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      if (
        url.includes('/auth/login') ||
        url.includes('/auth/preflight') ||
        url.includes('/auth/admin/') ||
        url.includes('/auth/change-password')
      ) {
        return Promise.reject(error);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authPreflight = (nickname) => api.post('/auth/preflight', { nickname });
export const login = (nickname, password) =>
  api.post('/auth/login', password !== undefined ? { nickname, password } : { nickname });
export const selectBedspace = (bedspaceId) => api.post('/auth/select-bedspace', { bedspaceId });
export const requestAdminResetOtp = (nickname) =>
  api.post('/auth/admin/request-reset-otp', { nickname });
export const resetAdminPassword = (nickname, otp, newPassword) =>
  api.post('/auth/admin/reset-password', { nickname, otp, newPassword });
export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', { currentPassword, newPassword });
export const getMe = () => api.get('/auth/me');

// ─── ADMIN ────────────────────────────────────────────────────────────────────
export const getTenants = () => api.get('/admin/tenants');
export const createTenant = (data) => api.post('/admin/tenants', data);
export const updateTenant = (id, data) => api.put(`/admin/tenants/${id}`, data);
export const deleteTenant = (id) => api.delete(`/admin/tenants/${id}`);
export const getDashboardSummary = () => api.get('/admin/dashboard-summary');
export const getBillCycles = () => api.get('/admin/bill-cycles');
export const getBillCycle = (id) => api.get(`/admin/bill-cycles/${id}`);
export const updateBillCycle = (id, data) => api.put(`/admin/bill-cycles/${id}`, data);
export const markTenantBillPaid = (id, isPaid) =>
  api.patch(`/admin/tenant-bills/${id}/mark-paid`, { isPaid });
export const patchTenantBillAdjustments = (id, data) =>
  api.patch(`/admin/tenant-bills/${id}/adjustments`, data);

// ─── SUPER (LANDLORD) ─────────────────────────────────────────────────────────
export const getSuperBedspaces = () => api.get('/super/bedspaces');
/** Landlord: all properties’ cycles + tenants for merged calendar */
export const getSuperCalendarData = () => api.get('/super/calendar-data');
/** Landlord: chart series per property + merged-by-month for overview */
export const getSuperDashboardOverview = () => api.get('/super/dashboard-overview');
export const createSuperBedspace = (payload) =>
  api.post('/super/bedspaces', typeof payload === 'string' ? { name: payload } : payload);
export const updateSuperBedspace = (id, data) => api.put(`/super/bedspaces/${id}`, data);
export const deleteSuperBedspace = (id) => api.delete(`/super/bedspaces/${id}`);
export const getSuperBedspacePeople = (bedspaceId) => api.get(`/super/bedspaces/${bedspaceId}/people`);
export const createMiniAdmin = (bedspaceId, payload) =>
  api.post(`/super/bedspaces/${bedspaceId}/mini-admins`, payload);
export const updateMiniAdmin = (userId, payload) => api.put(`/super/mini-admins/${userId}`, payload);
export const updateTenantPortal = (userId, tenantPortalVisibility) =>
  api.put(`/super/tenants/${userId}/portal`, { tenantPortalVisibility });

// ─── BILLS ────────────────────────────────────────────────────────────────────
export const generateBillCycle = (data) => api.post('/bills/generate', data);
export const sendPaymentLink = (tenantBillId) =>
  api.post(`/bills/send-link/${tenantBillId}`);
export const getMyBills = () => api.get('/bills/my-bills');
export const getCurrentBill = () => api.get('/bills/my-bills/current');

// ─── PAYMENT LINK (public) ────────────────────────────────────────────────────
export const getPaymentLinkData = (token) =>
  axios.get(`${API_URL}/api/payment/${token}`);

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
export const uploadQRCode = (cycleId, type, file) => {
  const formData = new FormData();
  formData.append('qr', file);
  return api.post(`/upload/qr/${cycleId}/${type}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadReceipt = (tenantBillId, file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  return api.post(`/upload/receipt/${tenantBillId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const uploadReceiptPublic = (token, file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  return axios.post(`${API_URL}/api/upload/receipt-public/${token}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export default api;
