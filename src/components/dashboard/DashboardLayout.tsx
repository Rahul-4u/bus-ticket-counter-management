import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Bus,
  ChevronRight,
  ExternalLink,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchUserNotifications, markNotificationRead } from '../../services/firestoreService';

export interface SidebarItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

export interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}

interface DashboardLayoutProps {
  portalTitle: string;
  roleLabel: string;
  groups: SidebarGroup[];
  children: React.ReactNode;
}

export function DashboardLayout({ portalTitle, roleLabel, groups, children }: DashboardLayoutProps) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', profile?.uid, profile?.role],
    queryFn: () => fetchUserNotifications(profile!.uid, profile?.role),
    enabled: Boolean(profile?.uid),
    refetchInterval: profile?.role === 'admin' || profile?.role === 'counter_staff' ? 15_000 : false,
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const breadcrumbs = location.pathname
    .split('/')
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, ' '));

  const handleMarkRead = async (id: string, title?: string) => {
    await markNotificationRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications', profile?.uid, profile?.role] });
    if (
      (title?.startsWith('Live Support Request:') || title?.startsWith('Incoming Voice Call:')) &&
      (profile?.role === 'admin' || profile?.role === 'counter_staff')
    ) {
      setNotifOpen(false);
      navigate('/admin/live-chat');
    }
  };

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSearch.trim()) return;
    navigate(`/track`);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Uena Theme 4 Left Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[264px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-extrabold text-lg font-display text-slate-950 dark:text-white">
            <span className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center">
              <Bus className="w-4 h-4" />
            </span>
            <span>DeshLine</span>
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{portalTitle}</span>
          <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 capitalize">
            {roleLabel}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                          isActive
                            ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-semibold'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-950 dark:hover:text-white'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <Link
            to="/"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <span>Public Booking Site</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={async () => {
              setSidebarOpen(false);
              await logout();
              navigate('/');
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 transition-colors cursor-pointer"
          >
            <span>Logout</span>
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Uena Theme 4 Top Navbar */}
        <header className="sticky top-0 z-30 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumbs */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 capitalize truncate">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  <span className={idx === breadcrumbs.length - 1 ? 'text-slate-900 dark:text-white font-semibold' : ''}>
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Search Input */}
            <form onSubmit={handleQuickSearch} className="hidden md:block relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Verify PNR..."
                className="h-9 w-48 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </form>

            {/* Light / Dark Mode Switch */}
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileOpen(false);
                }}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center relative hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 z-50">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Notifications</span>
                    <span className="text-[11px] text-slate-500">{unreadCount} unread</span>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">No notifications yet.</p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.slice(0, 6).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleMarkRead(n.id, n.title)}
                          className="w-full text-left py-2.5 px-1 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-lg cursor-pointer"
                        >
                          <p className={`text-xs font-semibold ${n.isRead ? 'text-slate-600 dark:text-slate-400' : 'text-slate-950 dark:text-white'}`}>
                            {n.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg bg-orange-600 text-white flex items-center justify-center text-xs font-bold">
                  {profile?.displayName?.[0]?.toUpperCase() || <UserIcon className="w-3.5 h-3.5" />}
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-xs font-semibold text-slate-900 dark:text-white max-w-[120px] truncate">
                    {profile?.displayName || 'User'}
                  </span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 capitalize">
                    {profile?.role}
                  </span>
                </span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-2 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{profile?.displayName}</p>
                    <p className="text-slate-500 truncate">{profile?.email}</p>
                  </div>
                  {profile?.role === 'admin' && (
                    <>
                      <Link to="/admin" onClick={() => setProfileOpen(false)} className="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        Admin Console
                      </Link>
                      <Link to="/owner" onClick={() => setProfileOpen(false)} className="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        Fleet Owner Portal
                      </Link>
                    </>
                  )}
                  <Link to="/passenger" onClick={() => setProfileOpen(false)} className="block px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                    Passenger Portal
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      setProfileOpen(false);
                      await logout();
                      navigate('/');
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 mt-1 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            {/* Direct Visible Top-Bar Logout Button */}
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              title="Logout"
              aria-label="Logout"
              className="h-9 px-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
