import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bus, Menu, X, PhoneCall, Mail, MapPin, Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchCompanySettings } from '../../services/firestoreService';
import { DEFAULT_SUPPORT_PHONE, toTelHref, toWhatsAppHref } from '../../services/voiceCallService';
import { LiveChatWidget } from '../chat/LiveChatWidget';

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: fetchCompanySettings,
    staleTime: 60_000,
  });
  const supportPhone = settings?.supportPhone || DEFAULT_SUPPORT_PHONE;
  const supportEmail = settings?.supportEmail || 'support@deshline.com.bd';

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
    navigate('/');
  };

  const dashboardHref =
    profile?.role === 'admin'
      ? '/admin'
      : profile?.role === 'owner'
        ? '/owner'
        : profile?.role === 'counter_staff'
          ? '/admin/counter-pos'
          : '/passenger';

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
      isActive
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <Link
            to="/"
            className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            <span className="w-9 h-9 rounded-lg bg-[#0B1F3A] text-white flex items-center justify-center">
              <Bus className="w-5 h-5 text-orange-400" />
            </span>
            DeshLine
          </Link>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-7">
            <NavLink to="/search" className={navLinkClass}>
              Routes
            </NavLink>
            <NavLink
              to="/#fleet"
              className="text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Fleet
            </NavLink>
            <NavLink to="/track" className={navLinkClass}>
              Track Ticket
            </NavLink>
            <NavLink to="/about" className={navLinkClass}>
              About
            </NavLink>
            <NavLink to="/contact" className={navLinkClass}>
              Contact
            </NavLink>
          </nav>

          {/* Zone 3: Direct Call + Theme Toggle + Auth Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            <a
              href={toTelHref(supportPhone)}
              title={`Call 24/7 Hotline: ${supportPhone}`}
              className="h-9 px-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Call Now</span>
            </a>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>

            {profile ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate(dashboardHref)}
                  className="px-4 py-2 rounded-lg bg-[#0B1F3A] dark:bg-orange-600 text-white text-sm font-semibold hover:bg-slate-800 dark:hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign Out"
                  className="px-3 py-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 py-4 flex flex-col gap-3">
            <Link to="/search" onClick={() => setMobileOpen(false)} className="py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              Search Routes
            </Link>
            <Link to="/track" onClick={() => setMobileOpen(false)} className="py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              Track Ticket
            </Link>
            <Link to="/about" onClick={() => setMobileOpen(false)} className="py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              About Us
            </Link>
            <Link to="/faq" onClick={() => setMobileOpen(false)} className="py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              FAQ
            </Link>
            <Link to="/contact" onClick={() => setMobileOpen(false)} className="py-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              Contact
            </Link>
            {profile ? (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    navigate(dashboardHref);
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-[#0B1F3A] dark:bg-orange-600 text-white text-sm font-semibold cursor-pointer"
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  navigate('/login');
                }}
                className="mt-1 py-2.5 rounded-lg bg-orange-600 text-white text-sm font-semibold cursor-pointer"
              >
                Sign In / Register
              </button>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {/* BigTranz-inspired Quiet Deep Navy Footer */}
      <footer className="bg-[#0B1F3A] text-slate-300 border-t border-slate-800 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2.5 text-xl font-extrabold text-white font-display mb-4">
                <span className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center">
                  <Bus className="w-4 h-4" />
                </span>
                DeshLine Paribahan
              </div>
              <p className="text-sm text-slate-400 leading-relaxed mb-5">
                Reliable intercity AC Business, Royal Sleeper, and Express coach travel connecting 8 divisions across Bangladesh with unified counter and online seat inventory.
              </p>
              <div className="space-y-2 text-xs text-slate-400">
                <p className="flex items-center gap-2">
                  <PhoneCall className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <a href={toTelHref(supportPhone)} className="hover:text-white underline-offset-2 hover:underline">
                    {supportPhone} (24/7 Dispatch)
                  </a>
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <a href={`mailto:${supportEmail}`} className="hover:text-white">
                    {supportEmail}
                  </a>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span>148 Mirpur Road, Kalyanpur, Dhaka 1207</span>
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <a
                    href={toTelHref(supportPhone)}
                    className="px-2.5 py-1 rounded-md bg-orange-600 hover:bg-orange-700 text-white font-semibold inline-flex items-center gap-1"
                  >
                    <PhoneCall className="w-3 h-3" />
                    Call Hotline
                  </a>
                  <a
                    href={toWhatsAppHref(supportPhone, 'Hello DeshLine Support')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">Booking & Travel</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/search" className="hover:text-white transition-colors">Search Coaches</Link></li>
                <li><Link to="/track" className="hover:text-white transition-colors">Verify & Track PNR</Link></li>
                <li><Link to="/passenger" className="hover:text-white transition-colors">My E-Tickets</Link></li>
                <li><Link to="/faq" className="hover:text-white transition-colors">Travel FAQ</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">Company & Portals</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/about" className="hover:text-white transition-colors">About DeshLine</Link></li>
                <li><Link to="/contact" className="hover:text-white transition-colors">Contact & Counters</Link></li>
                <li><Link to="/owner" className="hover:text-white transition-colors">Bus Owner Portal</Link></li>
                <li><Link to="/admin" className="hover:text-white transition-colors">Operations Console</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white mb-4">Policies & Payments</h3>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/terms" className="hover:text-white transition-colors">Terms & Conditions</Link></li>
                <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to="/refund-policy" className="hover:text-white transition-colors">Cancellation & Refund Policy</Link></li>
              </ul>
              <div className="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-400">
                Supported Gateways: SSLCommerz · aamarPay · Authorized Counters
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <p>© {new Date().getFullYear()} DeshLine Paribahan Ltd. All rights reserved.</p>
            <p>Single-Fleet Unified Inventory · Dhaka · Chattogram · Sylhet · Cox&apos;s Bazar</p>
          </div>
        </div>
      </footer>
      <LiveChatWidget />
    </div>
  );
}
