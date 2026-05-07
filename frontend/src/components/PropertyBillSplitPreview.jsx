import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPHP } from '../utils/helpers';
import { previewBillSplits } from '../utils/previewBillSplits';

/**
 * Property tab: enter house bill totals and see per-tenant splits (preview; same rules as live bill cycles).
 */
export default function PropertyBillSplitPreview({ tenants, propertyLabel }) {
  const [electricity, setElectricity] = useState('');
  const [water, setWater] = useState('');
  const [drinksTrash, setDrinksTrash] = useState('');

  const rows = useMemo(() => {
    const electricityTotal = parseFloat(String(electricity).replace(/,/g, '')) || 0;
    const waterBill = parseFloat(String(water).replace(/,/g, '')) || 0;
    const drinksTrashCombined = parseFloat(String(drinksTrash).replace(/,/g, '')) || 0;
    return previewBillSplits(tenants, { electricityTotal, waterBill, drinksTrashCombined });
  }, [tenants, electricity, water, drinksTrash]);

  const activeCount = useMemo(() => (tenants || []).filter((t) => t.isActive !== false).length, [tenants]);

  const totalsEntered =
    (parseFloat(String(electricity).replace(/,/g, '')) || 0) +
    (parseFloat(String(water).replace(/,/g, '')) || 0) +
    (parseFloat(String(drinksTrash).replace(/,/g, '')) || 0);

  return (
    <div className="card max-w-5xl border border-teal-100 bg-gradient-to-br from-teal-50/40 to-white">
      <h2 className="text-lg font-semibold text-gray-900">This month — bill preview</h2>
      <p className="text-sm text-gray-600 mt-1">
        Choose the property above (sidebar <strong>Property</strong> or the control here). Enter <strong>house totals</strong>{' '}
        for the month; splits follow the same rules as Billing: electricity weighted by room (aircon 1×, non-aircon ½×),{' '}
        water and <strong>drinking water + trash bags as one pool</strong> split equally among active tenants.
      </p>
      <p className="text-xs text-gray-500 mt-2">
        Property: <span className="font-medium text-gray-800">{propertyLabel || '—'}</span> · Active tenants:{' '}
        <span className="font-medium text-gray-800">{activeCount}</span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div>
          <label htmlFor="preview-elec" className="label text-xs text-gray-600">
            House electricity (PHP)
          </label>
          <input
            id="preview-elec"
            type="number"
            min="0"
            step="0.01"
            className="input mt-1"
            placeholder="e.g. 3500"
            value={electricity}
            onChange={(e) => setElectricity(e.target.value)}
          />
          <p className="text-xs text-amber-900/80 mt-1">Split by room type (see table).</p>
        </div>
        <div>
          <label htmlFor="preview-water" className="label text-xs text-gray-600">
            Water bill (PHP)
          </label>
          <input
            id="preview-water"
            type="number"
            min="0"
            step="0.01"
            className="input mt-1"
            placeholder="e.g. 1200"
            value={water}
            onChange={(e) => setWater(e.target.value)}
          />
          <p className="text-xs text-cyan-900/80 mt-1">Equal share per active tenant.</p>
        </div>
        <div>
          <label htmlFor="preview-pools" className="label text-xs text-gray-600">
            Drinking water + trash bags (PHP, one pool)
          </label>
          <input
            id="preview-pools"
            type="number"
            min="0"
            step="0.01"
            className="input mt-1"
            placeholder="e.g. 800"
            value={drinksTrash}
            onChange={(e) => setDrinksTrash(e.target.value)}
          />
          <p className="text-xs text-emerald-900/80 mt-1">Combined total; split equally (one figure per tenant).</p>
        </div>
      </div>

      {activeCount === 0 ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          No <strong>active</strong> tenants for this property. Add or re-activate tenants under the <strong>Tenants</strong>{' '}
          tab, or switch property.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3">Tenant</th>
                <th className="px-3 py-3">Room</th>
                <th className="px-3 py-3 text-right">Electricity</th>
                <th className="px-3 py-3 text-right">Water</th>
                <th className="px-3 py-3 text-right">Drinks + trash</th>
                <th className="px-3 py-3 text-right">Utilities</th>
                <th className="px-3 py-3 text-right">Rent</th>
                <th className="px-3 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.tenantId} className="bg-white hover:bg-teal-50/30">
                  <td className="px-3 py-2.5 font-medium text-gray-900">{r.nickname}</td>
                  <td className="px-3 py-2.5 capitalize text-xs text-gray-600">
                    {r.roomType === 'aircon' ? 'Aircon' : 'Non-aircon'}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(r.electricityShare)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(r.waterShare)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPHP(r.drinksTrashShare)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-800">
                    {formatPHP(r.utilitiesSubtotal)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{formatPHP(r.rentAmount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900">{formatPHP(r.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeCount > 0 && totalsEntered <= 0 && (
        <p className="text-sm text-gray-500 mt-4">Enter amounts above to see each tenant&apos;s share.</p>
      )}

      <div className="mt-5 pt-4 border-t border-gray-200 text-sm text-gray-600 space-y-2">
        <p>
          <strong>Preview only</strong> — totals are not saved here. To record the month, open{' '}
          <Link to="/admin/billing/generate" className="text-blue-600 font-medium hover:underline">
            Billing → Generate cycle
          </Link>{' '}
          (electricity, water) and{' '}
          <Link to="/admin/billing/drinking-trash" className="text-blue-600 font-medium hover:underline">
            Drinking water &amp; trash
          </Link>
          . Enter <strong>drinking water</strong> and <strong>trash</strong> so they add up to this combined pool (e.g.
          half and half, or put the full amount in one field and 0 in the other).
        </p>
      </div>
    </div>
  );
}
