import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bus, CalendarClock, CreditCard, RotateCcw, Ticket, Users } from 'lucide-react';
import { AdminShell } from './AdminShell';
import { StatCard } from '../../components/dashboard/StatCard';
import { BookingChart, ChartPoint, RevenueChart } from '../../components/dashboard/Charts';
import { DataTable } from '../../components/dashboard/DataTable';
import {
  adminFetchAllBookings,
  adminFetchAllBuses,
  adminFetchAllPayments,
  adminFetchAllRefunds,
  adminFetchAllUsers,
  adminFetchBusOwners,
  fetchTrips,
} from '../../services/firestoreService';
import { formatBDT } from '../../lib/seatLayouts';
import type { Booking } from '../../types/domain';

export function AdminOverviewPage() {
  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['admin-bookings'],
    queryFn: adminFetchAllBookings,
  });
  const { data: payments = [] } = useQuery({ queryKey: ['admin-payments'], queryFn: adminFetchAllPayments });
  const { data: buses = [] } = useQuery({ queryKey: ['admin-buses'], queryFn: adminFetchAllBuses });
  const { data: owners = [] } = useQuery({ queryKey: ['admin-owners'], queryFn: adminFetchBusOwners });
  const { data: users = [] } = useQuery({ queryKey: ['admin-users'], queryFn: adminFetchAllUsers });
  const { data: trips = [] } = useQuery({ queryKey: ['admin-trips'], queryFn: () => fetchTrips() });
  const { data: refunds = [] } = useQuery({ queryKey: ['admin-refunds'], queryFn: adminFetchAllRefunds });

  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const totalRevenue = payments
      .filter((p) => p.status === 'paid')
      .reduce((acc, p) => acc + p.amount, 0);
    const todaysBookings = bookings.filter((b) => b.createdAt.startsWith(today)).length;
    const upcomingTrips = trips.filter((t) => t.status === 'scheduled' && t.journeyDate >= today).length;
    const cancelledCount = bookings.filter((b) => b.bookingStatus === 'cancelled' || b.bookingStatus === 'refunded').length;
    const pendingRefunds = refunds.filter((r) => r.status === 'requested').length;
    const passengersCount = users.filter((u) => u.role === 'passenger').length;
    return {
      totalRevenue,
      totalBookings: bookings.length,
      todaysBookings,
      upcomingTrips,
      cancelledCount,
      pendingRefunds,
      passengersCount,
    };
  }, [bookings, payments, trips, refunds, users, today]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const grouped = new Map<string, ChartPoint>();
    bookings.forEach((b) => {
      const day = b.journeyDate || b.createdAt.slice(0, 10);
      const curr = grouped.get(day) || { label: day, revenue: 0, bookings: 0 };
      curr.bookings += 1;
      if (b.paymentStatus === 'paid') {
        curr.revenue += b.totalFare;
      }
      grouped.set(day, curr);
    });
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label)).slice(-10);
  }, [bookings]);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white font-display">
            Platform Operations Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Live metrics aggregated from Firestore bookings, fleet schedules, and payment records.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Verified Revenue"
            value={formatBDT(stats.totalRevenue)}
            subtext={`${payments.filter((p) => p.status === 'paid').length} paid transactions`}
            icon={CreditCard}
            tone="emerald"
          />
          <StatCard
            label="Total Bookings"
            value={stats.totalBookings}
            subtext={`${stats.todaysBookings} booked today`}
            icon={Ticket}
            tone="orange"
          />
          <StatCard
            label="Active Fleet & Owners"
            value={`${buses.length} / ${owners.length}`}
            subtext={`${stats.upcomingTrips} upcoming trips`}
            icon={Bus}
            tone="slate"
          />
          <StatCard
            label="Cancellations & Refunds"
            value={stats.cancelledCount}
            subtext={`${stats.pendingRefunds} pending refund review`}
            icon={RotateCcw}
            tone={stats.pendingRefunds > 0 ? 'amber' : 'slate'}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Registered Passengers" value={stats.passengersCount} icon={Users} tone="slate" />
          <StatCard label="Scheduled Trips" value={trips.length} icon={CalendarClock} tone="orange" />
          <StatCard label="Today's Bookings" value={stats.todaysBookings} icon={Ticket} tone="emerald" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenueChart data={chartData} title="Revenue by Journey Date" />
          <BookingChart data={chartData} title="Daily Booking Volume" />
        </div>

        <DataTable<Booking>
          title="Recent Bookings"
          data={bookings}
          loading={loadingBookings}
          searchPlaceholder="Search PNR, passenger, route..."
          searchPredicate={(row, q) =>
            row.pnr.toLowerCase().includes(q) ||
            row.passengerName.toLowerCase().includes(q) ||
            row.routeLabel.toLowerCase().includes(q)
          }
          filterOptions={[
            { label: 'Confirmed', value: 'confirmed' },
            { label: 'Cancelled', value: 'cancelled' },
            { label: 'Refunded', value: 'refunded' },
          ]}
          filterPredicate={(row, val) => row.bookingStatus === val}
          columns={[
            { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold text-orange-600">{r.pnr}</span> },
            { key: 'passenger', header: 'Passenger', render: (r) => <span>{r.passengerName}</span> },
            { key: 'route', header: 'Route', render: (r) => <span>{r.routeLabel}</span> },
            { key: 'channel', header: 'Channel', render: (r) => <span className="capitalize">{r.bookingChannel}</span> },
            { key: 'seats', header: 'Seats', render: (r) => <span className="font-mono">{r.seatNumbers.join(', ')}</span> },
            { key: 'status', header: 'Booking / Payment', render: (r) => <span className="uppercase font-mono text-[11px]">{r.bookingStatus} · {r.paymentStatus}</span> },
            { key: 'fare', header: 'Fare', align: 'right', render: (r) => <span className="font-mono font-bold tabular-nums">{formatBDT(r.totalFare)}</span> },
          ]}
        />
      </div>
    </AdminShell>
  );
}
