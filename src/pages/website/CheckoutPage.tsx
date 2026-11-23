import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Clock, CreditCard, ShieldCheck, Tag } from 'lucide-react';
import { PublicLayout } from '../../components/website/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import {
  confirmBookingTransaction,
  fetchActiveCoupons,
  fetchSavedPassengers,
  releaseSeatLocksTransaction,
} from '../../services/firestoreService';
import { formatBDT } from '../../lib/seatLayouts';
import type { PaymentMethod, Trip } from '../../types/domain';

const DEMO_TEST_CARD = '4242424242424242';

const checkoutSchema = z.object({
  passengerName: z.string().min(2, 'Full name is required'),
  passengerPhone: z.string().min(8, 'Valid Bangladesh phone number required'),
  passengerEmail: z.string().email('Valid email address required'),
  boardingPoint: z.string().min(1, 'Select a boarding point'),
  droppingPoint: z.string().min(1, 'Select a dropping point'),
  demoCardNumber: z
    .string()
    .refine(
      (val) => val.replace(/\s+/g, '').length >= 8,
      'Enter demo test card number (e.g. 4242424242424242)'
    ),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

interface CheckoutLocationState {
  trip?: Trip;
  seatNumbers?: string[];
  lockExpiresAt?: number;
}

export function CheckoutPage() {
  const { tripId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { notify } = useToast();

  const state = (location.state || {}) as CheckoutLocationState;
  const trip = state.trip;
  const seatNumbers = state.seatNumbers || [];
  const lockExpiresAt = state.lockExpiresAt || Date.now() + 5 * 60 * 1000;

  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.floor((lockExpiresAt - Date.now()) / 1000))
  );
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: coupons = [] } = useQuery({ queryKey: ['active-coupons'], queryFn: fetchActiveCoupons });
  const { data: savedPassengers = [] } = useQuery({
    queryKey: ['saved-passengers', profile?.uid],
    queryFn: () => fetchSavedPassengers(profile!.uid),
    enabled: Boolean(profile?.uid),
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      passengerName: profile?.displayName || '',
      passengerPhone: profile?.phone || '',
      passengerEmail: profile?.email || '',
      boardingPoint: trip?.boardingPoints[0] || '',
      droppingPoint: trip?.droppingPoints[0] || '',
      demoCardNumber: DEMO_TEST_CARD,
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const rem = Math.max(0, Math.floor((lockExpiresAt - Date.now()) / 1000));
      setSecondsLeft(rem);
      if (rem === 0) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockExpiresAt]);

  const subtotal = useMemo(() => (trip ? trip.fare * seatNumbers.length : 0), [trip, seatNumbers]);

  const discountAmount = useMemo(() => {
    if (!appliedCouponCode) return 0;
    const found = coupons.find((c) => c.code.toUpperCase() === appliedCouponCode.toUpperCase());
    if (!found || subtotal < found.minFare) return 0;
    const raw =
      found.discountType === 'percent'
        ? Math.round((subtotal * found.discountValue) / 100)
        : found.discountValue;
    return Math.min(raw, found.maxDiscount);
  }, [appliedCouponCode, coupons, subtotal]);

  const totalFare = Math.max(0, subtotal - discountAmount);

  if (!trip || seatNumbers.length === 0 || !profile) {
    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">No active seat lock session</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Please select your coach and seats again to initiate a fresh 5-minute reservation lock.
          </p>
          <button
            type="button"
            onClick={() => navigate(tripId ? `/trips/${tripId}` : '/search')}
            className="mt-6 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer"
          >
            Select Seats
          </button>
        </div>
      </PublicLayout>
    );
  }

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    const match = coupons.find((c) => c.code.toUpperCase() === code && c.isActive);
    if (!match) {
      notify('Invalid or expired coupon code', 'error');
      return;
    }
    if (subtotal < match.minFare) {
      notify(`Minimum fare of ${formatBDT(match.minFare)} required for ${match.code}`, 'info');
      return;
    }
    setAppliedCouponCode(match.code);
    notify(`Coupon ${match.code} applied`, 'success');
  };

  const handleCancelLock = async () => {
    await releaseSeatLocksTransaction(trip.id, seatNumbers, profile.uid);
    navigate(`/trips/${trip.id}`);
  };

  const onSubmit = async (values: CheckoutFormValues) => {
    if (secondsLeft <= 0) {
      notify('Your 5-minute seat lock expired', 'error', 'Please re-select your seats.');
      navigate(`/trips/${trip.id}`);
      return;
    }

    setSubmitting(true);
    try {
      const sanitizedCard = values.demoCardNumber.replace(/\s+/g, '');
      const demoTxnId = `DEMO_TXN_${Date.now()}_${sanitizedCard.slice(-4)}`;
      const demoSessionKey = `DEMO_SESSION_${Date.now()}`;

      const booking = await confirmBookingTransaction({
        trip,
        uid: profile.uid,
        bookingChannel: 'online',
        passengerName: values.passengerName,
        passengerPhone: values.passengerPhone,
        passengerEmail: values.passengerEmail,
        passengers: seatNumbers.map((sn) => ({
          seatNumber: sn,
          name: values.passengerName,
          gender: 'male',
        })),
        boardingPoint: values.boardingPoint,
        droppingPoint: values.droppingPoint,
        seatNumbers,
        subtotal,
        discountAmount,
        couponCode: appliedCouponCode || undefined,
        totalFare,
        paymentMethod: 'sslcommerz' as PaymentMethod,
        transactionId: demoTxnId,
        sessionKey: demoSessionKey,
        verifiedServerSide: true,
      });

      notify('Demo Payment Successful & Booking Confirmed!', 'success', `PNR: ${booking.pnr}`);
      navigate(`/booking/confirmation/${booking.pnr}`, { state: { booking } });
    } catch (err) {
      notify(
        'Booking could not be completed',
        'error',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <PublicLayout>
      <section className="bg-slate-50 dark:bg-slate-950 py-10 min-h-[80vh]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {/* Lock Timer Banner */}
          <div className="bg-[#0B1F3A] text-white rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-400" />
              <div>
                <p className="text-sm font-bold">
                  Seats Locked: <span className="font-mono text-orange-400">{seatNumbers.join(', ')}</span>
                </p>
                <p className="text-xs text-slate-300">
                  Complete passenger details and demo payment before the reservation lock expires.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-extrabold font-mono tabular-nums text-orange-400">
                {mins}:{secs}
              </span>
              <button
                type="button"
                onClick={handleCancelLock}
                className="text-xs font-semibold text-slate-300 hover:text-white underline cursor-pointer"
              >
                Release Seats
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 space-y-6">
              {/* Passenger Information */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display">
                    Passenger Information
                  </h2>
                  {savedPassengers.length > 0 && (
                    <select
                      onChange={(e) => {
                        const found = savedPassengers.find((p) => p.id === e.target.value);
                        if (found) {
                          setValue('passengerName', found.fullName);
                          setValue('passengerPhone', found.phone);
                        }
                      }}
                      defaultValue=""
                      className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="" disabled>
                        Fill from Saved Travelers
                      </option>
                      {savedPassengers.map((sp) => (
                        <option key={sp.id} value={sp.id}>
                          {sp.fullName} ({sp.phone})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      {...register('passengerName')}
                      placeholder="e.g. Tanvir Ahmed"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    {errors.passengerName && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {errors.passengerName.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Mobile Number (BD)
                    </label>
                    <input
                      {...register('passengerPhone')}
                      placeholder="01712345678"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    {errors.passengerPhone && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {errors.passengerPhone.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Address (for E-Ticket)
                  </label>
                  <input
                    {...register('passengerEmail')}
                    type="email"
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                  {errors.passengerEmail && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {errors.passengerEmail.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Boarding Point
                    </label>
                    <select
                      {...register('boardingPoint')}
                      className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                    >
                      {trip.boardingPoints.map((bp) => (
                        <option key={bp} value={bp}>
                          {bp}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Dropping Point
                    </label>
                    <select
                      {...register('droppingPoint')}
                      className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                    >
                      {trip.droppingPoints.map((dp) => (
                        <option key={dp} value={dp}>
                          {dp}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Demo Payment Only */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-orange-600" />
                    Demo Payment (Test Mode)
                  </h2>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                    Demo Only
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-orange-600 bg-orange-50/40 dark:bg-orange-950/20 dark:border-orange-500 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-950 dark:text-white">
                        Demo Card Checkout
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        No real gateway charge. Use test card number <span className="font-mono">4242424242424242</span>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setValue('demoCardNumber', DEMO_TEST_CARD, { shouldValidate: true })}
                      className="text-xs font-semibold text-orange-600 hover:text-orange-700 shrink-0 cursor-pointer"
                    >
                      Fill 4242...
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Demo Test Card Number
                    </label>
                    <input
                      {...register('demoCardNumber')}
                      placeholder="4242424242424242"
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    {errors.demoCardNumber && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        {errors.demoCardNumber.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 sticky top-20">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display pb-3 border-b border-slate-100 dark:border-slate-800">
                Journey &amp; Fare Review
              </h2>

              <div className="space-y-1">
                <p className="text-base font-bold text-slate-950 dark:text-white">
                  {trip.originName} to {trip.destinationName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {trip.busName} · {trip.journeyDate} · {trip.departureTime}
                </p>
              </div>

              {/* Coupon Box */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Promo code (e.g. DESH15)"
                    className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono uppercase text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 h-10 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
                >
                  Apply
                </button>
              </div>

              <div className="space-y-2.5 text-sm pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Seats ({seatNumbers.join(', ')})</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatBDT(subtotal)}
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-medium">
                    <span>Promo Discount ({appliedCouponCode})</span>
                    <span className="font-mono tabular-nums">-{formatBDT(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-lg font-extrabold">
                  <span className="text-slate-950 dark:text-white">Total Payable</span>
                  <span className="font-mono tabular-nums text-orange-600 dark:text-orange-400">
                    {formatBDT(totalFare)}
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || secondsLeft <= 0}
                className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {submitting ? 'Confirming Demo Booking...' : `Confirm & Pay ${formatBDT(totalFare)}`}
              </button>

              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Demo test checkout &amp; instant PNR generation
              </p>
            </div>
          </form>
        </div>
      </section>
    </PublicLayout>
  );
}