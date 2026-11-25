import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  LayoutDashboard,
  MapPin,
  Plus,
  RotateCcw,
  Star,
  Ticket,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { DashboardLayout, SidebarGroup } from '../../components/dashboard/DashboardLayout';
import { LiveChatWidget } from '../../components/chat/LiveChatWidget';
import { StatCard } from '../../components/dashboard/StatCard';
import { DataTable } from '../../components/dashboard/DataTable';
import { FormDialog } from '../../components/dashboard/Dialogs';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import {
  createSupportTicket,
  deleteSavedPassenger,
  fetchCompanySettings,
  fetchSavedPassengers,
  fetchUserBookings,
  fetchUserPayments,
  fetchUserRefunds,
  fetchUserSupportTickets,
  requestBookingCancellation,
  savePassengerProfile,
  submitTripReview,
  updateOwnProfile,
} from '../../services/firestoreService';
import { calculateEligibleRefund, formatBDT } from '../../lib/seatLayouts';
import { downloadETicketPDF } from '../../lib/pdfTicket';
import type { Booking, PaymentRecord, RefundRequest, SavedPassenger, SupportTicket } from '../../types/domain';

const PASSENGER_GROUPS: SidebarGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/passenger', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'My Travel',
    items: [
      { label: 'My Bookings & Tickets', to: '/passenger/bookings', icon: Ticket },
      { label: 'Track Booking', to: '/track', icon: MapPin },
      { label: 'Saved Passengers', to: '/passenger/saved-passengers', icon: Users },
    ],
  },
  {
    title: 'Payments & Account',
    items: [
      { label: 'Payments & Refunds', to: '/passenger/payments', icon: CreditCard },
      { label: 'Profile & Support', to: '/passenger/profile', icon: User },
    ],
  },
];

export function PassengerShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout portalTitle="Passenger Portal" roleLabel="Passenger" groups={PASSENGER_GROUPS}>
      {children}
      <LiveChatWidget />
    </DashboardLayout>
  );
}

