import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
  getSuperBedspaces,
  createSuperBedspace,
  getSuperBedspacePeople,
  createMiniAdmin,
  updateMiniAdmin,
  updateTenantPortal,
  selectBedspace,
  updateSuperBedspace,
} from '../utils/api';
import { DEFAULT_MINI_ADMIN_PERMISSIONS } from '../utils/authHelpers';

const PERM_LABELS = {
  manageTenants: 'Manage tenants',
  manageBillCycles: 'View / edit bill cycles',
  generateBills: 'Generate monthly bills',
  sendPaymentLinks: 'Send payment links',
  markPaid: 'Mark bills paid / unpaid',
  uploadQR: 'Upload GCash QR images',
  viewReports: 'Reports',
  viewCalendar: 'Calendar',
};

/**
 * Landlord-only: create bedspaces, mini admins, and per-tenant portal visibility.
 */
export default function LandlordAccessPanel() {
  const [bedspaces, setBedspaces] = useState([]);
  const [newName, setNewName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationAddress, setNewLocationAddress] = useState('');
  const [locNameEdit, setLocNameEdit] = useState('');
  const [locAddrEdit, setLocAddrEdit] = useState('');
  const [pdfRulesEdit, setPdfRulesEdit] = useState('');
  const [focusId, setFocusId] = useState('');
  const [people, setPeople] = useState(null);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [miniNickname, setMiniNickname] = useState('');
  const [miniPassword, setMiniPassword] = useState('');
  const [miniPerms, setMiniPerms] = useState({ ...DEFAULT_MINI_ADMIN_PERMISSIONS });

  const loadBedspaces = async () => {
    try {
      const { data } = await getSuperBedspaces();
      const arr = Array.isArray(data) ? data : [];
      setBedspaces(arr);
      setFocusId((prev) => prev || (arr[0]?._id ?? ''));
    } catch {
      toast.error('Could not load properties');
    }
  };

  useEffect(() => {
    loadBedspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, []);

  useEffect(() => {
    if (!focusId) {
      setPeople(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingPeople(true);
      try {
        const { data } = await getSuperBedspacePeople(focusId);
        if (!cancelled) setPeople(data);
      } catch {
        if (!cancelled) toast.error('Could not load people for this property');
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusId]);

  useEffect(() => {
    const b = bedspaces.find((x) => x._id === focusId);
    setLocNameEdit(b?.locationName || '');
    setLocAddrEdit(b?.locationAddress || '');
    setPdfRulesEdit(b?.pdfRulesText || '');
  }, [focusId, bedspaces]);

  const handleSaveLocation = async (e) => {
    e.preventDefault();
    const b = bedspaces.find((x) => x._id === focusId);
    if (!b) return;
    try {
      await updateSuperBedspace(focusId, {
        name: b.name,
        locationName: locNameEdit.trim(),
        locationAddress: locAddrEdit.trim(),
      });
      toast.success('Location saved for PDFs & reports');
      await loadBedspaces();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save location');
    }
  };

  const handleSavePdfRules = async (e) => {
    e.preventDefault();
    if (!focusId) return;
    try {
      await updateSuperBedspace(focusId, { pdfRulesText: pdfRulesEdit });
      toast.success('Rules saved — they will appear on monthly bill PDFs');
      await loadBedspaces();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save rules');
    }
  };

  const handleCreateBedspace = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast.error('Enter a property name');
      return;
    }
    try {
      const wasEmpty = bedspaces.length === 0;
      const { data: created } = await createSuperBedspace({
        name,
        locationName: newLocationName.trim(),
        locationAddress: newLocationAddress.trim(),
      });
      setNewName('');
      setNewLocationName('');
      setNewLocationAddress('');
      toast.success('Property created');
      await loadBedspaces();
      if (wasEmpty && created?._id) {
        try {
          const { data: auth } = await selectBedspace(created._id);
          localStorage.setItem('token', auth.token);
          localStorage.setItem('user', JSON.stringify(auth.user));
          toast.success(`Now working in ${auth.user.activeBedspaceName || 'your new property'}`);
          window.location.reload();
        } catch {
          toast.info('Property created — pick it from “Switch property” if the page does not refresh.');
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create property');
    }
  };

  const handleCreateMini = async (e) => {
    e.preventDefault();
    if (!focusId) return;
    try {
      await createMiniAdmin(focusId, {
        nickname: miniNickname.trim(),
        password: miniPassword,
        miniAdminPermissions: miniPerms,
      });
      setMiniNickname('');
      setMiniPassword('');
      setMiniPerms({ ...DEFAULT_MINI_ADMIN_PERMISSIONS });
      toast.success('Mini admin created');
      const { data } = await getSuperBedspacePeople(focusId);
      setPeople(data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not create mini admin');
    }
  };

  const toggleMiniAdminPerm = async (userId, key, value) => {
    const mini = people?.miniAdmins?.find((m) => m._id === userId);
    if (!mini) return;
    const eff = { ...DEFAULT_MINI_ADMIN_PERMISSIONS, ...(mini.miniAdminPermissions || {}) };
    const next = { ...eff, [key]: value };
    try {
      const { data } = await updateMiniAdmin(userId, { miniAdminPermissions: next });
      toast.success('Permissions updated');
      setPeople((prev) =>
        prev
          ? {
              ...prev,
              miniAdmins: prev.miniAdmins.map((m) => (m._id === userId ? data : m)),
            }
          : prev
      );
    } catch {
      toast.error('Could not update permissions');
    }
  };

  const saveTenantPortal = async (tenantId, visibility) => {
    try {
      await updateTenantPortal(tenantId, visibility);
      toast.success('Tenant portal updated');
      const { data } = await getSuperBedspacePeople(focusId);
      setPeople(data);
    } catch {
      toast.error('Could not update tenant settings');
    }
  };

  return (
    <div className="space-y-8">
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Your properties</h2>
        <p className="text-sm text-gray-600 mb-4">
          Each property has its own tenants, bill cycles, and optional mini admins. Use &quot;Switch
          property&quot; in the sidebar when you manage more than one.
        </p>
        <form onSubmit={handleCreateBedspace} className="space-y-3 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="New property name (e.g. Quezon Ave unit)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="btn-primary whitespace-nowrap">
              Add property
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="Location name (shown on PDF — e.g. Kamuning Bedspace)"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Full address (optional)"
              value={newLocationAddress}
              onChange={(e) => setNewLocationAddress(e.target.value)}
            />
          </div>
        </form>
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {bedspaces.map((b) => (
            <li key={b._id} className="px-4 py-3 flex items-center gap-3">
              <input
                type="radio"
                name="focusBed"
                checked={focusId === b._id}
                onChange={() => setFocusId(b._id)}
                className="rounded-full border-gray-300"
              />
              <span className="font-medium text-gray-900">{b.name}</span>
            </li>
          ))}
          {bedspaces.length === 0 && (
            <li className="px-4 py-6 text-center text-gray-500 text-sm">No properties yet — add one above.</li>
          )}
        </ul>
        {focusId && bedspaces.length > 0 && (
          <>
            <form onSubmit={handleSaveLocation} className="mt-4 p-4 bg-teal-50/80 border border-teal-100 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-teal-900">PDF &amp; print — location label</h3>
              <p className="text-xs text-teal-800">
                This appears on downloadable bill reports for the <strong>selected</strong> property.
              </p>
              <input
                className="input"
                placeholder="Location name"
                value={locNameEdit}
                onChange={(e) => setLocNameEdit(e.target.value)}
              />
              <textarea
                className="input min-h-[72px]"
                placeholder="Address or landmarks (optional)"
                value={locAddrEdit}
                onChange={(e) => setLocAddrEdit(e.target.value)}
              />
              <button type="submit" className="btn-secondary text-sm">
                Save location for reports
              </button>
            </form>

            <form onSubmit={handleSavePdfRules} className="mt-4 p-4 bg-amber-50/90 border border-amber-100 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-amber-950">Rules for PDF (this property)</h3>
              <p className="text-xs text-amber-900">
                Type anything you want on the <strong>monthly bill report PDF</strong> for this location — e.g. house
                rules, how to pay, quiet hours, due date reminders. This is <strong>not</strong> used for math; it is
                printed as text for tenants to read.
              </p>
              <textarea
                className="input min-h-[140px] font-normal"
                placeholder="Example: Pay GCash to Juan dela Cruz by the 15th. No visitors after 10pm. Water ration every Tuesday…"
                value={pdfRulesEdit}
                onChange={(e) => setPdfRulesEdit(e.target.value)}
              />
              <button type="submit" className="btn-secondary text-sm">
                Save rules for PDF
              </button>
            </form>
          </>
        )}
      </div>

      {focusId && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Access for this property</h2>
          <p className="text-sm text-gray-600 mb-4">
            <strong>Mini admins</strong> can log in with a password and only see this property. Toggle what they
            may do. <strong>Tenants</strong> only use nickname login; choose what they see in their portal (current
            bill, history, receipt upload).
          </p>

          {loadingPeople || !people ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Tenants — portal visibility</h3>
              <div className="overflow-x-auto mb-8">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-4">Nickname</th>
                      <th className="py-2 pr-4">Current bill</th>
                      <th className="py-2 pr-4">History</th>
                      <th className="py-2 pr-4">Receipt upload</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.tenants.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-gray-500">
                          No tenants in this property yet.
                        </td>
                      </tr>
                    )}
                    {people.tenants.map((t) => (
                      <TenantPortalRow
                        key={t._id}
                        tenant={t}
                        onSave={(vis) => saveTenantPortal(t._id, vis)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="text-sm font-semibold text-gray-800 mb-2">Mini admins</h3>
              {people.miniAdmins.length > 0 && (
                <ul className="space-y-4 mb-6">
                  {people.miniAdmins.map((m) => (
                    <li key={m._id} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                      <p className="font-medium text-gray-900 mb-2">{m.nickname}</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {Object.keys(DEFAULT_MINI_ADMIN_PERMISSIONS).map((key) => {
                          const eff = {
                            ...DEFAULT_MINI_ADMIN_PERMISSIONS,
                            ...(m.miniAdminPermissions || {}),
                          };
                          return (
                            <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                className="rounded border-gray-300"
                                checked={!!eff[key]}
                                onChange={(e) => toggleMiniAdminPerm(m._id, key, e.target.checked)}
                              />
                              {PERM_LABELS[key] || key}
                            </label>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h4 className="text-sm font-medium text-gray-800 mb-2">Add mini admin</h4>
              <form onSubmit={handleCreateMini} className="space-y-4 max-w-xl">
                <div>
                  <label className="label">Nickname (login)</label>
                  <input
                    className="input"
                    value={miniNickname}
                    onChange={(e) => setMiniNickname(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">Password (min 8 characters)</label>
                  <input
                    type="password"
                    className="input"
                    value={miniPassword}
                    onChange={(e) => setMiniPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.keys(DEFAULT_MINI_ADMIN_PERMISSIONS).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={!!miniPerms[key]}
                        onChange={(e) => setMiniPerms({ ...miniPerms, [key]: e.target.checked })}
                      />
                      {PERM_LABELS[key] || key}
                    </label>
                  ))}
                </div>
                <button type="submit" className="btn-primary">
                  Create mini admin
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TenantPortalRow({ tenant, onSave }) {
  const base = {
    showCurrentBill: tenant.tenantPortalVisibility?.showCurrentBill !== false,
    showBillHistory: tenant.tenantPortalVisibility?.showBillHistory !== false,
    showPaymentUpload: tenant.tenantPortalVisibility?.showPaymentUpload !== false,
  };
  const [local, setLocal] = useState(base);

  useEffect(() => {
    setLocal(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when tenant changes
  }, [tenant._id, tenant.tenantPortalVisibility]);

  return (
    <tr className="border-b border-gray-50">
      <td className="py-2 pr-4 font-medium text-gray-900">{tenant.nickname}</td>
      {['showCurrentBill', 'showBillHistory', 'showPaymentUpload'].map((key) => (
        <td key={key} className="py-2 pr-4">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            checked={!!local[key]}
            onChange={(e) => setLocal({ ...local, [key]: e.target.checked })}
          />
        </td>
      ))}
      <td className="py-2">
        <button
          type="button"
          onClick={() => onSave(local)}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          Save
        </button>
      </td>
    </tr>
  );
}
