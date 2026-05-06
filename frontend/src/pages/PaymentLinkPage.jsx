import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPaymentLinkData } from '../utils/api';
import QRCodeDisplay from '../components/QRCodeDisplay';
import ReceiptUpload from '../components/ReceiptUpload';
import { formatPHP, formatPHDate, getMonthLabel, CURRENCY_NOTE } from '../utils/helpers';

export default function PaymentLinkPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expired, setExpired] = useState(false);
  const [receiptUploaded, setReceiptUploaded] = useState(false);

  useEffect(() => {
    loadPaymentData();
  }, [token]);

  const loadPaymentData = async () => {
    setLoading(true);
    try {
      const { data: res } = await getPaymentLinkData(token);
      setData(res);
    } catch (err) {
      if (err.response?.status === 410) {
        setExpired(true);
      } else {
        setError(err.response?.data?.message || 'Invalid or expired payment link');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading your bill...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <span className="text-5xl mb-4 block">⏰</span>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h1>
          <p className="text-gray-500">
            This payment link has expired. Please contact your landlord for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <span className="text-5xl mb-4 block">❌</span>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Not Found</h1>
          <p className="text-gray-500">{error || 'This payment link is invalid.'}</p>
        </div>
      </div>
    );
  }

  const { tenant, bill, cycle } = data;
  const monthLabel = getMonthLabel(cycle.month, cycle.year);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-100 rounded-2xl mb-3">
            <span className="text-2xl">🏠</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Bedspace Bill Manager</h1>
          <p className="text-gray-500 text-sm">Payment for {monthLabel}</p>
          <p className="text-gray-400 text-xs mt-1">{CURRENCY_NOTE}</p>
        </div>

        {/* Tenant info */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">Tenant</p>
              <p className="text-xl font-bold text-gray-900">{tenant.nickname}</p>
              <span className={tenant.roomType === 'aircon' ? 'badge-aircon' : 'badge-nonaircon'}>
                {tenant.roomType === 'aircon' ? '❄️ Aircon Room' : '🌀 Non-Aircon Room'}
              </span>
            </div>
            <span className={bill.isPaid ? 'badge-paid text-base px-3 py-1' : 'badge-unpaid text-base px-3 py-1'}>
              {bill.isPaid ? '✅ Paid' : '⏳ Unpaid'}
            </span>
          </div>

          {/* Bill breakdown */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">⚡ Electricity Share</span>
              <span className="font-medium">{formatPHP(bill.electricityShare)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">💧 Water Share</span>
              <span className="font-medium">{formatPHP(bill.waterShare)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">🚰 Drinking water share</span>
              <span className="font-medium">{formatPHP(bill.drinkingWaterShare)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">🗑️ Trash bags share</span>
              <span className="font-medium">{formatPHP(bill.trashBagShare)}</span>
            </div>
            <div className="flex justify-between py-3 font-bold text-base">
              <span>TOTAL</span>
              <span className="text-blue-700 text-xl">{formatPHP(bill.totalAmount)}</span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
            <span>📅 Deadline:</span>
            <span className="font-medium text-gray-700">{formatPHDate(cycle.deadline)}</span>
          </div>

          {bill.paymentLinkExpiry && (
            <div className="mt-1 flex items-center gap-2 text-xs text-red-500">
              <span>⚠️ Link expires:</span>
              <span>{formatPHDate(bill.paymentLinkExpiry)}</span>
            </div>
          )}
        </div>

        {/* GCash payment */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <h2 className="font-semibold text-gray-900 mb-4">💳 Pay via GCash</h2>
          <QRCodeDisplay cycle={cycle} />
        </div>

        {/* Receipt upload */}
        {!bill.isPaid && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
            <h2 className="font-semibold text-gray-900 mb-2">📸 Upload Payment Receipt</h2>
            <p className="text-sm text-gray-500 mb-4">
              Optional — upload your GCash screenshot as proof of payment.
            </p>
            {receiptUploaded ? (
              <div className="text-center py-4">
                <span className="text-3xl mb-2 block">✅</span>
                <p className="text-green-700 font-medium">Receipt uploaded successfully!</p>
                <p className="text-sm text-gray-500 mt-1">Your landlord will verify your payment.</p>
              </div>
            ) : (
              <ReceiptUpload
                token={token}
                existingReceipt={bill.receiptImage}
                onUploaded={() => setReceiptUploaded(true)}
              />
            )}
          </div>
        )}

        {bill.isPaid && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <span className="text-4xl mb-2 block">🎉</span>
            <p className="font-semibold text-green-800">Payment confirmed!</p>
            <p className="text-sm text-green-600 mt-1">Thank you for your payment.</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-6">
          Bedspace Bill Manager — {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
