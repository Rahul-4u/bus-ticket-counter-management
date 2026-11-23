import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, Lock, MapPin, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '../../components/website/PublicLayout';
import { SeatMap } from '../../components/seats/SeatMap';
import {
  fetchTripById,
  lockSeatsTransaction,
  subscribeTripSeats,
} from '../../services/firestoreService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { formatBDT } from '../../lib/seatLayouts';
import { GENERATED_BUS_IMAGES } from '../../services/seedService';
import type { TripSeat } from '../../types/domain';

export function TripSeatPage() {
  const { tripId = '' } = useParams();
  const navigate = useNavigate();
  const { profile, signInWithGoogle } = useAuth();
  const { notify } = useToast();

  const [seats, setSeats] = useState<TripSeat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [locking, setLocking] = useState(false);

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => fetchTripById(tripId),
    enabled: Boolean(tripId),
  });

  useEffect(() => {
    if (!tripId) return;
    const unsub = subscribeTripSeats(
      tripId,
      (liveSeats) => setSeats(liveSeats),
      (err) => console.error('Seat stream error:', err)
    );
    return () => unsub();
  }, [tripId]);

  const totalFare = useMemo(() => (trip ? trip.fare * selectedSeats.length : 0), [trip, selectedSeats]);

  const handleToggleSeat = (seatNumber: string) => {
    setSelectedSeats((prev) => {
      if (prev.includes(seatNumber)) {
        return prev.filter((s) => s !== seatNumber);
      }
      if (prev.length >= 6) {
        notify('Maximum 6 seats per booking', 'info');
        return prev;
      }
      return [...prev, seatNumber];
    });
  };

  const handleContinueCheckout = async () => {
    if (!trip || selectedSeats.length === 0) return;

    let activeUser = profile;
    if (!activeUser) {
      try {
        activeUser = await signInWithGoogle();
      } catch {
        notify('Sign in required to lock seats', 'info', 'Please sign in with your account to continue.');
        navigate('/login');
        return;
      }
    }
    if (!activeUser) return;

    setLocking(true);
    try {
      const { lockExpiresAt } = await lockSeatsTransaction(trip.id, selectedSeats, activeUser.uid);
      notify('Seats locked for 5 minutes', 'success', `Reserved: ${selectedSeats.join(', ')}`);
      navigate(`/checkout/${trip.id}`, {
        state: {
          trip,
          seatNumbers: selectedSeats,
          lockExpiresAt,
        },
      });
    } catch (err) {
      notify('Seat lock failed', 'error', err instanceof Error ? err.message : 'Please select other seats.');
    } finally {
      setLocking(false);
    }
  };

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="h-96 rounded-2xl bg-slate-100 dark:bg-slate-900 animate-pulse" />
        </div>
      </PublicLayout>
    );
  }

  if (!trip) {
    return (
      <PublicLayout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trip not found</h1>
          <button
            type="button"
            onClick={() => navigate('/search')}
            className="mt-4 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-orange-600 text-white text-sm font-semibold cursor-pointer"
          >
            Back to Search
          </button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <section className="bg-slate-50 dark:bg-slate-950 py-10 min-h-[75vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Search Results
          </button>

          {/* Trip Header Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-3 aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
              <img
                src={trip.busImageUrl || GENERATED_BUS_IMAGES.scaniaBusiness}
                alt={trip.busName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="lg:col-span-9 space-y-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {trip.isAc ? 'Air Conditioned' : 'Non-AC'} · {trip.busTypeName} · {trip.layoutType} Layout
              </p>
              <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">
                {trip.originName} to {trip.destinationName} — {trip.busName}
              </h1>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Journey Date</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{trip.journeyDate}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Departure / Arrival</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                    {trip.departureTime} - {trip.arrivalTime}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Duration</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {trip.durationLabel}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Ticket Fare</span>
                  <span className="text-lg font-extrabold text-orange-600 dark:text-orange-400 font-mono tabular-nums">
                    {formatBDT(trip.fare)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Seat Selection + Booking Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7">
              <SeatMap
                seats={seats}
                layoutType={trip.layoutType}
                selectedSeats={selectedSeats}
                currentUid={profile?.uid}
                onToggleSeat={handleToggleSeat}
              />
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 sticky top-20">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display pb-3 border-b border-slate-100 dark:border-slate-800">
                Seat Selection Summary
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Selected Seats</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Fare per Seat</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-white">{formatBDT(trip.fare)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-base font-bold">
                  <span className="text-slate-950 dark:text-white">Total Fare</span>
                  <span className="font-mono tabular-nums text-orange-600 dark:text-orange-400">{formatBDT(totalFare)}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-600" />
                  Boarding Points
                </p>
                <p>{trip.boardingPoints.join(' · ')}</p>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
                <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  Clicking Continue atomically locks your chosen seats for 5 minutes while you enter passenger details and complete payment.
                </span>
              </div>

              <button
                type="button"
                disabled={selectedSeats.length === 0 || locking}
                onClick={handleContinueCheckout}
                className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {locking
                  ? 'Locking Seats...'
                  : profile
                    ? `Lock ${selectedSeats.length || ''} Seat${selectedSeats.length === 1 ? '' : 's'} & Continue`
                    : 'Sign In & Lock Seats'}
              </button>

              <p className="text-xs text-center text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Real-time unified inventory sync
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
