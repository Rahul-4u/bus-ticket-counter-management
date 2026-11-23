import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/Toast';

import { HomePage } from './pages/website/HomePage';
import { SearchResultsPage } from './pages/website/SearchResultsPage';
import { TripSeatPage } from './pages/website/TripSeatPage';
import { CheckoutPage } from './pages/website/CheckoutPage';
import { BookingConfirmationPage, ETicketPage, TrackBookingPage } from './pages/website/TicketPages';
import { AboutPage, ContactPage, FaqPage, LegalPage } from './pages/website/StaticPages';
import { AuthPage } from './pages/website/AuthPages';

import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import {
  AdminBusesPage,
  AdminCountersPage,
  AdminOwnersPage,
  AdminRoutesCitiesPage,
  AdminTripsPage,
} from './pages/admin/AdminFleetRoutesPages';
import {
  AdminBookingsPage,
  AdminCounterPosPage,
  AdminFinancialsPage,
  AdminRefundsPage,
} from './pages/admin/AdminBookingsFinancialPages';
import {
  AdminMarketingPage,
  AdminSettingsPage,
  AdminSupportLogsPage,
  AdminUsersPage,
} from './pages/admin/AdminSystemMarketingPages';

import {
  OwnerBookingsPage,
  OwnerFinancialsPage,
  OwnerFleetPage,
  OwnerOverviewPage,
  OwnerProfilePage,
  OwnerTripsPage,
} from './pages/owner/OwnerDashboardPages';

import {
  PassengerBookingsPage,
  PassengerOverviewPage,
  PassengerPaymentsPage,
  PassengerProfilePage,
  PassengerSavedPage,
} from './pages/passenger/PassengerDashboardPages';

import type { UserRole } from './types/domain';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function RequireRole({
  allowedRoles,
  children,
}: {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}) {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to="/passenger" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <BrowserRouter>
                <Routes>
                  {/* Public BigTranz-Inspired Website */}
                  <Route path="/" element={<HomePage />} />
                  <Route path="/search" element={<SearchResultsPage />} />
                  <Route path="/trips/:tripId" element={<TripSeatPage />} />
                  <Route path="/checkout/:tripId" element={<CheckoutPage />} />
                  <Route path="/booking/confirmation/:pnr" element={<BookingConfirmationPage />} />
                  <Route path="/ticket/:pnr" element={<ETicketPage />} />
                  <Route path="/track" element={<TrackBookingPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/faq" element={<FaqPage />} />
                  <Route path="/terms" element={<LegalPage title="Terms & Conditions" kind="terms" />} />
                  <Route path="/privacy" element={<LegalPage title="Privacy Policy" kind="privacy" />} />
                  <Route path="/refund-policy" element={<LegalPage title="Cancellation & Refund Policy" kind="refund" />} />
                  <Route path="/login" element={<AuthPage mode="login" />} />
                  <Route path="/register" element={<AuthPage mode="register" />} />
                  <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />

                  {/* Admin Dashboard (Uena Theme 4) */}
                  <Route path="/admin" element={<RequireRole allowedRoles={['admin']}><AdminOverviewPage /></RequireRole>} />
                  <Route path="/admin/owners" element={<RequireRole allowedRoles={['admin']}><AdminOwnersPage /></RequireRole>} />
                  <Route path="/admin/buses" element={<RequireRole allowedRoles={['admin']}><AdminBusesPage /></RequireRole>} />
                  <Route path="/admin/routes" element={<RequireRole allowedRoles={['admin']}><AdminRoutesCitiesPage /></RequireRole>} />
                  <Route path="/admin/counters" element={<RequireRole allowedRoles={['admin']}><AdminCountersPage /></RequireRole>} />
                  <Route path="/admin/trips" element={<RequireRole allowedRoles={['admin']}><AdminTripsPage /></RequireRole>} />
                  <Route path="/admin/bookings" element={<RequireRole allowedRoles={['admin']}><AdminBookingsPage /></RequireRole>} />
                  <Route path="/admin/counter-pos" element={<RequireRole allowedRoles={['admin', 'counter_staff']}><AdminCounterPosPage /></RequireRole>} />
                  <Route path="/admin/refunds" element={<RequireRole allowedRoles={['admin']}><AdminRefundsPage /></RequireRole>} />
                  <Route path="/admin/financials" element={<RequireRole allowedRoles={['admin']}><AdminFinancialsPage /></RequireRole>} />
                  <Route path="/admin/marketing" element={<RequireRole allowedRoles={['admin']}><AdminMarketingPage /></RequireRole>} />
                  <Route path="/admin/support" element={<RequireRole allowedRoles={['admin']}><AdminSupportLogsPage /></RequireRole>} />
                  <Route path="/admin/users" element={<RequireRole allowedRoles={['admin']}><AdminUsersPage /></RequireRole>} />
                  <Route path="/admin/settings" element={<RequireRole allowedRoles={['admin']}><AdminSettingsPage /></RequireRole>} />

                  {/* Bus Owner Dashboard (Uena Theme 4) */}
                  <Route path="/owner" element={<RequireRole allowedRoles={['owner', 'admin']}><OwnerOverviewPage /></RequireRole>} />
                  <Route path="/owner/buses" element={<RequireRole allowedRoles={['owner', 'admin']}><OwnerFleetPage /></RequireRole>} />
                  <Route path="/owner/trips" element={<RequireRole allowedRoles={['owner', 'admin']}><OwnerTripsPage /></RequireRole>} />
                  <Route path="/owner/bookings" element={<RequireRole allowedRoles={['owner', 'admin']}><OwnerBookingsPage /></RequireRole>} />
                  <Route path="/owner/financials" element={<RequireRole allowedRoles={['owner', 'admin']}><OwnerFinancialsPage /></RequireRole>} />
                  <Route path="/owner/profile" element={<RequireRole allowedRoles={['owner', 'admin']}><OwnerProfilePage /></RequireRole>} />

                  {/* Passenger Dashboard (Uena Theme 4) */}
                  <Route path="/passenger" element={<RequireRole allowedRoles={['passenger', 'owner', 'admin', 'counter_staff']}><PassengerOverviewPage /></RequireRole>} />
                  <Route path="/passenger/bookings" element={<RequireRole allowedRoles={['passenger', 'owner', 'admin', 'counter_staff']}><PassengerBookingsPage /></RequireRole>} />
                  <Route path="/passenger/saved-passengers" element={<RequireRole allowedRoles={['passenger', 'owner', 'admin', 'counter_staff']}><PassengerSavedPage /></RequireRole>} />
                  <Route path="/passenger/payments" element={<RequireRole allowedRoles={['passenger', 'owner', 'admin', 'counter_staff']}><PassengerPaymentsPage /></RequireRole>} />
                  <Route path="/passenger/profile" element={<RequireRole allowedRoles={['passenger', 'owner', 'admin', 'counter_staff']}><PassengerProfilePage /></RequireRole>} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
