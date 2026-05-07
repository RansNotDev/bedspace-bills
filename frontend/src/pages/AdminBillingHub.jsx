import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NavLink, Outlet, Navigate, useNavigate, useOutletContext, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import AdminTenantBillCard from '../components/AdminTenantBillCard';
import {
  getBillCycles,
  getBillCycle,
  generateBillCycle,
  sendPaymentLink,
  markTenantBillPaid,
  updateBillCycle,
  uploadQRCode,
  changePassword,
} from '../utils/api';
import { getStaffBillingNav, getStoredUser, isSuperAdmin } from '../utils/authHelpers';
import { formatPHP, getMonthLabel, copyToClipboard, getCurrentMonthYear, CURRENCY_NOTE } from '../utils/helpers';

/** Redirect /admin/billing → first section the user may open */
export function BillingIndexRedirect() {
  const user = getStoredUser();
  const items = getStaffBillingNav(user);
  if (items.length) return <Navigate to={items[0].path} replace />;
  return <Navigate to="/admin" replace />;
}

export default function AdminBillingHub() {
  const dashUser = getStoredUser();
  const navigate = useNavigate();

  const { month: curMonth, year: curYear } = getCurrentMonthYear();
  const [genForm, setGenForm] = useState({
    month: curMonth,
    year: curYear,
    electricityTotal: '',
    waterBill: '',
    drinkingWater: 100,
    trashBags: 100,
    deadline: '',
    gcashNumbers: { electricity: '', water: '', others: '' },
  });

  const [gcashForm, setGcashForm] = useState({
    electricity: '',
    water: '',
    others: '',
  });
  const [gcashQRFiles, setGcashQRFiles] = useState({
    electricity: null,
    water: null,
    others: null,
  });

  const [billCycles, setBillCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [cycleDetail, setCycleDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdNew2, setPwdNew2] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const propertyHeadline = useMemo(() => {
    if (dashUser?.activeBedspaceName) return dashUser.activeBedspaceName;
    return 'This property';
  }, [dashUser?.activeBedspaceName]);

  const loadCyclesOnly = useCallback(async () => {
    const cyclesRes = await getBillCycles();
    setBillCycles(cyclesRes.data);
    if (cyclesRes.data.length > 0) {
      setSelectedCycleId((prev) => prev || cyclesRes.data[0]._id);
    }
  }, []);

  const loadData = useCallback(async () => {
    await loadCyclesOnly();
  }, [loadCyclesOnly]);

  const loadCycleDetail = useCallback(async (id) => {
    try {
      const { data } = await getBillCycle(id);
      setCycleDetail(data);
      setGcashForm({
        electricity: data.cycle.gcashNumbers?.electricity || '',
        water: data.cycle.gcashNumbers?.water || '',
        others: data.cycle.gcashNumbers?.others || '',
      });
    } catch {
      toast.error('Failed to load bill cycle details');
    }
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (isSuperAdmin(u) && (!u?.bedspaces || u.bedspaces.length === 0)) return;
    if (isSuperAdmin(u) && u.needsBedspaceSelection) return;
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedCycleId) loadCycleDetail(selectedCycleId);
  }, [selectedCycleId, loadCycleDetail]);

  const handleBillAdjustSaved = useCallback(() => {
    if (selectedCycleId) loadCycleDetail(selectedCycleId);
    loadData();
  }, [selectedCycleId, loadCycleDetail, loadData]);

  const { unpaidBills, paidBills } = useMemo(() => {
    const all = cycleDetail?.tenantBills;
    if (!all?.length) return { unpaidBills: [], paidBills: [] };
    return {
      unpaidBills: all.filter((b) => b.isPaid !== true),
      paidBills: all.filter((b) => b.isPaid === true),
    };
  }, [cycleDetail]);

  const handleGenerateBill = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await generateBillCycle(genForm);
      toast.success(`Bill cycle for ${getMonthLabel(genForm.month, genForm.year)} generated!`);
      const { month: nextM, year: nextY } = getCurrentMonthYear();
      setGenForm({
        month: nextM,
        year: nextY,
        electricityTotal: '',
        waterBill: '',
        drinkingWater: 100,
        trashBags: 100,
        deadline: '',
        gcashNumbers: { electricity: '', water: '', others: '' },
      });
      await loadData();
      setSelectedCycleId(data.cycle._id);
      navigate('/admin/billing/details');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate bill cycle');
    } finally {
      setLoading(false);
    }
  };

  const handleSendLink = async (tenantBillId) => {
    try {
      const { data } = await sendPaymentLink(tenantBillId);
      if (data.sentViaEmail) {
        toast.success(data.message);
      } else {
        await copyToClipboard(data.paymentLinkUrl);
        toast.info('No email on file. Link copied to clipboard!');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send payment link');
    }
  };

  const handleMarkPaid = async (billId, currentStatus) => {
    try {
      await markTenantBillPaid(billId, !currentStatus);
      toast.success(`Marked as ${!currentStatus ? 'paid' : 'unpaid'}`);
      await loadCycleDetail(selectedCycleId);
      loadData();
    } catch {
      toast.error('Failed to update payment status');
    }
  };

  const handleSaveGcashType = async (type) => {
    if (!selectedCycleId) return;
    setLoading(true);
    try {
      const patch = {};
      if (type === 'electricity') patch['gcashNumbers.electricity'] = gcashForm.electricity;
      if (type === 'water') patch['gcashNumbers.water'] = gcashForm.water;
      if (type === 'others') patch['gcashNumbers.others'] = gcashForm.others;
      await updateBillCycle(selectedCycleId, patch);
      if (gcashQRFiles[type]) {
        await uploadQRCode(selectedCycleId, type, gcashQRFiles[type]);
      }
      toast.success('Saved');
      loadCycleDetail(selectedCycleId);
      setGcashQRFiles((prev) => ({ ...prev, [type]: null }));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save GCash info');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwdNew !== pwdNew2) {
      toast.error('New passwords do not match');
      return;
    }
    if (pwdNew.length < 8) {
      toast.error('At least 8 characters');
      return;
    }
    setPwdSaving(true);
    try {
      await changePassword(pwdCurrent, pwdNew);
      toast.success('Password updated');
      setPwdModalOpen(false);
      setPwdCurrent('');
      setPwdNew('');
      setPwdNew2('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change password');
    } finally {
      setPwdSaving(false);
    }
  };

  const billingNav = useMemo(() => getStaffBillingNav(dashUser), [dashUser]);

  const outletContext = {
    propertyHeadline,
    genForm,
    setGenForm,
    handleGenerateBill,
    loading,
    billCycles,
    selectedCycleId,
    setSelectedCycleId,
    cycleDetail,
    unpaidBills,
    paidBills,
    handleSendLink,
    handleMarkPaid,
    handleBillAdjustSaved,
    gcashForm,
    setGcashForm,
    gcashQRFiles,
    setGcashQRFiles,
    handleSaveGcashType,
  };

  if (billingNav.length === 0) {
    return (
      <Layout>
        <div className="card text-center py-10 text-gray-600">
          Your account does not include billing tasks for this property.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-500 text-sm mt-1">Generate cycles, tenant bills, and GCash — for {propertyHeadline}</p>
        </div>
        <button
          type="button"
          onClick={() => setPwdModalOpen(true)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg border border-blue-200 bg-white"
        >
          Change password
        </button>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
        {billingNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <Outlet context={outletContext} />

      {pwdModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={() => !pwdSaving && setPwdModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Change password</h2>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="label">Current password</label>
                <input
                  type="password"
                  className="input"
                  value={pwdCurrent}
                  onChange={(e) => setPwdCurrent(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div>
                <label className="label">New password</label>
                <input
                  type="password"
                  className="input"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="label">Confirm new password</label>
                <input
                  type="password"
                  className="input"
                  value={pwdNew2}
                  onChange={(e) => setPwdNew2(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  disabled={pwdSaving}
                  onClick={() => setPwdModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={pwdSaving}>
                  {pwdSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export function BillingGeneratePage() {
  const {
    genForm,
    setGenForm,
    handleGenerateBill,
    loading,
  } = useOutletContext();

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold">Generate monthly bill cycle</h2>
      <p className="text-xs text-gray-500">{CURRENCY_NOTE}</p>
      <form onSubmit={handleGenerateBill} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Month *</label>
            <select
              className="input"
              value={genForm.month}
              onChange={(e) => setGenForm({ ...genForm, month: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i).toLocaleString('en-PH', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year *</label>
            <input
              type="number"
              className="input"
              value={genForm.year}
              onChange={(e) => setGenForm({ ...genForm, year: Number(e.target.value) })}
              min={2020}
              max={2099}
            />
          </div>
        </div>

        <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">⚡ Electricity bill</h3>
          <p className="text-xs text-amber-900/80">House electricity meter total for the month (split by aircon rules).</p>
          <div>
            <label className="label">Electricity total (PHP) *</label>
            <input
              type="number"
              className="input"
              value={genForm.electricityTotal}
              onChange={(e) => setGenForm({ ...genForm, electricityTotal: Number(e.target.value) })}
              placeholder="e.g. 3000"
              min={0}
              step="0.01"
              required
            />
          </div>
        </div>

        <div className="rounded-xl border-2 border-cyan-200 bg-cyan-50/40 p-4 space-y-3">
          <h3 className="text-sm font-bold text-cyan-950 flex items-center gap-2">💧 Water bill</h3>
          <p className="text-xs text-cyan-900/80">Shared water bill for the month (split equally among all tenants).</p>
          <div>
            <label className="label">Water bill (PHP) *</label>
            <input
              type="number"
              className="input"
              value={genForm.waterBill}
              onChange={(e) => setGenForm({ ...genForm, waterBill: Number(e.target.value) })}
              placeholder="e.g. 500"
              min={0}
              step="0.01"
              required
            />
          </div>
        </div>

        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
          <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">🚰 Drinking water &amp; 🗑️ trash bags</h3>
          <p className="text-xs text-emerald-900/80">House pool totals for the month (each split equally among tenants).</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Drinking water pool (PHP)</label>
              <input
                type="number"
                className="input"
                value={genForm.drinkingWater}
                onChange={(e) => setGenForm({ ...genForm, drinkingWater: Number(e.target.value) })}
                min={0}
                step="0.01"
              />
            </div>
            <div>
              <label className="label">Trash bags pool (PHP)</label>
              <input
                type="number"
                className="input"
                value={genForm.trashBags}
                onChange={(e) => setGenForm({ ...genForm, trashBags: Number(e.target.value) })}
                min={0}
                step="0.01"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="label">Payment deadline *</label>
          <input
            type="date"
            className="input"
            value={genForm.deadline}
            onChange={(e) => setGenForm({ ...genForm, deadline: e.target.value })}
            required
          />
        </div>

        <div className="bg-blue-50 rounded-lg p-4 text-sm">
          <p className="font-medium text-blue-800 mb-2">💡 Splitting rules</p>
          <p className="text-blue-700">
            Aircon tenants pay <strong>2×</strong> the electricity share of non-aircon tenants. Water, drinking water,
            and trash bags are split equally among all tenants.
          </p>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? 'Generating...' : '⚡ Generate bill cycle'}
        </button>
      </form>
    </div>
  );
}

function cyclePicker(billCycles, selectedCycleId, setSelectedCycleId) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="label mb-0 whitespace-nowrap">Bill cycle:</label>
      <select
        className="input max-w-xs"
        value={selectedCycleId}
        onChange={(e) => setSelectedCycleId(e.target.value)}
      >
        {billCycles.map((c) => (
          <option key={c._id} value={c._id}>
            {getMonthLabel(c.month, c.year)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** House electricity total and per-tenant electricity shares */
export function BillingElectricityPage() {
  const { billCycles, selectedCycleId, setSelectedCycleId, cycleDetail } = useOutletContext();

  if (!cycleDetail && billCycles.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-500">
        No bill cycles yet. Generate one under <strong>Generate cycle</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cyclePicker(billCycles, selectedCycleId, setSelectedCycleId)}
      {cycleDetail ? (
        <>
          <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4">
            <h2 className="text-sm font-bold text-amber-950">⚡ Electricity (house total)</h2>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatPHP(cycleDetail.cycle.electricityTotal)}</p>
            <p className="text-xs text-amber-900/80 mt-1">Full meter / bill for {getMonthLabel(cycleDetail.cycle.month, cycleDetail.cycle.year)}.</p>
          </div>
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Per-tenant electricity share</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 pr-3">Tenant</th>
                  <th className="pb-2 pr-3">Room</th>
                  <th className="pb-2 text-right">Share (PHP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(cycleDetail.tenantBills || []).map((row) => (
                  <tr key={row._id}>
                    <td className="py-2 pr-3 font-medium text-gray-900">{row.tenantId?.nickname}</td>
                    <td className="py-2 pr-3 text-gray-600 capitalize">{row.tenantId?.roomType?.replace('-', ' ') || '—'}</td>
                    <td className="py-2 text-right tabular-nums">{formatPHP(row.electricityShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-600">
            To mark paid or send payment links, use{' '}
            <Link className="text-blue-600 font-medium hover:underline" to="/admin/billing/details">
              All tenant bills
            </Link>
            .
          </p>
        </>
      ) : (
        <div className="card text-center py-8 text-gray-400">Select a month.</div>
      )}
    </div>
  );
}

/** House water bill and per-tenant water shares */
export function BillingWaterPage() {
  const { billCycles, selectedCycleId, setSelectedCycleId, cycleDetail } = useOutletContext();

  if (!cycleDetail && billCycles.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-500">
        No bill cycles yet. Generate one under <strong>Generate cycle</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cyclePicker(billCycles, selectedCycleId, setSelectedCycleId)}
      {cycleDetail ? (
        <>
          <div className="rounded-xl border-2 border-cyan-200 bg-cyan-50/50 p-4">
            <h2 className="text-sm font-bold text-cyan-950">💧 Water (house total)</h2>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatPHP(cycleDetail.cycle.waterBill)}</p>
            <p className="text-xs text-cyan-900/80 mt-1">Split equally among tenants for this month.</p>
          </div>
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Per-tenant water share</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 pr-3">Tenant</th>
                  <th className="pb-2 text-right">Share (PHP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(cycleDetail.tenantBills || []).map((row) => (
                  <tr key={row._id}>
                    <td className="py-2 pr-3 font-medium text-gray-900">{row.tenantId?.nickname}</td>
                    <td className="py-2 text-right tabular-nums">{formatPHP(row.waterShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-600">
            Payments:{' '}
            <Link className="text-blue-600 font-medium hover:underline" to="/admin/billing/details">
              All tenant bills
            </Link>
            .
          </p>
        </>
      ) : (
        <div className="card text-center py-8 text-gray-400">Select a month.</div>
      )}
    </div>
  );
}

/** Drinking water & trash pool totals and per-tenant shares */
export function BillingDrinkingTrashPage() {
  const { billCycles, selectedCycleId, setSelectedCycleId, cycleDetail } = useOutletContext();

  if (!cycleDetail && billCycles.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-500">
        No bill cycles yet. Generate one under <strong>Generate cycle</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cyclePicker(billCycles, selectedCycleId, setSelectedCycleId)}
      {cycleDetail ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
              <h2 className="text-sm font-bold text-emerald-950">🚰 Drinking water pool</h2>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatPHP(cycleDetail.cycle.drinkingWater)}</p>
            </div>
            <div className="rounded-xl border-2 border-lime-200 bg-lime-50/50 p-4">
              <h2 className="text-sm font-bold text-lime-950">🗑️ Trash bags pool</h2>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatPHP(cycleDetail.cycle.trashBags)}</p>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Per-tenant shares</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 pr-3">Tenant</th>
                  <th className="pb-2 text-right">Drinking water</th>
                  <th className="pb-2 text-right">Trash bags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(cycleDetail.tenantBills || []).map((row) => (
                  <tr key={row._id}>
                    <td className="py-2 pr-3 font-medium text-gray-900">{row.tenantId?.nickname}</td>
                    <td className="py-2 text-right tabular-nums">{formatPHP(row.drinkingWaterShare)}</td>
                    <td className="py-2 text-right tabular-nums">{formatPHP(row.trashBagShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-600">
            Payments:{' '}
            <Link className="text-blue-600 font-medium hover:underline" to="/admin/billing/details">
              All tenant bills
            </Link>
            .
          </p>
        </>
      ) : (
        <div className="card text-center py-8 text-gray-400">Select a month.</div>
      )}
    </div>
  );
}

export function BillingDetailsPage() {
  const {
    billCycles,
    selectedCycleId,
    setSelectedCycleId,
    cycleDetail,
    unpaidBills,
    paidBills,
    handleSendLink,
    handleMarkPaid,
    handleBillAdjustSaved,
  } = useOutletContext();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="label mb-0 whitespace-nowrap">Select month:</label>
        <select
          className="input max-w-xs"
          value={selectedCycleId}
          onChange={(e) => setSelectedCycleId(e.target.value)}
        >
          {billCycles.map((c) => (
            <option key={c._id} value={c._id}>
              {getMonthLabel(c.month, c.year)}
            </option>
          ))}
        </select>
      </div>

      {cycleDetail ? (
        <>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">
                {getMonthLabel(cycleDetail.cycle.month, cycleDetail.cycle.year)}
              </h2>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  cycleDetail.cycle.status === 'open'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {cycleDetail.cycle.status}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Electricity</p>
                <p className="font-semibold">{formatPHP(cycleDetail.cycle.electricityTotal)}</p>
              </div>
              <div>
                <p className="text-gray-500">Water</p>
                <p className="font-semibold">{formatPHP(cycleDetail.cycle.waterBill)}</p>
              </div>
              <div>
                <p className="text-gray-500">Drinking water</p>
                <p className="font-semibold">{formatPHP(cycleDetail.cycle.drinkingWater)}</p>
              </div>
              <div>
                <p className="text-gray-500">Trash bags</p>
                <p className="font-semibold">{formatPHP(cycleDetail.cycle.trashBags)}</p>
              </div>
            </div>
          </div>

          {(unpaidBills.length > 0 || paidBills.length > 0) && (
            <div className="space-y-8">
              {unpaidBills.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-red-800 flex items-center gap-2">
                    <span>⏳ Unpaid</span>
                    <span className="text-sm font-normal text-gray-600">
                      ({unpaidBills.length}) — not fully paid until marked
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {unpaidBills.map((bill) => (
                      <AdminTenantBillCard
                        key={bill._id}
                        bill={bill}
                        onSendLink={handleSendLink}
                        onMarkPaid={handleMarkPaid}
                        onAdjustSaved={handleBillAdjustSaved}
                      />
                    ))}
                  </div>
                </div>
              )}
              {paidBills.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-green-800 flex items-center gap-2">
                    <span>✅ Paid</span>
                    <span className="text-sm font-normal text-gray-600">({paidBills.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paidBills.map((bill) => (
                      <AdminTenantBillCard
                        key={bill._id}
                        bill={bill}
                        onSendLink={handleSendLink}
                        onMarkPaid={handleMarkPaid}
                        onAdjustSaved={handleBillAdjustSaved}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {cycleDetail.tenantBills?.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">No tenant bills in this cycle.</p>
          )}
        </>
      ) : (
        <div className="card text-center py-8 text-gray-400">
          {billCycles.length === 0
            ? 'No bill cycles yet. Generate one first.'
            : 'Select a month to view details.'}
        </div>
      )}
    </div>
  );
}

function GcashTypeForm({ type, title, subtitle, billCycles, selectedCycleId, setSelectedCycleId, cycleDetail, gcashForm, setGcashForm, gcashQRFiles, setGcashQRFiles, handleSaveGcashType, loading }) {
  const key = type;
  return (
    <div className="card max-w-lg">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>

      <div className="mb-4">
        <label className="label">Bill cycle</label>
        <select
          className="input max-w-xs"
          value={selectedCycleId}
          onChange={(e) => setSelectedCycleId(e.target.value)}
        >
          {billCycles.map((c) => (
            <option key={c._id} value={c._id}>
              {getMonthLabel(c.month, c.year)}
            </option>
          ))}
        </select>
      </div>

      <div className="p-4 bg-gray-50 rounded-xl space-y-3">
        <div>
          <label className="label">GCash number</label>
          <input
            type="text"
            className="input"
            value={gcashForm[key]}
            onChange={(e) => setGcashForm({ ...gcashForm, [key]: e.target.value })}
            placeholder="09XX XXX XXXX"
          />
        </div>
        <div>
          <label className="label">QR code image</label>
          {cycleDetail?.cycle?.gcashQRImages?.[key] && (
            <img
              src={cycleDetail.cycle.gcashQRImages[key]}
              alt={`${key} QR`}
              className="w-24 h-24 object-contain rounded-lg border border-gray-200 mb-2"
            />
          )}
          <input
            type="file"
            accept="image/*"
            className="input text-sm"
            onChange={(e) => setGcashQRFiles({ ...gcashQRFiles, [key]: e.target.files[0] })}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => handleSaveGcashType(type)}
        className="btn-primary w-full mt-4"
        disabled={loading || !selectedCycleId}
      >
        {loading ? 'Saving...' : '💾 Save'}
      </button>
    </div>
  );
}

export function BillingGcashElectricityPage() {
  const ctx = useOutletContext();
  return (
    <GcashTypeForm
      type="electricity"
      title="GCash · electricity"
      subtitle="Number and QR for electricity payments only."
      {...ctx}
    />
  );
}

export function BillingGcashWaterPage() {
  const ctx = useOutletContext();
  return (
    <GcashTypeForm
      type="water"
      title="GCash · water"
      subtitle="Number and QR for water payments only."
      {...ctx}
    />
  );
}

export function BillingGcashPoolsPage() {
  const ctx = useOutletContext();
  return (
    <GcashTypeForm
      type="others"
      title="GCash · drinking water & trash"
      subtitle="Use for combined “other” house charges (drinking water + trash pools)."
      {...ctx}
    />
  );
}
