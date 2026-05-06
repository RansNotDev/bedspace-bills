import React, { useState, useEffect, useCallback } from 'react';
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
} from '../utils/api';
import { formatPHP, getMonthLabel, formatPHDate, copyToClipboard, getCurrentMonthYear } from '../utils/helpers';

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

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedCycleId) {
      loadCycleDetail(selectedCycleId);
    }
  }, [selectedCycleId]);

  const loadCycleDetail = async (id) => {
    try {
      const { data } = await getBillCycle(id);
      setCycleDetail(data);
      // Pre-fill GCash form
      setGcashForm({
        electricity: data.cycle.gcashNumbers?.electricity || '',
        water: data.cycle.gcashNumbers?.water || '',
        others: data.cycle.gcashNumbers?.others || '',
      });
    } catch {
      toast.error('Failed to load bill cycle details');
    }
  };

  const handleGenerateBill = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await generateBillCycle(genForm);
      toast.success(`Bill cycle for ${getMonthLabel(genForm.month, genForm.year)} generated!`);
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
      loadCycleDetail(selectedCycleId);
    } catch {
      toast.error('Failed to update payment status');
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Manage tenants, bills, and payments</p>
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
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon="👥"
              label="Active Tenants"
              value={summary?.activeTenants ?? '—'}
              color="blue"
            />
            <StatCard
              icon="✅"
              label="Paid"
              value={summary?.paidCount ?? '—'}
              color="green"
            />
            <StatCard
              icon="⏳"
              label="Unpaid"
              value={summary?.unpaidCount ?? '—'}
              color="red"
            />
            <StatCard
              icon="💰"
              label="Collected"
              value={summary ? formatPHP(summary.totalCollected) : '—'}
              color="purple"
            />
          </div>

          {/* Current cycle info */}
          {summary?.currentCycle ? (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-3">
                Current Cycle — {getMonthLabel(summary.currentCycle.month, summary.currentCycle.year)}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Electricity</p>
                  <p className="font-semibold">{formatPHP(summary.currentCycle.electricityTotal)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Water</p>
                  <p className="font-semibold">{formatPHP(summary.currentCycle.waterBill)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Deadline</p>
                  <p className="font-semibold">{formatPHDate(summary.currentCycle.deadline)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    summary.currentCycle.status === 'open'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {summary.currentCycle.status}
                  </span>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Collection Progress</span>
                  <span>{formatPHP(summary.totalCollected)} / {formatPHP(summary.totalBilled)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{
                      width: summary.totalBilled > 0
                        ? `${Math.min(100, (summary.totalCollected / summary.totalBilled) * 100)}%`
                        : '0%',
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="card text-center py-8">
              <p className="text-gray-500 mb-3">No bill cycle for this month yet.</p>
              <button
                onClick={() => setActiveTab('Generate Bill')}
                className="btn-primary text-sm"
              >
                Generate Bill Cycle
              </button>
            </div>
          )}
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
                <label className="label">Drinking Water (PHP)</label>
                <input
                  type="number"
                  className="input"
                  value={genForm.drinkingWater}
                  onChange={(e) => setGenForm({ ...genForm, drinkingWater: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div>
                <label className="label">Trash Bags (PHP)</label>
                <input
                  type="number"
                  className="input"
                  value={genForm.trashBags}
                  onChange={(e) => setGenForm({ ...genForm, trashBags: Number(e.target.value) })}
                  min={0}
                />
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
                Water, drinking water, and trash bags are split equally.
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
                  <div><p className="text-gray-500">Drinking Water</p><p className="font-semibold">{formatPHP(cycleDetail.cycle.drinkingWater)}</p></div>
                  <div><p className="text-gray-500">Trash Bags</p><p className="font-semibold">{formatPHP(cycleDetail.cycle.trashBags)}</p></div>
                </div>
              </div>

              {/* Tenant bills */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cycleDetail.tenantBills.map((bill) => (
                  <div key={bill._id} className="card">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{bill.tenantId?.nickname}</p>
                        <span className={bill.tenantId?.roomType === 'aircon' ? 'badge-aircon' : 'badge-nonaircon'}>
                          {bill.tenantId?.roomType === 'aircon' ? '❄️ Aircon' : '🌀 Non-Aircon'}
                        </span>
                      </div>
                      <span className={bill.isPaid ? 'badge-paid' : 'badge-unpaid'}>
                        {bill.isPaid ? '✅ Paid' : '⏳ Unpaid'}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm mb-3">
                      <div className="flex justify-between"><span className="text-gray-500">⚡ Electricity</span><span>{formatPHP(bill.electricityShare)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">💧 Water</span><span>{formatPHP(bill.waterShare)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">🚰 Drinking</span><span>{formatPHP(bill.drinkingWaterShare)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">🗑️ Trash</span><span>{formatPHP(bill.trashBagShare)}</span></div>
                      <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
                        <span>Total</span>
                        <span className="text-blue-700">{formatPHP(bill.totalAmount)}</span>
                      </div>
                    </div>

                    {bill.receiptImage && (
                      <a
                        href={bill.receiptImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mb-2"
                      >
                        <img
                          src={bill.receiptImage}
                          alt="Receipt"
                          className="w-full h-24 object-cover rounded-lg border border-gray-200"
                        />
                      </a>
                    )}

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleSendLink(bill._id)}
                        className="btn-secondary text-xs flex-1"
                        title={bill.tenantId?.email ? 'Send via email' : 'Copy link'}
                      >
                        {bill.tenantId?.email ? '📧 Send Link' : '🔗 Copy Link'}
                      </button>
                      <button
                        onClick={() => handleMarkPaid(bill._id, bill.isPaid)}
                        className={`text-xs flex-1 rounded-lg px-3 py-2 font-medium transition-colors ${
                          bill.isPaid
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {bill.isPaid ? '↩ Unpaid' : '✓ Mark Paid'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
    </Layout>
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
