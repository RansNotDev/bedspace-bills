import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import { getTenants, getBillCycles, updateTenant, getSuperCalendarData } from '../utils/api';
import { formatPHDate } from '../utils/helpers';
import { getStoredUser, isSuperAdmin, isMiniAdmin } from '../utils/authHelpers';
import { generateCalendarReport } from '../components/PDFReport';

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

const EVENT_COLORS = {
  deadline: '#dc2626',
  moveIn: '#2563eb',
  rent: '#ca8a04',
};

const RENT_MONTHS_BACK = 6;
const RENT_MONTHS_FORWARD = 14;

/**
 * Build calendar events; when severalBedspaces, titles include a location tag.
 */
function buildCalendarEvents(cycles, tenantList, bedspaces) {
  const severalBedspaces = (bedspaces?.length || 0) > 1;

  const tagForBedspace = (bedId) => {
    if (!severalBedspaces || !bedId) return '';
    const b = bedspaces.find((x) => String(x._id) === String(bedId));
    if (!b) return '';
    if (b.locationName) return `${b.locationName} (${b.name})`;
    return b.name;
  };

  const calEvents = [];

  cycles.forEach((cycle) => {
    if (!cycle.deadline || !cycle.bedspaceId) return;
    const monthShort = new Date(cycle.year, cycle.month - 1).toLocaleString('en-PH', {
      month: 'short',
    });
    const tag = tagForBedspace(cycle.bedspaceId);
    calEvents.push({
      id: `deadline-${cycle._id}`,
      title: tag
        ? `📅 Bill deadline — ${monthShort} ${cycle.year} · ${tag}`
        : `📅 Bill deadline — ${monthShort} ${cycle.year}`,
      start: new Date(cycle.deadline),
      end: new Date(cycle.deadline),
      allDay: true,
      type: 'deadline',
      color: EVENT_COLORS.deadline,
      bedspaceId: cycle.bedspaceId,
    });
  });

  tenantList.forEach((tenant) => {
    if (tenant.moveInDate) {
      const tag = tagForBedspace(tenant.bedspaceId);
      calEvents.push({
        id: `movein-${tenant._id}`,
        title: tag
          ? `🏠 ${tenant.nickname} — move-in · ${tag}`
          : `🏠 ${tenant.nickname} — move-in`,
        start: new Date(tenant.moveInDate),
        end: new Date(tenant.moveInDate),
        allDay: true,
        type: 'moveIn',
        color: EVENT_COLORS.moveIn,
        tenantId: tenant._id,
        bedspaceId: tenant.bedspaceId,
      });
    }
  });

  const today = new Date();
  for (let i = -RENT_MONTHS_BACK; i <= RENT_MONTHS_FORWARD; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    tenantList
      .filter((t) => t.isActive && Number(t.monthlyRent) > 0)
      .forEach((tenant) => {
        const tag = tagForBedspace(tenant.bedspaceId);
        calEvents.push({
          id: `rent-${tenant._id}-${d.getFullYear()}-${d.getMonth()}`,
          title: tag
            ? `💰 Rent due — ${tenant.nickname} (${formatPHPShort(tenant.monthlyRent)}) · ${tag}`
            : `💰 Rent due — ${tenant.nickname} (${formatPHPShort(tenant.monthlyRent)})`,
          start: new Date(d),
          end: new Date(d),
          allDay: true,
          type: 'rent',
          color: EVENT_COLORS.rent,
          tenantId: tenant._id,
          bedspaceId: tenant.bedspaceId,
        });
      });
  }

  return calEvents;
}

/**
 * Landlord: merged general across all bedspaces, or filter by one property.
 * Mini admin: single bedspace (JWT context); mode toggle hidden.
 */
