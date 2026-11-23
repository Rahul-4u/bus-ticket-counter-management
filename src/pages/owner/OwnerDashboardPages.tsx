import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bus, CalendarClock, CreditCard, LayoutDashboard, Plus, Ticket, User } from 'lucide-react';
import { DashboardLayout, SidebarGroup } from '../../components/dashboard/DashboardLayout';
import { StatCard } from '../../components/dashboard/StatCard';
import { BookingChart, ChartPoint, RevenueChart } from '../../components/dashboard/Charts';
import { DataTable } from '../../components/dashboard/DataTable';
import { FormDialog } from '../../components/dashboard/Dialogs';
import { SeatMap } from '../../components/seats/SeatMap';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import {
  createBus,
  createTripWithSeats,
  fetchOwnerBookings,
  fetchOwnerBuses,
  fetchOwnerPayments,
  fetchOwnerSettlements,
  fetchOwnerTrips,
  fetchRoutes,
  updateOwnProfile,
} from '../../services/firestoreService';
import { GENERATED_BUS_IMAGES } from '../../services/seedService';
import { formatBDT, generateSeatTemplate } from '../../lib/seatLayouts';
import type { Booking, Bus as BusModel, LayoutType, PaymentRecord, Settlement, Trip } from '../../types/domain';

const OWNER_GROUPS: SidebarGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/owner', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'My Fleet',
    items: [{ label: 'My Buses & Layouts', to: '/owner/buses', icon: Bus }],
  },
  {
    title: 'Trip Management',
    items: [{ label: 'Trip Schedules', to: '/owner/trips', icon: CalendarClock }],
  },
  {
    title: 'Bookings & Revenue',
    items: [
      { label: 'Bookings & Passengers', to: '/owner/bookings', icon: Ticket },
      { label: 'Revenue & Settlements', to: '/owner/financials', icon: CreditCard },
    ],
  },
  {
    title: 'Account',
    items: [{ label: 'Profile Settings', to: '/owner/profile', icon: User }],
  },
];

export function OwnerShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout portalTitle="Fleet Owner Portal" roleLabel="Bus Owner" groups={OWNER_GROUPS}>
      {children}
    </DashboardLayout>
  );
}

export function OwnerOverviewPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';

  const { data: buses = [] } = useQuery({ queryKey: ['owner-buses', uid], queryFn: () => fetchOwnerBuses(uid), enabled: Boolean(uid) });
  const { data: trips = [] } = useQuery({ queryKey: ['owner-trips', uid], queryFn: () => fetchOwnerTrips(uid), enabled: Boolean(uid) });
  const { data: bookings = [], isLoading } = useQuery({ queryKey: ['owner-bookings', uid], queryFn: () => fetchOwnerBookings(uid), enabled: Boolean(uid) });
  const { data: payments = [] } = useQuery({ queryKey: ['owner-payments', uid], queryFn: () => fetchOwnerPayments(uid), enabled: Boolean(uid) });
  const { data: settlements = [] } = useQuery({ queryKey: ['owner-settlements', uid], queryFn: () => fetchOwnerSettlements(uid), enabled: Boolean(uid) });

  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const activeBuses = buses.filter((b) => b.approvalStatus === 'approved' && b.isActive).length;
    const upcomingTrips = trips.filter((t) => t.status === 'scheduled' && t.journeyDate >= today).length;
    const availableSeats = trips.filter((t) => t.status === 'scheduled').reduce((a, b) => a + b.availableSeats, 0);
    const totalRevenue = payments.filter((p) => p.status === 'paid').reduce((a, b) => a + b.amount, 0);
    const pendingSettlements = settlements.filter((s) => s.status === 'pending').reduce((a, b) => a + b.netPayable, 0);
    return { activeBuses, upcomingTrips, availableSeats, totalRevenue, pendingSettlements };
  }, [buses, trips, payments, settlements, today]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const map = new Map<string, ChartPoint>();
    bookings.forEach((b) => {
      const key = b.journeyDate || b.createdAt.slice(0, 10);
      const item = map.get(key) || { label: key, revenue: 0, bookings: 0 };
      item.bookings += 1;
      if (b.paymentStatus === 'paid') item.revenue += b.totalFare;
      map.set(key, item);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-10);
  }, [bookings]);

  return (
    <OwnerShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white font-display">
            My Fleet Performance
          </h1>
          <p className="text-xs text-slate-500 mt-1">Strictly scoped to coaches, trips, and bookings owned by your account.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="My Revenue" value={formatBDT(stats.totalRevenue)} subtext={`Pending Payout: ${formatBDT(stats.pendingSettlements)}`} icon={CreditCard} tone="emerald" />
          <StatCard label="My Buses / Active" value={`${buses.length} / ${stats.activeBuses}`} icon={Bus} tone="slate" />
          <StatCard label="My Trips / Upcoming" value={`${trips.length} / ${stats.upcomingTrips}`} subtext={`${stats.availableSeats} open seats`} icon={CalendarClock} tone="orange" />
          <StatCard label="Total Bookings" value={bookings.length} icon={Ticket} tone="orange" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenueChart data={chartData} title="My Fleet Revenue" />
          <BookingChart data={chartData} title="My Ticket Volume" />
        </div>

        <DataTable<Booking>
          title="Recent Bookings on My Coaches"
          data={bookings}
          loading={isLoading}
          columns={[
            { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold text-orange-600">{r.pnr}</span> },
            { key: 'pax', header: 'Passenger', render: (r) => <span>{r.passengerName}</span> },
            { key: 'rt', header: 'Route', render: (r) => <span>{r.routeLabel}</span> },
            { key: 'seats', header: 'Seats', render: (r) => <span className="font-mono">{r.seatNumbers.join(', ')}</span> },
            { key: 'fare', header: 'Fare', align: 'right', render: (r) => <span className="font-mono font-bold">{formatBDT(r.totalFare)}</span> },
          ]}
        />
      </div>
    </OwnerShell>
  );
}

