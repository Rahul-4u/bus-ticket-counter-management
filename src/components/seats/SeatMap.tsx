import React, { useMemo, useState } from 'react';
import { Armchair, Lock, Ban } from 'lucide-react';
import type { LayoutType, TripSeat } from '../../types/domain';

interface SeatMapProps {
  seats: TripSeat[];
  layoutType: LayoutType;
  selectedSeats: string[];
  currentUid?: string | null;
  maxSelectable?: number;
  onToggleSeat: (seatNumber: string) => void;
}

export function SeatMap({
  seats,
  layoutType,
  selectedSeats,
  currentUid,
  maxSelectable = 6,
  onToggleSeat,
}: SeatMapProps) {
  const [activeDeck, setActiveDeck] = useState<'lower' | 'upper'>('lower');
  const now = Date.now();

  const hasUpperDeck = useMemo(() => seats.some((s) => s.deck === 'upper'), [seats]);

  const deckSeats = useMemo(
    () => seats.filter((s) => (hasUpperDeck ? s.deck === activeDeck : true)),
    [seats, hasUpperDeck, activeDeck]
  );

  const maxRow = useMemo(() => Math.max(0, ...deckSeats.map((s) => s.row)), [deckSeats]);
  const gridCols = layoutType === '2+1' || layoutType === 'sleeper' ? 4 : 5;

  const seatGrid = useMemo(() => {
    const map = new Map<string, TripSeat>();
    deckSeats.forEach((s) => map.set(`${s.row}-${s.col}`, s));
    return map;
  }, [deckSeats]);

  const getVisualState = (seat: TripSeat) => {
    const isExpiredLock =
      seat.status === 'locked' && typeof seat.lockExpiresAt === 'number' && seat.lockExpiresAt < now;

    if (selectedSeats.includes(seat.seatNumber)) {
      return 'selected';
    }
    if (seat.status === 'booked') return 'booked';
    if (seat.status === 'blocked') return 'blocked';
    if (seat.status === 'locked' && !isExpiredLock) {
      return seat.lockedByUid && currentUid && seat.lockedByUid === currentUid
        ? 'locked_by_me'
        : 'locked';
    }
    return 'available';
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 mb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 inline-block" />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-orange-600 inline-block" />
            Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-slate-800 dark:bg-slate-700 inline-block" />
            Booked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-amber-400 inline-block" />
            Locked (5m Hold)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-800 inline-block" />
            Blocked
          </span>
        </div>

        {hasUpperDeck && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveDeck('lower')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeDeck === 'lower'
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Lower Deck
            </button>
            <button
              type="button"
              onClick={() => setActiveDeck('upper')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeDeck === 'upper'
                  ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Upper Deck
            </button>
          </div>
        )}
      </div>

      {/* Coach Cabin Outline */}
      <div className="max-w-md mx-auto border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-slate-50/70 dark:bg-slate-950/60">
        {/* Driver Cabin Indicator */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>Entry Door</span>
          <span className="px-2.5 py-1 rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Driver Cabin
          </span>
        </div>

        <div className="space-y-2.5">
          {Array.from({ length: maxRow + 1 }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="grid gap-2.5"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: gridCols }).map((__, colIdx) => {
                const seat = seatGrid.get(`${rowIdx}-${colIdx}`);
                if (!seat) {
                  return <div key={`${rowIdx}-${colIdx}`} className="h-11" aria-hidden="true" />;
                }

                const vState = getVisualState(seat);
                const disabled =
                  vState === 'booked' ||
                  vState === 'blocked' ||
                  vState === 'locked' ||
                  (vState === 'available' && selectedSeats.length >= maxSelectable);

                const isSleeper = layoutType === 'sleeper';

                return (
                  <button
                    key={seat.seatNumber}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggleSeat(seat.seatNumber)}
                    title={`Seat ${seat.seatNumber} (${vState.replace('_', ' ')})`}
                    className={`${isSleeper ? 'h-16' : 'h-11'} rounded-xl border text-xs font-mono font-semibold flex flex-col items-center justify-center gap-0.5 transition-all ${
                      vState === 'selected'
                        ? 'bg-orange-600 border-orange-700 text-white shadow-sm cursor-pointer scale-[1.02]'
                        : vState === 'locked_by_me'
                          ? 'bg-emerald-600 border-emerald-700 text-white cursor-pointer'
                          : vState === 'booked'
                            ? 'bg-slate-800 dark:bg-slate-800 border-slate-900 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                            : vState === 'locked'
                              ? 'bg-amber-400/90 border-amber-500 text-amber-950 cursor-not-allowed'
                              : vState === 'blocked'
                                ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900 text-red-400 cursor-not-allowed'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-orange-500 hover:text-orange-600 dark:hover:border-orange-400 dark:hover:text-orange-400 cursor-pointer'
                    }`}
                  >
                    {vState === 'locked' || vState === 'locked_by_me' ? (
                      <Lock className="w-3 h-3" />
                    ) : vState === 'blocked' ? (
                      <Ban className="w-3 h-3" />
                    ) : (
                      <Armchair className="w-3.5 h-3.5" />
                    )}
                    <span>{seat.seatNumber}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
