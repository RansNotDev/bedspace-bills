import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import BillCard from '../components/BillCard';
import QRCodeDisplay from '../components/QRCodeDisplay';
import ReceiptUpload from '../components/ReceiptUpload';
import { getCurrentBill, getMyBills, getMe } from '../utils/api';
import { getMonthLabel } from '../utils/helpers';
import { getStoredUser } from '../utils/authHelpers';

const DEFAULT_VIS = {
  showCurrentBill: true,
  showBillHistory: true,
  showPaymentUpload: true,
};

export default function TenantDashboard() {
  const [portalVis, setPortalVis] = useState(() => {
    const u = getStoredUser();
    return u?.tenantPortalVisibility
      ? { ...DEFAULT_VIS, ...u.tenantPortalVisibility }
      : { ...DEFAULT_VIS };
  });

  const [currentBill, setCurrentBill] = useState(null);
  const [pastBills, setPastBills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      try {
        const { data: me } = await getMe();
        const u = getStoredUser();
        if (u && me) {
          const nextVis = me.tenantPortalVisibility
            ? { ...DEFAULT_VIS, ...me.tenantPortalVisibility }
            : { ...DEFAULT_VIS };
          setPortalVis(nextVis);
          localStorage.setItem(
            'user',
            JSON.stringify({
              ...u,
              ...me,
              tenantPortalVisibility: nextVis,
            })
          );
        }
      } catch {
        /* ignore */
      }

      const [currentRes, pastRes] = await Promise.all([
        getCurrentBill().catch(() => null),
        getMyBills(),
      ]);

      if (currentRes?.data) {
        setCurrentBill(currentRes.data);
      }

      // Filter out current month from past bills
      const past = pastRes.data.filter(
        (b) => b._id !== currentRes?.data?._id
      );
      setPastBills(past);
    } catch (err) {
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-500">Loading your bills...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Bills</h1>
        <p className="text-gray-500 text-sm mt-1">View and pay your monthly bills</p>
      </div>

      {!portalVis.showCurrentBill && !portalVis.showBillHistory && (
        <div className="card text-center py-12 text-gray-600">
          Your landlord has limited what you can see here. If this looks wrong, contact them.
        </div>
      )}

      {/* Current Bill */}
      {portalVis.showCurrentBill && currentBill ? (
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Current Bill — {getMonthLabel(currentBill.billCycleId.month, currentBill.billCycleId.year)}
              </h2>
              <span className={currentBill.isPaid ? 'badge-paid' : 'badge-unpaid'}>
                {currentBill.isPaid ? '✅ Paid' : '⏳ Unpaid'}
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <BillCard bill={currentBill} cycle={currentBill.billCycleId} />
              </div>
              <div>
                <h3 className="font-medium text-gray-800 mb-3">💳 Payment Options</h3>
                <QRCodeDisplay cycle={currentBill.billCycleId} />
              </div>
            </div>

            {portalVis.showPaymentUpload && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-medium text-gray-800 mb-3">📸 Upload Payment Receipt (Optional)</h3>
                <ReceiptUpload
                  tenantBillId={currentBill._id}
                  existingReceipt={currentBill.receiptImage}
                  onUploaded={() => loadData()}
                />
              </div>
            )}
          </div>
        </div>
      ) : portalVis.showCurrentBill ? (
        <div className="card text-center py-12">
          <span className="text-5xl mb-4 block">📭</span>
          <p className="text-gray-500 text-lg">No bill for this month yet.</p>
          <p className="text-gray-400 text-sm mt-2">Check back later or contact your landlord.</p>
        </div>
      ) : null}

      {/* Past Bills */}
      {portalVis.showBillHistory && pastBills.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📜 Past Bills</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pastBills.map((bill) => (
              <div key={bill._id}>
                <div className="text-xs text-gray-500 mb-2">
                  {getMonthLabel(bill.billCycleId.month, bill.billCycleId.year)}
                </div>
                <BillCard bill={bill} cycle={bill.billCycleId} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
