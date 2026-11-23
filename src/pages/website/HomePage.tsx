import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Wifi,
} from 'lucide-react';
import { PublicLayout } from '../../components/website/PublicLayout';
import { BusSearchBar } from '../../components/website/BusSearchBar';
import {
  fetchActiveCoupons,
  fetchApprovedBuses,
  fetchCities,
  fetchPublishedReviews,
  fetchRoutes,
} from '../../services/firestoreService';
import { GENERATED_BUS_IMAGES } from '../../services/seedService';
import { formatBDT } from '../../lib/seatLayouts';
import { useAuth } from '../../contexts/AuthContext';

const FAQ_ITEMS = [
  {
    q: 'How long are selected seats held during checkout?',
    a: 'Once you select your seats and proceed to passenger details, DeshLine atomically reserves those seats for 5 minutes across both online and counter channels so no one else can double-book them.',
  },
  {
    q: 'Can I verify or download my e-ticket without visiting a counter?',
    a: 'Yes. Every confirmed booking generates a unique PNR and a scannable QR code e-ticket. You can download a print-ready PDF directly or verify any PNR anytime on our Track Ticket page.',
  },
  {
    q: 'What payment methods are accepted on DeshLine?',
    a: 'We support online payments through SSLCommerz and aamarPay (cards, bKash, Nagad, Rocket, net banking in sandbox mode) as well as authorized cash bookings at DeshLine counters.',
  },
  {
    q: 'What is the cancellation and refund policy?',
    a: 'Cancellations submitted 24+ hours prior to departure qualify for an 85% refund. Between 12 and 24 hours, 50% is refundable. Within 12 hours of departure, tickets are non-refundable.',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { profile, signInWithGoogle } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);

  const { data: cities = [] } = useQuery({ queryKey: ['cities'], queryFn: fetchCities });
  const { data: routes = [] } = useQuery({ queryKey: ['routes'], queryFn: fetchRoutes });
  const { data: buses = [] } = useQuery({ queryKey: ['approved-buses'], queryFn: fetchApprovedBuses });
  const { data: coupons = [] } = useQuery({ queryKey: ['active-coupons'], queryFn: fetchActiveCoupons });
  const { data: reviews = [] } = useQuery({ queryKey: ['published-reviews'], queryFn: fetchPublishedReviews });

  const today = new Date().toISOString().split('T')[0];

  return (
    <PublicLayout>
      {/* Hero Section — BigTranz Inspired */}
      <section className="relative bg-[#0B1F3A] text-white overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={GENERATED_BUS_IMAGES.heroCoach}
            alt="DeshLine luxury intercity coach crossing a bridge in Bangladesh"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/65 to-[#0B1F3A]/40" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-wider uppercase text-orange-400 mb-3">
              Bangladesh Intercity Coach Network · Unified Online &amp; Counter Inventory
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold tracking-tight leading-[1.08] text-white font-display [text-wrap:balance]">
              Travel across Bangladesh with precision comfort.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-200 max-w-2xl leading-relaxed">
              Reserve AC Business Class, Double-Deck Royal Sleeper, and Express coaches with live seat selection, instant PNR, and verified QR e-tickets.
            </p>
          </div>

          {/* Search Form */}
          <div className="mt-10">
            <BusSearchBar cities={cities} />
          </div>

          {cities.length === 0 && !profile && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-white/10 backdrop-blur border border-white/15 rounded-xl px-4 py-3 text-xs text-slate-200">
              <span>First-time setup: Sign in with your Administrator Google account to initialize live routes, coaches, and schedules in Firestore.</span>
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold cursor-pointer shrink-0"
              >
                Initialize Fleet Data
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 4-Column Full-Width Metric Strip */}
      <section className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white font-mono tabular-nums">99.4%</p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">On-Time Departure Rate</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white font-mono tabular-nums">8 Divisions</p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">Connected Intercity Corridors</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white font-mono tabular-nums">5 Min Lock</p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">Atomic Zero-Duplicate Seat Hold</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-950 dark:text-white font-mono tabular-nums">24/7 Dispatch</p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">Authorized Counter &amp; Online Sync</p>
          </div>
        </div>
      </section>

      {/* Popular Routes */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2">Expressway Corridors</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white font-display">Popular Intercity Routes</h2>
            </div>
            <Link
              to="/search"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700"
            >
              View all schedules <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {routes.length === 0 ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center bg-slate-50 dark:bg-slate-900">
              <p className="text-sm text-slate-600 dark:text-slate-400">Routes will appear here once initialized by the fleet administrator.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {routes.slice(0, 6).map((route) => (
                <div
                  key={route.id}
                  className="group border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-white dark:bg-slate-900 hover:border-orange-300 dark:hover:border-orange-500/60 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3">
                      <span>{route.distanceKm} km</span>
                      <span>{route.estimatedDuration}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-950 dark:text-white font-display">
                      {route.originName} to {route.destinationName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      {route.stops.slice(0, 3).map((s) => s.name).join(' · ')}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 block">Starting from</span>
                      <span className="text-lg font-bold text-slate-950 dark:text-white font-mono tabular-nums">
                        {formatBDT(route.baseFare)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/search?from=${route.originCityId}&to=${route.destinationCityId}&date=${today}`
                        )
                      }
                      className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 group-hover:bg-orange-600 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Check Trips
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Featured Fleet */}
      <section id="fleet" className="py-16 lg:py-20 bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2">Modern Fleet</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white font-display">
              Coaches Engineered for Long-Haul Comfort
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Choose between 2+1 Scania Business Class, Double-Deck Royal Sleepers, and high-frequency Express coaches.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {buses.slice(0, 4).map((bus) => (
              <div
                key={bus.id}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-slate-900 relative overflow-hidden">
                  <img
                    src={bus.imageUrl || GENERATED_BUS_IMAGES.scaniaBusiness}
                    alt={bus.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {bus.isAc ? 'Air Conditioned' : 'Non-AC Express'} · {bus.layoutType} Layout · {bus.totalSeats} Seats
                    </p>
                    <h3 className="text-base font-bold text-slate-950 dark:text-white mt-1.5 font-display">{bus.name}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                      {bus.amenities.slice(0, 3).join(' · ')}
                    </p>
                  </div>
                  <Link
                    to="/search"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700"
                  >
                    Book this coach <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us & How It Works */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2">How DeshLine Works</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white font-display [text-wrap:balance]">
                From route search to boarding bay in four clear steps.
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                Every online booking and counter ticket shares one real-time seat inventory, preventing double-bookings and ensuring transparent fares.
              </p>
            </div>

            <div className="mt-8 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-[4/3]">
              <img
                src={GENERATED_BUS_IMAGES.coxsRoute}
                alt="Coastal Marine Drive highway to Cox's Bazar"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/70">
              <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-4">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">01. Search &amp; Compare</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Filter departures by AC/Non-AC, coach layout, boarding terminal, and departure window with live seat counts.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/70">
              <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">02. Lock Your Exact Seats</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Pick upper/lower sleeper berths or 2+1 business seats. Seats are atomically locked for 5 minutes during checkout.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/70">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center mb-4">
                <Wifi className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">03. Verified Gateway Checkout</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Pay securely via SSLCommerz or aamarPay with server-verified transaction signatures and instant coupon discounts.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-900/70">
              <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-4">
                <Ticket className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">04. Board With QR E-Ticket</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Receive an instant unique PNR, downloadable PDF ticket, and verifiable QR pass accepted at every DeshLine bay.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Special Offers */}
      {coupons.length > 0 && (
        <section className="py-14 bg-[#0B1F3A] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4 mb-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-400 mb-1">Seasonal Savings</p>
                <h2 className="text-2xl font-bold font-display">Active Promo Codes</h2>
              </div>
              <Sparkles className="w-5 h-5 text-orange-400" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {coupons.map((c) => (
                <div
                  key={c.id}
                  className="border border-slate-700/80 bg-slate-900/50 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <h3 className="text-lg font-bold text-white font-display">{c.title}</h3>
                    <p className="text-sm text-slate-300 mt-1">{c.description}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      Min fare {formatBDT(c.minFare)} · Valid until {c.validUntil}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-block px-4 py-2 rounded-xl bg-orange-600 text-white font-mono font-bold text-sm tracking-wider">
                      {c.code}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Passenger Reviews */}
      {reviews.length > 0 && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-10">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2">Verified Travelers</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white font-display">Passenger Feedback</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reviews.slice(0, 3).map((rv) => (
                <div key={rv.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                  <div className="flex items-center gap-1 text-orange-500 mb-3">
                    {Array.from({ length: rv.rating }).map((_, idx) => (
                      <Star key={idx} className="w-4 h-4 fill-orange-500" />
                    ))}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">&ldquo;{rv.comment}&rdquo;</p>
                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-bold text-slate-950 dark:text-white">{rv.passengerName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{rv.routeLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ + Newsletter */}
      <section className="py-16 lg:py-20 bg-white dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400 mb-2">Frequently Asked</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-950 dark:text-white font-display mb-6">Booking &amp; Travel Questions</h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
              {FAQ_ITEMS.map((item, idx) => (
                <div key={idx} className="py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 text-left font-semibold text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    <span className="text-sm sm:text-base">{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform ${
                        openFaq === idx ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {openFaq === idx && (
                    <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.a}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
              <h3 className="text-xl font-bold text-slate-950 dark:text-white font-display">Route Alerts &amp; Eid Schedules</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                Receive early notice when festive advance ticket windows and new expressway departures open.
              </p>
              {newsletterSubscribed ? (
                <div className="mt-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-sm text-emerald-800 dark:text-emerald-300 font-medium">
                  Subscribed! We will notify {newsletterEmail} when new schedules open.
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newsletterEmail.includes('@')) setNewsletterSubscribed(true);
                  }}
                  className="mt-6 space-y-3"
                >
                  <input
                    type="email"
                    required
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                  <button
                    type="submit"
                    className="w-full h-11 rounded-xl bg-[#0B1F3A] dark:bg-orange-600 hover:bg-slate-800 dark:hover:bg-orange-700 text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Subscribe for Updates
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
