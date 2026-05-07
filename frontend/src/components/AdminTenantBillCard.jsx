import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { patchTenantBillAdjustments } from '../utils/api';
import { formatPHP } from '../utils/helpers';

export default function AdminTenantBillCard({ bill, onSendLink, onMarkPaid, onAdjustSaved }) {
  const paid = bill.isPaid === true;
  const [rent, setRent] = useState(String(bill.rentAmount ?? 0));
  const [disc, setDisc] = useState(String(bill.discountPercent ?? 0));
  const [adjLoading, setAdjLoading] = useState(false);

  useEffect(() => {
    setRent(String(bill.rentAmount ?? 0));
    setDisc(String(bill.discountPercent ?? 0));
  }, [bill._id, bill.rentAmount, bill.discountPercent]);

  const utilsSub =
    bill.utilitiesSubtotal != null
      ? Number(bill.utilitiesSubtotal)
      : Number(bill.electricityShare || 0) +
        Number(bill.waterShare || 0) +
        Number(bill.drinkingWaterShare || 0) +
        Number(bill.trashBagShare || 0);

  const applyAdjust = async () => {
    setAdjLoading(true);
    try {
      await patchTenantBillAdjustments(bill._id, {
        rentAmount: Number(rent),
        discountPercent: Number(disc),
      });
      toast.success('Rent & discount updated');
      onAdjustSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update bill');
    } finally {
      setAdjLoading(false);
    }
  };

  return (
    <div className={`card ${paid ? '' : 'border border-red-100 bg-red-50/20'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-900">{bill.tenantId?.nickname}</p>
          <span className={bill.tenantId?.roomType === 'aircon' ? 'badge-aircon' : 'badge-nonaircon'}>
            {bill.tenantId?.roomType === 'aircon' ? '❄️ Aircon' : '🌀 Non-Aircon'}
          </span>
          {Number(bill.tenantId?.monthlyRent) > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Monthly rent (profile): {formatPHP(bill.tenantId.monthlyRent)}
            </p>
          )}
        </div>
        <span className={paid ? 'badge-paid' : 'badge-unpaid'}>
          {paid ? '✅ Paid' : '⏳ Unpaid'}
        </span>
      </div>

      <div className="space-y-1 text-sm mb-3">
        <div className="flex justify-between">
          <span className="text-gray-500">⚡ Electricity</span>
          <span>{formatPHP(bill.electricityShare)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">💧 Water</span>
          <span>{formatPHP(bill.waterShare)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">🚰 Drinking water</span>
          <span>{formatPHP(bill.drinkingWaterShare)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">🗑️ Trash bags</span>
          <span>{formatPHP(bill.trashBagShare)}</span>
        </div>
        <div className="flex justify-between text-gray-600 pt-1 border-t border-dashed border-gray-200">
          <span>Utilities subtotal</span>
          <span>{formatPHP(utilsSub)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">🏠 Rent (this bill)</span>
          <span>{formatPHP(bill.rentAmount || 0)}</span>
        </div>
        {(Number(bill.discountPercent) > 0 || Number(bill.discountAmount) > 0) && (
          <div className="flex justify-between text-amber-800">
            <span>Discount ({Number(bill.discountPercent) || 0}%)</span>
            <span>− {formatPHP(bill.discountAmount || 0)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
          <span>Amount due</span>
          <span className="text-blue-700">{formatPHP(bill.totalAmount)}</span>
        </div>
      </div>

      <div className="mb-3 p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
        <p className="text-xs text-slate-600">
          Adjust <strong>rent for this month</strong> and <strong>discount %</strong> (applied to utilities + rent).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500">Rent (PHP)</label>
            <input
              type="number"
              className="input text-sm py-1.5"
              min={0}
              step="0.01"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Discount %</label>
            <input
              type="number"
              className="input text-sm py-1.5"
              min={0}
              max={100}
              step="0.5"
              value={disc}
              onChange={(e) => setDisc(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={applyAdjust}
          disabled={adjLoading}
          className="btn-secondary text-xs w-full py-2"
        >
          {adjLoading ? 'Saving…' : 'Apply rent & discount'}
        </button>
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
