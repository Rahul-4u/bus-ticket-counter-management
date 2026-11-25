import React from 'react';
import {
  Bus,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  MessageSquareText,
  Receipt,
  RotateCcw,
  Settings,
  ShieldCheck,
  Store,
  Tag,
  Ticket,
  Users,
} from 'lucide-react';
import { DashboardLayout, SidebarGroup } from '../../components/dashboard/DashboardLayout';
import { useAuth } from '../../contexts/AuthContext';

const ADMIN_GROUPS: SidebarGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'Fleet & Network',
    items: [
      { label: 'Bus Owners', to: '/admin/owners', icon: Users },
      { label: 'Buses & Layouts', to: '/admin/buses', icon: Bus },
      { label: 'Cities & Routes', to: '/admin/routes', icon: MapPinned },
      { label: 'Counters', to: '/admin/counters', icon: Store },
      { label: 'Trips & Schedules', to: '/admin/trips', icon: CalendarClock },
    ],
  },
  {
    title: 'Bookings & Counter',
    items: [
      { label: 'All Bookings', to: '/admin/bookings', icon: Ticket },
      { label: 'Counter Booking POS', to: '/admin/counter-pos', icon: Receipt },
      { label: 'Live Passenger Chat', to: '/admin/live-chat', icon: MessageSquareText },
      { label: 'Refund Requests', to: '/admin/refunds', icon: RotateCcw },
      { label: 'Verify Ticket', to: '/track', icon: ShieldCheck },
    ],
  },
  {
    title: 'Finance & Growth',
    items: [
      { label: 'Payments & Settlements', to: '/admin/financials', icon: CreditCard },
      { label: 'Coupons & Reviews', to: '/admin/marketing', icon: Tag },
      { label: 'Support & Audit Logs', to: '/admin/support', icon: Megaphone },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Roles & Users', to: '/admin/users', icon: Users },
      { label: 'General Settings', to: '/admin/settings', icon: Settings },
    ],
  },
];

const COUNTER_STAFF_GROUPS: SidebarGroup[] = [
  {
    title: 'Counter Desk',
    items: [
      { label: 'Counter Booking POS', to: '/admin/counter-pos', icon: Receipt },
      { label: 'Live Passenger Chat', to: '/admin/live-chat', icon: MessageSquareText },
      { label: 'Verify Ticket', to: '/track', icon: ShieldCheck },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const isCounter = profile?.role === 'counter_staff';

  return (
    <DashboardLayout
      portalTitle={isCounter ? 'Counter Desk Console' : 'Operations Console'}
      roleLabel={isCounter ? 'Counter Staff' : 'Admin'}
      groups={isCounter ? COUNTER_STAFF_GROUPS : ADMIN_GROUPS}
    >
      {children}
    </DashboardLayout>
  );
}
