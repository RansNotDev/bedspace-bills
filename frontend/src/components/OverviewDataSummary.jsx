import React, { useMemo, useState } from 'react';
import { formatPHP } from '../utils/helpers';

/**
 * KPI + bar chart for collections (billed vs collected) from time series points.
 */
export default function OverviewDataSummary({
  title = 'Collections overview',
  subtitle,
  /** @type {{ month: number, year: number, totalBilled: number, totalCollected: number, cycleId?: string }[]} */
  series,
  /** Optional KPIs when series is empty or you want explicit headline numbers */
  headline,
}) {
  const financials = useMemo(() => summarizeSeries(series), [series]);
  const showChart = series && series.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Active tenants"
          value={headline?.activeTenants != null ? String(headline.activeTenants) : '—'}
        />
        <KpiCard label="Total billed" value={formatPHP(headline?.sumBilled ?? financials.sumBilled)} />
        <KpiCard label="Total collected" value={formatPHP(headline?.sumCollected ?? financials.sumCollected)} />
        <KpiCard
          label="Collection rate"
          value={
            (headline?.collectionRate != null ? headline.collectionRate : financials.collectionRate) != null
              ? `${headline?.collectionRate ?? financials.collectionRate}%`
              : '—'
          }
        />
      </div>

      {showChart ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Billed vs collected by month</h3>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Gray bars = total billed; green = collected. Oldest to newest (up to 12 cycles).
          </p>
          <CollectionsBarChart series={series} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No bill cycles yet — charts appear after you generate a cycle.
        </div>
      )}
    </div>
  );
}

/** Landlord multi-property wrapper: general (merged) vs one bedspace */
export function OverviewMultiPropertyCharts({ overviewPayload, activePropertyLabel }) {
  const { perBedspace = [], mergedSeries = [], mergedTotals = {} } = overviewPayload || {};
  const options = useMemo(() => {
    const opts = [{ value: '__all__', label: 'All properties (merged)' }];
    for (const p of perBedspace) {
      opts.push({ value: p.bedspaceId, label: p.displayLabel || p.name });
    }
    return opts;
  }, [perBedspace]);

  const [scope, setScope] = useState('__all__');

  const current = useMemo(() => {
    if (scope === '__all__') {
      return {
        title: 'All properties — merged',
        subtitle:
          mergedTotals.propertiesCount > 0
            ? `${mergedTotals.propertiesCount} propert${mergedTotals.propertiesCount === 1 ? 'y' : 'ies'} · ${mergedTotals.totalActiveTenants ?? 0} active tenants (sum across properties)`
            : '',
        series: mergedSeries.map((row) => ({
          month: row.month,
          year: row.year,
          totalBilled: row.totalBilled,
          totalCollected: row.totalCollected,
        })),
        headline: {
          activeTenants: mergedTotals.totalActiveTenants,
          sumBilled: mergedTotals.sumBilled,
          sumCollected: mergedTotals.sumCollected,
          collectionRate: mergedTotals.collectionRate,
        },
      };
    }
    const one = perBedspace.find((p) => p.bedspaceId === scope);
    if (!one) {
      return {
        title: 'Property',
        subtitle: '',
        series: [],
        headline: {},
      };
    }
    return {
      title: one.displayLabel || one.name,
      subtitle: `${one.activeTenants} active tenants · this property only`,
      series: one.series || [],
      headline: {
        activeTenants: one.activeTenants,
        sumBilled: one.totals?.sumBilled,
        sumCollected: one.totals?.sumCollected,
        collectionRate: one.totals?.collectionRate,
      },
    };
  }, [scope, perBedspace, mergedSeries, mergedTotals]);

  if (!overviewPayload || options.length <= 1) return null;

  return (
    <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/40 to-white px-4 py-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Portfolio</p>
          <p className="text-sm text-gray-700 mt-1">
            You manage multiple locations. Pick <strong>merged</strong> for one chart summed by calendar month, or a
            single property.
          </p>
          {activePropertyLabel && (
            <p className="text-xs text-gray-500 mt-2">
              Working in dashboard context: <span className="font-medium text-gray-800">{activePropertyLabel}</span>
            </p>
          )}
        </div>
        <div className="min-w-[220px]">
          <label htmlFor="overview-scope" className="label">
            Chart scope
          </label>
          <select
            id="overview-scope"
            className="input"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <OverviewDataSummary
        title={current.title}
        subtitle={current.subtitle}
        series={current.series}
        headline={current.headline}
      />
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1 tabular-nums break-all">{value}</p>
    </div>
  );
}

