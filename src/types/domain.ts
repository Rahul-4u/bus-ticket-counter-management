export type UserRole = 'admin' | 'owner' | 'passenger' | 'counter_staff';
export type AccountStatus = 'active' | 'inactive';
export type LayoutType = '2+2' | '2+1' | 'sleeper' | 'custom';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TripStatus = 'scheduled' | 'boarding' | 'completed' | 'cancelled';
export type SeatStatus = 'available' | 'locked' | 'booked' | 'blocked';
export type BookingChannel = 'online' | 'counter';
export type BookingStatus = 'pending' | 'awaiting_payment' | 'confirmed' | 'cancelled' | 'expired' | 'refunded';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentMethod = 'sslcommerz' | 'aamarpay' | 'counter_cash';
export type RefundStatus = 'requested' | 'approved' | 'rejected' | 'processed';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  status: AccountStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface BusOwner {
  id: string;
  userId: string;
  companyUnitName: string;
  contactName: string;
  phone: string;
  email: string;
  commissionRate: number;
  status: AccountStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface City {
  id: string;
  name: string;
  code: string;
  division: string;
  isActive: boolean;
}

export interface RouteStop {
  name: string;
  timeOffsetMinutes: number;
  type: 'boarding' | 'dropping' | 'both';
}

export interface Route {
  id: string;
  originCityId: string;
  originName: string;
  destinationCityId: string;
  destinationName: string;
  distanceKm: number;
  estimatedDuration: string;
  stops: RouteStop[];
  baseFare: number;
  isActive: boolean;
}

export interface Counter {
  id: string;
  cityId: string;
  cityName: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
}

export interface BusType {
  id: string;
  name: string;
  code: string;
  layoutType: LayoutType;
  isAc: boolean;
  totalSeats: number;
  rows: number;
  cols: number;
  decks: 1 | 2;
}

export interface Bus {
  id: string;
  ownerId: string;
  ownerName: string;
  coachNumber: string;
  registrationNumber: string;
  name: string;
  busTypeId: string;
  busTypeName: string;
  layoutType: LayoutType;
  isAc: boolean;
  totalSeats: number;
  amenities: string[];
  imageUrl: string;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Trip {
  id: string;
  ownerId: string;
  busId: string;
  busName: string;
  busTypeName: string;
  isAc: boolean;
  layoutType: LayoutType;
  busImageUrl: string;
  routeId: string;
  originCityId: string;
  originName: string;
  destinationCityId: string;
  destinationName: string;
  journeyDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  arrivalTime: string; // HH:mm
  durationLabel: string;
  fare: number;
  totalSeats: number;
  availableSeats: number;
  boardingPoints: string[];
  droppingPoints: string[];
  status: TripStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface TripSeat {
  seatNumber: string;
  row: number;
  col: number;
  deck: 'lower' | 'upper';
  seatType?: 'standard' | 'business' | 'sleeper';
  status: SeatStatus;
  lockedByUid?: string | null;
  lockExpiresAt?: number | null;
  bookingId?: string | null;
  updatedAt?: string;
}

export interface BookingPassenger {
  seatNumber: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  age?: number;
}

export interface Booking {
  id: string;
  pnr: string;
  tripId: string;
  ownerId: string;
  userId: string;
  bookingChannel: BookingChannel;
  counterId?: string;
  counterStaffUid?: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string;
  passengers: BookingPassenger[];
  boardingPoint: string;
  droppingPoint: string;
  seatNumbers: string[];
  seatCount: number;
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  totalFare: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  routeLabel: string;
  busName: string;
  busTypeName: string;
  journeyDate: string;
  departureTime: string;
  arrivalTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketVerification {
  pnr: string;
  bookingId: string;
  routeLabel: string;
  busName: string;
  journeyDate: string;
  departureTime: string;
  seatNumbers: string[];
  seatCount: number;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  maskedPassenger: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  pnr: string;
  userId: string;
  ownerId: string;
  provider: PaymentMethod;
  transactionId: string;
  sessionKey?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  verifiedServerSide: boolean;
  gatewayPayload?: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRequest {
  id: string;
  bookingId: string;
  pnr: string;
  userId: string;
  ownerId: string;
  reason: string;
  originalAmount: number;
  eligibleRefundAmount: number;
  refundPercent: number;
  status: RefundStatus;
  adminNote?: string;
  processedByUid?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Settlement {
  id: string;
  ownerId: string;
  ownerName: string;
  periodLabel: string;
  grossAmount: number;
  commissionAmount: number;
  netPayable: number;
  status: 'pending' | 'paid';
  referenceNo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minFare: number;
  maxDiscount: number;
  validUntil: string;
  isActive: boolean;
}

export interface Review {
  id: string;
  bookingId: string;
  tripId: string;
  userId: string;
  passengerName: string;
  routeLabel: string;
  rating: number;
  comment: string;
  status: 'published' | 'hidden';
  createdAt: string;
}

export interface SavedPassenger {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  gender: 'male' | 'female' | 'other';
  nidOrPassport?: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  targetUid: string;
  targetRole: UserRole;
  title: string;
  message: string;
  type: 'booking' | 'payment' | 'refund' | 'fleet' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySettings {
  id: string;
  companyName: string;
  tagline: string;
  supportPhone: string;
  supportEmail: string;
  headOffice: string;
  commissionPercent: number;
  sandboxMode: boolean;
  cancellationPolicy: {
    before24HoursRefundPercent: number;
    between12And24HoursRefundPercent: number;
    under12HoursRefundPercent: number;
    seatLockMinutes: number;
  };
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  createdAt: string;
}

export type ChatSessionStatus = 'ai_active' | 'human_requested' | 'human_active' | 'resolved';
export type ChatSenderRole = 'passenger' | 'ai' | 'admin' | 'counter_staff';

export interface ChatSession {
  id: string;
  visitorToken: string;
  userId?: string | null;
  visitorName: string;
  visitorEmail?: string;
  visitorPhone?: string;
  status: ChatSessionStatus;
  humanRequested: boolean;
  humanRequestedAt?: string;
  assignedAgentUid?: string | null;
  assignedAgentName?: string | null;
  assignedAgentRole?: 'admin' | 'counter_staff' | null;
  lastMessage: string;
  lastSenderRole: ChatSenderRole;
  unreadForStaff: number;
  unreadForPassenger: number;
  emailNotificationStatus?: 'none' | 'sent' | 'logged' | 'failed';
  emailNotificationNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderRole: ChatSenderRole;
  senderName: string;
  senderUid?: string | null;
  text: string;
  createdAt: string;
}
