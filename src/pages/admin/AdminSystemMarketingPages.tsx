import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { AdminShell } from './AdminShell';
import { DataTable } from '../../components/dashboard/DataTable';
import { FormDialog } from '../../components/dashboard/Dialogs';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import {
  adminFetchAllReviews,
  adminFetchAllSupportTickets,
  adminFetchAllUsers,
  adminFetchAuditLogs,
  adminFetchCoupons,
  adminSaveCompanySettings,
  adminUpdateSupportTicket,
  adminUpdateUserRole,
  adminUpsertCoupon,
  fetchCompanySettings,
} from '../../services/firestoreService';
import { ensureDatabaseSeeded } from '../../services/seedService';
import type { AuditLog, CompanySettings, Coupon, Review, SupportTicket, UserProfile, UserRole } from '../../types/domain';

export function AdminMarketingPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    title: '',
    description: '',
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: 10,
    minFare: 800,
    maxDiscount: 300,
  });

  const { data: coupons = [] } = useQuery({ queryKey: ['admin-coupons'], queryFn: adminFetchCoupons });
  const { data: reviews = [] } = useQuery({ queryKey: ['admin-reviews'], queryFn: adminFetchAllReviews });

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `cpn_${form.code.toLowerCase()}_${Date.now().toString().slice(-3)}`;
    await adminUpsertCoupon({
      id,
      code: form.code.toUpperCase(),
      title: form.title,
      description: form.description,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minFare: Number(form.minFare),
      maxDiscount: Number(form.maxDiscount),
      validUntil: '2027-12-31',
      isActive: true,
    });
    notify('Coupon saved', 'success');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <DataTable<Coupon>
          title="Promo Coupons & Offers"
          data={coupons}
          actionSlot={
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Coupon
            </button>
          }
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-bold text-orange-600">{r.code}</span> },
            { key: 'title', header: 'Title', render: (r) => <span className="font-semibold">{r.title}</span> },
            { key: 'val', header: 'Discount', render: (r) => <span>{r.discountType === 'percent' ? `${r.discountValue}%` : `৳${r.discountValue}`}</span> },
            { key: 'exp', header: 'Valid Until', render: (r) => <span className="font-mono">{r.validUntil}</span> },
            {
              key: 'st',
              header: 'Active',
              align: 'right',
              render: (r) => (
                <button
                  type="button"
                  onClick={async () => {
                    await adminUpsertCoupon({ ...r, isActive: !r.isActive });
                    queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
                  }}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                >
                  {r.isActive ? 'Disable' : 'Enable'}
                </button>
              ),
            },
          ]}
        />

        <DataTable<Review>
          title="Passenger Reviews"
          data={reviews}
          columns={[
            { key: 'pax', header: 'Passenger', render: (r) => <span className="font-semibold">{r.passengerName}</span> },
            { key: 'rt', header: 'Route', render: (r) => <span>{r.routeLabel}</span> },
            { key: 'rat', header: 'Rating', render: (r) => <span className="font-mono">{r.rating}/5</span> },
            { key: 'cmt', header: 'Comment', render: (r) => <span className="max-w-sm truncate block">{r.comment}</span> },
          ]}
        />

        <FormDialog open={open} title="Create Promo Coupon" onClose={() => setOpen(false)}>
          <form onSubmit={handleSaveCoupon} className="space-y-4">
            <input
              required
              placeholder="Coupon Code (EID20)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm uppercase font-mono"
            />
            <input
              required
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              required
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-3 gap-3">
              <select
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value as 'percent' | 'fixed' })}
                className="h-10 px-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed BDT</option>
              </select>
              <input
                type="number"
                value={form.discountValue}
                onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                type="number"
                value={form.maxDiscount}
                onChange={(e) => setForm({ ...form, maxDiscount: Number(e.target.value) })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
              Save Coupon
            </button>
          </form>
        </FormDialog>
      </div>
    </AdminShell>
  );
}

