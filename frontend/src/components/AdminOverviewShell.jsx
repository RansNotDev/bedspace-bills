import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPHP, getMonthLabel, formatPHDate } from '../utils/helpers';

/** Manila “today” at local midnight for deadline comparisons */
function phDayStart() {
  const ph = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  ph.setHours(0, 0, 0, 0);
  return ph;
}

function parseDeadline(d) {
  if (d == null) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

/** Whole days from deadline date to today (PH); negative if deadline is in the future */
function daysSinceDeadline(deadline) {
  const end = parseDeadline(deadline);
  if (!end) return 0;
  const start = phDayStart();
  end.setHours(0, 0, 0, 0);
  return Math.floor((start - end) / (86400000));
}

function formatCompactPHP(n) {
  const x = Math.abs(Number(n) || 0);
  const sign = Number(n) < 0 ? '−' : '';
  if (x >= 1000000) return `${sign}₱${(x / 1000000).toFixed(1)}M`;
  if (x >= 1000) return `${sign}₱${(x / 1000).toFixed(1)}K`;
  return `${sign}${formatPHP(x)}`.replace(/^₱/, '₱');
}

function bucketAging(days) {
  if (days <= 30) return 0;
  if (days <= 60) return 1;
  if (days <= 90) return 2;
  return 3;
}

/** Not yet due → bucket 0–30d */
function bucketForUnpaidRow(deadline) {
  const d = daysSinceDeadline(deadline);
  if (d < 0) return 0;
  return bucketAging(d);
}

const AGING_LABELS = ['0–30d', '31–60d', '61–90d', '90d+'];
const AGING_COLORS = ['bg-violet-500', 'bg-amber-500', 'bg-orange-400', 'bg-red-500'];

/**
 * Reference-style overview: 3 summary cards + tenant bill table (driven by dashboard-summary data).
 */
export default function AdminOverviewShell({
  propertyHeadline,
  isLandlordPortfolio = false,
  overviewBlocks,
  overviewStats,
  perms,
  setTenantsTab,
}) {
  const [period, setPeriod] = useState('12m');
  const [tableTab, setTableTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const blocksChrono = useMemo(
    () => [...(overviewBlocks || [])].sort((a, b) => a.cycle.year - b.cycle.year || a.cycle.month - b.cycle.month),
    [overviewBlocks]
  );

  const blocksNewestFirst = useMemo(() => [...(overviewBlocks || [])], [overviewBlocks]);

  const currentBlock = useMemo(() => {
    if (!overviewStats || !blocksNewestFirst.length) return null;
    return (
      blocksNewestFirst.find(
        (b) =>
          b.cycle.month === overviewStats.currentCalendarMonth &&
          b.cycle.year === overviewStats.currentCalendarYear
      ) || null
    );
  }, [blocksNewestFirst, overviewStats]);

  const blocksForPeriod = useMemo(() => {
    if (period === 'latest') return blocksNewestFirst.slice(0, 1);
    if (period === 'current') return currentBlock ? [currentBlock] : [];
    return blocksNewestFirst;
  }, [period, blocksNewestFirst, currentBlock]);

  const outstandingForBlocks = (blocks) => {
    let s = 0;
    for (const block of blocks) {
      for (const row of block.billRows || []) {
        if (!row.isPaid && Number(row.totalAmount) > 0) s += Number(row.totalAmount);
      }
    }
    return Math.round(s * 100) / 100;
  };

  const pendingCountForBlocks = (blocks) => {
    let n = 0;
    for (const block of blocks) {
      for (const row of block.billRows || []) {
        if (row.notInCycle) n += 1;
      }
    }
    return n;
  };

  const agingTotals = useMemo(() => {
    const totals = [0, 0, 0, 0];
    for (const block of blocksForPeriod) {
      const dl = block.cycle?.deadline;
      for (const row of block.billRows || []) {
        if (row.isPaid || row.notInCycle || Number(row.totalAmount) <= 0) continue;
        const b = bucketForUnpaidRow(dl);
        totals[b] += Number(row.totalAmount);
      }
    }
    return totals.map((x) => Math.round(x * 100) / 100);
  }, [blocksForPeriod]);

  const outstanding = useMemo(() => outstandingForBlocks(blocksForPeriod), [blocksForPeriod]);
  const agingSum = useMemo(() => agingTotals.reduce((a, b) => a + b, 0), [agingTotals]);

  const prevPeriodOutstanding = useMemo(() => {
    if (period === 'latest' && blocksNewestFirst.length > 1) {
      return outstandingForBlocks(blocksNewestFirst.slice(1, 2));
    }
    if (period === 'current' && blocksNewestFirst.length > 1) {
      const curIdx = blocksNewestFirst.findIndex(
        (b) =>
          b.cycle.month === overviewStats?.currentCalendarMonth &&
          b.cycle.year === overviewStats?.currentCalendarYear
      );
      if (curIdx >= 0 && curIdx + 1 < blocksNewestFirst.length) {
        return outstandingForBlocks([blocksNewestFirst[curIdx + 1]]);
      }
    }
    if (period === '12m' && blocksChrono.length > 1) {
      const half = Math.ceil(blocksChrono.length / 2);
      return outstandingForBlocks(blocksChrono.slice(0, half));
    }
    return null;
  }, [period, blocksNewestFirst, blocksChrono, overviewStats]);

  const trendPct = useMemo(() => {
    if (prevPeriodOutstanding == null || prevPeriodOutstanding <= 0) return null;
    const ch = ((outstanding - prevPeriodOutstanding) / prevPeriodOutstanding) * 100;
    return Math.round(ch * 10) / 10;
  }, [outstanding, prevPeriodOutstanding]);

  const latest = blocksNewestFirst[0];
  const prev = blocksNewestFirst[1];
  const barStats = useMemo(() => {
    if (!latest) return { paid: 0, unpaid: 0, pending: 0, draft: 0 };
    let paid = 0;
    let unpaid = 0;
    let pending = 0;
    for (const row of latest.billRows || []) {
      if (row.notInCycle) pending += 1;
      else if (row.isPaid) paid += 1;
      else unpaid += 1;
    }
    const draft = prev ? pendingCountForBlocks([prev]) : 0;
    return { paid, unpaid, pending, draft };
  }, [latest, prev]);

  const barMax = useMemo(() => Math.max(barStats.paid, barStats.unpaid, barStats.pending, barStats.draft, 1), [barStats]);
  const barH = 72;

  const riskAmount = useMemo(() => {
    let s = 0;
    for (const block of blocksNewestFirst) {
      const d = daysSinceDeadline(block.cycle?.deadline);
      if (d < 31) continue;
      for (const row of block.billRows || []) {
        if (!row.isPaid && !row.notInCycle && Number(row.totalAmount) > 0) s += Number(row.totalAmount);
      }
    }
    return Math.round(s * 100) / 100;
  }, [blocksNewestFirst]);

  const riskMeta = useMemo(() => {
    let maxDays = 0;
    let overdueRows = 0;
    for (const block of blocksNewestFirst) {
      const d = daysSinceDeadline(block.cycle?.deadline);
      for (const row of block.billRows || []) {
        if (row.isPaid || row.notInCycle || Number(row.totalAmount) <= 0) continue;
        if (d > 0) {
          overdueRows += 1;
          maxDays = Math.max(maxDays, d);
        }
      }
    }
    const pendingLatest = latest ? pendingCountForBlocks([latest]) : 0;
    let small = 0;
    for (const block of blocksNewestFirst) {
      for (const row of block.billRows || []) {
        if (!row.isPaid && !row.notInCycle && Number(row.totalAmount) > 0 && Number(row.totalAmount) < 500) {
          small += 1;
        }
      }
    }
    return { maxDays, overdueRows, pendingLatest, small };
  }, [blocksNewestFirst, latest]);

  const tableRows = useMemo(() => {
    const out = [];
    for (const block of blocksNewestFirst) {
      const label = getMonthLabel(block.cycle.month, block.cycle.year);
      for (const row of block.billRows || []) {
        const status = row.notInCycle ? 'pending' : row.isPaid ? 'paid' : 'unpaid';
        out.push({
          key: `${block.cycle.month}-${block.cycle.year}-${row.tenantBillId || row.tenantUserId || row.nickname}`,
          cycleLabel: label,
          cycleId: String(block.cycle._id),
          deadline: block.cycle.deadline,
          nickname: row.nickname,
          roomType: row.roomType,
          amount: row.notInCycle ? 0 : Number(row.totalAmount) || 0,
          status,
          notInCycle: row.notInCycle,
        });
      }
    }
    return out;
  }, [blocksNewestFirst]);

  const filteredRows = useMemo(() => {
    let rows = tableRows;
    const st = statusFilter === 'all' ? null : statusFilter;
    if (tableTab === 'unpaid') rows = rows.filter((r) => r.status === 'unpaid');
    else if (tableTab === 'paid') rows = rows.filter((r) => r.status === 'paid');
    if (st) rows = rows.filter((r) => r.status === st);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.nickname.toLowerCase().includes(q));
    }
    return rows;
  }, [tableRows, tableTab, statusFilter, search]);

  const agingPercents = agingSum > 0 ? agingTotals.map((x) => (x / agingSum) * 100) : null;

  return (
    <div className="space-y-8">
      {/* Top actions — reference-style */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {(perms.generateBills || perms.manageBillCycles || perms.uploadQR) && (
          <>
            <Link
              to="/admin/billing"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold border-2 border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
            >
              Billing
            </Link>
            <Link
              to="/admin/billing/generate"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
            >
              <span className="text-lg leading-none">+</span> New bill cycle
            </Link>
          </>
        )}
      </div>

      {/* Three cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1 — Outstanding */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Outstanding balance</h3>
            <select
              className="text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-700"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="12m">Last 12 cycles</option>
              <option value="current">This month (PH)</option>
              <option value="latest">Latest cycle</option>
            </select>
          </div>
          <p className="text-3xl font-bold text-gray-900 tracking-tight">{formatCompactPHP(outstanding)}</p>
          {trendPct != null && (
            <p className={`text-sm mt-1 font-medium ${trendPct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {trendPct > 0 ? '↑' : '↓'} {Math.abs(trendPct)}% vs comparison period
            </p>
          )}
          <p className="text-xs text-gray-500 mt-3 mb-2">Unpaid billed amounts by days past payment deadline</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 gap-0.5">
            {agingPercents ? (
              agingPercents.map((pct, i) => (
                <div
                  key={AGING_LABELS[i]}
                  className={`${AGING_COLORS[i]} h-full transition-all min-w-[2px]`}
                  style={{ width: `${Math.max(pct, 0)}%` }}
                  title={`${AGING_LABELS[i]}: ${formatPHP(agingTotals[i])}`}
                />
              ))
            ) : (
              <div className="h-full w-full bg-gray-200 rounded-full" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-gray-600">
            {AGING_LABELS.map((lb, i) => (
              <div key={lb} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${AGING_COLORS[i]}`} />
                <span>{lb}</span>
                <span className="font-medium text-gray-900 ml-auto tabular-nums">{formatPHP(agingTotals[i])}</span>
              </div>
            ))}
          </div>
          {perms.manageBillCycles && (
            <Link
              to="/admin/billing/details"
              className="mt-4 inline-flex items-center text-sm font-semibold text-violet-700 hover:text-violet-900"
            >
              Manage collections →
            </Link>
          )}
        </div>

        {/* Card 2 — Activity */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-900">Latest cycle</h3>
            {latest && (
              <span className="text-xs text-gray-500">{getMonthLabel(latest.cycle.month, latest.cycle.year)}</span>
            )}
          </div>
          {!latest ? (
            <p className="text-sm text-gray-500 py-8">No cycles yet.</p>
          ) : (
            <>
              <div className="flex items-end justify-center gap-3 h-[100px] mt-2">
                {[
                  { label: 'Paid', n: barStats.paid, cls: 'bg-violet-500' },
                  { label: 'Unpaid', n: barStats.unpaid, cls: 'bg-emerald-500' },
                  { label: 'Pending', n: barStats.pending, cls: 'bg-amber-500' },
                  { label: 'Prior pending', n: barStats.draft, cls: 'bg-slate-400' },
                ].map((b) => (
                  <div key={b.label} className="flex flex-col items-center gap-2 flex-1">
                    <div
                      className={`w-full max-w-[3rem] rounded-t-md ${b.cls} mx-auto`}
                      style={{ height: `${Math.max(8, (b.n / barMax) * barH)}px` }}
                      title={`${b.label}: ${b.n}`}
                    />
                    <span className="text-[10px] text-gray-500 text-center leading-tight">{b.label}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
                <div className="flex gap-2">
                  <span className="w-1 rounded-full bg-red-500 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs">Unpaid bills</p>
                    <p className="font-semibold text-gray-900">{barStats.unpaid}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="w-1 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <p className="text-gray-500 text-xs">Pending row</p>
                    <p className="font-semibold text-gray-900">{barStats.pending}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Link
                  to="/admin/billing/details"
                  className="flex-1 min-w-[120px] text-center text-xs font-semibold py-2 rounded-full border-2 border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Review bills →
                </Link>
                {perms.manageTenants && setTenantsTab && (
                  <button
                    type="button"
                    onClick={() => setTenantsTab()}
                    className="flex-1 min-w-[120px] text-xs font-semibold py-2 rounded-full border-2 border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    Tenants →
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Card 3 — Revenue at risk */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900">Revenue at risk</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Priority
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 mt-2">{formatCompactPHP(riskAmount)}</p>
          <p className="text-xs text-gray-500 mt-1">Unpaid · deadline 31+ days ago</p>
          <div className="grid grid-cols-3 gap-2 mt-5 text-center border-t border-gray-100 pt-4">
            <div className="border-r border-gray-100 pr-2">
              <p className="text-xs text-gray-500">Oldest</p>
              <p className="text-sm font-semibold text-gray-900">{riskMeta.maxDays ? `${riskMeta.maxDays}d` : '—'}</p>
              <p className="text-[10px] text-gray-500">{riskMeta.overdueRows} unpaid</p>
            </div>
            <div className="border-r border-gray-100 px-1">
              <p className="text-xs text-gray-500">Needs bill</p>
              <p className="text-sm font-semibold text-gray-900">{riskMeta.pendingLatest}</p>
              <p className="text-[10px] text-gray-500">This cycle</p>
            </div>
            <div className="pl-2">
              <p className="text-xs text-gray-500">Under ₱500</p>
              <p className="text-sm font-semibold text-gray-900">{riskMeta.small}</p>
              <p className="text-[10px] text-gray-500">Unpaid bills</p>
            </div>
          </div>
          <Link
            to="/admin/billing/details"
            className="mt-4 inline-flex items-center text-sm font-semibold text-violet-700 hover:text-violet-900"
          >
            View all priorities →
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200/80 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex rounded-xl bg-gray-200/60 p-1 w-fit">
            {['all', 'unpaid', 'paid'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTableTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  tableTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t === 'all' ? 'All rows' : t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                type="search"
                placeholder="Search tenant…"
                className="pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm w-44 sm:w-56 focus:ring-2 focus:ring-violet-200 focus:border-violet-300 outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All status</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500 bg-white border-b border-gray-100">
                <th className="px-4 py-3">Cycle</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No rows match. Try another tab or clear search.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.key} className="bg-white hover:bg-violet-50/30">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.cycleLabel}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{r.nickname}</span>
                      {r.notInCycle && (
                        <span className="block text-xs text-amber-700">No bill generated yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600 text-xs">
                      {r.roomType ? r.roomType.replace('-', ' ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {formatPHDate(r.deadline)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                      {r.notInCycle ? '—' : formatPHP(r.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status === 'paid' && (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800">
                          Paid
                        </span>
                      )}
                      {r.status === 'unpaid' && (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-800">
                          Unpaid
                        </span>
                      )}
                      {r.status === 'pending' && (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-900">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/admin/billing/details"
                        className="text-violet-600 font-medium hover:underline text-xs"
                      >
                        Open bills
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 px-4 py-3 bg-gray-50/80 border-t border-gray-100">
          {isLandlordPortfolio ? (
            <>
              Rows use the last 12 bill cycles for the <strong>active property</strong> ({propertyHeadline}
              ). Switch property under <strong>Property</strong> in the sidebar. Open{' '}
              <strong>Billing → All tenant bills</strong> to mark paid or send links.
            </>
          ) : (
            <>
              Rows are built from your last 12 bill cycles for <strong>{propertyHeadline}</strong>. {''}
              Open <strong>Billing → All tenant bills</strong> to mark paid or send links.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
