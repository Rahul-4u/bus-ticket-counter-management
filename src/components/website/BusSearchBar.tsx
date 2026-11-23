import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Calendar, MapPin, Search, Users } from 'lucide-react';
import type { City } from '../../types/domain';

interface BusSearchBarProps {
  cities: City[];
  initialFrom?: string;
  initialTo?: string;
  initialDate?: string;
  initialPassengers?: number;
  compact?: boolean;
}

export function BusSearchBar({
  cities,
  initialFrom = '',
  initialTo = '',
  initialDate,
  initialPassengers = 1,
  compact = false,
}: BusSearchBarProps) {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  const [fromCityId, setFromCityId] = useState(initialFrom || cities[0]?.id || 'city_dhk');
  const [toCityId, setToCityId] = useState(initialTo || cities[2]?.id || cities[1]?.id || 'city_cxb');
  const [journeyDate, setJourneyDate] = useState(initialDate || today);
  const [returnDate, setReturnDate] = useState('');
  const [passengers, setPassengers] = useState(initialPassengers);
  const [error, setError] = useState('');

  const handleSwap = () => {
    setFromCityId(toCityId);
    setToCityId(fromCityId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCityId || !toCityId) {
      setError('Please select both origin and destination cities.');
      return;
    }
    if (fromCityId === toCityId) {
      setError('Origin and destination cities cannot be the same.');
      return;
    }
    setError('');
    const params = new URLSearchParams({
      from: fromCityId,
      to: toCityId,
      date: journeyDate,
      passengers: String(passengers),
    });
    if (returnDate) params.set('returnDate', returnDate);
    navigate(`/search?${params.toString()}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl ${compact ? 'p-4' : 'p-5 sm:p-6'}`}
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        {/* From City */}
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">From City</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={fromCityId}
              onChange={(e) => setFromCityId(e.target.value)}
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            >
              {cities.length === 0 && <option value="city_dhk">Dhaka</option>}
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Swap button */}
        <div className="hidden md:flex md:col-span-1 justify-center pb-1">
          <button
            type="button"
            onClick={handleSwap}
            title="Swap cities"
            className="w-9 h-9 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>
        </div>

        {/* To City */}
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">To City</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-orange-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={toCityId}
              onChange={(e) => setToCityId(e.target.value)}
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            >
              {cities.length === 0 && <option value="city_cxb">Cox&apos;s Bazar</option>}
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Journey Date */}
        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Journey Date</label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              min={today}
              value={journeyDate}
              onChange={(e) => setJourneyDate(e.target.value)}
              className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
            />
          </div>
        </div>

        {/* Return Date or Passengers */}
        {!compact ? (
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Seats</label>
            <div className="relative">
              <Users className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={passengers}
                onChange={(e) => setPassengers(Number(e.target.value))}
                className="w-full h-11 pl-8 pr-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Return</label>
            <input
              type="date"
              min={journeyDate}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="w-full h-11 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </div>
        )}

        {/* Submit */}
        <div className="md:col-span-2">
          <button
            type="submit"
            className="w-full h-11 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            Search Buses
          </button>
        </div>
      </div>

      {error && <p className="mt-2.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
