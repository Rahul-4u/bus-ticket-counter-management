import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { PublicLayout } from '../../components/website/PublicLayout';
import { BusSearchBar } from '../../components/website/BusSearchBar';
import { fetchCities, fetchTrips } from '../../services/firestoreService';
import { GENERATED_BUS_IMAGES } from '../../services/seedService';
import { formatBDT } from '../../lib/seatLayouts';

type SortOption = 'lowest_price' | 'highest_price' | 'earliest' | 'latest';

export function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const fromId = searchParams.get('from') || '';
  const toId = searchParams.get('to') || '';
  const dateParam = searchParams.get('date') || '';
  const passengersParam = Number(searchParams.get('passengers') || '1');

  const [acFilter, setAcFilter] = useState<'all' | 'ac' | 'nonac'>('all');
  const [layoutFilter, setLayoutFilter] = useState<string>('all');
  const [timeWindow, setTimeWindow] = useState<'all' | 'morning' | 'afternoon' | 'night'>('all');
  const [maxPrice, setMaxPrice] = useState<number>(5000);
  const [minSeats, setMinSeats] = useState<number>(passengersParam || 1);
  const [sortBy, setSortBy] = useState<SortOption>('earliest');

  const { data: cities = [] } = useQuery({ queryKey: ['cities'], queryFn: fetchCities });
  const { data: allTrips = [], isLoading } = useQuery({
    queryKey: ['trips', fromId, toId, dateParam],
    queryFn: () =>
      fetchTrips({
        originCityId: fromId || undefined,
        destinationCityId: toId || undefined,
        journeyDate: dateParam || undefined,
      }),
  });

  const filteredTrips = useMemo(() => {
    return allTrips
      .filter((t) => t.status === 'scheduled' || t.status === 'boarding')
      .filter((t) => {
        if (acFilter === 'ac' && !t.isAc) return false;
        if (acFilter === 'nonac' && t.isAc) return false;
        if (layoutFilter !== 'all' && t.layoutType !== layoutFilter) return false;
        if (t.fare > maxPrice) return false;
        if (t.availableSeats < minSeats) return false;
        if (timeWindow !== 'all') {
          const hour = Number(t.departureTime.split(':')[0] || 0);
          if (timeWindow === 'morning' && (hour < 5 || hour >= 12)) return false;
          if (timeWindow === 'afternoon' && (hour < 12 || hour >= 18)) return false;
          if (timeWindow === 'night' && hour >= 5 && hour < 18) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'lowest_price') return a.fare - b.fare;
        if (sortBy === 'highest_price') return b.fare - a.fare;
        if (sortBy === 'latest') return b.departureTime.localeCompare(a.departureTime);
        return a.departureTime.localeCompare(b.departureTime);
      });
  }, [allTrips, acFilter, layoutFilter, maxPrice, minSeats, timeWindow, sortBy]);

  return (
    <PublicLayout>
      <section className="bg-[#0B1F3A] py-8 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <BusSearchBar
            cities={cities}
            initialFrom={fromId}
            initialTo={toId}
            initialDate={dateParam}
            initialPassengers={passengersParam}
            compact
          />
        </div>
      </section>

      <section className="bg-slate-50 dark:bg-slate-950 py-10 min-h-[65vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-orange-600" />
                  Filter Trips
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setAcFilter('all');
                    setLayoutFilter('all');
                    setTimeWindow('all');
                    setMaxPrice(5000);
                    setMinSeats(1);
                  }}
                  className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 cursor-pointer"
                >
                  Reset
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Coach Class</label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(['all', 'ac', 'nonac'] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAcFilter(val)}
                      className={`py-1.5 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                        acFilter === val
                          ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {val === 'nonac' ? 'Non-AC' : val.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Seat Layout</label>
                <select
                  value={layoutFilter}
                  onChange={(e) => setLayoutFilter(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">All Layouts</option>
                  <option value="2+1">2+1 Business Class</option>
                  <option value="sleeper">Double-Deck Sleeper</option>
                  <option value="2+2">2+2 Express Coach</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Departure Window</label>
                <select
                  value={timeWindow}
                  onChange={(e) => setTimeWindow(e.target.value as typeof timeWindow)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="all">Any Time</option>
                  <option value="morning">Morning (05:00 - 11:59)</option>
                  <option value="afternoon">Afternoon (12:00 - 17:59)</option>
                  <option value="night">Evening / Night (18:00 - 04:59)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  <span>Max Fare</span>
                  <span className="font-mono tabular-nums">{formatBDT(maxPrice)}</span>
                </div>
                <input
                  type="range"
                  min={400}
                  max={5000}
                  step={100}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="w-full accent-orange-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Minimum Available Seats
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={minSeats}
                  onChange={(e) => setMinSeats(Math.max(1, Number(e.target.value)))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </aside>

          {/* Results List */}
          <div className="lg:col-span-9 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold text-slate-950 dark:text-white font-display">
                  {filteredTrips.length} {filteredTrips.length === 1 ? 'Coach' : 'Coaches'} Available
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {dateParam ? `Departure date: ${dateParam}` : 'Showing all upcoming scheduled trips'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-950"
                >
                  <option value="earliest">Earliest Departure</option>
                  <option value="latest">Latest Departure</option>
                  <option value="lowest_price">Lowest Price</option>
                  <option value="highest_price">Highest Price</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-44 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
                ))}
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">No trips match your current filters</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
                  Try clearing the date filter or adjusting AC/price filters to see all scheduled coaches.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/search')}
                  className="mt-5 px-4 py-2 rounded-lg bg-slate-900 dark:bg-orange-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Show All Scheduled Trips
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTrips.map((trip) => (
                  <article
                    key={trip.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:border-orange-300 dark:hover:border-orange-500/60 transition-colors grid grid-cols-1 md:grid-cols-12 gap-5 items-center"
                  >
                    <div className="md:col-span-3 aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img
                        src={trip.busImageUrl || GENERATED_BUS_IMAGES.scaniaBusiness}
                        alt={trip.busName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="md:col-span-6 space-y-2">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {trip.isAc ? 'AC' : 'Non-AC'} · {trip.busTypeName} · {trip.journeyDate}
                      </p>
                      <h2 className="text-lg font-bold text-slate-950 dark:text-white font-display">{trip.busName}</h2>

                      <div className="flex flex-wrap items-center gap-4 pt-1">
                        <div>
                          <p className="text-xl font-bold text-slate-950 dark:text-white font-mono tabular-nums">{trip.departureTime}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{trip.originName}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{trip.durationLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-slate-950 dark:text-white font-mono tabular-nums">{trip.arrivalTime}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{trip.destinationName}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          Board: {trip.boardingPoints[0] || trip.originName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Drop: {trip.droppingPoints[0] || trip.destinationName}</span>
                      </div>
                    </div>

                    <div className="md:col-span-3 md:text-right flex md:flex-col items-center md:items-end justify-between gap-3 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-5">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Per Seat</p>
                        <p className="text-2xl font-extrabold text-slate-950 dark:text-white font-mono tabular-nums">
                          {formatBDT(trip.fare)}
                        </p>
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
                          {trip.availableSeats} of {trip.totalSeats} seats left
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={trip.availableSeats === 0}
                        onClick={() => navigate(`/trips/${trip.id}`)}
                        className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        View Seats
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
