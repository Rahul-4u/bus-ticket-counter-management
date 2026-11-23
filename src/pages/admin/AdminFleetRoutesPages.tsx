import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { AdminShell } from './AdminShell';
import { DataTable } from '../../components/dashboard/DataTable';
import { FormDialog } from '../../components/dashboard/Dialogs';
import { SeatMap } from '../../components/seats/SeatMap';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  adminFetchAllBuses,
  adminFetchBusOwners,
  adminUpsertBusOwner,
  adminUpsertCity,
  adminUpsertCounter,
  adminUpsertRoute,
  createBus,
  createTripWithSeats,
  fetchCities,
  fetchCounters,
  fetchRoutes,
  fetchTrips,
  logAuditAction,
  updateBus,
  updateTripStatus,
} from '../../services/firestoreService';
import { GENERATED_BUS_IMAGES } from '../../services/seedService';
import { formatBDT, generateSeatTemplate } from '../../lib/seatLayouts';
import type { Bus, BusOwner, City, Counter, LayoutType, Route, Trip } from '../../types/domain';

export function AdminOwnersPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyUnitName: '',
    contactName: '',
    phone: '',
    email: '',
    userId: '',
    commissionRate: 8,
  });

  const { data: owners = [], isLoading } = useQuery({
    queryKey: ['admin-owners'],
    queryFn: adminFetchBusOwners,
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `own_${Date.now()}`;
    const now = new Date().toISOString();
    await adminUpsertBusOwner({
      id,
      userId: form.userId || profile?.uid || id,
      companyUnitName: form.companyUnitName,
      contactName: form.contactName,
      phone: form.phone,
      email: form.email,
      commissionRate: Number(form.commissionRate),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await logAuditAction({
      actorUid: profile?.uid || '',
      actorEmail: profile?.email || '',
      action: 'CREATE_BUS_OWNER',
      resourceType: 'bus_owners',
      resourceId: id,
      details: form.companyUnitName,
    });
    notify('Bus Owner added', 'success');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['admin-owners'] });
  };

  const toggleStatus = async (owner: BusOwner) => {
    await adminUpsertBusOwner({
      ...owner,
      status: owner.status === 'active' ? 'inactive' : 'active',
      updatedAt: new Date().toISOString(),
    });
    notify('Owner status updated', 'success');
    queryClient.invalidateQueries({ queryKey: ['admin-owners'] });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <DataTable<BusOwner>
          title="Bus Owners & Fleet Divisions"
          data={owners}
          loading={isLoading}
          searchPlaceholder="Search owner or division..."
          searchPredicate={(r, q) =>
            r.companyUnitName.toLowerCase().includes(q) || r.contactName.toLowerCase().includes(q)
          }
          actionSlot={
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Bus Owner
            </button>
          }
          columns={[
            { key: 'unit', header: 'Fleet Division', render: (r) => <span className="font-semibold">{r.companyUnitName}</span> },
            { key: 'contact', header: 'Contact', render: (r) => <span>{r.contactName}</span> },
            { key: 'phone', header: 'Phone', render: (r) => <span className="font-mono">{r.phone}</span> },
            { key: 'comm', header: 'Commission', render: (r) => <span className="font-mono">{r.commissionRate}%</span> },
            { key: 'status', header: 'Status', render: (r) => <span className="capitalize font-semibold">{r.status}</span> },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (r) => (
                <button
                  type="button"
                  onClick={() => toggleStatus(r)}
                  className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  {r.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              ),
            },
          ]}
        />

        <FormDialog open={open} title="Register Bus Owner" onClose={() => setOpen(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <input
              required
              placeholder="Fleet Division / Unit Name"
              value={form.companyUnitName}
              onChange={(e) => setForm({ ...form, companyUnitName: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              required
              placeholder="Contact Name"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Phone (+880...)"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <input
              placeholder="Linked Firebase User UID (optional)"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm font-mono"
            />
            <input
              type="number"
              min={0}
              max={50}
              value={form.commissionRate}
              onChange={(e) => setForm({ ...form, commissionRate: Number(e.target.value) })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
              Save Bus Owner
            </button>
          </form>
        </FormDialog>
      </div>
    </AdminShell>
  );
}

export function AdminBusesPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<LayoutType | null>(null);
  const [form, setForm] = useState({
    name: '',
    coachNumber: '',
    registrationNumber: '',
    layoutType: '2+1' as LayoutType,
    isAc: true,
    totalSeats: 27,
  });

  const { data: buses = [], isLoading } = useQuery({
    queryKey: ['admin-buses'],
    queryFn: adminFetchAllBuses,
  });

  const handleCreateBus = async (e: React.FormEvent) => {
    e.preventDefault();
    await createBus({
      ownerId: profile?.uid || 'admin',
      ownerName: 'DeshLine Flagship Fleet',
      coachNumber: form.coachNumber,
      registrationNumber: form.registrationNumber,
      name: form.name,
      busTypeId: form.layoutType === 'sleeper' ? 'bt_sleeper' : form.layoutType === '2+1' ? 'bt_business' : 'bt_ac_eco',
      busTypeName: `${form.isAc ? 'AC' : 'Non-AC'} (${form.layoutType})`,
      layoutType: form.layoutType,
      isAc: form.isAc,
      totalSeats: Number(form.totalSeats),
      amenities: form.isAc ? ['Climate AC', 'USB Charging', 'GPS'] : ['Express Highway'],
      imageUrl:
        form.layoutType === 'sleeper'
          ? GENERATED_BUS_IMAGES.sleeperCoach
          : form.isAc
            ? GENERATED_BUS_IMAGES.scaniaBusiness
            : GENERATED_BUS_IMAGES.nonAcExpress,
      approvalStatus: 'approved',
      isActive: true,
    });
    notify('Coach registered & approved', 'success');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['admin-buses'] });
  };

  const handleApproval = async (bus: Bus, approvalStatus: 'approved' | 'rejected') => {
    await updateBus(bus.id, { approvalStatus });
    notify(`Coach ${bus.coachNumber} ${approvalStatus}`, 'success');
    queryClient.invalidateQueries({ queryKey: ['admin-buses'] });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <DataTable<Bus>
          title="Fleet Coaches & Seat Layouts"
          data={buses}
          loading={isLoading}
          searchPlaceholder="Search coach name or number..."
          searchPredicate={(r, q) =>
            r.name.toLowerCase().includes(q) || r.coachNumber.toLowerCase().includes(q)
          }
          filterOptions={[
            { label: 'Approved', value: 'approved' },
            { label: 'Pending Approval', value: 'pending' },
            { label: 'Rejected', value: 'rejected' },
          ]}
          filterPredicate={(r, v) => r.approvalStatus === v}
          actionSlot={
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Coach
            </button>
          }
          columns={[
            { key: 'coach', header: 'Coach #', render: (r) => <span className="font-mono font-bold">{r.coachNumber}</span> },
            { key: 'name', header: 'Coach Name', render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'layout', header: 'Layout', render: (r) => <span>{r.layoutType} · {r.totalSeats} seats</span> },
            { key: 'ac', header: 'Class', render: (r) => <span>{r.isAc ? 'AC' : 'Non-AC'}</span> },
            { key: 'approval', header: 'Approval', render: (r) => <span className="uppercase font-mono text-[11px]">{r.approvalStatus}</span> },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (r) => (
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewLayout(r.layoutType)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                  >
                    Preview Seats
                  </button>
                  {r.approvalStatus !== 'approved' && (
                    <button
                      type="button"
                      onClick={() => handleApproval(r, 'approved')}
                      className="p-1.5 rounded-lg bg-emerald-600 text-white cursor-pointer"
                      title="Approve"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {r.approvalStatus !== 'rejected' && (
                    <button
                      type="button"
                      onClick={() => handleApproval(r, 'rejected')}
                      className="p-1.5 rounded-lg bg-red-600 text-white cursor-pointer"
                      title="Reject"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />

        <FormDialog open={open} title="Add Fleet Coach" onClose={() => setOpen(false)}>
          <form onSubmit={handleCreateBus} className="space-y-4">
            <input
              required
              placeholder="Coach Name (e.g. Scania Business Class)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Coach Code (DL-501)"
                value={form.coachNumber}
                onChange={(e) => setForm({ ...form, coachNumber: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                required
                placeholder="Reg # (Dhaka-Metro-Ba...)"
                value={form.registrationNumber}
                onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <select
                value={form.layoutType}
                onChange={(e) => {
                  const lt = e.target.value as LayoutType;
                  setForm({
                    ...form,
                    layoutType: lt,
                    totalSeats: lt === '2+1' ? 27 : lt === 'sleeper' ? 30 : 40,
                  });
                }}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="2+1">2+1 Layout</option>
                <option value="2+2">2+2 Layout</option>
                <option value="sleeper">Sleeper</option>
                <option value="custom">Custom</option>
              </select>
              <select
                value={form.isAc ? 'ac' : 'nonac'}
                onChange={(e) => setForm({ ...form, isAc: e.target.value === 'ac' })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="ac">AC</option>
                <option value="nonac">Non-AC</option>
              </select>
              <input
                type="number"
                min={12}
                max={60}
                value={form.totalSeats}
                onChange={(e) => setForm({ ...form, totalSeats: Number(e.target.value) })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
              Register Coach
            </button>
          </form>
        </FormDialog>

        <FormDialog
          open={Boolean(previewLayout)}
          title={`Seat Layout Preview (${previewLayout})`}
          onClose={() => setPreviewLayout(null)}
        >
          {previewLayout && (
            <SeatMap
              seats={generateSeatTemplate(previewLayout)}
              layoutType={previewLayout}
              selectedSeats={[]}
              onToggleSeat={() => {}}
            />
          )}
        </FormDialog>
      </div>
    </AdminShell>
  );
}

export function AdminRoutesCitiesPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [cityOpen, setCityOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);

  const [cityForm, setCityForm] = useState({ name: '', code: '', division: '' });
  const [routeForm, setRouteForm] = useState({
    originCityId: 'city_dhk',
    destinationCityId: 'city_ctg',
    distanceKm: 250,
    estimatedDuration: '5h 30m',
    baseFare: 1100,
    boardingStop: 'Arambagh Counter',
    droppingStop: 'Dampara Counter',
  });

  const { data: cities = [] } = useQuery({ queryKey: ['cities'], queryFn: fetchCities });
  const { data: routes = [], isLoading } = useQuery({ queryKey: ['routes'], queryFn: fetchRoutes });

  const handleAddCity = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `city_${cityForm.code.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString().slice(-3)}`;
    await adminUpsertCity({
      id,
      name: cityForm.name,
      code: cityForm.code.toUpperCase(),
      division: cityForm.division,
      isActive: true,
    });
    notify('City saved', 'success');
    setCityOpen(false);
    queryClient.invalidateQueries({ queryKey: ['cities'] });
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    const orig = cities.find((c) => c.id === routeForm.originCityId);
    const dest = cities.find((c) => c.id === routeForm.destinationCityId);
    if (!orig || !dest || orig.id === dest.id) {
      notify('Select different origin and destination cities', 'error');
      return;
    }
    const id = `rt_${Date.now()}`;
    await adminUpsertRoute({
      id,
      originCityId: orig.id,
      originName: orig.name,
      destinationCityId: dest.id,
      destinationName: dest.name,
      distanceKm: Number(routeForm.distanceKm),
      estimatedDuration: routeForm.estimatedDuration,
      baseFare: Number(routeForm.baseFare),
      isActive: true,
      stops: [
        { name: routeForm.boardingStop, timeOffsetMinutes: 0, type: 'boarding' },
        { name: routeForm.droppingStop, timeOffsetMinutes: 300, type: 'dropping' },
      ],
    });
    notify('Route created', 'success');
    setRouteOpen(false);
    queryClient.invalidateQueries({ queryKey: ['routes'] });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <DataTable<City>
          title="Cities Network"
          data={cities}
          actionSlot={
            <button
              type="button"
              onClick={() => setCityOpen(true)}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add City
            </button>
          }
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-bold">{r.code}</span> },
            { key: 'name', header: 'City Name', render: (r) => <span className="font-semibold">{r.name}</span> },
            { key: 'div', header: 'Division', render: (r) => <span>{r.division}</span> },
          ]}
          pageSize={6}
        />

        <DataTable<Route>
          title="Intercity Routes & Stops"
          data={routes}
          loading={isLoading}
          actionSlot={
            <button
              type="button"
              onClick={() => setRouteOpen(true)}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Route
            </button>
          }
          columns={[
            { key: 'corridor', header: 'Corridor', render: (r) => <span className="font-semibold">{r.originName} → {r.destinationName}</span> },
            { key: 'dist', header: 'Distance', render: (r) => <span className="font-mono">{r.distanceKm} km</span> },
            { key: 'dur', header: 'Duration', render: (r) => <span>{r.estimatedDuration}</span> },
            { key: 'stops', header: 'Stops', render: (r) => <span>{r.stops.map((s) => s.name).join(' · ')}</span> },
            { key: 'fare', header: 'Base Fare', align: 'right', render: (r) => <span className="font-mono font-bold">{formatBDT(r.baseFare)}</span> },
          ]}
        />

        <FormDialog open={cityOpen} title="Add City" onClose={() => setCityOpen(false)}>
          <form onSubmit={handleAddCity} className="space-y-4">
            <input
              required
              placeholder="City Name (e.g. Bogura)"
              value={cityForm.name}
              onChange={(e) => setCityForm({ ...cityForm, name: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Code (BOG)"
                value={cityForm.code}
                onChange={(e) => setCityForm({ ...cityForm, code: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm uppercase"
              />
              <input
                required
                placeholder="Division (Rajshahi)"
                value={cityForm.division}
                onChange={(e) => setCityForm({ ...cityForm, division: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
              Save City
            </button>
          </form>
        </FormDialog>

        <FormDialog open={routeOpen} title="Create Route" onClose={() => setRouteOpen(false)}>
          <form onSubmit={handleAddRoute} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <select
                value={routeForm.originCityId}
                onChange={(e) => setRouteForm({ ...routeForm, originCityId: e.target.value })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={routeForm.destinationCityId}
                onChange={(e) => setRouteForm({ ...routeForm, destinationCityId: e.target.value })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                placeholder="Distance km"
                value={routeForm.distanceKm}
                onChange={(e) => setRouteForm({ ...routeForm, distanceKm: Number(e.target.value) })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                placeholder="Duration"
                value={routeForm.estimatedDuration}
                onChange={(e) => setRouteForm({ ...routeForm, estimatedDuration: e.target.value })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
              <input
                type="number"
                placeholder="Base Fare"
                value={routeForm.baseFare}
                onChange={(e) => setRouteForm({ ...routeForm, baseFare: Number(e.target.value) })}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <input
              required
              placeholder="Primary Boarding Stop"
              value={routeForm.boardingStop}
              onChange={(e) => setRouteForm({ ...routeForm, boardingStop: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <input
              required
              placeholder="Primary Dropping Stop"
              value={routeForm.droppingStop}
              onChange={(e) => setRouteForm({ ...routeForm, droppingStop: e.target.value })}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
            />
            <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
              Save Route
            </button>
          </form>
        </FormDialog>
      </div>
    </AdminShell>
  );
}

export function AdminCountersPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cityId: 'city_dhk', name: '', address: '', phone: '' });

  const { data: cities = [] } = useQuery({ queryKey: ['cities'], queryFn: fetchCities });
  const { data: counters = [], isLoading } = useQuery({ queryKey: ['counters'], queryFn: fetchCounters });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const city = cities.find((c) => c.id === form.cityId);
    const id = `cnt_${Date.now()}`;
    await adminUpsertCounter({
      id,
      cityId: form.cityId,
      cityName: city?.name || 'Dhaka',
      name: form.name,
      address: form.address,
      phone: form.phone,
      isActive: true,
    });
    notify('Counter added', 'success');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['counters'] });
  };

  return (
    <AdminShell>
      <DataTable<Counter>
        title="Authorized Booking Counters"
        data={counters}
        loading={isLoading}
        actionSlot={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Counter
          </button>
        }
        columns={[
          { key: 'name', header: 'Counter Name', render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 'city', header: 'City', render: (r) => <span>{r.cityName}</span> },
          { key: 'addr', header: 'Address', render: (r) => <span>{r.address}</span> },
          { key: 'phone', header: 'Phone', render: (r) => <span className="font-mono">{r.phone}</span> },
        ]}
      />
      <FormDialog open={open} title="New Authorized Counter" onClose={() => setOpen(false)}>
        <form onSubmit={handleSave} className="space-y-4">
          <select
            value={form.cityId}
            onChange={(e) => setForm({ ...form, cityId: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            required
            placeholder="Counter Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <input
            required
            placeholder="Street Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <input
            required
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
            Save Counter
          </button>
        </form>
      </FormDialog>
    </AdminShell>
  );
}

export function AdminTripsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);

  const { data: trips = [], isLoading } = useQuery({ queryKey: ['admin-trips'], queryFn: () => fetchTrips() });
  const { data: buses = [] } = useQuery({ queryKey: ['admin-buses'], queryFn: adminFetchAllBuses });
  const { data: routes = [] } = useQuery({ queryKey: ['routes'], queryFn: fetchRoutes });

  const [form, setForm] = useState({
    busId: '',
    routeId: '',
    journeyDate: new Date().toISOString().split('T')[0],
    departureTime: '22:00',
    arrivalTime: '06:30',
    fare: 1500,
  });

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    const bus = buses.find((b) => b.id === (form.busId || buses[0]?.id));
    const route = routes.find((r) => r.id === (form.routeId || routes[0]?.id));
    if (!bus || !route) {
      notify('Select an approved coach and route', 'error');
      return;
    }
    await createTripWithSeats({
      ownerId: bus.ownerId,
      busId: bus.id,
      busName: bus.name,
      busTypeName: bus.busTypeName,
      isAc: bus.isAc,
      layoutType: bus.layoutType,
      busImageUrl: bus.imageUrl,
      routeId: route.id,
      originCityId: route.originCityId,
      originName: route.originName,
      destinationCityId: route.destinationCityId,
      destinationName: route.destinationName,
      journeyDate: form.journeyDate,
      departureTime: form.departureTime,
      arrivalTime: form.arrivalTime,
      durationLabel: route.estimatedDuration,
      fare: Number(form.fare),
      totalSeats: bus.totalSeats,
      boardingPoints: route.stops.filter((s) => s.type !== 'dropping').map((s) => s.name),
      droppingPoints: route.stops.filter((s) => s.type !== 'boarding').map((s) => s.name),
      status: 'scheduled',
    });
    notify('Trip schedule & seat inventory generated', 'success');
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ['admin-trips'] });
  };

  return (
    <AdminShell>
      <DataTable<Trip>
        title="Scheduled Trips & Seat Inventories"
        data={trips}
        loading={isLoading}
        searchPlaceholder="Search route, coach, date..."
        searchPredicate={(r, q) =>
          `${r.originName} ${r.destinationName} ${r.busName} ${r.journeyDate}`.toLowerCase().includes(q)
        }
        actionSlot={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Schedule Trip
          </button>
        }
        columns={[
          { key: 'route', header: 'Route', render: (r) => <span className="font-semibold">{r.originName} → {r.destinationName}</span> },
          { key: 'bus', header: 'Coach', render: (r) => <span>{r.busName}</span> },
          { key: 'date', header: 'Date & Time', render: (r) => <span className="font-mono">{r.journeyDate} · {r.departureTime}</span> },
          { key: 'seats', header: 'Seats Left', render: (r) => <span className="font-mono tabular-nums">{r.availableSeats}/{r.totalSeats}</span> },
          { key: 'fare', header: 'Fare', render: (r) => <span className="font-mono font-bold">{formatBDT(r.fare)}</span> },
          {
            key: 'status',
            header: 'Status',
            align: 'right',
            render: (r) => (
              <select
                value={r.status}
                onChange={async (e) => {
                  await updateTripStatus(r.id, e.target.value as Trip['status']);
                  notify('Trip status updated', 'success');
                  queryClient.invalidateQueries({ queryKey: ['admin-trips'] });
                }}
                className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-semibold"
              >
                <option value="scheduled">Scheduled</option>
                <option value="boarding">Boarding</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            ),
          },
        ]}
      />

      <FormDialog open={open} title="Schedule New Trip" onClose={() => setOpen(false)}>
        <form onSubmit={handleCreateTrip} className="space-y-4">
          <select
            value={form.busId || buses[0]?.id || ''}
            onChange={(e) => setForm({ ...form, busId: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            {buses.filter((b) => b.approvalStatus === 'approved').map((b) => (
              <option key={b.id} value={b.id}>
                {b.coachNumber} · {b.name} ({b.layoutType})
              </option>
            ))}
          </select>
          <select
            value={form.routeId || routes[0]?.id || ''}
            onChange={(e) => setForm({ ...form, routeId: e.target.value })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            {routes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.originName} → {rt.destinationName}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-3">
            <input
              type="date"
              required
              value={form.journeyDate}
              onChange={(e) => setForm({ ...form, journeyDate: e.target.value })}
              className="h-10 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <input
              type="time"
              required
              value={form.departureTime}
              onChange={(e) => setForm({ ...form, departureTime: e.target.value })}
              className="h-10 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
            <input
              type="time"
              required
              value={form.arrivalTime}
              onChange={(e) => setForm({ ...form, arrivalTime: e.target.value })}
              className="h-10 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-xs"
            />
          </div>
          <input
            type="number"
            required
            min={100}
            value={form.fare}
            onChange={(e) => setForm({ ...form, fare: Number(e.target.value) })}
            className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent text-sm"
          />
          <button type="submit" className="w-full h-10 rounded-xl bg-orange-600 text-white text-sm font-semibold cursor-pointer">
            Publish Trip &amp; Generate Seats
          </button>
        </form>
      </FormDialog>
    </AdminShell>
  );
}
