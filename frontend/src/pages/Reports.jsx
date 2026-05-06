import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import { generatePDFReport } from '../components/PDFReport';
import { getBillCycles, getBillCycle } from '../utils/api';
import { getMonthLabel, formatPHP, formatPHDate } from '../utils/helpers';

export default function Reports() {
  const [billCycles, setBillCycles] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [cycleDetail, setCycleDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadCycles();
  }, []);

  useEffect(() => {
    if (selectedCycleId) {
      loadDetail(selectedCycleId);
    }
  }, [selectedCycleId]);

  const loadCycles = async () => {
    setLoading(true);
    try {
      const { data } = await getBillCycles();
      setBillCycles(data);
      if (data.length > 0) setSelectedCycleId(data[0]._id);
    } catch {
      toast.error('Failed to load bill cycles');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    try {
      const { data } = await getBillCycle(id);
      setCycleDetail(data);
    } catch {
      toast.error('Failed to load cycle details');
    }
  };

  const handleGeneratePDF = async () => {
    if (!cycleDetail) return;
    setGenerating(true);
    try {
      generatePDFReport(cycleDetail.cycle, cycleDetail.tenantBills);
      toast.success('PDF report downloaded!');
    } catch (err) {
      toast.error('Failed to generate PDF');
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">
          View and download monthly bill reports (last 18 months). All amounts are in Philippine Peso (PHP).
        </p>
      </div>

      {/* Month selector */}
      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <label className="label">Select Month</label>
            <select
              className="input max-w-xs"
              value={selectedCycleId}
              onChange={(e) => setSelectedCycleId(e.target.value)}
              disabled={loading}
            >
              {billCycles.length === 0 && (
                <option value="">No bill cycles yet</option>
              )}
              {billCycles.map((c) => (
                <option key={c._id} value={c._id}>
                  {getMonthLabel(c.month, c.year)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGeneratePDF}
            className="btn-primary"
            disabled={!cycleDetail || generating}
          >
            {generating ? 'Generating...' : '📄 Download PDF'}
          </button>
        </div>
      </div>

      {/* Report preview */}
      {cycleDetail ? (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Electricity', value: formatPHP(cycleDetail.cycle.electricityTotal), icon: '⚡' },
              { label: 'Water', value: formatPHP(cycleDetail.cycle.waterBill), icon: '💧' },
              {
                label: 'Drinking water',
                value: formatPHP(cycleDetail.cycle.drinkingWater),
                icon: '🚰',
              },
              {
                label: 'Trash bags',
                value: formatPHP(cycleDetail.cycle.trashBags),
                icon: '🗑️',
              },
            ].map((item) => (
              <div key={item.label} className="card text-center">
                <p className="text-2xl mb-1">{item.icon}</p>
                <p className="text-lg font-bold text-gray-900">{item.value}</p>
                <p className="text-xs text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Collection summary */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">
              Collection Summary — {getMonthLabel(cycleDetail.cycle.month, cycleDetail.cycle.year)}
            </h2>
            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {cycleDetail.tenantBills.filter((b) => b.isPaid === true).length}
                </p>
                <p className="text-sm text-gray-500">Paid</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {cycleDetail.tenantBills.filter((b) => b.isPaid !== true).length}
                </p>
                <p className="text-sm text-gray-500">Unpaid</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">
                  {formatPHP(cycleDetail.tenantBills.filter((b) => b.isPaid === true).reduce((s, b) => s + b.totalAmount, 0))}
                </p>
                <p className="text-sm text-gray-500">Collected</p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Collection Progress</span>
                <span>
                  {formatPHP(cycleDetail.tenantBills.filter((b) => b.isPaid === true).reduce((s, b) => s + b.totalAmount, 0))}
                  {' / '}
                  {formatPHP(cycleDetail.tenantBills.reduce((s, b) => s + b.totalAmount, 0))}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{
                    width: cycleDetail.tenantBills.length > 0
                      ? `${Math.min(100, (cycleDetail.tenantBills.filter((b) => b.isPaid === true).reduce((s, b) => s + b.totalAmount, 0) / cycleDetail.tenantBills.reduce((s, b) => s + b.totalAmount, 0)) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Tenant breakdown table */}
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Tenant Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Tenant</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Room</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Electricity</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Water</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Drink. water</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Trash</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cycleDetail.tenantBills.map((bill) => (
                    <tr key={bill._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {bill.tenantId?.nickname || 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={bill.tenantId?.roomType === 'aircon' ? 'badge-aircon' : 'badge-nonaircon'}>
                          {bill.tenantId?.roomType === 'aircon' ? '❄️ Aircon' : '🌀 Non-Aircon'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{formatPHP(bill.electricityShare)}</td>
                      <td className="px-4 py-3 text-right">{formatPHP(bill.waterShare)}</td>
                      <td className="px-4 py-3 text-right">{formatPHP(bill.drinkingWaterShare)}</td>
                      <td className="px-4 py-3 text-right">{formatPHP(bill.trashBagShare)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">
                        {formatPHP(bill.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={bill.isPaid === true ? 'badge-paid' : 'badge-unpaid'}>
                          {bill.isPaid === true ? '✅ Paid' : '⏳ Unpaid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="bg-blue-50 font-semibold">
                    <td className="px-4 py-3 text-gray-900" colSpan={2}>Totals</td>
                    <td className="px-4 py-3 text-right">
                      {formatPHP(cycleDetail.tenantBills.reduce((s, b) => s + b.electricityShare, 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatPHP(cycleDetail.tenantBills.reduce((s, b) => s + b.waterShare, 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatPHP(cycleDetail.tenantBills.reduce((s, b) => s + b.drinkingWaterShare, 0))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatPHP(cycleDetail.tenantBills.reduce((s, b) => s + b.trashBagShare, 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-700">
                      {formatPHP(cycleDetail.tenantBills.reduce((s, b) => s + b.totalAmount, 0))}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={handleGeneratePDF}
              className="btn-primary px-8"
              disabled={generating}
            >
              {generating ? 'Generating PDF...' : '📄 Download PDF Report'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <span className="text-5xl mb-4 block">📊</span>
          <p className="text-gray-500">
            {loading ? 'Loading...' : 'No bill cycles found. Generate a bill cycle first.'}
          </p>
        </div>
      )}
    </Layout>
  );
}