export default function CalendarPage() {
  const [rawEvents, setRawEvents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [metaBedspaces, setMetaBedspaces] = useState([]);
  /** 'general' = all locations merged | 'property' = pick one bedspace */
  const [calendarMode, setCalendarMode] = useState('general');
  const [propertyFilterId, setPropertyFilterId] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [showMoveInModal, setShowMoveInModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const staffUser = getStoredUser();
  const landlord = isSuperAdmin(staffUser);
  const miniAdmin = isMiniAdmin(staffUser);

  const sessionPropertyLabel =
    staffUser?.activeBedspaceName || staffUser?.bedspaces?.[0]?.name || 'this property';

  const loadCalendarData = useCallback(async () => {
    const u = getStoredUser();
    try {
      if (isSuperAdmin(u)) {
        const { data } = await getSuperCalendarData();
        const bedspaces = data.bedspaces || [];
        const cycles = data.billCycles || [];
        const tenantList = data.tenants || [];
        setMetaBedspaces(bedspaces);
        setTenants(tenantList);
        setRawEvents(buildCalendarEvents(cycles, tenantList, bedspaces));

        setPropertyFilterId((prev) => {
          if (prev && bedspaces.some((b) => String(b._id) === String(prev))) return prev;
          const active = u?.activeBedspaceId;
          if (active && bedspaces.some((b) => String(b._id) === String(active))) return String(active);
          return bedspaces[0]?._id ? String(bedspaces[0]._id) : '';
        });
      } else {
        const [tenantsRes, cyclesRes] = await Promise.all([getTenants(), getBillCycles()]);
        const tenantList = tenantsRes.data;
        const cycles = cyclesRes.data;
        setMetaBedspaces([]);
        setTenants(tenantList);
        const loneBedId = tenantList[0]?.bedspaceId || cycles[0]?.bedspaceId;
        const virtualBeds =
          loneBedId && u?.activeBedspaceName
            ? [{ _id: loneBedId, name: u.activeBedspaceName, locationName: '' }]
            : loneBedId
              ? [{ _id: loneBedId, name: sessionPropertyLabel, locationName: '' }]
              : [];
        setRawEvents(buildCalendarEvents(cycles, tenantList, virtualBeds));
        if (loneBedId) setPropertyFilterId(String(loneBedId));
      }
    } catch {
      toast.error('Failed to load calendar data');
    }
  }, [sessionPropertyLabel]);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  const events = useMemo(() => {
    if (calendarMode === 'general' || !landlord) {
      return rawEvents;
    }
    if (!propertyFilterId) return [];
    return rawEvents.filter((e) => e.bedspaceId && String(e.bedspaceId) === String(propertyFilterId));
  }, [rawEvents, calendarMode, propertyFilterId, landlord]);

  const tenantsForMoveIn = useMemo(() => {
    const list = tenants.filter((t) => t.isActive);
    if (!landlord || calendarMode === 'general' || !propertyFilterId) return list;
    return list.filter((t) => String(t.bedspaceId) === String(propertyFilterId));
  }, [tenants, landlord, calendarMode, propertyFilterId]);

  const selectedPropertyLabel = useMemo(() => {
    if (!propertyFilterId) return '';
    const b = metaBedspaces.find((x) => String(x._id) === String(propertyFilterId));
    if (!b) return sessionPropertyLabel;
    return b.locationName ? `${b.locationName} (${b.name})` : b.name;
  }, [propertyFilterId, metaBedspaces, sessionPropertyLabel]);

  const handlePrintCalendar = () => {
    const title =
      !landlord || calendarMode === 'general'
        ? 'General calendar — all properties'
        : `Property calendar — ${selectedPropertyLabel || 'Selected location'}`;
    const subtitle =
      !landlord || calendarMode === 'general'
        ? 'Merged bill deadlines, move-ins & rent (every bedspace you own)'
        : `Only this location’s tenants, deadlines & rent reminders`;
    generateCalendarReport({
      title,
      subtitle,
      locationLine:
        !landlord || calendarMode === 'general'
          ? 'All locations merged'
          : `Location: ${selectedPropertyLabel}`,
      events: events.map((e) => ({
        start: e.start,
        title: e.title,
        type: e.type || '',
      })),
    });
    toast.success('Calendar PDF downloaded');
  };

  const handleSelectSlot = ({ start }) => {
    setSelectedDate(start);
    setShowMoveInModal(true);
  };

  const handleAssignMoveIn = async () => {
    if (!selectedTenant || !selectedDate) return;
    setLoading(true);
    try {
      await updateTenant(selectedTenant, {
        moveInDate: selectedDate.toISOString().split('T')[0],
      });
      toast.success('Move-in date assigned!');
      setShowMoveInModal(false);
      setSelectedTenant('');
      loadCalendarData();
    } catch {
      toast.error('Failed to assign move-in date');
    } finally {
      setLoading(false);
    }
  };

  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor: event.color,
      borderRadius: '4px',
      border: 'none',
      color: 'white',
      fontSize: '11px',
      padding: '2px 4px',
    },
  });

  const showPropertyToggle = landlord && metaBedspaces.length > 0;

  return (
    <Layout>
      <div className="mb-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-500 text-sm mt-1">
            {landlord
              ? 'General merges every bedspace you own. One property limits the calendar to that location (defaults to the property you picked at login).'
              : 'Bill deadlines, move-ins, and rent reminders for your bedspace.'}
          </p>
          <p className="text-xs text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 mt-2 inline-block">
            Session property: <strong>{sessionPropertyLabel}</strong>
            {miniAdmin && <span className="text-teal-700"> · mini admin (single location)</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handlePrintCalendar} className="btn-primary text-sm">
            📄 Print / PDF report
          </button>
        </div>
      </div>

      {showPropertyToggle && (
        <div className="card mb-4">
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div>
              <label className="label">View</label>
              <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50 w-fit flex-wrap">
                <button
                  type="button"
                  onClick={() => setCalendarMode('general')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    calendarMode === 'general' ? 'bg-white shadow text-teal-800' : 'text-gray-600'
                  }`}
                >
                  General (all locations)
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarMode('property')}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    calendarMode === 'property' ? 'bg-white shadow text-teal-800' : 'text-gray-600'
                  }`}
                >
                  One property
                </button>
              </div>
            </div>
            {calendarMode === 'property' && (
              <div className="flex-1 max-w-md">
                <label className="label">Property / location</label>
                <select
                  className="input"
                  value={propertyFilterId}
                  onChange={(e) => setPropertyFilterId(e.target.value)}
                >
                  {metaBedspaces.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.locationName ? `${b.locationName} — ${b.name}` : b.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Defaults to the property you chose at login; change here only for this calendar view.
                </p>
              </div>
            )}
          </div>
          {calendarMode === 'general' && metaBedspaces.length > 1 && (
            <p className="text-sm text-teal-900 bg-teal-50/80 border border-teal-100 rounded-lg px-3 py-2 mt-3">
              Showing <strong>{metaBedspaces.length}</strong> properties in one calendar. Events are labeled with each
              location.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-600" />
          <span className="text-gray-600">Bill deadline</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600" />
          <span className="text-gray-600">Move-in</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-600" />
          <span className="text-gray-600">Rent due (1st of month)</span>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div style={{ height: 600 }} className="p-4">
          <BigCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            selectable
            onSelectSlot={handleSelectSlot}
            eventPropGetter={eventStyleGetter}
            views={['month', 'week', 'agenda']}
            defaultView="month"
            popup
          />
        </div>
      </div>

      {showMoveInModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-1">Assign Move-in Date</h3>
            <p className="text-sm text-gray-500 mb-4">
              Selected: <strong>{formatPHDate(selectedDate)}</strong>
            </p>
            <div className="mb-4">
              <label className="label">Select Tenant</label>
              <select
                className="input"
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
              >
                <option value="">— Choose tenant —</option>
                {tenantsForMoveIn.map((t) => {
                  const bed = metaBedspaces.find((b) => String(b._id) === String(t.bedspaceId));
                  const loc =
                    landlord && calendarMode === 'general' && bed
                      ? ` · ${bed.locationName || bed.name}`
                      : '';
                  return (
                    <option key={t._id} value={t._id}>
                      {t.nickname} ({t.roomType}){loc}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAssignMoveIn}
                className="btn-primary flex-1"
                disabled={!selectedTenant || loading}
              >
                {loading ? 'Saving...' : 'Assign'}
              </button>
              <button
                onClick={() => setShowMoveInModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function formatPHPShort(n) {
  const x = Number(n) || 0;
  return `₱${x.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