function summarizeSeries(series) {
  if (!series?.length) {
    return { sumBilled: 0, sumCollected: 0, collectionRate: null };
  }
  let sumBilled = 0;
  let sumCollected = 0;
  for (const p of series) {
    sumBilled += Number(p.totalBilled) || 0;
    sumCollected += Number(p.totalCollected) || 0;
  }
  const collectionRate = sumBilled > 0 ? Math.round((sumCollected / sumBilled) * 1000) / 10 : null;
  return { sumBilled, sumCollected, collectionRate };
}

function shortCycleLabel(month, year) {
  return `${new Date(year, month - 1, 1).toLocaleString('en-PH', { month: 'short' })} '${String(year).slice(-2)}`;
}

function CollectionsBarChart({ series }) {
  const max = Math.max(
    ...series.map((t) => Math.max(Number(t.totalBilled) || 0, Number(t.totalCollected) || 0)),
    1
  );
  const barMaxPx = 120;

  return (
    <>
      <div className="flex items-end justify-stretch gap-1 sm:gap-2 min-h-[140px] px-1 overflow-x-auto pb-1">
        {series.map((t, idx) => {
          const billed = Number(t.totalBilled) || 0;
          const coll = Number(t.totalCollected) || 0;
          const hB = Math.max(2, (billed / max) * barMaxPx);
          const hC = Math.max(2, (coll / max) * barMaxPx);
          const key = t.cycleId || `${t.year}-${t.month}-${idx}`;
          return (
            <div key={key} className="flex-1 flex flex-col items-center gap-1.5 min-w-[36px]">
              <div className="flex gap-1 items-end justify-center h-[128px] w-full">
                <div
                  className="w-2.5 sm:w-3 rounded-t bg-slate-200 shrink-0"
                  style={{ height: `${hB}px` }}
                  title={`Billed ${formatPHP(billed)}`}
                />
                <div
                  className="w-2.5 sm:w-3 rounded-t bg-emerald-500 shrink-0"
                  style={{ height: `${hC}px` }}
                  title={`Collected ${formatPHP(coll)}`}
                />
              </div>
              <span className="text-[10px] text-gray-500 text-center leading-tight line-clamp-2 px-0.5">
                {t.month && t.year ? shortCycleLabel(t.month, t.year) : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-slate-200" /> Billed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Collected
        </span>
      </div>
    </>
  );
}

/** Build chronological chart points from admin dashboard summary blocks (newest-first API order). */
export function seriesFromOverviewBlocks(blocks) {
  if (!blocks?.length) return [];
  return blocks
    .slice()
    .reverse()
    .map((b) => ({
      cycleId: String(b.cycle._id),
      month: b.cycle.month,
      year: b.cycle.year,
      totalBilled: Number(b.totalBilled) || 0,
      totalCollected: Number(b.totalCollected) || 0,
    }));
}

/** Convenience KPIs from the same blocks the chart uses */
export function headlineFromSummary(summary) {
  if (!summary) return {};
  const os = summary.overviewStats;
  return {
    activeTenants: summary.activeTenants,
    sumBilled: os?.totalBilled12m,
    sumCollected: os?.totalCollected12m,
    collectionRate: os?.collectionRate12m,
  };
}