export function AdminSupportLogsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { data: tickets = [] } = useQuery({ queryKey: ['admin-support'], queryFn: adminFetchAllSupportTickets });
  const { data: logs = [] } = useQuery({ queryKey: ['admin-audit'], queryFn: adminFetchAuditLogs });

  return (
    <AdminShell>
      <div className="space-y-6">
        <DataTable<SupportTicket>
          title="Passenger & Owner Support Tickets"
          data={tickets}
          columns={[
            { key: 'user', header: 'User', render: (r) => <span>{r.userName} ({r.userEmail})</span> },
            { key: 'subj', header: 'Subject', render: (r) => <span className="font-semibold">{r.subject}</span> },
            { key: 'msg', header: 'Message', render: (r) => <span className="max-w-xs truncate block">{r.message}</span> },
            {
              key: 'st',
              header: 'Status',
              align: 'right',
              render: (r) => (
                <select
                  value={r.status}
                  onChange={async (e) => {
                    await adminUpdateSupportTicket(r.id, e.target.value as SupportTicket['status'], 'Reviewed by dispatch');
                    notify('Ticket status updated', 'success');
                    queryClient.invalidateQueries({ queryKey: ['admin-support'] });
                  }}
                  className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              ),
            },
          ]}
        />

        <DataTable<AuditLog>
          title="System Audit Trail"
          data={logs}
          columns={[
            { key: 'time', header: 'Timestamp', render: (r) => <span className="font-mono">{r.createdAt.slice(0, 19).replace('T', ' ')}</span> },
            { key: 'actor', header: 'Actor', render: (r) => <span>{r.actorEmail}</span> },
            { key: 'act', header: 'Action', render: (r) => <span className="font-mono font-bold">{r.action}</span> },
            { key: 'det', header: 'Details', render: (r) => <span>{r.details}</span> },
          ]}
        />
      </div>
    </AdminShell>
  );
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: adminFetchAllUsers });

  return (
    <AdminShell>
      <DataTable<UserProfile>
        title="Users & Role-Based Permissions"
        data={users}
        loading={isLoading}
        searchPlaceholder="Search name or email..."
        searchPredicate={(r, q) => r.email.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q)}
        columns={[
          { key: 'name', header: 'Name', render: (r) => <span className="font-semibold">{r.displayName}</span> },
          { key: 'email', header: 'Email', render: (r) => <span>{r.email}</span> },
          {
            key: 'role',
            header: 'Role',
            render: (r) => (
              <select
                value={r.role}
                onChange={async (e) => {
                  await adminUpdateUserRole(r.uid, e.target.value as UserRole, r.status);
                  notify(`Role updated for ${r.displayName}`, 'success');
                  queryClient.invalidateQueries({ queryKey: ['admin-users'] });
                }}
                className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-semibold"
              >
                <option value="passenger">Passenger</option>
                <option value="owner">Bus Owner</option>
                <option value="counter_staff">Counter Staff</option>
                <option value="admin">Admin</option>
              </select>
            ),
          },
          { key: 'status', header: 'Status', align: 'right', render: (r) => <span className="capitalize">{r.status}</span> },
        ]}
      />
    </AdminShell>
  );
}

export function AdminSettingsPage() {
  const { profile } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['company-settings'], queryFn: fetchCompanySettings });

  const [form, setForm] = useState<CompanySettings>({
    id: 'company',
    companyName: 'DeshLine Paribahan',
    tagline: 'Precision Intercity Coach Travel Across Bangladesh',
    supportPhone: '+880 1700-000999',
    supportEmail: 'support@deshline.com.bd',
    headOffice: '148 Mirpur Road, Dhaka',
    commissionPercent: 8,
    sandboxMode: true,
    cancellationPolicy: {
      before24HoursRefundPercent: 85,
      between12And24HoursRefundPercent: 50,
      under12HoursRefundPercent: 0,
      seatLockMinutes: 5,
    },
  });

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminSaveCompanySettings(form);
    notify('Company & policy settings saved', 'success');
    queryClient.invalidateQueries({ queryKey: ['company-settings'] });
  };

  const handleReseed = async () => {
    if (!profile) return;
    await ensureDatabaseSeeded(profile.uid, profile.email, true);
    notify('Sample Bangladesh routes, fleet, and trips re-seeded', 'success');
    queryClient.invalidateQueries();
  };

  return (
    <AdminShell>
      <div className="max-w-3xl space-y-6">
        <form
          onSubmit={handleSave}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5"
        >
          <h1 className="text-xl font-bold font-display">Company &amp; Cancellation Policy Settings</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Company Name</label>
              <input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Support Phone</label>
              <input
                value={form.supportPhone}
                onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">24h+ Refund (%)</label>
              <input
                type="number"
                value={form.cancellationPolicy.before24HoursRefundPercent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cancellationPolicy: {
                      ...form.cancellationPolicy,
                      before24HoursRefundPercent: Number(e.target.value),
                    },
                  })
                }
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">12-24h Refund (%)</label>
              <input
                type="number"
                value={form.cancellationPolicy.between12And24HoursRefundPercent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cancellationPolicy: {
                      ...form.cancellationPolicy,
                      between12And24HoursRefundPercent: Number(e.target.value),
                    },
                  })
                }
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Default Commission (%)</label>
              <input
                type="number"
                value={form.commissionPercent}
                onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button type="submit" className="px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
              Save Settings
            </button>
            <button
              type="button"
              onClick={handleReseed}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Re-Seed Demo Fleet &amp; Trips
            </button>
          </div>
        </form>
      </div>
    </AdminShell>
  );
}
