import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { selectBedspace, getSuperBedspaces } from '../utils/api';
import { isSuperAdmin, getStoredUser } from '../utils/authHelpers';
import { clearPortfolioGeneralSession, setPortfolioGeneralSession } from '../utils/portfolioGeneralSession';

/** Label shown for a bedspace in lists and pickers */
function bedspaceLabel(b) {
  if (!b) return '';
  return b.locationName ? `${b.locationName} (${b.name})` : b.name;
}

/**
 * After landlord login with more than one property, they pick which bedspace
 * the dashboard should use. Issues a new JWT scoped to that property.
 */
export default function SelectBedspace() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  /** Property chosen for “Add tenant” (required before that action) */
  const [tenantBedspaceId, setTenantBedspaceId] = useState('');

  useEffect(() => {
    const user = getStoredUser();
    if (!user || !isSuperAdmin(user)) {
      navigate('/admin', { replace: true });
      return;
    }
    (async () => {
      try {
        const { data } = await getSuperBedspaces();
        setList(Array.isArray(data) ? data : []);
        if (data.length === 0) {
          toast.info('Create a property first — use Add property below, or Landlord & access on the dashboard.');
          /* Stay on page so “Add property” is available */
        }
      } catch {
        toast.error('Could not load your properties');
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const handlePick = async (id) => {
    setSavingId(id);
    try {
      const { data } = await selectBedspace(id);
      clearPortfolioGeneralSession();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success(`Working in: ${data.user.activeBedspaceName || 'bedspace'}`);
      navigate('/admin', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not select property');
    } finally {
      setSavingId('');
    }
  };

  /** Open dashboard on Landlord & access to create a new property (no bedspace switch required). */
  const handleAddProperty = () => {
    navigate('/admin', { state: { openDashboardTab: 'Landlord & access' } });
  };

  /** Switch JWT to the chosen bedspace, then open Tenants tab. */
  const handleAddTenant = async () => {
    if (!tenantBedspaceId) {
      toast.warning('Select a property first — that sets which bedspace the new tenant belongs to.');
      return;
    }
    setSavingId(tenantBedspaceId);
    try {
      const { data } = await selectBedspace(tenantBedspaceId);
      clearPortfolioGeneralSession();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success(`Opening Tenants for ${data.user.activeBedspaceName || 'this property'}`);
      navigate('/admin', { replace: true, state: { openTenantsTab: true } });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not switch property');
    } finally {
      setSavingId('');
    }
  };

  /** Portfolio-wide dashboard: no bedspace in JWT yet; merged charts load via super API. */
  const handleGeneralPortfolio = () => {
    setPortfolioGeneralSession(true);
    navigate('/admin', { replace: true, state: { openDashboardTab: 'Overview', portfolioGeneral: true } });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading your properties…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md card">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Choose a property</h1>
        <p className="text-sm text-gray-600 mb-5">
          You manage more than one bedspace. Pick which one this session is for. You can switch anytime from the
          sidebar under <strong>Property</strong>.
        </p>

        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 mb-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Quick actions</p>
          <button
            type="button"
            onClick={handleAddProperty}
            disabled={!!savingId}
            className="w-full px-4 py-2.5 rounded-lg border-2 border-blue-200 bg-white text-blue-800 text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-60"
          >
            Add property
          </button>
          <div>
            <label htmlFor="tenant-bedspace" className="block text-xs font-medium text-gray-600 mb-1">
              Property for new tenant <span className="text-red-600">*</span>
            </label>
            <select
              id="tenant-bedspace"
              className="input text-sm py-2 w-full"
              value={tenantBedspaceId}
              onChange={(e) => setTenantBedspaceId(e.target.value)}
              disabled={!!savingId || list.length === 0}
            >
              <option value="">— Select a property first —</option>
              {list.map((b) => (
                <option key={b._id} value={b._id}>
                  {bedspaceLabel(b)}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Add tenant switches your session to that property, then opens the Tenants tab.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddTenant}
            disabled={!!savingId || !tenantBedspaceId || list.length === 0}
            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingId && tenantBedspaceId === savingId ? 'Opening…' : 'Add tenant'}
          </button>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            You do not have any properties yet. Use <strong>Add property</strong> above to create one.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Portfolio</p>
            <button
              type="button"
              onClick={handleGeneralPortfolio}
              disabled={!!savingId}
              className="w-full text-left px-4 py-3 rounded-lg border-2 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 transition-colors font-semibold text-indigo-950 disabled:opacity-60 mb-4"
            >
              General — all properties
            </button>
            <p className="text-xs text-gray-500 mb-3">
              Opens the dashboard with merged portfolio charts. Pick a single property later from the sidebar when you need billing or tenant details.
            </p>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Open dashboard (one property)</p>
            <ul className="space-y-2">
              {list.map((b) => (
                <li key={b._id}>
                  <button
                    type="button"
                    onClick={() => handlePick(b._id)}
                    disabled={!!savingId}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-200 transition-colors font-medium text-gray-900 disabled:opacity-60"
                  >
                    {savingId === b._id ? 'Opening…' : bedspaceLabel(b)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
