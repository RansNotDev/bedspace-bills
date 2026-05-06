import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import TenantList from '../components/TenantList';
import BillCard from '../components/BillCard';
import {
  getTenants,
  getDashboardSummary,
  getBillCycles,
  getBillCycle,
  generateBillCycle,
  sendPaymentLink,
  markTenantBillPaid,
  updateBillCycle,
  uploadQRCode,
  changePassword,
} from '../utils/api';
import { formatPHP, getMonthLabel, formatPHDate, copyToClipboard, getCurrentMonthYear, CURRENCY_NOTE } from '../utils/helpers';

const TABS = ['Overview', 'Tenants', 'Generate Bill', 'Bill Details', 'GCash Setup'];

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [tenants, setTenants] = useState([]);
  const [summary, setSummary] = useState(null);
  const [billCycles, setBillCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [cycleDetail, setCycleDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  // Generate bill form
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

  // GCash setup state
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

  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdNew2, setPwdNew2] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  /** Overview: which bill cycle month is focused */
  const [overviewCycleId, setOverviewCycleId] = useState('');
  const [overviewShowAllMonths, setOverviewShowAllMonths] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [tenantsRes, summaryRes, cyclesRes] = await Promise.all([
        getTenants(),
        getDashboardSummary(),
        getBillCycles(),
      ]);
      setTenants(tenantsRes.data);
      setSummary(summaryRes.data);
      setBillCycles(cyclesRes.data);

      // Auto-select current cycle
      if (cyclesRes.data.length > 0 && !selectedCycleId) {
        setSelectedCycleId(cyclesRes.data[0]._id);
      }
    } catch (err) {
      toast.error('Failed to load dashboard data');
    }
  }, [selectedCycleId]);

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
    if (selectedCycleId) {
      loadCycleDetail(selectedCycleId);
    }
  }, [selectedCycleId, loadCycleDetail]);

  const { unpaidBills, paidBills } = useMemo(() => {
    const all = cycleDetail?.tenantBills;
    if (!all?.length) return { unpaidBills: [], paidBills: [] };
    return {
      unpaidBills: all.filter((b) => b.isPaid !== true),
      paidBills: all.filter((b) => b.isPaid === true),
    };
  }, [cycleDetail]);

  useEffect(() => {
    const list = summary?.collectionsByMonth;
    if (!list?.length) return;
    setOverviewCycleId((prev) => {
      const ids = list.map((b) => String(b.cycle._id));
      if (prev && ids.includes(String(prev))) return prev;
      return String(list[0].cycle._id);
    });
  }, [summary]);

  const overviewBlocks = summary?.collectionsByMonth ?? [];
  const selectedOverviewBlock = useMemo(() => {
    if (!overviewBlocks.length) return null;
    return (
      overviewBlocks.find((b) => String(b.cycle._id) === String(overviewCycleId)) ??
      overviewBlocks[0]
    );
  }, [overviewBlocks, overviewCycleId]);

  useEffect(() => {
    loadData();
  }, []);

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
      setActiveTab('Bill Details');
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
        // Copy link to clipboard
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

  const handleSaveGcash = async () => {
    if (!selectedCycleId) return;
    setLoading(true);
    try {
      // Save GCash numbers
      await updateBillCycle(selectedCycleId, {
        'gcashNumbers.electricity': gcashForm.electricity,
        'gcashNumbers.water': gcashForm.water,
        'gcashNumbers.others': gcashForm.others,
      });

      // Upload QR images if selected
      for (const type of ['electricity', 'water', 'others']) {
        if (gcashQRFiles[type]) {
          await uploadQRCode(selectedCycleId, type, gcashQRFiles[type]);
        }
      }

      toast.success('GCash info saved!');
      loadCycleDetail(selectedCycleId);
      setGcashQRFiles({ electricity: null, water: null, others: null });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save GCash info');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Manage tenants, bills, and payments</p>
        </div>
        <button
          type="button"
          onClick={() => setPwdModalOpen(true)}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg border border-blue-200 bg-white"
        >
          Change password
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'Overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              icon="👥"
              label="Active Tenants"
              value={summary?.activeTenants ?? '—'}
              color="blue"
            />
          </div>

          <p className="text-sm text-gray-600 max-w-3xl">
            Choose a <strong>bill cycle month</strong> to see that cycle&apos;s{' '}
            <strong>electricity</strong>, <strong>water</strong>, <strong>drinking water</strong>, and{' '}
            <strong>trash bags</strong> amounts (same as when you generated the bill), plus collection and each
            tenant&apos;s bill. {CURRENCY_NOTE} Figures are <strong>per month only</strong>, not added across months.
          </p>

          {overviewBlocks.length > 0 && selectedOverviewBlock ? (
            <>
              <div className="card bg-white border border-gray-200">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">View overview by month</h2>
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label htmlFor="overview-month" className="label">
                      Bill cycle month
                    </label>
                    <select
                      id="overview-month"
                      className="input"
                      value={overviewCycleId}
                      onChange={(e) => setOverviewCycleId(e.target.value)}
                    >
                      {overviewBlocks.map((b) => (
                        <option key={b.cycle._id} value={b.cycle._id}>
                          {getMonthLabel(b.cycle.month, b.cycle.year)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer pb-1">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      checked={overviewShowAllMonths}
                      onChange={(e) => setOverviewShowAllMonths(e.target.checked)}
                    />
                    Also show other months (compact)
                  </label>
                </div>
              </div>

              <OverviewMonthPanel block={selectedOverviewBlock} variant="featured" />

              {overviewShowAllMonths &&
                overviewBlocks
                  .filter((b) => String(b.cycle._id) !== String(overviewCycleId))
                  .map((b) => (
                    <OverviewMonthPanel key={b.cycle._id} block={b} variant="compact" />
                  ))}
            </>
          ) : (
            <div className="card text-center py-8">
              <p className="text-gray-500 mb-3">No bill cycles yet.</p>
              <button type="button" onClick={() => setActiveTab('Generate Bill')} className="btn-primary text-sm">
                Generate Bill Cycle
              </button>
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={() => setActiveTab('Bill Details')}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Open Bill Details for actions →
            </button>
          </div>
        </div>
      )}

      {/* ── TENANTS TAB ── */}
      {activeTab === 'Tenants' && (
        <div className="card">
          <TenantList tenants={tenants} onRefresh={loadData} />
        </div>
      )}

      {/* ── GENERATE BILL TAB ── */}
      {activeTab === 'Generate Bill' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold mb-4">Generate Monthly Bill Cycle</h2>
          <p className="text-xs text-gray-500 mb-4">{CURRENCY_NOTE}</p>
          <form onSubmit={handleGenerateBill} className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Electricity Total (PHP) *</label>
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
              <div>
                <label className="label">Water Bill (PHP) *</label>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Drinking water pool (PHP)</label>
                <input
                  type="number"
                  className="input"
                  value={genForm.drinkingWater}
                  onChange={(e) =>
                    setGenForm({ ...genForm, drinkingWater: Number(e.target.value) })
                  }
                  min={0}
                  step="0.01"
                />
                <p className="text-xs text-gray-500 mt-1">House total for the month (default ₱100). Split equally among tenants.</p>
              </div>
              <div>
                <label className="label">Trash bags pool (PHP)</label>
                <input
                  type="number"
                  className="input"
                  value={genForm.trashBags}
                  onChange={(e) =>
                    setGenForm({ ...genForm, trashBags: Number(e.target.value) })
                  }
                  min={0}
                  step="0.01"
                />
                <p className="text-xs text-gray-500 mt-1">House total for the month (default ₱100). Split equally among tenants.</p>
              </div>
            </div>

            <div>
              <label className="label">Payment Deadline *</label>
              <input
                type="date"
                className="input"
                value={genForm.deadline}
                onChange={(e) => setGenForm({ ...genForm, deadline: e.target.value })}
                required
              />
            </div>

            <div className="bg-blue-50 rounded-lg p-4 text-sm">
              <p className="font-medium text-blue-800 mb-2">💡 Bill Splitting Preview</p>
              <p className="text-blue-700">
                Aircon tenants pay <strong>2×</strong> the electricity share of non-aircon tenants.
                Water, drinking water, and trash bags are split equally among all tenants.
              </p>
            </div>

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Generating...' : '⚡ Generate Bill Cycle'}
            </button>
          </form>
        </div>
      )}

      {/* ── BILL DETAILS TAB ── */}
      {activeTab === 'Bill Details' && (
        <div className="space-y-4">
          {/* Cycle selector */}
          <div className="flex items-center gap-3">
            <label className="label mb-0 whitespace-nowrap">Select Month:</label>
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
              {/* Cycle summary */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900">
                    {getMonthLabel(cycleDetail.cycle.month, cycleDetail.cycle.year)}
                  </h2>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    cycleDetail.cycle.status === 'open'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {cycleDetail.cycle.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-gray-500">Electricity</p><p className="font-semibold">{formatPHP(cycleDetail.cycle.electricityTotal)}</p></div>
                  <div><p className="text-gray-500">Water</p><p className="font-semibold">{formatPHP(cycleDetail.cycle.waterBill)}</p></div>
                  <div><p className="text-gray-500">Drinking water</p><p className="font-semibold">{formatPHP(cycleDetail.cycle.drinkingWater)}</p></div>
                  <div><p className="text-gray-500">Trash bags</p><p className="font-semibold">{formatPHP(cycleDetail.cycle.trashBags)}</p></div>
                </div>
              </div>

              {/* Tenant bills — unpaid shown first by default */}
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
      )}

      {/* ── GCASH SETUP TAB ── */}
      {activeTab === 'GCash Setup' && (
        <div className="card max-w-2xl">
          <h2 className="text-lg font-semibold mb-2">GCash Setup</h2>
          <p className="text-sm text-gray-500 mb-4">
            Set GCash numbers and upload QR codes for the selected bill cycle.
          </p>

          <div className="mb-4">
            <label className="label">Bill Cycle</label>
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

          {['electricity', 'water', 'others'].map((type) => (
            <div key={type} className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h3 className="font-medium text-gray-800 mb-3 capitalize">
                {type === 'electricity' ? '⚡ Electricity' : type === 'water' ? '💧 Water' : '🗑️ Others'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="label">GCash Number</label>
                  <input
                    type="text"
                    className="input"
                    value={gcashForm[type]}
                    onChange={(e) => setGcashForm({ ...gcashForm, [type]: e.target.value })}
                    placeholder="09XX XXX XXXX"
                  />
                </div>
                <div>
                  <label className="label">QR Code Image</label>
                  {cycleDetail?.cycle?.gcashQRImages?.[type] && (
                    <img
                      src={cycleDetail.cycle.gcashQRImages[type]}
                      alt={`${type} QR`}
                      className="w-24 h-24 object-contain rounded-lg border border-gray-200 mb-2"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="input text-sm"
                    onChange={(e) =>
                      setGcashQRFiles({ ...gcashQRFiles, [type]: e.target.files[0] })
                    }
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={handleSaveGcash}
            className="btn-primary w-full"
            disabled={loading || !selectedCycleId}
          >
            {loading ? 'Saving...' : '💾 Save GCash Info'}
          </button>
        </div>
      )}

      {pwdModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="presentation"
          onClick={() => !pwdSaving && setPwdModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Change landlord password</h2>
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
                <button type="button" className="btn-secondary flex-1" disabled={pwdSaving} onClick={() => setPwdModalOpen(false)}>
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

/** Overview: one bill cycle block with house-level electricity / water / misc and tenant bill table */
function OverviewMonthPanel({ block, variant }) {
  const featured = variant === 'featured';
  const { cycle } = block;

  return (
    <div
      className={`card border shadow-sm ${
        featured ? 'border-blue-200 ring-1 ring-blue-100 bg-white' : 'border-gray-200 bg-gray-50/40'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
        <div>
          <h2 className={featured ? 'text-xl font-bold text-gray-900' : 'text-base font-semibold text-gray-900'}>
            {getMonthLabel(cycle.month, cycle.year)}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Paid {block.paidCount} · Unpaid {block.unpaidCount} · Collected {formatPHP(block.totalCollected)} of{' '}
            {formatPHP(block.totalBilled)} billed (this cycle only)
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            cycle.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {cycle.status}
        </span>
      </div>

      <div
        className={`rounded-xl border p-4 mb-4 ${
          featured
            ? 'bg-gradient-to-br from-slate-50 via-white to-blue-50/40 border-blue-100'
            : 'bg-white border-gray-100'
        }`}
      >
        <h3 className="text-sm font-semibold text-gray-800 mb-3">
          Bill cycle — house totals (all amounts in PHP)
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className={`rounded-lg border p-4 text-center ${featured ? 'bg-white border-amber-100 shadow-sm' : 'bg-white border-gray-100'}`}>
            <p className={featured ? 'text-3xl mb-2' : 'text-xl mb-1'}>⚡</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Electricity</p>
            <p className={featured ? 'text-xl font-bold text-gray-900 mt-1' : 'text-base font-bold text-gray-900 mt-1'}>
              {formatPHP(cycle.electricityTotal)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Full meter / bill total</p>
          </div>
          <div className={`rounded-lg border p-4 text-center ${featured ? 'bg-white border-cyan-100 shadow-sm' : 'bg-white border-gray-100'}`}>
            <p className={featured ? 'text-3xl mb-2' : 'text-xl mb-1'}>💧</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Water</p>
            <p className={featured ? 'text-xl font-bold text-gray-900 mt-1' : 'text-base font-bold text-gray-900 mt-1'}>
              {formatPHP(cycle.waterBill)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Shared bill for the month</p>
          </div>
          <div className={`rounded-lg border p-4 text-center ${featured ? 'bg-white border-emerald-100 shadow-sm' : 'bg-white border-gray-100'}`}>
            <p className={featured ? 'text-3xl mb-2' : 'text-xl mb-1'}>🚰</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Drinking water</p>
            <p className={featured ? 'text-xl font-bold text-gray-900 mt-1' : 'text-base font-bold text-gray-900 mt-1'}>
              {formatPHP(cycle.drinkingWater)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Pool total, split equally</p>
          </div>
          <div className={`rounded-lg border p-4 text-center ${featured ? 'bg-white border-lime-100 shadow-sm' : 'bg-white border-gray-100'}`}>
            <p className={featured ? 'text-3xl mb-2' : 'text-xl mb-1'}>🗑️</p>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trash bags</p>
            <p className={featured ? 'text-xl font-bold text-gray-900 mt-1' : 'text-base font-bold text-gray-900 mt-1'}>
              {formatPHP(cycle.trashBags)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Pool total, split equally</p>
          </div>
        </div>
      </div>

      <div className={`grid gap-3 mb-4 ${featured ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4 text-sm'}`}>
        <div>
          <p className="text-gray-500">Payment deadline</p>
          <p className="font-semibold">{formatPHDate(cycle.deadline)}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-gray-500">Collection progress (this cycle)</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{
                  width:
                    block.totalBilled > 0
                      ? `${Math.min(100, (block.totalCollected / block.totalBilled) * 100)}%`
                      : '0%',
                }}
              />
            </div>
            <span className="text-xs text-gray-600 tabular-nums whitespace-nowrap">
              {formatPHP(block.totalCollected)} / {formatPHP(block.totalBilled)}
            </span>
          </div>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-800 mb-2">Tenant bills — this cycle</h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">Tenant</th>
              <th className="px-3 py-2 font-medium text-right">Bill amount</th>
              <th className="px-3 py-2 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {block.billRows.map((row) => (
              <tr key={row.tenantBillId || `missing-${row.tenantUserId}`} className="bg-white">
                <td className="px-3 py-2">
                  <span className="font-medium text-gray-900">{row.nickname}</span>
                  {row.notInCycle && (
                    <span className="ml-2 text-xs text-amber-700">No bill row in this cycle</span>
                  )}
                  {row.roomType && !row.notInCycle && (
                    <span
                      className={`ml-2 text-xs ${
                        row.roomType === 'aircon' ? 'text-blue-600' : 'text-gray-500'
                      }`}
                    >
                      {row.roomType === 'aircon' ? 'Aircon' : 'Non-aircon'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                  {row.notInCycle ? '—' : formatPHP(row.totalAmount)}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.notInCycle ? (
                    <span className="text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                      Pending
                    </span>
                  ) : row.isPaid ? (
                    <span className="text-xs font-medium text-green-800 bg-green-50 px-2 py-0.5 rounded-full">
                      Paid
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-red-800 bg-red-50 px-2 py-0.5 rounded-full">
                      Unpaid
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminTenantBillCard({ bill, onSendLink, onMarkPaid }) {
  const paid = bill.isPaid === true;
  return (
    <div className={`card ${paid ? '' : 'border border-red-100 bg-red-50/20'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">{bill.tenantId?.nickname}</p>
          <span className={bill.tenantId?.roomType === 'aircon' ? 'badge-aircon' : 'badge-nonaircon'}>
            {bill.tenantId?.roomType === 'aircon' ? '❄️ Aircon' : '🌀 Non-Aircon'}
          </span>
        </div>
        <span className={paid ? 'badge-paid' : 'badge-unpaid'}>
          {paid ? '✅ Paid' : '⏳ Unpaid'}
        </span>
      </div>

      <div className="space-y-1 text-sm mb-3">
        <div className="flex justify-between"><span className="text-gray-500">⚡ Electricity</span><span>{formatPHP(bill.electricityShare)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">💧 Water</span><span>{formatPHP(bill.waterShare)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">🚰 Drinking water</span><span>{formatPHP(bill.drinkingWaterShare)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">🗑️ Trash bags</span><span>{formatPHP(bill.trashBagShare)}</span></div>
        <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
          <span>Total</span>
          <span className="text-blue-700">{formatPHP(bill.totalAmount)}</span>
        </div>
      </div>

      {bill.receiptImage && (
        <a href={bill.receiptImage} target="_blank" rel="noopener noreferrer" className="block mb-2">
          <img
            src={bill.receiptImage}
            alt="Receipt"
            className="w-full h-24 object-cover rounded-lg border border-gray-200"
          />
        </a>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => onSendLink(bill._id)}
          className="btn-secondary text-xs flex-1"
          title={bill.tenantId?.email ? 'Send via email' : 'Copy link'}
        >
          {bill.tenantId?.email ? '📧 Send Link' : '🔗 Copy Link'}
        </button>
        <button
          type="button"
          onClick={() => onMarkPaid(bill._id, bill.isPaid)}
          className={`text-xs flex-1 rounded-lg px-3 py-2 font-medium transition-colors ${
            paid
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-green-50 text-green-600 hover:bg-green-100'
          }`}
        >
          {paid ? '↩ Unpaid' : '✓ Mark Paid'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
  };

  return (
    <div className="card">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${colors[color]}`}>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}
