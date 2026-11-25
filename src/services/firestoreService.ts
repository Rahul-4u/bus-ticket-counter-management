import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { generatePNR, generateSeatTemplate, maskPassengerName } from '../lib/seatLayouts';
import type {
  AppNotification,
  AuditLog,
  Booking,
  BookingPassenger,
  Bus,
  BusOwner,
  BusType,
  City,
  CompanySettings,
  Counter,
  Coupon,
  PaymentMethod,
  PaymentRecord,
  RefundRequest,
  Review,
  Route,
  SavedPassenger,
  Settlement,
  SupportTicket,
  TicketVerification,
  Trip,
  TripSeat,
  UserProfile,
  UserRole,
} from '../types/domain';

const BOOTSTRAP_ADMIN_EMAIL = 'arminayasmin09@gmail.com';
const LOCK_DURATION_MS = 5 * 60 * 1000;

export interface ProfileSyncOptions {
  requestedRole?: UserRole;
  phone?: string;
  companyUnitName?: string;
  emailVerified?: boolean;
}

export async function getOrCreateUserProfile(
  uid: string,
  email: string,
  displayName: string,
  options?: ProfileSyncOptions
): Promise<UserProfile & { adminPendingApproval?: boolean }> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    const now = new Date().toISOString();
    const isBootstrapAdmin = email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
    const isVerifiedEmail = Boolean(options?.emailVerified);

    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      if (isBootstrapAdmin && isVerifiedEmail && data.role !== 'admin') {
        await setDoc(doc(db, 'admins', uid), { uid, email, createdAt: now });
        await updateDoc(ref, { role: 'admin', updatedAt: now });
        return { ...data, role: 'admin', updatedAt: now };
      }
      return data;
    }

    // Determine safe role on signup:
    // - 'passenger' or 'owner' can self-register directly.
    // - 'admin' is granted automatically only to the verified bootstrap admin email;
    //   other users requesting 'admin' start as 'passenger' and log an admin approval ticket.
    let assignedRole: UserRole = 'passenger';
    let adminPendingApproval = false;

    if (isBootstrapAdmin && isVerifiedEmail) {
      assignedRole = 'admin';
    } else if (options?.requestedRole === 'owner') {
      assignedRole = 'owner';
    } else if (options?.requestedRole === 'admin') {
      assignedRole = 'passenger';
      adminPendingApproval = true;
    }

    const cleanName = (displayName || email.split('@')[0] || 'DeshLine User').trim().slice(0, 120);
    const cleanPhone = (options?.phone || '').trim().slice(0, 32);

    const profile: UserProfile = {
      uid,
      email,
      displayName: cleanName,
      phone: cleanPhone,
      role: assignedRole,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    if (assignedRole === 'admin') {
      await setDoc(doc(db, 'admins', uid), { uid, email, createdAt: now });
    }

    await setDoc(ref, profile);

    if (assignedRole === 'owner') {
      const unitName = (options?.companyUnitName || `${cleanName} Coach Division`).trim().slice(0, 120);
      const ownerRecord: BusOwner = {
        id: uid,
        userId: uid,
        companyUnitName: unitName,
        contactName: cleanName,
        phone: cleanPhone || '+880 1700-000000',
        email,
        commissionRate: 8,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(doc(db, 'bus_owners', uid), ownerRecord);
    }

    if (adminPendingApproval) {
      const ticketId = `sup_adm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await setDoc(doc(db, 'support_tickets', ticketId), {
        id: ticketId,
        userId: uid,
        userName: cleanName,
        userEmail: email,
        subject: 'Admin Role Access Request',
        message: `User ${cleanName} (${email}) requested Administrator access during signup. Please review and update role in Operations Console > Users.`,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      }).catch(() => {});
    }

    return { ...profile, adminPendingApproval };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateOwnProfile(
  uid: string,
  updates: { displayName: string; phone: string; whatsappNumber?: string }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: updates.displayName.trim(),
      phone: updates.phone.trim(),
      ...(typeof updates.whatsappNumber === 'string'
        ? { whatsappNumber: updates.whatsappNumber.trim() }
        : {}),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateOwnWhatsappNumber(uid: string, whatsappNumber: string): Promise<void> {
  const clean = whatsappNumber.trim().slice(0, 32);
  try {
    await updateDoc(doc(db, 'users', uid), {
      whatsappNumber: clean,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

// Public Catalog Queries
export async function fetchCities(): Promise<City[]> {
  try {
    const snap = await getDocs(collection(db, 'cities'));
    return snap.docs.map((d) => d.data() as City).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'cities');
  }
}

export async function fetchRoutes(): Promise<Route[]> {
  try {
    const snap = await getDocs(collection(db, 'routes'));
    return snap.docs.map((d) => d.data() as Route);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'routes');
  }
}

export async function fetchCounters(): Promise<Counter[]> {
  try {
    const snap = await getDocs(collection(db, 'counters'));
    return snap.docs.map((d) => d.data() as Counter);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'counters');
  }
}

export async function fetchBusTypes(): Promise<BusType[]> {
  try {
    const snap = await getDocs(collection(db, 'bus_types'));
    return snap.docs.map((d) => d.data() as BusType);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bus_types');
  }
}

export async function fetchApprovedBuses(): Promise<Bus[]> {
  try {
    const q = query(collection(db, 'buses'), where('approvalStatus', '==', 'approved'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Bus);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'buses');
  }
}

export async function fetchTrips(filters?: {
  originCityId?: string;
  destinationCityId?: string;
  journeyDate?: string;
}): Promise<Trip[]> {
  try {
    const snap = await getDocs(collection(db, 'trips'));
    let list = snap.docs.map((d) => d.data() as Trip);
    if (filters?.originCityId) {
      list = list.filter((t) => t.originCityId === filters.originCityId);
    }
    if (filters?.destinationCityId) {
      list = list.filter((t) => t.destinationCityId === filters.destinationCityId);
    }
    if (filters?.journeyDate) {
      list = list.filter((t) => t.journeyDate === filters.journeyDate);
    }
    return list.sort((a, b) => `${a.journeyDate} ${a.departureTime}`.localeCompare(`${b.journeyDate} ${b.departureTime}`));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'trips');
  }
}

export async function fetchTripById(tripId: string): Promise<Trip | null> {
  try {
    const snap = await getDoc(doc(db, 'trips', tripId));
    return snap.exists() ? (snap.data() as Trip) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `trips/${tripId}`);
  }
}

export function subscribeTripSeats(
  tripId: string,
  onData: (seats: TripSeat[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = `trips/${tripId}/seats`;
  return onSnapshot(
    collection(db, 'trips', tripId, 'seats'),
    (snap) => {
      const seats = snap.docs.map((d) => d.data() as TripSeat);
      seats.sort((a, b) => {
        if (a.deck !== b.deck) return a.deck === 'lower' ? -1 : 1;
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });
      onData(seats);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchActiveCoupons(): Promise<Coupon[]> {
  try {
    const snap = await getDocs(collection(db, 'coupons'));
    return snap.docs.map((d) => d.data() as Coupon).filter((c) => c.isActive);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'coupons');
  }
}

export async function fetchPublishedReviews(): Promise<Review[]> {
  try {
    const q = query(collection(db, 'reviews'), where('status', '==', 'published'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Review);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reviews');
  }
}

export async function fetchCompanySettings(): Promise<CompanySettings | null> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'company'));
    return snap.exists() ? (snap.data() as CompanySettings) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'settings/company');
  }
}

export async function verifyTicketByPnr(pnr: string): Promise<TicketVerification | null> {
  const normalized = pnr.trim().toUpperCase();
  if (!normalized) return null;
  try {
    const snap = await getDoc(doc(db, 'ticket_verifications', normalized));
    return snap.exists() ? (snap.data() as TicketVerification) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `ticket_verifications/${normalized}`);
  }
}

// Concurrency-Safe Seat Locking & Booking Transactions
export async function lockSeatsTransaction(
  tripId: string,
  seatNumbers: string[],
  uid: string
): Promise<{ lockExpiresAt: number }> {
  const now = Date.now();
  const lockExpiresAt = now + LOCK_DURATION_MS;
  const isoNow = new Date(now).toISOString();

  try {
    await runTransaction(db, async (tx) => {
      const seatRefs = seatNumbers.map((sn) => doc(db, 'trips', tripId, 'seats', sn));
      const seatSnaps = await Promise.all(seatRefs.map((r) => tx.get(r)));

      for (let i = 0; i < seatSnaps.length; i++) {
        const snap = seatSnaps[i];
        if (!snap.exists()) {
          throw new Error(`Seat ${seatNumbers[i]} does not exist on this trip.`);
        }
        const seat = snap.data() as TripSeat;
        const isExpiredLock =
          seat.status === 'locked' &&
          typeof seat.lockExpiresAt === 'number' &&
          seat.lockExpiresAt < now;
        const isOwnLock = seat.status === 'locked' && seat.lockedByUid === uid;

        if (seat.status !== 'available' && !isExpiredLock && !isOwnLock) {
          throw new Error(`Seat ${seat.seatNumber} is no longer available. Please pick another seat.`);
        }
      }

      for (const ref of seatRefs) {
        tx.update(ref, {
          status: 'locked',
          lockedByUid: uid,
          lockExpiresAt,
          updatedAt: isoNow,
        });
      }
    });

    return { lockExpiresAt };
  } catch (error) {
    if (error instanceof Error && error.message.includes('no longer available')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `trips/${tripId}/seats`);
  }
}

export async function releaseSeatLocksTransaction(
  tripId: string,
  seatNumbers: string[],
  uid: string
): Promise<void> {
  const isoNow = new Date().toISOString();
  try {
    await runTransaction(db, async (tx) => {
      const seatRefs = seatNumbers.map((sn) => doc(db, 'trips', tripId, 'seats', sn));
      const snaps = await Promise.all(seatRefs.map((r) => tx.get(r)));
      snaps.forEach((snap, idx) => {
        if (snap.exists()) {
          const seat = snap.data() as TripSeat;
          if (seat.status === 'locked' && seat.lockedByUid === uid) {
            tx.update(seatRefs[idx], {
              status: 'available',
              lockedByUid: null,
              lockExpiresAt: null,
              updatedAt: isoNow,
            });
          }
        }
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `trips/${tripId}/seats`);
  }
}

export interface CreateBookingInput {
  trip: Trip;
  uid: string;
  bookingChannel: 'online' | 'counter';
  counterId?: string;
  counterStaffUid?: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string;
  passengers: BookingPassenger[];
  boardingPoint: string;
  droppingPoint: string;
  seatNumbers: string[];
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  totalFare: number;
  paymentMethod: PaymentMethod;
  transactionId: string;
  sessionKey?: string;
  verifiedServerSide: boolean;
}

export async function confirmBookingTransaction(input: CreateBookingInput): Promise<Booking> {
  const now = new Date().toISOString();
  const bookingId = `bkg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const notifId = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pnr = generatePNR();

  const booking: Booking = {
    id: bookingId,
    pnr,
    tripId: input.trip.id,
    ownerId: input.trip.ownerId,
    userId: input.uid,
    bookingChannel: input.bookingChannel,
    ...(input.counterId ? { counterId: input.counterId } : {}),
    ...(input.counterStaffUid ? { counterStaffUid: input.counterStaffUid } : {}),
    passengerName: input.passengerName.trim(),
    passengerPhone: input.passengerPhone.trim(),
    passengerEmail: input.passengerEmail.trim(),
    passengers: input.passengers,
    boardingPoint: input.boardingPoint,
    droppingPoint: input.droppingPoint,
    seatNumbers: input.seatNumbers,
    seatCount: input.seatNumbers.length,
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    ...(input.couponCode ? { couponCode: input.couponCode } : {}),
    totalFare: input.totalFare,
    bookingStatus: 'confirmed',
    paymentStatus: 'paid',
    paymentMethod: input.paymentMethod,
    routeLabel: `${input.trip.originName} to ${input.trip.destinationName}`,
    busName: input.trip.busName,
    busTypeName: input.trip.busTypeName,
    journeyDate: input.trip.journeyDate,
    departureTime: input.trip.departureTime,
    arrivalTime: input.trip.arrivalTime,
    createdAt: now,
    updatedAt: now,
  };

  const payment: PaymentRecord = {
    id: paymentId,
    bookingId,
    pnr,
    userId: input.uid,
    ownerId: input.trip.ownerId,
    provider: input.paymentMethod,
    transactionId: input.transactionId,
    ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
    amount: input.totalFare,
    currency: 'BDT',
    status: 'paid',
    verifiedServerSide: input.verifiedServerSide,
    createdAt: now,
    updatedAt: now,
  };

  const verification: TicketVerification = {
    pnr,
    bookingId,
    routeLabel: booking.routeLabel,
    busName: booking.busName,
    journeyDate: booking.journeyDate,
    departureTime: booking.departureTime,
    seatNumbers: booking.seatNumbers,
    seatCount: booking.seatCount,
    bookingStatus: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    maskedPassenger: maskPassengerName(booking.passengerName),
    updatedAt: now,
  };

  const notification: AppNotification = {
    id: notifId,
    targetUid: input.uid,
    targetRole: 'passenger',
    title: `Ticket Confirmed (${pnr})`,
    message: `${booking.routeLabel} on ${booking.journeyDate} at ${booking.departureTime}. Seats: ${booking.seatNumbers.join(', ')}.`,
    type: 'booking',
    isRead: false,
    createdAt: now,
  };

  try {
    await runTransaction(db, async (tx) => {
      const tripRef = doc(db, 'trips', input.trip.id);
      const tripSnap = await tx.get(tripRef);
      if (!tripSnap.exists()) throw new Error('Trip not found.');
      const tripData = tripSnap.data() as Trip;

      const seatRefs = input.seatNumbers.map((sn) =>
        doc(db, 'trips', input.trip.id, 'seats', sn)
      );
      const seatSnaps = await Promise.all(seatRefs.map((r) => tx.get(r)));

      for (let i = 0; i < seatSnaps.length; i++) {
        const snap = seatSnaps[i];
        if (!snap.exists()) {
          throw new Error(`Seat ${input.seatNumbers[i]} not found.`);
        }
        const seat = snap.data() as TripSeat;
        const validLock = seat.status === 'locked' && seat.lockedByUid === input.uid;
        const validCounterAvailable =
          input.bookingChannel === 'counter' && seat.status === 'available';

        if (!validLock && !validCounterAvailable) {
          throw new Error(`Seat ${seat.seatNumber} lock expired or was claimed by another traveler.`);
        }
      }

      for (const seatRef of seatRefs) {
        tx.update(seatRef, {
          status: 'booked',
          lockedByUid: null,
          lockExpiresAt: null,
          bookingId,
          updatedAt: now,
        });
      }

      tx.update(tripRef, {
        availableSeats: Math.max(0, tripData.availableSeats - input.seatNumbers.length),
        updatedAt: now,
      });

      tx.set(doc(db, 'bookings', bookingId), booking);
      tx.set(doc(db, 'payments', paymentId), payment);
      tx.set(doc(db, 'ticket_verifications', pnr), verification);
      tx.set(doc(db, 'notifications', notifId), notification);
    });

    return booking;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('lock expired') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'bookings');
  }
}

// Passenger Scoped Queries
export async function fetchUserBookings(uid: string): Promise<Booking[]> {
  try {
    const q = query(collection(db, 'bookings'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Booking).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bookings');
  }
}

export async function fetchBookingByPnrForUser(pnr: string, uid: string, isAdminUser: boolean): Promise<Booking | null> {
  try {
    const q = isAdminUser
      ? query(collection(db, 'bookings'), where('pnr', '==', pnr.trim().toUpperCase()))
      : query(
          collection(db, 'bookings'),
          where('userId', '==', uid),
          where('pnr', '==', pnr.trim().toUpperCase())
        );
    const snap = await getDocs(q);
    return snap.empty ? null : (snap.docs[0].data() as Booking);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bookings');
  }
}

export async function fetchUserPayments(uid: string): Promise<PaymentRecord[]> {
  try {
    const q = query(collection(db, 'payments'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as PaymentRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payments');
  }
}

export async function fetchUserRefunds(uid: string): Promise<RefundRequest[]> {
  try {
    const q = query(collection(db, 'refunds'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as RefundRequest).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'refunds');
  }
}

export async function requestBookingCancellation(
  booking: Booking,
  reason: string,
  eligibleRefundAmount: number,
  refundPercent: number
): Promise<RefundRequest> {
  const now = new Date().toISOString();
  const refundId = `ref_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const refund: RefundRequest = {
    id: refundId,
    bookingId: booking.id,
    pnr: booking.pnr,
    userId: booking.userId,
    ownerId: booking.ownerId,
    reason: reason.trim(),
    originalAmount: booking.totalFare,
    eligibleRefundAmount,
    refundPercent,
    status: 'requested',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await runTransaction(db, async (tx) => {
      const tripRef = doc(db, 'trips', booking.tripId);
      const tripSnap = await tx.get(tripRef);
      if (tripSnap.exists()) {
        const trip = tripSnap.data() as Trip;
        tx.update(tripRef, {
          availableSeats: Math.min(trip.totalSeats, trip.availableSeats + booking.seatCount),
          updatedAt: now,
        });
      }

      for (const sn of booking.seatNumbers) {
        tx.update(doc(db, 'trips', booking.tripId, 'seats', sn), {
          status: 'available',
          lockedByUid: null,
          lockExpiresAt: null,
          bookingId: null,
          updatedAt: now,
        });
      }

      tx.update(doc(db, 'bookings', booking.id), {
        bookingStatus: 'cancelled',
        updatedAt: now,
      });

      tx.set(doc(db, 'ticket_verifications', booking.pnr), {
        pnr: booking.pnr,
        bookingId: booking.id,
        routeLabel: booking.routeLabel,
        busName: booking.busName,
        journeyDate: booking.journeyDate,
        departureTime: booking.departureTime,
        seatNumbers: booking.seatNumbers,
        seatCount: booking.seatCount,
        bookingStatus: 'cancelled',
        paymentStatus: booking.paymentStatus,
        maskedPassenger: maskPassengerName(booking.passengerName),
        updatedAt: now,
      });

      tx.set(doc(db, 'refunds', refundId), refund);
    });
    return refund;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `refunds/${refundId}`);
  }
}

export async function fetchSavedPassengers(uid: string): Promise<SavedPassenger[]> {
  try {
    const q = query(collection(db, 'saved_passengers'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SavedPassenger);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'saved_passengers');
  }
}

export async function savePassengerProfile(item: Omit<SavedPassenger, 'id' | 'createdAt'>): Promise<SavedPassenger> {
  const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const record: SavedPassenger = { ...item, id, createdAt: new Date().toISOString() };
  try {
    await setDoc(doc(db, 'saved_passengers', id), record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `saved_passengers/${id}`);
  }
}

export async function deleteSavedPassenger(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'saved_passengers', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `saved_passengers/${id}`);
  }
}

export async function submitTripReview(review: Omit<Review, 'id' | 'createdAt' | 'status'>): Promise<Review> {
  const id = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const record: Review = {
    ...review,
    id,
    status: 'published',
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'reviews', id), record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reviews/${id}`);
  }
}

// Notifications & Support Tickets
export async function fetchUserNotifications(uid: string, role?: UserRole): Promise<AppNotification[]> {
  try {
    const q = query(collection(db, 'notifications'), where('targetUid', '==', uid));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => d.data() as AppNotification);

    if (role === 'admin' || role === 'counter_staff') {
      const broadcastQ = query(collection(db, 'notifications'), where('targetUid', '==', 'staff_broadcast'));
      const broadcastSnap = await getDocs(broadcastQ);
      broadcastSnap.docs.forEach((d) => list.push(d.data() as AppNotification));
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'notifications');
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', id), { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${id}`);
  }
}

export async function createSupportTicket(input: {
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
}): Promise<SupportTicket> {
  const id = `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const ticket: SupportTicket = { ...input, id, status: 'open', createdAt: now, updatedAt: now };
  try {
    await setDoc(doc(db, 'support_tickets', id), ticket);
    return ticket;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `support_tickets/${id}`);
  }
}

export async function fetchUserSupportTickets(uid: string): Promise<SupportTicket[]> {
  try {
    const q = query(collection(db, 'support_tickets'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SupportTicket).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'support_tickets');
  }
}

// Bus Owner Scoped Operations (strictly ownerId == uid)
export async function fetchOwnerBuses(ownerId: string): Promise<Bus[]> {
  try {
    const q = query(collection(db, 'buses'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Bus);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'buses');
  }
}

export async function fetchOwnerTrips(ownerId: string): Promise<Trip[]> {
  try {
    const q = query(collection(db, 'trips'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Trip).sort((a, b) => b.journeyDate.localeCompare(a.journeyDate));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'trips');
  }
}

export async function fetchOwnerBookings(ownerId: string): Promise<Booking[]> {
  try {
    const q = query(collection(db, 'bookings'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Booking).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bookings');
  }
}

export async function fetchOwnerPayments(ownerId: string): Promise<PaymentRecord[]> {
  try {
    const q = query(collection(db, 'payments'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as PaymentRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payments');
  }
}

export async function fetchOwnerSettlements(ownerId: string): Promise<Settlement[]> {
  try {
    const q = query(collection(db, 'settlements'), where('ownerId', '==', ownerId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Settlement).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'settlements');
  }
}

// Shared Bus & Trip Creation (with automatic Seat Inventory generation)
export async function createBus(bus: Omit<Bus, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bus> {
  const id = `bus_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const record: Bus = { ...bus, id, createdAt: now, updatedAt: now };
  try {
    await setDoc(doc(db, 'buses', id), record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `buses/${id}`);
  }
}

export async function updateBus(id: string, updates: Partial<Bus>): Promise<void> {
  try {
    await updateDoc(doc(db, 'buses', id), { ...updates, updatedAt: new Date().toISOString() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `buses/${id}`);
  }
}

export async function createTripWithSeats(
  tripInput: Omit<Trip, 'id' | 'createdAt' | 'updatedAt' | 'availableSeats'>
): Promise<Trip> {
  const id = `trip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const seats = generateSeatTemplate(tripInput.layoutType, tripInput.totalSeats);
  const trip: Trip = {
    ...tripInput,
    id,
    totalSeats: seats.length,
    availableSeats: seats.length,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'trips', id), trip);
    const batch = writeBatch(db);
    seats.forEach((seat) => {
      batch.set(doc(db, 'trips', id, 'seats', seat.seatNumber), { ...seat, updatedAt: now });
    });
    await batch.commit();
    return trip;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `trips/${id}`);
  }
}

export async function updateTripStatus(tripId: string, status: Trip['status']): Promise<void> {
  try {
    await updateDoc(doc(db, 'trips', tripId), { status, updatedAt: new Date().toISOString() });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `trips/${tripId}`);
  }
}

// Admin Global Operations
export async function adminFetchAllBuses(): Promise<Bus[]> {
  try {
    const snap = await getDocs(collection(db, 'buses'));
    return snap.docs.map((d) => d.data() as Bus);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'buses');
  }
}

export async function adminFetchAllBookings(): Promise<Booking[]> {
  try {
    const snap = await getDocs(collection(db, 'bookings'));
    return snap.docs.map((d) => d.data() as Booking).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bookings');
  }
}

export async function adminFetchAllPayments(): Promise<PaymentRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'payments'));
    return snap.docs.map((d) => d.data() as PaymentRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'payments');
  }
}

export async function adminFetchAllRefunds(): Promise<RefundRequest[]> {
  try {
    const snap = await getDocs(collection(db, 'refunds'));
    return snap.docs.map((d) => d.data() as RefundRequest).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'refunds');
  }
}

export async function adminFetchAllUsers(): Promise<UserProfile[]> {
  try {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map((d) => d.data() as UserProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function adminFetchBusOwners(): Promise<BusOwner[]> {
  try {
    const snap = await getDocs(collection(db, 'bus_owners'));
    return snap.docs.map((d) => d.data() as BusOwner);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'bus_owners');
  }
}

export async function adminFetchSettlements(): Promise<Settlement[]> {
  try {
    const snap = await getDocs(collection(db, 'settlements'));
    return snap.docs.map((d) => d.data() as Settlement).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'settlements');
  }
}

export async function adminFetchCoupons(): Promise<Coupon[]> {
  try {
    const snap = await getDocs(collection(db, 'coupons'));
    return snap.docs.map((d) => d.data() as Coupon);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'coupons');
  }
}

export async function adminFetchAllReviews(): Promise<Review[]> {
  try {
    const snap = await getDocs(collection(db, 'reviews'));
    return snap.docs.map((d) => d.data() as Review).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reviews');
  }
}

export async function adminFetchAllSupportTickets(): Promise<SupportTicket[]> {
  try {
    const snap = await getDocs(collection(db, 'support_tickets'));
    return snap.docs.map((d) => d.data() as SupportTicket).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'support_tickets');
  }
}

export async function adminFetchAuditLogs(): Promise<AuditLog[]> {
  try {
    const q = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AuditLog);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'audit_logs');
  }
}

export async function logAuditAction(input: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
  const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await setDoc(doc(db, 'audit_logs', id), {
      ...input,
      id,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Audit failure shouldn't crash primary operation
  }
}

export async function adminUpdateUserRole(uid: string, role: UserRole, status: 'active' | 'inactive'): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'users', uid), { role, status, updatedAt: now });
    if (role === 'admin') {
      await setDoc(doc(db, 'admins', uid), { uid, email: '', createdAt: now });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function adminUpsertCity(city: City): Promise<void> {
  try {
    await setDoc(doc(db, 'cities', city.id), city);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `cities/${city.id}`);
  }
}

export async function adminUpsertRoute(route: Route): Promise<void> {
  try {
    await setDoc(doc(db, 'routes', route.id), route);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `routes/${route.id}`);
  }
}

export async function adminUpsertCounter(counter: Counter): Promise<void> {
  try {
    await setDoc(doc(db, 'counters', counter.id), counter);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `counters/${counter.id}`);
  }
}

export async function adminUpsertCoupon(coupon: Coupon): Promise<void> {
  try {
    await setDoc(doc(db, 'coupons', coupon.id), coupon);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `coupons/${coupon.id}`);
  }
}

export async function adminUpsertBusOwner(owner: BusOwner): Promise<void> {
  try {
    await setDoc(doc(db, 'bus_owners', owner.id), owner);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `bus_owners/${owner.id}`);
  }
}

export async function adminProcessRefund(
  refund: RefundRequest,
  decision: 'approved' | 'rejected' | 'processed',
  adminNote: string,
  adminUid: string
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'refunds', refund.id), {
      status: decision,
      adminNote,
      processedByUid: adminUid,
      updatedAt: now,
    });
    if (decision === 'processed') {
      await updateDoc(doc(db, 'bookings', refund.bookingId), {
        bookingStatus: 'refunded',
        paymentStatus: 'refunded',
        updatedAt: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `refunds/${refund.id}`);
  }
}

export async function adminCreateSettlement(settlement: Settlement): Promise<void> {
  try {
    await setDoc(doc(db, 'settlements', settlement.id), settlement);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `settlements/${settlement.id}`);
  }
}

export async function adminMarkSettlementPaid(id: string, referenceNo: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'settlements', id), {
      status: 'paid',
      referenceNo,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `settlements/${id}`);
  }
}

export async function adminUpdateSupportTicket(id: string, status: SupportTicket['status'], adminReply: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'support_tickets', id), {
      status,
      adminReply,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `support_tickets/${id}`);
  }
}

export async function adminSaveCompanySettings(settings: CompanySettings): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'company'), settings);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/company');
  }
}
