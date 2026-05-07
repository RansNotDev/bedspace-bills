import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import { getDashboardSummary, updateSuperBedspace } from '../utils/api';
import { getStoredUser, isMiniAdmin, isSuperAdmin } from '../utils/authHelpers';

/** PDF / notice text for the active property; landlords can edit, mini admins read-only. */
export default function AdminRulesPage() {
  const user = getStoredUser();
  const canEdit = isSuperAdmin(user);
  const readOnly = isMiniAdmin(user);

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const bedspaceId = user?.activeBedspaceId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getDashboardSummary();
      const t = data?.bedspace?.pdfRulesText;
      setText(t != null ? String(t) : '');
    } catch {
      toast.error('Could not load rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const u = getStoredUser();
    if (isSuperAdmin(u) && (!u?.bedspaces || u.bedspaces.length === 0)) return;
    if (isSuperAdmin(u) && u.needsBedspaceSelection) return;
    load();
  }, [load]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canEdit || !bedspaceId) return;
    setSaving(true);
    try {
      await updateSuperBedspace(bedspaceId, { pdfRulesText: text });
      toast.success('Rules saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900">Rules for PDFs</h1>
        <p className="text-gray-500 text-sm mt-1">
          This text is printed on monthly bill PDFs for <span className="font-medium text-gray-800">{user?.activeBedspaceName || 'this property'}</span>.
          It does not change how amounts are calculated.
        </p>

        {loading ? (
          <p className="text-gray-500 mt-6">Loading…</p>
        ) : (
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div>
              <label htmlFor="rules-text" className="label">
                Rules &amp; notices
              </label>
              <textarea
                id="rules-text"
                className="input min-h-[220px] font-mono text-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
                readOnly={!canEdit}
                disabled={!canEdit}
                placeholder="e.g. Payment due by the 5th. GCash only. Quiet hours 10pm–6am."
              />
            </div>
            {canEdit && (
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save rules'}
              </button>
            )}
            {readOnly && (
              <p className="text-sm text-gray-500">Mini admins can view rules here; only the landlord can change them.</p>
            )}
          </form>
        )}
      </div>
    </Layout>
  );
}
