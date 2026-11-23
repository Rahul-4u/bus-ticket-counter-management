import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer, Receipt, ShieldCheck } from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AdminShell } from './AdminShell';
import { DataTable } from '../../components/dashboard/DataTable';
import { SeatMap } from '../../components/seats/SeatMap';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { db } from '../../lib/firebase';
import {
  adminCreateSettlement,
  adminFetchAllBookings,
  adminFetchAllPayments,
  adminFetchAllRefunds,
  adminFetchBusOwners,
  adminFetchSettlements,
  adminMarkSettlementPaid,
  adminProcessRefund,
  confirmBookingTransaction,
  fetchCounters,
  fetchTrips,
  subscribeTripSeats,
} from '../../services/firestoreService';
import { formatBDT } from '../../lib/seatLayouts';
import { downloadETicketPDF } from '../../lib/pdfTicket';
import type { Booking, PaymentRecord, RefundRequest, Settlement, TripSeat } from '../../types/domain';

export function AdminBookingsPage() {
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['admin-bookings'],
    queryFn: adminFetchAllBookings,
  });

  return (
    <AdminShell>
      <DataTable<Booking>
        title="All Ticket Bookings"
        data={bookings}
        loading={isLoading}
        searchPlaceholder="Search PNR, phone, passenger..."
        searchPredicate={(r, q) =>
          r.pnr.toLowerCase().includes(q) ||
          r.passengerPhone.toLowerCase().includes(q) ||
          r.passengerName.toLowerCase().includes(q)
        }
        filterOptions={[
          { label: 'Online', value: 'online' },
          { label: 'Counter', value: 'counter' },
          { label: 'Cancelled', value: 'cancelled' },
        ]}
        filterPredicate={(r, val) =>
          val === 'cancelled' ? r.bookingStatus === 'cancelled' : r.bookingChannel === val
        }
        columns={[
          { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold text-orange-600">{r.pnr}</span> },
          { key: 'pax', header: 'Passenger', render: (r) => <span>{r.passengerName} · {r.passengerPhone}</span> },
          { key: 'route', header: 'Route', render: (r) => <span>{r.routeLabel}</span> },
          { key: 'date', header: 'Departure', render: (r) => <span className="font-mono">{r.journeyDate} {r.departureTime}</span> },
          { key: 'seats', header: 'Seats', render: (r) => <span className="font-mono">{r.seatNumbers.join(', ')}</span> },
          { key: 'ch', header: 'Channel', render: (r) => <span className="capitalize">{r.bookingChannel}</span> },
          { key: 'st', header: 'Status', render: (r) => <span className="uppercase font-mono text-[11px]">{r.bookingStatus}</span> },
          {
            key: 'act',
            header: 'Ticket',
            align: 'right',
            render: (r) => (
              <Link to={`/ticket/${r.pnr}`} className="text-xs font-semibold text-orange-600 hover:underline">
                View E-Ticket
              </Link>
            ),
          },
        ]}
      />
    </AdminShell>
  );
}

