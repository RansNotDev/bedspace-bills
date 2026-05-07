import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import TenantList from '../components/TenantList';
import PropertySelectControl from '../components/PropertySelectControl';
import PropertyBillSplitPreview from '../components/PropertyBillSplitPreview';
import { OverviewMultiPropertyCharts } from '../components/OverviewDataSummary';
import AdminOverviewShell from '../components/AdminOverviewShell';
import LandlordAccessPanel from '../components/LandlordAccessPanel';
import { getTenants, getDashboardSummary, getSuperDashboardOverview, changePassword } from '../utils/api';
import { effectiveMiniPerms, isSuperAdmin, getStoredUser, getStaffBillingNav } from '../utils/authHelpers';
import { formatPHP, getMonthLabel, formatPHDate, CURRENCY_NOTE } from '../utils/helpers';
import { isPortfolioGeneralSession, setPortfolioGeneralSession } from '../utils/portfolioGeneralSession';

const TAB_DEFS = [
  { id: 'Overview', perm: null },
  { id: 'Property', perm: null },
  { id: 'Tenants', perm: 'manageTenants' },
  { id: 'Landlord & access', perm: null, superOnly: true },
];

export default function AdminDashboard() {
  const dashUser = getStoredUser();
  const perms = effectiveMiniPerms(dashUser);
  const location = useLocation();
  const navigate = useNavigate();

  const visibleTabs = useMemo(() => {
    let defs = TAB_DEFS.filter(
      (t) =>
        (!t.superOnly || isSuperAdmin(dashUser)) && (t.perm == null || perms[t.perm])
    );
    if (isSuperAdmin(dashUser) && (!dashUser?.bedspaces || dashUser.bedspaces.length === 0)) {
      defs = defs.filter((t) => t.superOnly);
    }
    return defs;
  }, [dashUser, perms]);

  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.id || 'Overview');
  const [tenants, setTenants] = useState([]);
  const [summary, setSummary] = useState(null);
  const [superOverview, setSuperOverview] = useState(null);

  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdNew2, setPwdNew2] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  /** Overview: which bill cycle month is focused */
  const [overviewCycleId, setOverviewCycleId] = useState('');
  const [overviewShowAllMonths, setOverviewShowAllMonths] = useState(false);

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  /** Deep-link tab from choose-property screen (Add property / Add tenant / General portfolio). */
  useEffect(() => {
    const st = location.state;
    if (!st || (!st.openDashboardTab && !st.openTenantsTab && !st.portfolioGeneral)) return;

    if (st.portfolioGeneral) {
      setPortfolioGeneralSession(true);
    }
    if (st.openDashboardTab && visibleTabs.some((t) => t.id === st.openDashboardTab)) {
      setActiveTab(st.openDashboardTab);
    }
    if (st.openTenantsTab && visibleTabs.some((t) => t.id === 'Tenants')) {
      setActiveTab('Tenants');
    }

    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate, visibleTabs]);

  const propertyHeadline = useMemo(() => {
    const b = summary?.bedspace;
    if (b?.locationName) return `${b.locationName} (${b.name})`;
    if (b?.name) return b.name;
    return dashUser?.activeBedspaceName || 'This property';
  }, [summary?.bedspace, dashUser?.activeBedspaceName]);

  const overviewStats = summary?.overviewStats;
  const overviewBlocks = summary?.collectionsByMonth ?? [];

  const billingLinks = useMemo(() => getStaffBillingNav(dashUser), [dashUser]);

  /** Landlord: working without a bedspace-scoped JWT — portfolio charts only until you pick Property */
  const portfolioGeneralMode =
    isSuperAdmin(dashUser) && !!dashUser.needsBedspaceSelection && isPortfolioGeneralSession();

  const bedspaceChoicesForTenants = useMemo(() => {
    if (!isSuperAdmin(dashUser) || !dashUser.bedspaces || dashUser.bedspaces.length <= 1) return null;
    return dashUser.bedspaces;
  }, [dashUser]);

  const loadData = useCallback(async () => {
    try {
      const tenantsP = getTenants();
      const summaryP = getDashboardSummary();
      const [tenantsRes, summaryRes] = await Promise.all([tenantsP, summaryP]);
      setTenants(tenantsRes.data);
      setSummary(summaryRes.data);

      const u = getStoredUser();
      if (isSuperAdmin(u) && u.bedspaces && u.bedspaces.length > 1) {
        try {
          const { data } = await getSuperDashboardOverview();
          setSuperOverview(data);
        } catch {
          setSuperOverview(null);
        }
      } else {
        setSuperOverview(null);
      }
    } catch (err) {
      toast.error('Failed to load dashboard data');
    }
  }, []);

  useEffect(() => {
    const list = summary?.collectionsByMonth;
    if (!list?.length) return;
    setOverviewCycleId((prev) => {
      const ids = list.map((b) => String(b.cycle._id));
      if (prev && ids.includes(String(prev))) return prev;
      return String(list[0].cycle._id);
    });
  }, [summary]);

  const selectedOverviewBlock = useMemo(() => {
    if (!overviewBlocks.length) return null;
    return (
      overviewBlocks.find((b) => String(b.cycle._id) === String(overviewCycleId)) ??
      overviewBlocks[0]
    );
  }, [overviewBlocks, overviewCycleId]);

  useEffect(() => {
    const u = getStoredUser();
    if (isSuperAdmin(u) && (!u?.bedspaces || u.bedspaces.length === 0)) {
      return;
    }
    if (isSuperAdmin(u) && u.needsBedspaceSelection && isPortfolioGeneralSession()) {
      (async () => {
        try {
          const { data } = await getSuperDashboardOverview();
          setSuperOverview(data);
        } catch {
          setSuperOverview(null);
          toast.error('Could not load portfolio overview');
        }
      })();
      return;
    }
    if (isSuperAdmin(u) && u.needsBedspaceSelection) {
      return;
    }
    loadData();
  }, []);

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

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Manage tenants, bills, and payments</p>
          {isSuperAdmin(dashUser) && dashUser.bedspaces && dashUser.bedspaces.length > 1 && (
            <div className="mt-3 md:hidden max-w-md">
              <PropertySelectControl />
            </div>
          )}
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
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.id}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'Overview' && (
        <div className="space-y-6">
          {isSuperAdmin(dashUser) ? (
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-white px-4 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Landlord overview</p>
                <h2 className="text-lg font-bold text-gray-900 mt-0.5">Portfolio &amp; rules</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {portfolioGeneralMode ? (
                    <>
                      You&apos;re in <strong>general (all properties)</strong> mode — merged portfolio charts are below.
                      To use <strong>Billing</strong>, per-property KPIs, or the tenant table, pick one location under{' '}
                      <strong>Property</strong> in the sidebar or{' '}
                      <Link to="/admin/select-bedspace" className="font-semibold text-indigo-800 underline">
                        Choose a property
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      Charts and billing data follow the <strong>active property</strong> in the sidebar. Use{' '}
                      <strong>Rules</strong> for bill PDF text and defaults; open <strong>Billing</strong> for cycles and
                      GCash.
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!portfolioGeneralMode &&
                  (perms.generateBills || perms.manageBillCycles || perms.uploadQR) && (
                  <Link
                    to="/admin/billing"
                    className="btn-primary text-sm whitespace-nowrap inline-flex items-center justify-center"
                  >
                    Billing
                  </Link>
                )}
                <Link
                  to="/admin/rules"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold border-2 border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50 whitespace-nowrap"
                >
                  Rules
                </Link>
                {!portfolioGeneralMode && perms.manageTenants && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('Tenants')}
                    className="btn-secondary text-sm whitespace-nowrap"
                  >
                    Tenants
                  </button>
                )}
                {!portfolioGeneralMode && perms.viewReports && (
                  <Link
                    to="/admin/reports"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Reports &amp; PDF
                  </Link>
                )}
                {perms.viewCalendar && (
                  <Link
                    to="/admin/calendar"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Calendar
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/90 to-white px-4 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">At a glance</p>
                <h2 className="text-lg font-bold text-gray-900 mt-0.5">{propertyHeadline}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Portfolio summary below when you have multiple locations. This property:{' '}
                  <strong>{propertyHeadline}</strong>. Use <strong>Property</strong> in the tabs or sidebar to switch
                  context, and <strong>Billing</strong> for cycles and GCash.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(perms.generateBills || perms.manageBillCycles || perms.uploadQR) && (
                  <Link
                    to="/admin/billing"
                    className="btn-primary text-sm whitespace-nowrap inline-flex items-center justify-center"
                  >
                    Billing
                  </Link>
                )}
                {perms.manageTenants && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('Tenants')}
                    className="btn-secondary text-sm whitespace-nowrap"
                  >
                    Tenants
                  </button>
                )}
                {perms.viewReports && (
                  <Link
                    to="/admin/reports"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Reports &amp; PDF
                  </Link>
                )}
                {perms.viewCalendar && (
                  <Link
                    to="/admin/calendar"
                    className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 whitespace-nowrap"
                  >
                    Calendar
                  </Link>
                )}
              </div>
            </div>
          )}

          {overviewStats &&
            overviewBlocks.length > 0 &&
            !overviewStats.hasCycleForCurrentCalendarMonth && (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                role="status"
              >
                <p className="text-sm text-amber-950">
                  <strong>No bill cycle yet</strong> for{' '}
                  {getMonthLabel(overviewStats.currentCalendarMonth, overviewStats.currentCalendarYear)} (Philippine
                  month). Generate one so tenants get their bills for this month.
                </p>
                {perms.generateBills && (
                  <Link to="/admin/billing/generate" className="btn-primary text-sm shrink-0 inline-flex items-center justify-center">
                    Go to generate bill
                  </Link>
                )}
              </div>
            )}

          {isSuperAdmin(dashUser) && dashUser.bedspaces?.length > 1 && superOverview ? (
            <OverviewMultiPropertyCharts
              overviewPayload={superOverview}
              activePropertyLabel={portfolioGeneralMode ? 'All properties' : propertyHeadline}
            />
          ) : null}

          {portfolioGeneralMode && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
              <strong>General view</strong> — Per-property KPIs, collections table, and month drill-down need an active
              property. Use the sidebar <strong>Property</strong> picker when you&apos;re ready.
            </div>
          )}

          {!portfolioGeneralMode && (
            <AdminOverviewShell
              propertyHeadline={propertyHeadline}
              isLandlordPortfolio={isSuperAdmin(dashUser)}
              overviewBlocks={overviewBlocks}
              overviewStats={overviewStats}
              perms={perms}
              setTenantsTab={perms.manageTenants ? () => setActiveTab('Tenants') : undefined}
            />
          )}

          {!portfolioGeneralMode && (
            <p className="text-sm text-gray-600 max-w-3xl">
              Pick a <strong>bill cycle month</strong> below for house meter totals (electricity, water, drinking water,
              trash) and each tenant row. {CURRENCY_NOTE} Amounts are <strong>for that month only</strong>.
            </p>
          )}

          {!portfolioGeneralMode &&
            (overviewBlocks.length > 0 && selectedOverviewBlock ? (
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
                      {overviewBlocks.map((b) => {
                        const isThisCalMonth =
                          overviewStats &&
                          b.cycle.month === overviewStats.currentCalendarMonth &&
                          b.cycle.year === overviewStats.currentCalendarYear;
                        return (
                          <option key={b.cycle._id} value={b.cycle._id}>
                            {getMonthLabel(b.cycle.month, b.cycle.year)}
                            {isThisCalMonth ? ' · this month (PH)' : ''}
                          </option>
                        );
                      })}
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
              {perms.generateBills ? (
                <Link to="/admin/billing/generate" className="btn-primary text-sm inline-flex items-center justify-center">
                  Generate bill cycle
                </Link>
              ) : (
                <p className="text-sm text-gray-400">Your account cannot generate bills.</p>
              )}
            </div>
          ))}

          {!portfolioGeneralMode && (
          <div className="text-center">
            <Link
              to="/admin/billing/details"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Open billing — bill details &amp; payments →
            </Link>
          </div>
          )}
        </div>
      )}

      {activeTab === 'Property' && (
        <div className="space-y-6">
          <div className="card max-w-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Property context</h2>
            <p className="text-sm text-gray-600 mt-1">
              Dashboard, tenants, and billing use the property selected here (same as the sidebar).
            </p>
            <div className="mt-4 max-w-md">
              <PropertySelectControl />
            </div>
            <p className="mt-3 text-sm text-gray-600">
              Active property: <span className="font-semibold text-gray-900">{propertyHeadline}</span>
            </p>
          </div>

          <PropertyBillSplitPreview tenants={tenants} propertyLabel={propertyHeadline} />

          {billingLinks.length > 0 && (
            <div className="card max-w-3xl">
              <h3 className="text-base font-semibold text-gray-900">Billing (this property)</h3>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                Generate cycles, view electricity/water/pools, GCash — scoped to the property above.
              </p>
              <div className="flex flex-wrap gap-2">
                {billingLinks.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm text-gray-600">
            PDF rules:{' '}
            <Link to="/admin/rules" className="text-blue-600 font-medium hover:underline">
              Rules for PDF
            </Link>{' '}
            (also in the sidebar).
          </p>
        </div>
      )}

      {/* ── TENANTS TAB ── */}
      {activeTab === 'Tenants' && (
        <div className="card">
          <TenantList
            tenants={tenants}
            onRefresh={loadData}
            propertyHeadline={propertyHeadline}
            bedspaceChoices={bedspaceChoicesForTenants}
          />
        </div>
      )}

      {activeTab === 'Landlord & access' && isSuperAdmin(dashUser) && <LandlordAccessPanel />}

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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Change password</h2>
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
