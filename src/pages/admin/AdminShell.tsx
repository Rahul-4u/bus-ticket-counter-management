import React from 'react';
import {
  Bus,
  CalendarClock,
  CreditCard,
  LayoutDashboard,
  MapPinned,
  Megaphone,
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout portalTitle="Operations Console" roleLabel="Admin" groups={ADMIN_GROUPS}>
      {children}
    </DashboardLayout>
  );
}
