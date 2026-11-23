# Security Specification & Threat Model — DeshLine Paribahan

## 1. Data Invariants
1. **Seat Inventory Atomicity**: A seat (`trips/{tripId}/seats/{seatNumber}`) can only transition `available -> locked` if currently `available` or if an existing lock's `lockExpiresAt` has elapsed. Only the user holding `lockedByUid == request.auth.uid` can confirm (`booked`) or release (`available`).
2. **Role Integrity**: Self-registration (`users/{uid}`) strictly enforces `role == 'passenger'` unless executed by an existing verified Admin (`arminayasmin09@gmail.com` or `/admins/{uid}`). Users cannot escalate their own `role` or `status`.
3. **Owner Isolation**: Bus Owners (`ownerId`) can only read and mutate buses, trips, bookings, payments, refunds, and settlements where `ownerId == request.auth.uid`.
4. **Passenger Isolation**: Passengers can only read/write their own `bookings`, `payments`, `refunds`, `saved_passengers`, `notifications`, and `support_tickets`.
5. **PII Isolation**: Public search and QR verification (`trips`, `trip_seats`, `ticket_verifications`) contain zero passenger phone numbers, emails, or NID details.
6. **Financial Immutability**: `bookings`, `payments`, `refunds`, `settlements`, and `audit_logs` forbid deletion (`allow delete: if false`).

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. Self-escalation: Passenger creating `/users/{uid}` with `role: "admin"` -> DENIED.
2. Profile role tampering: Passenger updating `/users/{uid}` changing `role` to `"owner"` -> DENIED.
3. Shadow field injection: Creating a booking with unexpected field `isFree: true` -> DENIED by `hasOnly`.
4. ID poisoning: Writing a document with 2KB ID string -> DENIED by `isValidId`.
5. Cross-owner bus tampering: Owner A updating Owner B's bus -> DENIED.
6. Cross-passenger booking read: Passenger A reading Passenger B's booking -> DENIED.
7. Stealing active seat lock: User B overwriting User A's active non-expired seat lock -> DENIED.
8. Fare tampering on booking update: Passenger modifying `totalFare` on update -> DENIED.
9. Deleting financial records: Anyone deleting `/payments/{id}` or `/bookings/{id}` -> DENIED.
10. Unverified email write: User with `email_verified: false` creating a booking -> DENIED.
11. Unauthenticated list scraping on `/users` or `/bookings` -> DENIED.
12. Fake refund approval: Passenger updating `/refunds/{id}` setting `status: "processed"` -> DENIED.
