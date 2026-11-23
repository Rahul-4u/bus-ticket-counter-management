import type { LayoutType, TripSeat } from '../types/domain';

const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function generateSeatTemplate(layoutType: LayoutType, totalSeatsOverride?: number): TripSeat[] {
  const seats: TripSeat[] = [];

  if (layoutType === '2+1') {
    // 9 rows x 3 seats = 27 seats (Business Class AC)
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const letter = ROW_LETTERS[r];
      [0, 1, 3].forEach((col, idx) => {
        seats.push({
          seatNumber: `${letter}${idx + 1}`,
          row: r,
          col,
          deck: 'lower',
          seatType: 'business',
          status: 'available',
          lockedByUid: null,
          lockExpiresAt: null,
          bookingId: null,
        });
      });
    }
    return seats;
  }

  if (layoutType === 'sleeper') {
    // Lower deck (15 berths: 5 rows x 3) + Upper deck (15 berths: 5 rows x 3) = 30 sleeper berths
    const rows = 5;
    (['lower', 'upper'] as const).forEach((deck) => {
      const prefix = deck === 'lower' ? 'L' : 'U';
      for (let r = 0; r < rows; r++) {
        [0, 2, 3].forEach((col, idx) => {
          seats.push({
            seatNumber: `${prefix}${r + 1}${String.fromCharCode(65 + idx)}`,
            row: r,
            col,
            deck,
            seatType: 'sleeper',
            status: 'available',
            lockedByUid: null,
            lockExpiresAt: null,
            bookingId: null,
          });
        });
      }
    });
    return seats;
  }

  if (layoutType === 'custom') {
    const count = totalSeatsOverride && totalSeatsOverride >= 12 ? totalSeatsOverride : 32;
    const rows = Math.ceil(count / 4);
    let created = 0;
    for (let r = 0; r < rows; r++) {
      const letter = ROW_LETTERS[r] || `R${r + 1}`;
      for (let idx = 0; idx < 4 && created < count; idx++) {
        const col = idx < 2 ? idx : idx + 1;
        seats.push({
          seatNumber: `${letter}${idx + 1}`,
          row: r,
          col,
          deck: 'lower',
          seatType: 'standard',
          status: 'available',
          lockedByUid: null,
          lockExpiresAt: null,
          bookingId: null,
        });
        created++;
      }
    }
    return seats;
  }

  // Default 2+2 (10 rows x 4 seats = 40 seats)
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    const letter = ROW_LETTERS[r];
    [0, 1, 3, 4].forEach((col, idx) => {
      seats.push({
        seatNumber: `${letter}${idx + 1}`,
        row: r,
        col,
        deck: 'lower',
        seatType: 'standard',
        status: 'available',
        lockedByUid: null,
        lockExpiresAt: null,
        bookingId: null,
      });
    });
  }
  return seats;
}

export function generatePNR(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars[Math.floor(Math.random() * chars.length)];
  }
  return `DL${yy}${mm}${dd}${rand}`;
}

export function maskPassengerName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => (p.length <= 1 ? p : `${p[0]}${'*'.repeat(Math.min(p.length - 1, 4))}`))
    .join(' ');
}

export function formatBDT(amount: number): string {
  return `৳${amount.toLocaleString('en-BD')}`;
}

export function calculateEligibleRefund(
  journeyDate: string,
  departureTime: string,
  totalFare: number,
  policy?: {
    before24HoursRefundPercent: number;
    between12And24HoursRefundPercent: number;
    under12HoursRefundPercent: number;
  }
): { refundPercent: number; eligibleAmount: number; hoursUntilDeparture: number } {
  const defaults = policy || {
    before24HoursRefundPercent: 85,
    between12And24HoursRefundPercent: 50,
    under12HoursRefundPercent: 0,
  };
  const depDate = new Date(`${journeyDate}T${departureTime}:00`);
  const hours = Number.isNaN(depDate.getTime())
    ? 48
    : (depDate.getTime() - Date.now()) / (1000 * 60 * 60);

  let refundPercent = defaults.under12HoursRefundPercent;
  if (hours >= 24) {
    refundPercent = defaults.before24HoursRefundPercent;
  } else if (hours >= 12) {
    refundPercent = defaults.between12And24HoursRefundPercent;
  }
  return {
    refundPercent,
    eligibleAmount: Math.round((totalFare * refundPercent) / 100),
    hoursUntilDeparture: Math.max(0, Math.round(hours)),
  };
}
