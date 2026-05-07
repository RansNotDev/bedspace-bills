import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { createTenant, updateTenant, deleteTenant } from '../utils/api';
import { formatPHDate } from '../utils/helpers';
import { getStoredUser, isSuperAdmin } from '../utils/authHelpers';

const EMPTY_FORM = {
  nickname: '',
  roomType: 'non-aircon',
  moveInDate: '',
  email: '',
  monthlyRent: '',
  bedspaceId: '',
};

/**
 * Tenants are always created under the bedspace in your JWT (sidebar “Switch property” for landlords).
 * @param {object} props
 * @param {Array<{_id:string,name:string,locationName?:string}>|null} [props.bedspaceChoices] — landlord: pick property when adding
 */
export default function TenantList({ tenants, onRefresh, propertyHeadline, bedspaceChoices }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const openAdd = () => {
    const u = getStoredUser();
    setForm({
      ...EMPTY_FORM,
      bedspaceId: u?.activeBedspaceId ? String(u.activeBedspaceId) : '',
    });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (tenant) => {
    setForm({
      nickname: tenant.nickname,
      roomType: tenant.roomType,
      moveInDate: tenant.moveInDate ? tenant.moveInDate.split('T')[0] : '',
      email: tenant.email || '',
      monthlyRent: tenant.monthlyRent != null ? String(tenant.monthlyRent) : '',
      bedspaceId: '',
    });
    setEditingId(tenant._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        const { bedspaceId: _b, ...updatePayload } = form;
        await updateTenant(editingId, updatePayload);
        toast.success('Tenant updated');
      } else {
        const payload = { ...form };
        if (!bedspaceChoices || bedspaceChoices.length <= 1) {
          delete payload.bedspaceId;
        }
        await createTenant(payload);
        toast.success('Tenant added');
        const u = getStoredUser();
        if (isSuperAdmin(u) && form.bedspaceId && String(form.bedspaceId) !== String(u?.activeBedspaceId)) {
          toast.info('Tenant is on another property — switch property in the sidebar to see them in this list.');
        }
      }
      setShowForm(false);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save tenant');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (tenant) => {
    if (!window.confirm(`Deactivate ${tenant.nickname}? They won't appear in future bills.`)) return;
    try {
      await deleteTenant(tenant._id);
      toast.success('Tenant deactivated');
      onRefresh();
    } catch {
      toast.error('Failed to deactivate tenant');
    }
  };

  const handleReactivate = async (tenant) => {
    try {
      await updateTenant(tenant._id, { isActive: true });
      toast.success('Tenant reactivated');
      onRefresh();
    } catch {
      toast.error('Failed to reactivate tenant');
    }
  };

  const activeTenants = tenants.filter((t) => t.isActive);
  const inactiveTenants = tenants.filter((t) => !t.isActive);

  return (
    <div>
      {propertyHeadline && (
        <div className="mb-4 rounded-lg border border-teal-100 bg-teal-50/80 px-4 py-3 text-sm text-teal-900">
          <p className="font-medium text-teal-950">Property / location</p>
          <p className="mt-0.5">
            List shows tenants for <strong>{propertyHeadline}</strong> (sidebar <strong>Property</strong>). When adding a
            tenant, landlords with multiple locations can pick which property they belong to.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Tenants ({activeTenants.length} active)
        </h2>
        <button onClick={openAdd} className="btn-primary text-sm">
          + Add Tenant
        </button>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Tenant' : 'Add New Tenant'}
            </h3>
            {propertyHeadline && !editingId && (
              <p className="text-xs text-gray-600 mb-4 -mt-2">Adding to: {propertyHeadline}</p>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {bedspaceChoices && bedspaceChoices.length > 1 && !editingId && (
                <div>
                  <label className="label">Property / location *</label>
                  <select
                    className="input"
                    required
                    value={form.bedspaceId}
                    onChange={(e) => setForm({ ...form, bedspaceId: e.target.value })}
                  >
                    {bedspaceChoices.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.locationName ? `${b.locationName} (${b.name})` : b.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Which bedspace this tenant rents in.</p>
                </div>
              )}
              <div>
                <label className="label">Nickname *</label>
                <input
                  className="input"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  placeholder="e.g. Juan"
                  required
                />
              </div>
              <div>
                <label className="label">Room Type *</label>
                <select
                  className="input"
                  value={form.roomType}
                  onChange={(e) => setForm({ ...form, roomType: e.target.value })}
                >
                  <option value="non-aircon">Non-Aircon</option>
                  <option value="aircon">Aircon</option>
                </select>
              </div>
              <div>
                <label className="label">Move-in Date</label>
                <input
                  type="date"
                  className="input"
                  value={form.moveInDate}
                  onChange={(e) => setForm({ ...form, moveInDate: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Monthly rent (PHP)</label>
                <input
                  type="number"
                  className="input"
                  min={0}
                  step="0.01"
                  value={form.monthlyRent}
                  onChange={(e) => setForm({ ...form, monthlyRent: e.target.value })}
                  placeholder="0 = utilities only"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Added to each new bill; you can override per month in Bill Details.
                </p>
              </div>
              <div>
                <label className="label">Email (optional)</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="tenant@email.com"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? 'Saving...' : editingId ? 'Update' : 'Add Tenant'}
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Active Tenants Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nickname</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Room</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Move-in</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Rent / mo</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeTenants.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">
                  No active tenants yet. Add one above.
                </td>
              </tr>
            )}
            {activeTenants.map((tenant) => (
              <tr key={tenant._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{tenant.nickname}</td>
                <td className="px-4 py-3">
                  <span className={tenant.roomType === 'aircon' ? 'badge-aircon' : 'badge-nonaircon'}>
                    {tenant.roomType === 'aircon' ? '❄️ Aircon' : '🌀 Non-Aircon'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{formatPHDate(tenant.moveInDate)}</td>
                <td className="px-4 py-3 text-gray-600 tabular-nums">
                  {tenant.monthlyRent != null && Number(tenant.monthlyRent) > 0
                    ? `₱${Number(tenant.monthlyRent).toLocaleString('en-PH')}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{tenant.email || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(tenant)}
                    className="text-blue-600 hover:text-blue-800 mr-3 text-xs font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeactivate(tenant)}
                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                  >
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Inactive Tenants */}
      {inactiveTenants.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
            {inactiveTenants.length} inactive tenant(s)
          </summary>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {inactiveTenants.map((tenant) => (
                  <tr key={tenant._id} className="bg-gray-50 opacity-60">
                    <td className="px-4 py-3 text-gray-500">{tenant.nickname}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{tenant.roomType}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleReactivate(tenant)}
                        className="text-green-600 hover:text-green-800 text-xs font-medium"
                      >
                        Reactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