export function AdminCounterPosPage() {
  const { profile } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data: trips = [] } = useQuery({ queryKey: ['admin-trips'], queryFn: () => fetchTrips() });
  const { data: counters = [] } = useQuery({ queryKey: ['counters'], queryFn: fetchCounters });

  const [selectedTripId, setSelectedTripId] = useState('');
  const [counterId, setCounterId] = useState('');
  const [seats, setSeats] = useState<TripSeat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [issuedBooking, setIssuedBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  const activeTrip = trips.find((t) => t.id === (selectedTripId || trips[0]?.id));

  useEffect(() => {
    if (!activeTrip) return;
    setSelectedSeats([]);
    const unsub = subscribeTripSeats(activeTrip.id, setSeats);
    return () => unsub();
  }, [activeTrip?.id]);

  const handleToggleSeat = (sn: string) => {
    setSelectedSeats((prev) =>
      prev.includes(sn) ? prev.filter((s) => s !== sn) : prev.length < 6 ? [...prev, sn] : prev
    );
  };

  const handleIssueCashTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !profile || selectedSeats.length === 0) return;
    setBusy(true);
    try {
      const fare = activeTrip.fare * selectedSeats.length;
      const booking = await confirmBookingTransaction({
        trip: activeTrip,
        uid: profile.uid,
        bookingChannel: 'counter',
        counterId: counterId || counters[0]?.id || 'cnt_arambagh',
        counterStaffUid: profile.uid,
        passengerName,
        passengerPhone,
        passengerEmail: profile.email,
        passengers: selectedSeats.map((s) => ({ seatNumber: s, name: passengerName, gender: 'male' })),
        boardingPoint: activeTrip.boardingPoints[0] || activeTrip.originName,
        droppingPoint: activeTrip.droppingPoints[0] || activeTrip.destinationName,
        seatNumbers: selectedSeats,
        subtotal: fare,
        discountAmount: 0,
        totalFare: fare,
        paymentMethod: 'counter_cash',
        transactionId: `CASH_${Date.now()}`,
        verifiedServerSide: true,
      });
      setIssuedBooking(booking);
      setSelectedSeats([]);
      setPassengerName('');
      setPassengerPhone('');
      notify(`Counter ticket issued: ${booking.pnr}`, 'success');
      queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
    } catch (err) {
      notify('Counter booking failed', 'error', err instanceof Error ? err.message : 'Seat unavailable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white font-display flex items-center gap-2">
            <Receipt className="w-6 h-6 text-orange-600" />
            Authorized Counter Booking POS
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Shares the exact real-time trip seat inventory with online bookings. Prevents duplicate seat allocation.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Select Scheduled Trip</label>
                <select
                  value={activeTrip?.id || ''}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                >
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.originName} → {t.destinationName} ({t.journeyDate} {t.departureTime})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Authorized Counter</label>
                <select
                  value={counterId || counters[0]?.id || ''}
                  onChange={(e) => setCounterId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium"
                >
                  {counters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.cityName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeTrip && (
              <SeatMap
                seats={seats}
                layoutType={activeTrip.layoutType}
                selectedSeats={selectedSeats}
                currentUid={profile?.uid}
                onToggleSeat={handleToggleSeat}
              />
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <form
              onSubmit={handleIssueCashTicket}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
            >
              <h2 className="text-base font-bold font-display">Counter Cash Sale</h2>
              <div className="text-xs space-y-1 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                <p>Seats: <strong className="font-mono text-orange-600">{selectedSeats.join(', ') || 'None'}</strong></p>
                <p>
                  Cash Total:{' '}
                  <strong className="font-mono">
                    {formatBDT((activeTrip?.fare || 0) * selectedSeats.length)}
                  </strong>
                </p>
              </div>
              <input
                required
                placeholder="Passenger Full Name"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                required
                placeholder="Passenger Phone (+880...)"
                value={passengerPhone}
                onChange={(e) => setPassengerPhone(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
              />
              <button
                type="submit"
                disabled={busy || selectedSeats.length === 0}
                className="w-full h-11 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-sm font-semibold cursor-pointer"
              >
                {busy ? 'Issuing Ticket...' : 'Accept Cash & Issue Ticket'}
              </button>
            </form>

            {issuedBooking && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Issued PNR: {issuedBooking.pnr}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {issuedBooking.passengerName} · Seats {issuedBooking.seatNumbers.join(', ')} · {formatBDT(issuedBooking.totalFare)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => downloadETicketPDF(issuedBooking)}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print / PDF Ticket
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

export function AdminRefundsPage() {
  const { profile } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { data: refunds = [], isLoading } = useQuery({
    queryKey: ['admin-refunds'],
    queryFn: adminFetchAllRefunds,
  });

  const handleAction = async (ref: RefundRequest, decision: 'approved' | 'rejected' | 'processed') => {
    if (!profile) return;
    await adminProcessRefund(ref, decision, `Marked ${decision} by Admin`, profile.uid);
    notify(`Refund ${ref.pnr} ${decision}`, 'success');
    queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
    queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
  };

  return (
    <AdminShell>
      <DataTable<RefundRequest>
        title="Cancellation & Refund Queue"
        data={refunds}
        loading={isLoading}
        columns={[
          { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold">{r.pnr}</span> },
          { key: 'reason', header: 'Reason', render: (r) => <span className="max-w-xs truncate block">{r.reason}</span> },
          { key: 'orig', header: 'Original', render: (r) => <span className="font-mono">{formatBDT(r.originalAmount)}</span> },
          { key: 'elig', header: 'Eligible Refund', render: (r) => <span className="font-mono font-bold text-emerald-600">{formatBDT(r.eligibleRefundAmount)} ({r.refundPercent}%)</span> },
          { key: 'st', header: 'Status', render: (r) => <span className="uppercase font-mono text-[11px]">{r.status}</span> },
          {
            key: 'act',
            header: 'Decision',
            align: 'right',
            render: (r) => (
              <div className="inline-flex gap-1.5">
                {r.status === 'requested' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAction(r, 'approved')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(r, 'rejected')}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs cursor-pointer"
                    >
                      Reject
                    </button>
                  </>
                )}
                {r.status === 'approved' && (
                  <button
                    type="button"
                    onClick={() => handleAction(r, 'processed')}
                    className="px-2.5 py-1 rounded-lg bg-orange-600 text-white text-xs cursor-pointer"
                  >
                    Mark Refunded
                  </button>
                )}
              </div>
            ),
          },
        ]}
      />
    </AdminShell>
  );
}

export function AdminFinancialsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { data: payments = [], isLoading } = useQuery({ queryKey: ['admin-payments'], queryFn: adminFetchAllPayments });
  const { data: settlements = [] } = useQuery({ queryKey: ['admin-settlements'], queryFn: adminFetchSettlements });
  const { data: owners = [] } = useQuery({ queryKey: ['admin-owners'], queryFn: adminFetchBusOwners });

  const generateSettlement = async () => {
    const owner = owners[0];
    if (!owner) return;
    const ownerPaid = payments.filter((p) => p.ownerId === owner.userId && p.status === 'paid');
    const gross = ownerPaid.reduce((a, b) => a + b.amount, 0);
    const commission = Math.round((gross * owner.commissionRate) / 100);
    const now = new Date().toISOString();
    await adminCreateSettlement({
      id: `set_${Date.now()}`,
      ownerId: owner.userId,
      ownerName: owner.companyUnitName,
      periodLabel: `Settlement ${now.slice(0, 10)}`,
      grossAmount: gross,
      commissionAmount: commission,
      netPayable: gross - commission,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    notify('Settlement statement generated', 'success');
    queryClient.invalidateQueries({ queryKey: ['admin-settlements'] });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <DataTable<PaymentRecord>
          title="Payment Transactions Ledger"
          data={payments}
          loading={isLoading}
          searchPlaceholder="Search transaction ID or PNR..."
          searchPredicate={(r, q) =>
            r.transactionId.toLowerCase().includes(q) || r.pnr.toLowerCase().includes(q)
          }
          columns={[
            { key: 'txn', header: 'Transaction ID', render: (r) => <span className="font-mono text-xs">{r.transactionId}</span> },
            { key: 'pnr', header: 'PNR', render: (r) => <span className="font-mono font-bold">{r.pnr}</span> },
            { key: 'prov', header: 'Gateway', render: (r) => <span className="uppercase">{r.provider}</span> },
            { key: 'amt', header: 'Amount', render: (r) => <span className="font-mono font-bold">{formatBDT(r.amount)}</span> },
            { key: 'ver', header: 'Verified', render: (r) => <span>{r.verifiedServerSide ? 'Server HMAC' : 'Pending'}</span> },
            { key: 'st', header: 'Status', align: 'right', render: (r) => <span className="uppercase font-mono">{r.status}</span> },
          ]}
        />

        <DataTable<Settlement>
          title="Bus Owner Settlements"
          data={settlements}
          actionSlot={
            <button
              type="button"
              onClick={generateSettlement}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold cursor-pointer"
            >
              Generate Owner Settlement
            </button>
          }
          columns={[
            { key: 'owner', header: 'Owner', render: (r) => <span className="font-semibold">{r.ownerName}</span> },
            { key: 'period', header: 'Period', render: (r) => <span>{r.periodLabel}</span> },
            { key: 'gross', header: 'Gross', render: (r) => <span className="font-mono">{formatBDT(r.grossAmount)}</span> },
            { key: 'net', header: 'Net Payable', render: (r) => <span className="font-mono font-bold text-emerald-600">{formatBDT(r.netPayable)}</span> },
            {
              key: 'act',
              header: 'Status',
              align: 'right',
              render: (r) =>
                r.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await adminMarkSettlementPaid(r.id, `BANK_${Date.now()}`);
                      notify('Settlement marked paid', 'success');
                      queryClient.invalidateQueries({ queryKey: ['admin-settlements'] });
                    }}
                    className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs cursor-pointer"
                  >
                    Mark Paid
                  </button>
                ) : (
                  <span className="font-mono text-emerald-600 font-semibold">PAID ({r.referenceNo})</span>
                ),
            },
          ]}
        />
      </div>
    </AdminShell>
  );
}

export interface ManagedUser {
  id: string;
  uid?: string;
  name: string;
  email: string;
  phone: string;
  role: 'passenger' | 'owner' | 'admin';
  status: 'active' | 'suspended';
  createdAt?: string;
}

export function AdminUserControlPage() {
  const { profile } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'passenger' | 'owner' | 'admin'>('admin');
  const [saving, setSaving] = useState(false);

  const { data: users = [], isLoading } = useQuery<ManagedUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => {
        const raw = d.data() as Record<string, unknown>;
        const normalizedRole =
          raw.role === 'admin' || raw.role === 'owner' || raw.role === 'passenger'
            ? raw.role
            : 'passenger';
        const normalizedStatus = raw.status === 'suspended' ? 'suspended' : 'active';
        return {
          id: d.id,
          uid: typeof raw.uid === 'string' && raw.uid ? raw.uid : d.id,
          name: typeof raw.name === 'string' ? raw.name : '',
          email: typeof raw.email === 'string' ? raw.email : '',
          phone: typeof raw.phone === 'string' ? raw.phone : '',
          role: normalizedRole,
          status: normalizedStatus,
          createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
        };
      });
    },
  });

  const refreshUsers = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  };

  const handleAddOrAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name.trim() || cleanEmail.split('@')[0];
      const cleanPhone = phone.trim();
      const now = new Date().toISOString();

      const existing = users.find((u) => (u.email || '').toLowerCase() === cleanEmail);
      const targetDocId = existing ? existing.id : encodeURIComponent(cleanEmail);

      await setDoc(
        doc(db, 'users', targetDocId),
        {
          uid: existing?.uid || targetDocId,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role,
          status: existing?.status || 'active',
          updatedAt: now,
          createdAt: existing?.createdAt || now,
        },
        { merge: true }
      );

      setName('');
      setEmail('');
      setPhone('');
      setRole('admin');
      notify(`${cleanEmail} (${role}) saved`, 'success');
      refreshUsers();
    } catch (err) {
      notify(
        'Failed to save user',
        'error',
        err instanceof Error ? err.message : 'Check Firestore rules or permissions'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async (user: ManagedUser, nextRole: 'passenger' | 'owner' | 'admin') => {
    const isSelf = Boolean(profile?.uid && (user.uid === profile.uid || user.id === profile.uid));
    if (isSelf && nextRole !== 'admin') {
      notify('You cannot remove your own admin role', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.id), {
        role: nextRole,
        updatedAt: new Date().toISOString(),
      });
      notify(`Role updated to ${nextRole}`, 'success');
      refreshUsers();
    } catch (err) {
      notify('Failed to update role', 'error', err instanceof Error ? err.message : 'Permission denied');
    }
  };

  const handleToggleStatus = async (user: ManagedUser) => {
    const isSelf = Boolean(profile?.uid && (user.uid === profile.uid || user.id === profile.uid));
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
    if (isSelf && nextStatus === 'suspended') {
      notify('You cannot suspend your own active admin account', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.id), {
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      notify(`User ${nextStatus}`, 'success');
      refreshUsers();
    } catch (err) {
      notify('Failed to update status', 'error', err instanceof Error ? err.message : 'Permission denied');
    }
  };

  const handleRemoveUser = async (user: ManagedUser) => {
    const isSelf = Boolean(profile?.uid && (user.uid === profile.uid || user.id === profile.uid));
    if (isSelf) {
      notify('You cannot remove your own active admin account', 'error');
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', user.id));
      notify(`Removed ${user.email || user.name || user.id}`, 'success');
      refreshUsers();
    } catch (err) {
      notify('Failed to remove user', 'error', err instanceof Error ? err.message : 'Permission denied');
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-950 dark:text-white font-display flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-orange-600" />
            Admin & User Control Center
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Add or remove admins, assign Passenger / Bus Owner / Admin roles, suspend accounts, or remove user records.
          </p>
        </div>

        <form
          onSubmit={handleAddOrAssignUser}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4"
        >
          <h2 className="text-sm font-bold font-display">Add Admin / Assign User Role</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              type="email"
              required
              placeholder="User or Admin Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              type="text"
              placeholder="Phone (+880...)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'passenger' | 'owner' | 'admin')}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="admin">Admin</option>
              <option value="owner">Bus Owner</option>
              <option value="passenger">Passenger</option>
            </select>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-xs font-semibold cursor-pointer"
            >
              {saving ? 'Saving...' : 'Add / Update User'}
            </button>
          </div>
        </form>

        <DataTable<ManagedUser>
          title="All Users & Admin Access Control"
          data={users}
          loading={isLoading}
          searchPlaceholder="Search name, email, phone, role..."
          searchPredicate={(r, q) =>
            (r.name || '').toLowerCase().includes(q) ||
            (r.email || '').toLowerCase().includes(q) ||
            (r.phone || '').toLowerCase().includes(q) ||
            (r.role || '').toLowerCase().includes(q)
          }
          filterOptions={[
            { label: 'Admins', value: 'admin' },
            { label: 'Bus Owners', value: 'owner' },
            { label: 'Passengers', value: 'passenger' },
            { label: 'Suspended', value: 'suspended' },
          ]}
          filterPredicate={(r, val) =>
            val === 'suspended' ? r.status === 'suspended' : r.role === val
          }
          columns={[
            {
              key: 'user',
              header: 'User',
              render: (r) => (
                <div>
                  <div className="font-semibold">{r.name || 'Unnamed User'}</div>
                  <div className="text-xs text-slate-500">{r.email || r.id}</div>
                </div>
              ),
            },
            {
              key: 'phone',
              header: 'Phone',
              render: (r) => <span className="font-mono text-xs">{r.phone || '—'}</span>,
            },
            {
              key: 'role',
              header: 'Role',
              render: (r) => (
                <select
                  value={r.role}
                  onChange={(e) => handleChangeRole(r, e.target.value as 'passenger' | 'owner' | 'admin')}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold capitalize"
                >
                  <option value="passenger">Passenger</option>
                  <option value="owner">Bus Owner</option>
                  <option value="admin">Admin</option>
                </select>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (r) => <span className="uppercase font-mono text-[11px]">{r.status}</span>,
            },
            {
              key: 'actions',
              header: 'Controls',
              align: 'right',
              render: (r) => (
                <div className="inline-flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(r)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs cursor-pointer"
                  >
                    {r.status === 'suspended' ? 'Activate' : 'Suspend'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveUser(r)}
                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>
    </AdminShell>
  );
}