export function PassengerOverviewPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['passenger-bookings', uid],
    queryFn: () => fetchUserBookings(uid),
    enabled: Boolean(uid),
  });

  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const upcoming = bookings.filter((b) => b.bookingStatus === 'confirmed' && b.journeyDate >= today);
    const completed = bookings.filter((b) => b.bookingStatus === 'confirmed' && b.journeyDate < today);
    const cancelled = bookings.filter((b) => b.bookingStatus === 'cancelled' || b.bookingStatus === 'refunded');
    return {
      nextTrip: upcoming[0],
      total: bookings.length,
      upcomingCount: upcoming.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
    };
  }, [bookings, today]);

  return (
    <PassengerShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white font-display">
              Welcome back, {profile?.displayName}
            </h1>
            <p className="text-xs text-slate-500 mt-1">Manage your journeys, QR e-tickets, and saved travelers.</p>
          </div>
          <Link
            to="/search"
            className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
          >
            Book New Journey
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Upcoming Trips" value={stats.upcomingCount} icon={Ticket} tone="orange" />
          <StatCard label="Total Bookings" value={stats.total} icon={MapPin} tone="slate" />
          <StatCard label="Completed Journeys" value={stats.completedCount} icon={Star} tone="emerald" />
          <StatCard label="Cancelled / Refunded" value={stats.cancelledCount} icon={RotateCcw} tone="amber" />
        </div>

        {stats.nextTrip && (
          <div className="bg-[#0B1F3A] text-white rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">Upcoming Journey</p>
              <h2 className="text-xl font-bold font-display mt-1">{stats.nextTrip.routeLabel}</h2>
              <p className="text-xs text-slate-300 mt-1 font-mono">
                PNR: {stats.nextTrip.pnr} · {stats.nextTrip.journeyDate} at {stats.nextTrip.departureTime} · Seats {stats.nextTrip.seatNumbers.join(', ')}
              </p>
            </div>
            <div className="flex gap-2.5">
              <Link
                to={`/ticket/${stats.nextTrip.pnr}`}
                className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold"
              >
                Open E-Ticket
              </Link>
              <button
                type="button"
                onClick={() => downloadETicketPDF(stats.nextTrip!)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
              >
                Download PDF
              </button>
            </div>
          </div>
        )}

        <DataTable<Booking>
          title="Recent Booking Activity"
          data={bookings}
          loading={isLoading}
          emptyTitle="No bookings yet"
          emptyDescription="Search available coaches to book your first intercity journey."
          columns={[
            { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold text-orange-600">{r.pnr}</span> },
            { key: 'rt', header: 'Route', render: (r) => <span className="font-semibold">{r.routeLabel}</span> },
            { key: 'dt', header: 'Departure', render: (r) => <span className="font-mono">{r.journeyDate} {r.departureTime}</span> },
            { key: 'st', header: 'Status', render: (r) => <span className="uppercase font-mono text-[11px]">{r.bookingStatus}</span> },
            {
              key: 'act',
              header: 'Ticket',
              align: 'right',
              render: (r) => (
                <Link to={`/ticket/${r.pnr}`} className="text-xs font-semibold text-orange-600 hover:underline">
                  View Ticket
                </Link>
              ),
            },
          ]}
        />
      </div>
    </PassengerShell>
  );
}

export function PassengerBookingsPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['passenger-bookings', uid],
    queryFn: () => fetchUserBookings(uid),
    enabled: Boolean(uid),
  });
  const { data: settings } = useQuery({ queryKey: ['company-settings'], queryFn: fetchCompanySettings });

  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reviewTarget, setReviewTarget] = useState<Booking | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    const calc = calculateEligibleRefund(
      cancelTarget.journeyDate,
      cancelTarget.departureTime,
      cancelTarget.totalFare,
      settings?.cancellationPolicy
    );
    await requestBookingCancellation(cancelTarget, cancelReason, calc.eligibleAmount, calc.refundPercent);
    notify('Cancellation & refund request submitted', 'success', `Eligible refund: ${formatBDT(calc.eligibleAmount)}`);
    setCancelTarget(null);
    setCancelReason('');
    queryClient.invalidateQueries({ queryKey: ['passenger-bookings', uid] });
    queryClient.invalidateQueries({ queryKey: ['passenger-refunds', uid] });
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget || !profile) return;
    await submitTripReview({
      bookingId: reviewTarget.id,
      tripId: reviewTarget.tripId,
      userId: profile.uid,
      passengerName: profile.displayName,
      routeLabel: reviewTarget.routeLabel,
      rating,
      comment,
    });
    notify('Thank you for reviewing your journey!', 'success');
    setReviewTarget(null);
    setComment('');
  };

  return (
    <PassengerShell>
      <DataTable<Booking>
        title="My Bookings & E-Tickets"
        data={bookings}
        loading={isLoading}
        searchPlaceholder="Search PNR or route..."
        searchPredicate={(r, q) => r.pnr.toLowerCase().includes(q) || r.routeLabel.toLowerCase().includes(q)}
        filterOptions={[
          { label: 'Confirmed', value: 'confirmed' },
          { label: 'Cancelled', value: 'cancelled' },
          { label: 'Refunded', value: 'refunded' },
        ]}
        filterPredicate={(r, v) => r.bookingStatus === v}
        columns={[
          { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold text-orange-600">{r.pnr}</span> },
          { key: 'rt', header: 'Route', render: (r) => <span className="font-semibold">{r.routeLabel}</span> },
          { key: 'dt', header: 'Date & Time', render: (r) => <span className="font-mono">{r.journeyDate} {r.departureTime}</span> },
          { key: 'seats', header: 'Seats', render: (r) => <span className="font-mono">{r.seatNumbers.join(', ')}</span> },
          { key: 'fare', header: 'Fare', render: (r) => <span className="font-mono font-bold">{formatBDT(r.totalFare)}</span> },
          { key: 'st', header: 'Status', render: (r) => <span className="uppercase font-mono text-[11px]">{r.bookingStatus}</span> },
          {
            key: 'act',
            header: 'Actions',
            align: 'right',
            render: (r) => (
              <div className="inline-flex items-center gap-2">
                <Link to={`/ticket/${r.pnr}`} className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs">
                  E-Ticket
                </Link>
                <button
                  type="button"
                  onClick={() => downloadETicketPDF(r)}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                >
                  PDF
                </button>
                {r.bookingStatus === 'confirmed' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setReviewTarget(r)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelTarget(r)}
                      className="px-2.5 py-1 rounded-lg text-red-600 border border-red-200 text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />

      <FormDialog open={Boolean(cancelTarget)} title={`Cancel Booking ${cancelTarget?.pnr || ''}`} onClose={() => setCancelTarget(null)}>
        {cancelTarget && (
          <form onSubmit={handleCancelSubmit} className="space-y-4">
            {(() => {
              const calc = calculateEligibleRefund(
                cancelTarget.journeyDate,
                cancelTarget.departureTime,
                cancelTarget.totalFare,
                settings?.cancellationPolicy
              );
              return (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
                  <p>Hours until departure: <strong>{calc.hoursUntilDeparture}h</strong></p>
                  <p>Eligible refund tier: <strong>{calc.refundPercent}% ({formatBDT(calc.eligibleAmount)})</strong></p>
                </div>
              );
            })()}
            <textarea
              required
              rows={3}
              placeholder="Reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <button type="submit" className="w-full h-10 rounded-xl bg-red-600 text-white text-sm font-semibold cursor-pointer">
              Confirm Cancellation &amp; Request Refund
            </button>
          </form>
        )}
      </FormDialog>

      <FormDialog open={Boolean(reviewTarget)} title="Rate Your Journey" onClose={() => setReviewTarget(null)}>
        <form onSubmit={handleReviewSubmit} className="space-y-4">
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n} Stars</option>
            ))}
          </select>
          <textarea
            required
            rows={3}
            placeholder="Share your coach comfort and punctuality experience..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
            Submit Review
          </button>
        </form>
      </FormDialog>
    </PassengerShell>
  );
}