export function OwnerFleetPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<LayoutType | null>(null);
  const [form, setForm] = useState({
    name: '',
    coachNumber: '',
    registrationNumber: '',
    layoutType: '2+2' as LayoutType,
    isAc: true,
    totalSeats: 40,
  });

  const { data: buses = [], isLoading } = useQuery({
    queryKey: ['owner-buses', uid],
    queryFn: () => fetchOwnerBuses(uid),
    enabled: Boolean(uid),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    await createBus({
      ownerId: profile.uid,
      ownerName: profile.displayName,
      coachNumber: form.coachNumber,
      registrationNumber: form.registrationNumber,
      name: form.name,
      busTypeId: form.layoutType === '2+1' ? 'bt_business' : form.layoutType === 'sleeper' ? 'bt_sleeper' : 'bt_ac_eco',
      busTypeName: `${form.isAc ? 'AC' : 'Non-AC'} (${form.layoutType})`,
      layoutType: form.layoutType,
      isAc: form.isAc,
      totalSeats: Number(form.totalSeats),
      amenities: form.isAc ? ['Climate AC', 'GPS Tracking'] : ['Express'],
      imageUrl: form.layoutType === 'sleeper' ? GENERATED_BUS_IMAGES.sleeperCoach : GENERATED_BUS_IMAGES.scaniaBusiness,
      approvalStatus: profile.role === 'admin' ? 'approved' : 'pending',
      isActive: true,
    });
    notify('Coach submitted for Admin approval', 'success');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['owner-buses', uid] });
  };

  return (
    <OwnerShell>
      <DataTable<BusModel>
        title="My Fleet Coaches"
        data={buses}
        loading={isLoading}
        actionSlot={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Coach
          </button>
        }
        columns={[
          { key: 'code', header: 'Coach #', render: (r) => <span className="font-mono font-bold">{r.coachNumber}</span> },
          { key: 'name', header: 'Name', render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 'layout', header: 'Layout', render: (r) => <span>{r.layoutType} · {r.totalSeats} seats</span> },
          { key: 'app', header: 'Admin Approval', render: (r) => <span className="uppercase font-mono text-[11px]">{r.approvalStatus}</span> },
          {
            key: 'act',
            header: 'Layout',
            align: 'right',
            render: (r) => (
              <button
                type="button"
                onClick={() => setPreviewLayout(r.layoutType)}
                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
              >
                View Seats
              </button>
            ),
          },
        ]}
      />

      <FormDialog open={open} title="Register New Coach" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            required
            placeholder="Coach Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Coach Number (DL-602)"
              value={form.coachNumber}
              onChange={(e) => setForm({ ...form, coachNumber: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              required
              placeholder="Registration No"
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.layoutType}
              onChange={(e) => {
                const lt = e.target.value as LayoutType;
                setForm({ ...form, layoutType: lt, totalSeats: lt === '2+1' ? 27 : lt === 'sleeper' ? 30 : 40 });
              }}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="2+1">2+1 Business</option>
              <option value="2+2">2+2 Express</option>
              <option value="sleeper">Sleeper</option>
            </select>
            <select
              value={form.isAc ? 'ac' : 'nonac'}
              onChange={(e) => setForm({ ...form, isAc: e.target.value === 'ac' })}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="ac">AC</option>
              <option value="nonac">Non-AC</option>
            </select>
          </div>
          <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
            Submit Coach
          </button>
        </form>
      </FormDialog>

      <FormDialog open={Boolean(previewLayout)} title="Seat Layout" onClose={() => setPreviewLayout(null)}>
        {previewLayout && (
          <SeatMap seats={generateSeatTemplate(previewLayout)} layoutType={previewLayout} selectedSeats={[]} onToggleSeat={() => {}} />
        )}
      </FormDialog>
    </OwnerShell>
  );
}

export function OwnerTripsPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);

  const { data: trips = [], isLoading } = useQuery({ queryKey: ['owner-trips', uid], queryFn: () => fetchOwnerTrips(uid), enabled: Boolean(uid) });
  const { data: buses = [] } = useQuery({ queryKey: ['owner-buses', uid], queryFn: () => fetchOwnerBuses(uid), enabled: Boolean(uid) });
  const { data: routes = [] } = useQuery({ queryKey: ['routes'], queryFn: fetchRoutes });

  const approvedBuses = buses.filter((b) => b.approvalStatus === 'approved');
  const [form, setForm] = useState({
    busId: '',
    routeId: '',
    journeyDate: new Date().toISOString().split('T')[0],
    departureTime: '21:00',
    arrivalTime: '06:00',
    fare: 1400,
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const bus = approvedBuses.find((b) => b.id === (form.busId || approvedBuses[0]?.id));
    const route = routes.find((r) => r.id === (form.routeId || routes[0]?.id));
    if (!bus || !route) {
      notify('An approved coach and route are required', 'error');
      return;
    }
    await createTripWithSeats({
      ownerId: uid,
      busId: bus.id,
      busName: bus.name,
      busTypeName: bus.busTypeName,
      isAc: bus.isAc,
      layoutType: bus.layoutType,
      busImageUrl: bus.imageUrl,
      routeId: route.id,
      originCityId: route.originCityId,
      originName: route.originName,
      destinationCityId: route.destinationCityId,
      destinationName: route.destinationName,
      journeyDate: form.journeyDate,
      departureTime: form.departureTime,
      arrivalTime: form.arrivalTime,
      durationLabel: route.estimatedDuration,
      fare: Number(form.fare),
      totalSeats: bus.totalSeats,
      boardingPoints: route.stops.filter((s) => s.type !== 'dropping').map((s) => s.name),
      droppingPoints: route.stops.filter((s) => s.type !== 'boarding').map((s) => s.name),
      status: 'scheduled',
    });
    notify('Trip published', 'success');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['owner-trips', uid] });
  };

  return (
    <OwnerShell>
      <DataTable<Trip>
        title="My Trip Schedules"
        data={trips}
        loading={isLoading}
        filterOptions={[
          { label: 'Scheduled', value: 'scheduled' },
          { label: 'Completed', value: 'completed' },
          { label: 'Cancelled', value: 'cancelled' },
        ]}
        filterPredicate={(r, v) => r.status === v}
        actionSlot={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Trip
          </button>
        }
        columns={[
          { key: 'rt', header: 'Route', render: (r) => <span className="font-semibold">{r.originName} → {r.destinationName}</span> },
          { key: 'bus', header: 'Coach', render: (r) => <span>{r.busName}</span> },
          { key: 'dt', header: 'Schedule', render: (r) => <span className="font-mono">{r.journeyDate} {r.departureTime}</span> },
          { key: 'seats', header: 'Available', render: (r) => <span className="font-mono">{r.availableSeats}/{r.totalSeats}</span> },
          { key: 'fare', header: 'Fare', align: 'right', render: (r) => <span className="font-mono font-bold">{formatBDT(r.fare)}</span> },
        ]}
      />

      <FormDialog open={open} title="Create Trip for Approved Coach" onClose={() => setOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <select
            value={form.busId || approvedBuses[0]?.id || ''}
            onChange={(e) => setForm({ ...form, busId: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            {approvedBuses.map((b) => (
              <option key={b.id} value={b.id}>{b.coachNumber} · {b.name}</option>
            ))}
          </select>
          <select
            value={form.routeId || routes[0]?.id || ''}
            onChange={(e) => setForm({ ...form, routeId: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            {routes.map((rt) => (
              <option key={rt.id} value={rt.id}>{rt.originName} → {rt.destinationName}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-3">
            <input type="date" value={form.journeyDate} onChange={(e) => setForm({ ...form, journeyDate: e.target.value })} className="h-10 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
            <input type="time" value={form.departureTime} onChange={(e) => setForm({ ...form, departureTime: e.target.value })} className="h-10 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
            <input type="time" value={form.arrivalTime} onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })} className="h-10 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs" />
          </div>
          <input type="number" min={100} value={form.fare} onChange={(e) => setForm({ ...form, fare: Number(e.target.value) })} className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
          <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
            Publish Schedule
          </button>
        </form>
      </FormDialog>
    </OwnerShell>
  );
}

export function OwnerBookingsPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const { data: bookings = [], isLoading } = useQuery({ queryKey: ['owner-bookings', uid], queryFn: () => fetchOwnerBookings(uid), enabled: Boolean(uid) });

  return (
    <OwnerShell>
      <DataTable<Booking>
        title="Passenger Lists & Bookings"
        data={bookings}
        loading={isLoading}
        searchPlaceholder="Search PNR or passenger..."
        searchPredicate={(r, q) => r.pnr.toLowerCase().includes(q) || r.passengerName.toLowerCase().includes(q)}
        columns={[
          { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold text-orange-600">{r.pnr}</span> },
          { key: 'pax', header: 'Passenger', render: (r) => <span>{r.passengerName} ({r.passengerPhone})</span> },
          { key: 'rt', header: 'Route & Date', render: (r) => <span>{r.routeLabel} · {r.journeyDate}</span> },
          { key: 'seats', header: 'Seats', render: (r) => <span className="font-mono">{r.seatNumbers.join(', ')}</span> },
          { key: 'st', header: 'Status', align: 'right', render: (r) => <span className="uppercase font-mono text-[11px]">{r.bookingStatus}</span> },
        ]}
      />
    </OwnerShell>
  );
}

export function OwnerFinancialsPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const { data: payments = [] } = useQuery({ queryKey: ['owner-payments', uid], queryFn: () => fetchOwnerPayments(uid), enabled: Boolean(uid) });
  const { data: settlements = [] } = useQuery({ queryKey: ['owner-settlements', uid], queryFn: () => fetchOwnerSettlements(uid), enabled: Boolean(uid) });

  return (
    <OwnerShell>
      <div className="space-y-6">
        <DataTable<PaymentRecord>
          title="My Payment History"
          data={payments}
          columns={[
            { key: 'txn', header: 'Transaction', render: (r) => <span className="font-mono">{r.transactionId}</span> },
            { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold">{r.pnr}</span> },
            { key: 'prov', header: 'Method', render: (r) => <span className="uppercase">{r.provider}</span> },
            { key: 'amt', header: 'Amount', align: 'right', render: (r) => <span className="font-mono font-bold">{formatBDT(r.amount)}</span> },
          ]}
        />
        <DataTable<Settlement>
          title="Settlement Statements"
          data={settlements}
          columns={[
            { key: 'per', header: 'Period', render: (r) => <span>{r.periodLabel}</span> },
            { key: 'gr', header: 'Gross', render: (r) => <span className="font-mono">{formatBDT(r.grossAmount)}</span> },
            { key: 'net', header: 'Net Payout', render: (r) => <span className="font-mono font-bold text-emerald-600">{formatBDT(r.netPayable)}</span> },
            { key: 'st', header: 'Status', align: 'right', render: (r) => <span className="uppercase font-mono">{r.status}</span> },
          ]}
        />
      </div>
    </OwnerShell>
  );
}

export function OwnerProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const { notify } = useToast();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    await updateOwnProfile(profile.uid, { displayName, phone });
    await refreshProfile();
    notify('Profile updated', 'success');
  };

  return (
    <OwnerShell>
      <form onSubmit={handleSave} className="max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
        <h1 className="text-lg font-bold font-display">Owner Profile Settings</h1>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name" className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
        <button type="submit" className="px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
          Save Changes
        </button>
      </form>
    </OwnerShell>
  );
}
