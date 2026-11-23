import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Download, Printer, QrCode, Search, ShieldCheck, XCircle } from 'lucide-react';
import { PublicLayout } from '../../components/website/PublicLayout';
import { useAuth } from '../../contexts/AuthContext';
import { fetchBookingByPnrForUser, verifyTicketByPnr } from '../../services/firestoreService';
import { downloadETicketPDF, generateTicketQRDataUrl } from '../../lib/pdfTicket';
import { formatBDT } from '../../lib/seatLayouts';
import type { Booking, TicketVerification } from '../../types/domain';

export function BookingConfirmationPage() {
  const { pnr = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const stateBooking = (location.state as { booking?: Booking } | null)?.booking;
  const [booking, setBooking] = useState<Booking | null>(stateBooking || null);

  useEffect(() => {
    if (!booking && pnr && profile) {
      fetchBookingByPnrForUser(pnr, profile.uid, profile.role === 'admin').then(setBooking).catch(() => {});
    }
  }, [booking, pnr, profile]);

  return (
    <PublicLayout>
      <section className="bg-slate-50 dark:bg-slate-950 py-14 min-h-[75vh]">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white font-display">
              Booking Confirmed
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your seats are reserved and your digital e-ticket is ready. Keep your PNR handy when boarding.
            </p>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 inline-block">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Reservation PNR</span>
              <span className="text-2xl font-extrabold font-mono text-[#0B1F3A] dark:text-orange-400 tracking-wider">
                {pnr}
              </span>
            </div>

            {booking && (
              <div className="text-left border-t border-slate-100 dark:border-slate-800 pt-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Route</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{booking.routeLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Schedule</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {booking.journeyDate} · {booking.departureTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Seats</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{booking.seatNumbers.join(', ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total Paid</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatBDT(booking.totalFare)}</span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => navigate(`/ticket/${pnr}`, { state: { booking } })}
                className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold cursor-pointer"
              >
                View QR E-Ticket
              </button>
              {booking && (
                <button
                  type="button"
                  onClick={() => downloadETicketPDF(booking)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              )}
              <Link
                to="/passenger"
                className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] dark:bg-slate-800 text-white text-sm font-semibold"
              >
                My Bookings
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

export function ETicketPage() {
  const { pnr = '' } = useParams();
  const location = useLocation();
  const { profile } = useAuth();
  const stateBooking = (location.state as { booking?: Booking } | null)?.booking;
  const [booking, setBooking] = useState<Booking | null>(stateBooking || null);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [loading, setLoading] = useState(!stateBooking);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!booking && pnr && profile) {
        const res = await fetchBookingByPnrForUser(pnr, profile.uid, profile.role === 'admin');
        if (active) setBooking(res);
      }
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [booking, pnr, profile]);

  useEffect(() => {
    if (booking) {
      generateTicketQRDataUrl(booking).then(setQrUrl).catch(() => {});
    }
  }, [booking]);

  return (
    <PublicLayout>
      <section className="bg-slate-50 dark:bg-slate-950 py-10 min-h-[80vh]">
        <div className="max-w-3xl mx-auto px-4 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 no-print">
            <h1 className="text-xl font-bold text-slate-950 dark:text-white font-display">Digital E-Ticket</h1>
            {booking && (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => downloadETicketPDF(booking)}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Print Ticket
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl animate-pulse" />
          ) : !booking ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
              <p className="text-base font-bold text-slate-900 dark:text-white">Sign in to view full private e-ticket</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Full passenger details are protected. For quick status verification, use the Track Ticket page.
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <Link to="/login" className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold">
                  Sign In
                </Link>
                <Link to="/track" className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold">
                  Verify PNR
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              {/* Ticket Header */}
              <div className="bg-[#0B1F3A] text-white px-6 py-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-orange-400 font-semibold">DeshLine Paribahan</p>
                  <h2 className="text-xl font-extrabold font-display mt-0.5">{booking.routeLabel}</h2>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-300">PNR Number</p>
                  <p className="text-xl font-extrabold font-mono text-orange-400">{booking.pnr}</p>
                </div>
              </div>

              <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                <div className="md:col-span-8 grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Passenger</span>
                    <span className="font-bold text-slate-950 dark:text-white">{booking.passengerName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Phone</span>
                    <span className="font-mono text-slate-900 dark:text-slate-100">{booking.passengerPhone}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Coach</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{booking.busName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Class</span>
                    <span className="text-slate-900 dark:text-slate-100">{booking.busTypeName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Journey Date</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{booking.journeyDate}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Departure / Arrival</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {booking.departureTime} - {booking.arrivalTime}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Boarding Point</span>
                    <span className="text-slate-900 dark:text-slate-100">{booking.boardingPoint}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Dropping Point</span>
                    <span className="text-slate-900 dark:text-slate-100">{booking.droppingPoint}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Seats</span>
                    <span className="font-mono font-extrabold text-orange-600 dark:text-orange-400 text-base">
                      {booking.seatNumbers.join(', ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">Total Fare &amp; Status</span>
                    <span className="font-mono font-bold text-slate-950 dark:text-white">
                      {formatBDT(booking.totalFare)} · {booking.bookingStatus.toUpperCase()} / {booking.paymentStatus.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="md:col-span-4 flex flex-col items-center justify-center border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-5 md:pt-0 md:pl-6">
                  {qrUrl && (
                    <img
                      src={qrUrl}
                      alt={`QR verification code for ${booking.pnr}`}
                      className="w-40 h-40 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 bg-white"
                    />
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center font-mono">Scan at boarding gate</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}

export function TrackBookingPage() {
  const [pnrInput, setPnrInput] = useState('');
  const [result, setResult] = useState<TicketVerification | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    let pnr = pnrInput.trim();
    if (pnr.startsWith('{')) {
      try {
        const parsed = JSON.parse(pnr);
        if (parsed.pnr) pnr = String(parsed.pnr);
      } catch {
        // Keep raw input
      }
    }
    if (!pnr) return;
    setSearching(true);
    try {
      const data = await verifyTicketByPnr(pnr);
      setResult(data);
    } finally {
      setSearching(false);
    }
  };

  const isConfirmedValid = result && result.bookingStatus === 'confirmed' && result.paymentStatus === 'paid';

  return (
    <PublicLayout>
      <section className="bg-slate-50 dark:bg-slate-950 py-14 min-h-[75vh]">
        <div className="max-w-2xl mx-auto px-4 space-y-6">
          <div className="text-center space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">PNR &amp; QR Verification</p>
            <h1 className="text-3xl font-extrabold text-slate-950 dark:text-white font-display">Track or Verify Your Ticket</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Enter your DeshLine PNR code (or paste QR payload) to verify ticket authenticity and departure schedule.
            </p>
          </div>

          <form onSubmit={handleSearch} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex gap-3 shadow-sm">
            <div className="relative flex-1">
              <QrCode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={pnrInput}
                onChange={(e) => setPnrInput(e.target.value)}
                placeholder="Enter PNR (e.g. DL261121XXXXX)"
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-5 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              {searching ? 'Checking...' : 'Verify'}
            </button>
          </form>

          {result === null && (
            <div className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 text-center space-y-2">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">No Ticket Found for This PNR</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">Double-check your PNR characters and try again.</p>
            </div>
          )}

          {result && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  {isConfirmedValid ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  )}
                  <div>
                    <p className="text-sm font-bold text-slate-950 dark:text-white">
                      {isConfirmedValid ? 'Valid Confirmed E-Ticket' : `Ticket Status: ${result.bookingStatus.toUpperCase()}`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">PNR: {result.pnr}</p>
                  </div>
                </div>
                <Link
                  to={`/ticket/${result.pnr}`}
                  className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700"
                >
                  Open Full Ticket
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Route</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{result.routeLabel}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Coach</span>
                  <span className="text-slate-900 dark:text-slate-100">{result.busName}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Passenger (Masked)</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{result.maskedPassenger}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Schedule</span>
                  <span className="font-mono text-slate-900 dark:text-slate-100">{result.journeyDate} · {result.departureTime}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Seats</span>
                  <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{result.seatNumbers.join(', ')}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">Payment Status</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">{result.paymentStatus.toUpperCase()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
