import React from 'react';
import { toast } from 'react-toastify';
import { selectBedspace } from '../utils/api';
import { getStoredUser, isSuperAdmin } from '../utils/authHelpers';
import { clearPortfolioGeneralSession, isPortfolioGeneralSession } from '../utils/portfolioGeneralSession';

const PORTFOLIO_GENERAL_PLACEHOLDER = '__portfolio_general__';

/**
 * Landlords with multiple properties: switch active bedspace (new JWT). Reloads the app so all pages pick up context.
 */
export default function PropertySelectControl({ className = '' }) {
  const user = getStoredUser();
  const list = isSuperAdmin(user) && Array.isArray(user.bedspaces) ? user.bedspaces : [];
  const activeId = user?.activeBedspaceId ? String(user.activeBedspaceId) : '';
  const selectValue =
    activeId || (isPortfolioGeneralSession() ? PORTFOLIO_GENERAL_PLACEHOLDER : '');

  if (list.length <= 1) {
    return (
      <div className={className}>
        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Property</p>
        <p className="text-sm font-medium text-gray-900 truncate mt-0.5" title={user?.activeBedspaceName}>
          {user?.activeBedspaceName || '—'}
        </p>
      </div>
    );
  }

  const onChange = async (e) => {
    const id = e.target.value;
    if (!id || id === activeId || id === PORTFOLIO_GENERAL_PLACEHOLDER) return;
    try {
      const { data } = await selectBedspace(id);
      clearPortfolioGeneralSession();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success(`Now viewing: ${data.user.activeBedspaceName || 'property'}`);
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not switch property');
      e.target.value = activeId;
    }
  };

  return (
    <div className={className}>
      <label htmlFor="sidebar-property" className="text-xs text-gray-500 uppercase font-semibold tracking-wide block">
        Property
      </label>
      <select
        id="sidebar-property"
        className="input text-sm py-2 mt-1 w-full"
        value={selectValue}
        onChange={onChange}
      >
        {isPortfolioGeneralSession() && (
          <option value={PORTFOLIO_GENERAL_PLACEHOLDER}>General — all properties</option>
        )}
        {list.map((b) => (
          <option key={b._id} value={b._id}>
            {b.locationName ? `${b.locationName} (${b.name})` : b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