export function PassengerSavedPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', gender: 'male' as 'male' | 'female' | 'other', nidOrPassport: '' });

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['saved-passengers', uid],
    queryFn: () => fetchSavedPassengers(uid),
    enabled: Boolean(uid),
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    await savePassengerProfile({ ...form, userId: uid });
    notify('Traveler saved', 'success');
    setOpen(false);
    setForm({ fullName: '', phone: '', gender: 'male', nidOrPassport: '' });
    queryClient.invalidateQueries({ queryKey: ['saved-passengers', uid] });
  };

  return (
    <PassengerShell>
      <DataTable<SavedPassenger>
        title="Saved Travelers"
        data={list}
        loading={isLoading}
        actionSlot={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Traveler
          </button>
        }
        columns={[
          { key: 'name', header: 'Full Name', render: (r) => <span className="font-semibold">{r.fullName}</span> },
          { key: 'phone', header: 'Phone', render: (r) => <span className="font-mono">{r.phone}</span> },
          { key: 'gen', header: 'Gender', render: (r) => <span className="capitalize">{r.gender}</span> },
          {
            key: 'del',
            header: 'Remove',
            align: 'right',
            render: (r) => (
              <button
                type="button"
                onClick={async () => {
                  await deleteSavedPassenger(r.id);
                  notify('Removed saved traveler', 'info');
                  queryClient.invalidateQueries({ queryKey: ['saved-passengers', uid] });
                }}
                className="p-1.5 text-red-600 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ),
          },
        ]}
      />

      <FormDialog open={open} title="Save Frequent Traveler" onClose={() => setOpen(false)}>
        <form onSubmit={handleAdd} className="space-y-4">
          <input required placeholder="Full Name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
          <input required placeholder="Phone (+880...)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'male' | 'female' | 'other' })} className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
            Save Traveler
          </button>
        </form>
      </FormDialog>
    </PassengerShell>
  );
}

