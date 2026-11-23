import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateSeatTemplate } from '../lib/seatLayouts';
import type {
  Bus,
  BusOwner,
  BusType,
  City,
  CompanySettings,
  Counter,
  Coupon,
  Review,
  Route,
  Trip,
} from '../types/domain';

function addDaysISO(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

export const GENERATED_BUS_IMAGES = {
  scaniaBusiness: '/src/assets/images/bus_scania_business_1795255690262.jpg',
  sleeperCoach: '/src/assets/images/bus_sleeper_coach_1795255690069.jpg',
  nonAcExpress: '/src/assets/images/bus_nonac_express_1795255689846.jpg',
  heroCoach: '/src/assets/images/hero_coach_highway_1795255689853.jpg',
  coxsRoute: '/src/assets/images/route_coxs_bazar_1795255689101.jpg',
};

export async function ensureDatabaseSeeded(adminUid: string, adminEmail: string, force = false): Promise<boolean> {
  const settingsRef = doc(db, 'settings', 'company');
  if (!force) {
    const existing = await getDoc(settingsRef);
    if (existing.exists()) {
      return false;
    }
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);

  const settings: CompanySettings = {
    id: 'company',
    companyName: 'DeshLine Paribahan',
    tagline: 'Precision Intercity Coach Travel Across Bangladesh',
    supportPhone: '+880 1700-000999',
    supportEmail: 'support@deshline.com.bd',
    headOffice: '148 Gabtoli & Kalyanpur Coach Terminal, Mirpur Road, Dhaka 1207',
    commissionPercent: 8,
    sandboxMode: true,
    cancellationPolicy: {
      before24HoursRefundPercent: 85,
      between12And24HoursRefundPercent: 50,
      under12HoursRefundPercent: 0,
      seatLockMinutes: 5,
    },
  };
  batch.set(settingsRef, settings);

  const cities: City[] = [
    { id: 'city_dhk', name: 'Dhaka', code: 'DHK', division: 'Dhaka', isActive: true },
    { id: 'city_ctg', name: 'Chattogram', code: 'CTG', division: 'Chattogram', isActive: true },
    { id: 'city_cxb', name: "Cox's Bazar", code: 'CXB', division: 'Chattogram', isActive: true },
    { id: 'city_syl', name: 'Sylhet', code: 'SYL', division: 'Sylhet', isActive: true },
    { id: 'city_raj', name: 'Rajshahi', code: 'RAJ', division: 'Rajshahi', isActive: true },
    { id: 'city_khl', name: 'Khulna', code: 'KHL', division: 'Khulna', isActive: true },
    { id: 'city_rng', name: 'Rangpur', code: 'RNG', division: 'Rangpur', isActive: true },
    { id: 'city_bar', name: 'Barishal', code: 'BAR', division: 'Barishal', isActive: true },
  ];
  cities.forEach((c) => batch.set(doc(db, 'cities', c.id), c));

  const routes: Route[] = [
    {
      id: 'rt_dhk_cxb',
      originCityId: 'city_dhk',
      originName: 'Dhaka',
      destinationCityId: 'city_cxb',
      destinationName: "Cox's Bazar",
      distanceKm: 398,
      estimatedDuration: '9h 30m',
      baseFare: 1650,
      isActive: true,
      stops: [
        { name: 'Arambagh DeshLine Lounge', timeOffsetMinutes: 0, type: 'boarding' },
        { name: 'Sayedabad Terminal Bay 4', timeOffsetMinutes: 25, type: 'boarding' },
        { name: 'Chattogram Dampara Stop', timeOffsetMinutes: 330, type: 'both' },
        { name: "Cox's Bazar Kolatoli Terminal", timeOffsetMinutes: 570, type: 'dropping' },
      ],
    },
    {
      id: 'rt_dhk_ctg',
      originCityId: 'city_dhk',
      originName: 'Dhaka',
      destinationCityId: 'city_ctg',
      destinationName: 'Chattogram',
      distanceKm: 248,
      estimatedDuration: '5h 30m',
      baseFare: 1100,
      isActive: true,
      stops: [
        { name: 'Fakirapool Counter', timeOffsetMinutes: 0, type: 'boarding' },
        { name: 'Rajarbagh Hub', timeOffsetMinutes: 15, type: 'boarding' },
        { name: 'Dampara Counter', timeOffsetMinutes: 320, type: 'dropping' },
        { name: 'GEC Circle Bay', timeOffsetMinutes: 330, type: 'dropping' },
      ],
    },
    {
      id: 'rt_dhk_syl',
      originCityId: 'city_dhk',
      originName: 'Dhaka',
      destinationCityId: 'city_syl',
      destinationName: 'Sylhet',
      distanceKm: 240,
      estimatedDuration: '5h 45m',
      baseFare: 950,
      isActive: true,
      stops: [
        { name: 'Mohakhali Terminal', timeOffsetMinutes: 0, type: 'boarding' },
        { name: 'Uttara House Building', timeOffsetMinutes: 30, type: 'boarding' },
        { name: 'Humayun Rashid Chattar', timeOffsetMinutes: 330, type: 'dropping' },
        { name: 'Kadamtali Central Stand', timeOffsetMinutes: 345, type: 'dropping' },
      ],
    },
    {
      id: 'rt_dhk_raj',
      originCityId: 'city_dhk',
      originName: 'Dhaka',
      destinationCityId: 'city_raj',
      destinationName: 'Rajshahi',
      distanceKm: 256,
      estimatedDuration: '6h 00m',
      baseFare: 850,
      isActive: true,
      stops: [
        { name: 'Kalyanpur Counter', timeOffsetMinutes: 0, type: 'boarding' },
        { name: 'Gabtoli Coach Bay', timeOffsetMinutes: 20, type: 'boarding' },
        { name: 'Shiroil Bus Stand', timeOffsetMinutes: 360, type: 'dropping' },
      ],
    },
    {
      id: 'rt_dhk_khl',
      originCityId: 'city_dhk',
      originName: 'Dhaka',
      destinationCityId: 'city_khl',
      destinationName: 'Khulna',
      distanceKm: 215,
      estimatedDuration: '4h 45m',
      baseFare: 900,
      isActive: true,
      stops: [
        { name: 'Kalyanpur Counter', timeOffsetMinutes: 0, type: 'boarding' },
        { name: 'Mawa Padma Bridge Express', timeOffsetMinutes: 45, type: 'boarding' },
        { name: 'Royal More Counter', timeOffsetMinutes: 285, type: 'dropping' },
      ],
    },
    {
      id: 'rt_dhk_bar',
      originCityId: 'city_dhk',
      originName: 'Dhaka',
      destinationCityId: 'city_bar',
      destinationName: 'Barishal',
      distanceKm: 170,
      estimatedDuration: '3h 45m',
      baseFare: 750,
      isActive: true,
      stops: [
        { name: 'Sayedabad Terminal', timeOffsetMinutes: 0, type: 'boarding' },
        { name: 'Bhanga Expressway Point', timeOffsetMinutes: 75, type: 'boarding' },
        { name: 'Nathullabad Terminal', timeOffsetMinutes: 225, type: 'dropping' },
      ],
    },
  ];
  routes.forEach((r) => batch.set(doc(db, 'routes', r.id), r));

  const counters: Counter[] = [
    { id: 'cnt_arambagh', cityId: 'city_dhk', cityName: 'Dhaka', name: 'Arambagh Flagship Lounge', address: '82 Inner Circular Rd, Motijheel', phone: '+880 1711-220011', isActive: true },
    { id: 'cnt_kalyanpur', cityId: 'city_dhk', cityName: 'Dhaka', name: 'Kalyanpur Central Hub', address: 'Mirpur Road, Kalyanpur', phone: '+880 1711-220022', isActive: true },
    { id: 'cnt_dampara', cityId: 'city_ctg', cityName: 'Chattogram', name: 'Dampara Coach Terminal', address: '14 CDA Avenue, Dampara', phone: '+880 1711-220033', isActive: true },
    { id: 'cnt_kolatoli', cityId: 'city_cxb', cityName: "Cox's Bazar", name: 'Kolatoli Marine Counter', address: 'Dolphin More, Kolatoli', phone: '+880 1711-220044', isActive: true },
    { id: 'cnt_sylhet', cityId: 'city_syl', cityName: 'Sylhet', name: 'Kadamtali Executive Bay', address: 'South Surma, Sylhet', phone: '+880 1711-220055', isActive: true },
  ];
  counters.forEach((c) => batch.set(doc(db, 'counters', c.id), c));

  const busTypes: BusType[] = [
    { id: 'bt_business', name: 'Scania AC Business (2+1)', code: 'AC-BIZ', layoutType: '2+1', isAc: true, totalSeats: 27, rows: 9, cols: 3, decks: 1 },
    { id: 'bt_sleeper', name: 'Double-Deck AC Sleeper', code: 'AC-SLP', layoutType: 'sleeper', isAc: true, totalSeats: 30, rows: 5, cols: 3, decks: 2 },
    { id: 'bt_ac_eco', name: 'Hyundai AC Economy (2+2)', code: 'AC-ECO', layoutType: '2+2', isAc: true, totalSeats: 40, rows: 10, cols: 4, decks: 1 },
    { id: 'bt_nonac', name: 'Hino AK1J Express (Non-AC)', code: 'NON-AC', layoutType: '2+2', isAc: false, totalSeats: 40, rows: 10, cols: 4, decks: 1 },
  ];
  busTypes.forEach((bt) => batch.set(doc(db, 'bus_types', bt.id), bt));

  const owners: BusOwner[] = [
    {
      id: 'own_desh_flagship',
      userId: adminUid,
      companyUnitName: 'DeshLine Flagship Fleet Division',
      contactName: 'Tariqul Islam Chowdhury',
      phone: '+880 1711-889900',
      email: adminEmail,
      commissionRate: 8,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ];
  owners.forEach((o) => batch.set(doc(db, 'bus_owners', o.id), o));

  const buses: Bus[] = [
    {
      id: 'bus_scania_01',
      ownerId: adminUid,
      ownerName: 'DeshLine Flagship Fleet Division',
      coachNumber: 'DL-101',
      registrationNumber: 'Dhaka-Metro-Ba-15-4821',
      name: 'Scania Marcopolo Business',
      busTypeId: 'bt_business',
      busTypeName: 'Scania AC Business (2+1)',
      layoutType: '2+1',
      isAc: true,
      totalSeats: 27,
      amenities: ['WiFi', 'USB Charging', 'Leg Rest', 'Bottled Water', 'GPS Live'],
      imageUrl: GENERATED_BUS_IMAGES.scaniaBusiness,
      approvalStatus: 'approved',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bus_sleeper_02',
      ownerId: adminUid,
      ownerName: 'DeshLine Flagship Fleet Division',
      coachNumber: 'DL-204',
      registrationNumber: 'Dhaka-Metro-Ba-15-6190',
      name: 'DeshLine Royal Sleeper',
      busTypeId: 'bt_sleeper',
      busTypeName: 'Double-Deck AC Sleeper',
      layoutType: 'sleeper',
      isAc: true,
      totalSeats: 30,
      amenities: ['Lie-Flat Berth', 'Blanket & Pillow', 'Reading Lamp', 'USB-C', 'AC Cabin'],
      imageUrl: GENERATED_BUS_IMAGES.sleeperCoach,
      approvalStatus: 'approved',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bus_hyundai_03',
      ownerId: adminUid,
      ownerName: 'DeshLine Flagship Fleet Division',
      coachNumber: 'DL-308',
      registrationNumber: 'Dhaka-Metro-Ba-14-9032',
      name: 'Hyundai Universe Executive',
      busTypeId: 'bt_ac_eco',
      busTypeName: 'Hyundai AC Economy (2+2)',
      layoutType: '2+2',
      isAc: true,
      totalSeats: 40,
      amenities: ['Climate AC', 'Reclining Seat', 'Reading Light', 'GPS Tracking'],
      imageUrl: GENERATED_BUS_IMAGES.scaniaBusiness,
      approvalStatus: 'approved',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bus_hino_04',
      ownerId: adminUid,
      ownerName: 'DeshLine Flagship Fleet Division',
      coachNumber: 'DL-412',
      registrationNumber: 'Dhaka-Metro-Ba-14-3318',
      name: 'Hino AK1J Express',
      busTypeId: 'bt_nonac',
      busTypeName: 'Hino AK1J Express (Non-AC)',
      layoutType: '2+2',
      isAc: false,
      totalSeats: 40,
      amenities: ['Express Highway', 'Spacious Legroom', 'Luggage Hold'],
      imageUrl: GENERATED_BUS_IMAGES.nonAcExpress,
      approvalStatus: 'approved',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  buses.forEach((b) => batch.set(doc(db, 'buses', b.id), b));

  const coupons: Coupon[] = [
    {
      id: 'cpn_desh15',
      code: 'DESH15',
      title: '15% Off Coastal Express',
      description: 'Valid on Dhaka to Cox\'s Bazar & Chattogram AC coaches',
      discountType: 'percent',
      discountValue: 15,
      minFare: 1000,
      maxDiscount: 350,
      validUntil: addDaysISO(90),
      isActive: true,
    },
    {
      id: 'cpn_padma200',
      code: 'PADMA200',
      title: 'Flat ৳200 Off Southern Routes',
      description: 'Save ৳200 on Khulna & Barishal Padma Bridge expressway trips',
      discountType: 'fixed',
      discountValue: 200,
      minFare: 700,
      maxDiscount: 200,
      validUntil: addDaysISO(60),
      isActive: true,
    },
  ];
  coupons.forEach((cp) => batch.set(doc(db, 'coupons', cp.id), cp));

  const reviews: Review[] = [
    {
      id: 'rev_1',
      bookingId: 'seed_b1',
      tripId: 'seed_t1',
      userId: adminUid,
      passengerName: 'Nusrat Jahan',
      routeLabel: "Dhaka to Cox's Bazar",
      rating: 5,
      comment: 'Took the 22:30 Double-Deck Sleeper from Arambagh. Departed on the dot and arrived at Kolatoli fresh at dawn.',
      status: 'published',
      createdAt: now,
    },
    {
      id: 'rev_2',
      bookingId: 'seed_b2',
      tripId: 'seed_t2',
      userId: adminUid,
      passengerName: 'Mahmudul Hasan',
      routeLabel: 'Dhaka to Chattogram',
      rating: 5,
      comment: 'The 2+1 Scania Business Class legroom and smooth QR check-in made my weekly business commute effortless.',
      status: 'published',
      createdAt: now,
    },
    {
      id: 'rev_3',
      bookingId: 'seed_b3',
      tripId: 'seed_t3',
      userId: adminUid,
      passengerName: 'Farhana Rahman',
      routeLabel: 'Dhaka to Sylhet',
      rating: 4,
      comment: 'Clean cabin, courteous supervisor, and instant PDF e-ticket right after payment.',
      status: 'published',
      createdAt: now,
    },
  ];
  reviews.forEach((rv) => batch.set(doc(db, 'reviews', rv.id), rv));

  await batch.commit();

  // Seed 10 scheduled trips across today + next 2 days with full seat subcollections
  const tripConfigs: Array<{
    id: string;
    bus: Bus;
    route: Route;
    dayOffset: number;
    dep: string;
    arr: string;
    fare: number;
  }> = [
    { id: 'trip_cxb_1', bus: buses[0], route: routes[0], dayOffset: 0, dep: '21:30', arr: '07:00', fare: 1850 },
    { id: 'trip_cxb_2', bus: buses[1], route: routes[0], dayOffset: 0, dep: '22:30', arr: '08:00', fare: 2400 },
    { id: 'trip_cxb_3', bus: buses[1], route: routes[0], dayOffset: 1, dep: '22:00', arr: '07:30', fare: 2400 },
    { id: 'trip_ctg_1', bus: buses[0], route: routes[1], dayOffset: 0, dep: '08:00', arr: '13:30', fare: 1250 },
    { id: 'trip_ctg_2', bus: buses[2], route: routes[1], dayOffset: 1, dep: '14:30', arr: '20:00', fare: 1100 },
    { id: 'trip_syl_1', bus: buses[2], route: routes[2], dayOffset: 0, dep: '09:00', arr: '14:45', fare: 950 },
    { id: 'trip_syl_2', bus: buses[0], route: routes[2], dayOffset: 1, dep: '23:00', arr: '04:45', fare: 1150 },
    { id: 'trip_raj_1', bus: buses[3], route: routes[3], dayOffset: 0, dep: '07:30', arr: '13:30', fare: 680 },
    { id: 'trip_khl_1', bus: buses[2], route: routes[4], dayOffset: 0, dep: '10:00', arr: '14:45', fare: 900 },
    { id: 'trip_bar_1', bus: buses[3], route: routes[5], dayOffset: 1, dep: '08:30', arr: '12:15', fare: 550 },
  ];

  for (const cfg of tripConfigs) {
    const seats = generateSeatTemplate(cfg.bus.layoutType, cfg.bus.totalSeats);
    const trip: Trip = {
      id: cfg.id,
      ownerId: adminUid,
      busId: cfg.bus.id,
      busName: cfg.bus.name,
      busTypeName: cfg.bus.busTypeName,
      isAc: cfg.bus.isAc,
      layoutType: cfg.bus.layoutType,
      busImageUrl: cfg.bus.imageUrl,
      routeId: cfg.route.id,
      originCityId: cfg.route.originCityId,
      originName: cfg.route.originName,
      destinationCityId: cfg.route.destinationCityId,
      destinationName: cfg.route.destinationName,
      journeyDate: addDaysISO(cfg.dayOffset),
      departureTime: cfg.dep,
      arrivalTime: cfg.arr,
      durationLabel: cfg.route.estimatedDuration,
      fare: cfg.fare,
      totalSeats: seats.length,
      availableSeats: seats.length,
      boardingPoints: cfg.route.stops.filter((s) => s.type === 'boarding' || s.type === 'both').map((s) => s.name),
      droppingPoints: cfg.route.stops.filter((s) => s.type === 'dropping' || s.type === 'both').map((s) => s.name),
      status: 'scheduled',
      createdAt: now,
      updatedAt: now,
    };
    const tBatch = writeBatch(db);
    tBatch.set(doc(db, 'trips', cfg.id), trip);
    seats.forEach((s) => {
      tBatch.set(doc(db, 'trips', cfg.id, 'seats', s.seatNumber), { ...s, updatedAt: now });
    });
    await tBatch.commit();
  }

  return true;
}
