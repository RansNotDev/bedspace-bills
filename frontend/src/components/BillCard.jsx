import React from 'react';
import { formatPHP, formatPHDate, isPastDeadline } from '../utils/helpers';

function utilitiesSubtotal(bill) {
  if (bill.utilitiesSubtotal != null && bill.utilitiesSubtotal !== '') {
    return Number(bill.utilitiesSubtotal);
  }
  return (
    Number(bill.electricityShare || 0) +
    Number(bill.waterShare || 0) +
    Number(bill.drinkingWaterShare || 0) +
    Number(bill.trashBagShare || 0)
  );
}

export default function BillCard({ bill, cycle, showTenantName = false }) {
  if (!bill || !cycle) return null;

  const isOverdue = !bill.isPaid && isPastDeadline(cycle.deadline);
  const uSub = utilitiesSubtotal(bill);
  const rent = Number(bill.rentAmount || 0);
  const dPct = Number(bill.discountPercent || 0);
  const dAmt = Number(bill.discountAmount || 0);

  return (
    <div className={`card ${isOverdue ? 'border-red-200 bg-red-50' : ''}`}>
      {showTenantName && bill.tenantId && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">{bill.tenantId.nickname}</h3>
          <span className={bill.tenantId.roomType === 'aircon' ? 'badge-aircon' : 'badge-nonaircon'}>
            {bill.tenantId.roomType === 'aircon' ? '❄️ Aircon' : '🌀 Non-Aircon'}
          </span>
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">⚡ Electricity</span>
          <span className="font-medium">{formatPHP(bill.electricityShare)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">💧 Water</span>
          <span className="font-medium">{formatPHP(bill.waterShare)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">🚰 Drinking water</span>
          <span className="font-medium">{formatPHP(bill.drinkingWaterShare)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">🗑️ Trash bags</span>
          <span className="font-medium">{formatPHP(bill.trashBagShare)}</span>
        </div>
        <div className="flex justify-between pt-2 border-t border-gray-200 text-gray-700">
          <span>Utilities subtotal</span>
          <span className="font-medium">{formatPHP(uSub)}</span>
        </div>
        {rent > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">🏠 Monthly rent</span>
            <span className="font-medium">{formatPHP(rent)}</span>
          </div>
        )}
        {dPct > 0 && (
          <div className="flex justify-between text-amber-800">
            <span>Discount ({dPct}%)</span>
            <span>− {formatPHP(dAmt)}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold">
          <span>Amount due</span>
          <span className="text-blue-700">{formatPHP(bill.totalAmount)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className={bill.isPaid ? 'badge-paid' : 'badge-unpaid'}>
          {bill.isPaid ? '✅ Paid' : isOverdue ? '⚠️ Overdue' : '⏳ Unpaid'}
        </span>
        <span className="text-xs text-gray-500">
          Due: {formatPHDate(cycle.deadline)}
        </span>
      </div>

      {bill.receiptImage && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <a
            href={bill.receiptImage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            🧾 View Receipt
          </a>
        </div>
      )}
    </div>
  );
}