export function PassengerPaymentsPage() {
  const { profile } = useAuth();
  const uid = profile?.uid || '';
  const { data: payments = [] } = useQuery({ queryKey: ['passenger-payments', uid], queryFn: () => fetchUserPayments(uid), enabled: Boolean(uid) });
  const { data: refunds = [] } = useQuery({ queryKey: ['passenger-refunds', uid], queryFn: () => fetchUserRefunds(uid), enabled: Boolean(uid) });

  return (
    <PassengerShell>
      <div className="space-y-6">
        <DataTable<PaymentRecord>
          title="My Payment History"
          data={payments}
          columns={[
            { key: 'txn', header: 'Transaction ID', render: (r) => <span className="font-mono text-xs">{r.transactionId}</span> },
            { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold">{r.pnr}</span> },
            { key: 'prov', header: 'Gateway', render: (r) => <span className="uppercase">{r.provider}</span> },
            { key: 'amt', header: 'Amount', render: (r) => <span className="font-mono font-bold">{formatBDT(r.amount)}</span> },
            { key: 'st', header: 'Status', align: 'right', render: (r) => <span className="uppercase font-mono">{r.status}</span> },
          ]}
        />
        <DataTable<RefundRequest>
          title="My Refund Requests"
          data={refunds}
          columns={[
            { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold">{r.pnr}</span> },
            { key: 'elig', header: 'Refund Amount', render: (r) => <span className="font-mono text-emerald-600 font-bold">{formatBDT(r.eligibleRefundAmount)}</span> },
            { key: 'st', header: 'Status', render: (r) => <span className="uppercase font-mono">{r.status}</span> },
            { key: 'note', header: 'Note', align: 'right', render: (r) => <span>{r.adminNote || 'In review'}</span> },
          ]}
        />
      </div>
    </PassengerShell>
  );
}

export function PassengerProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const uid = profile?.uid || '';
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const { data: tickets = [] } = useQuery({
    queryKey: ['passenger-support', uid],
    queryFn: () => fetchUserSupportTickets(uid),
    enabled: Boolean(uid),
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    await updateOwnProfile(profile.uid, { displayName, phone });
    await refreshProfile();
    notify('Profile updated', 'success');
  };

  const handleSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    await createSupportTicket({
      userId: profile.uid,
      userName: profile.displayName,
      userEmail: profile.email,
      subject,
      message,
    });
    notify('Support ticket submitted', 'success');
    setSubject('');
    setMessage('');
    queryClient.invalidateQueries({ queryKey: ['passenger-support', uid] });
  };

  return (
    <PassengerShell>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold font-display">Personal Profile</h2>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Full Name" className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (+880...)" className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
          <button type="submit" className="px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
            Update Profile
          </button>
        </form>

        <form onSubmit={handleSupport} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold font-display">New Support Ticket</h2>
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
          <textarea required rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we assist?" className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm" />
          <button type="submit" className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-sm font-semibold cursor-pointer">
            Send Request
          </button>
        </form>
      </div>

      <div className="mt-6">
        <DataTable<SupportTicket>
          title="My Support Tickets"
          data={tickets}
          columns={[
            { key: 'sub', header: 'Subject', render: (r) => <span className="font-semibold">{r.subject}</span> },
            { key: 'st', header: 'Status', render: (r) => <span className="uppercase font-mono text-[11px]">{r.status}</span> },
            { key: 'rep', header: 'Dispatch Reply', align: 'right', render: (r) => <span>{r.adminReply || 'Awaiting response'}</span> },
          ]}
        />
      </div>
    </PassengerShell>
  );
}
