import React, { useState, useEffect } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import { getTenants, getBillCycles, updateTenant } from '../utils/api';
import { formatPHDate } from '../utils/helpers';

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales,
});

// Event colors
const EVENT_COLORS = {
  deadline: '#dc2626',   // red
  moveIn: '#2563eb',     // blue
  payment: '#16a34a',    // green
};

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [showMoveInModal, setShowMoveInModal] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCalendarData();
  }, []);

  const loadCalendarData = async () => {
    try {
      const [tenantsRes, cyclesRes] = await Promise.all([
        getTenants(),
        getBillCycles(),
      ]);

      const tenantList = tenantsRes.data;
      const cycles = cyclesRes.data;
      setTenants(tenantList);

      const calEvents = [];

      // Bill deadlines
      cycles.forEach((cycle) => {
        if (cycle.deadline) {
          calEvents.push({
            id: `deadline-${cycle._id}`,
            title: `📅 Bill Deadline (${new Date(cycle.year, cycle.month - 1).toLocaleString('en-PH', { month: 'short' })} ${cycle.year})`,
            start: new Date(cycle.deadline),
            end: new Date(cycle.deadline),
            allDay: true,
            type: 'deadline',
            color: EVENT_COLORS.deadline,
          });
        }
      });

      // Tenant move-in dates
      tenantList.forEach((tenant) => {
        if (tenant.moveInDate) {
          calEvents.push({
            id: `movein-${tenant._id}`,
            title: `🏠 ${tenant.nickname} moved in`,
            start: new Date(tenant.moveInDate),
            end: new Date(tenant.moveInDate),
            allDay: true,
            type: 'moveIn',
            color: EVENT_COLORS.moveIn,
          });
        }
      });

      setEvents(calEvents);
    } catch {
      toast.error('Failed to load calendar data');
    }
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

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-gray-500 text-sm mt-1">
          View bill deadlines and tenant move-in dates. Click a date to assign a move-in date.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-600" />
          <span className="text-gray-600">Bill Deadline</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-600" />
          <span className="text-gray-600">Move-in Date</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-600" />
          <span className="text-gray-600">Payment</span>
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

      {/* Move-in date modal */}
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
                {tenants.filter((t) => t.isActive).map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.nickname} ({t.roomType})
                  </option>
                ))}
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
