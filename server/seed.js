// Demo members (bots) and their rides, so a single tester can try every flow.
// Disable with DEMO_BOTS=0.
import { Users, Rides, Bookings, Reports, uid } from './db.js';
import { FARES, placeStops, rideShape } from './corridors.js';
import { newUser } from './engine.js';

const BOTS = [
  ['u_ravi', 'Ravi Kumar', 34, '#2563EB', 4.8, 126, { ridesGiven: 142, cancellations: 2 }, true, 'Software engineer. Daily commute Sangareddy → HITEC City via ORR. Punctual & calm driver.', { brand: 'Maruti', model: 'Swift Dzire', color: 'White', reg: 'TS 09 EK 4521', type: 'Sedan' }],
  ['u_priya', 'Priya Sharma', 29, '#DB2777', 4.9, 88, { ridesGiven: 95, cancellations: 1 }, true, 'Product designer. Uses the quieter Shankarpally route.', { brand: 'Honda', model: 'City', color: 'Silver', reg: 'TS 08 GH 7712', type: 'Sedan' }],
  ['u_arjun', 'Arjun Reddy', 31, '#7C3AED', 4.6, 54, { ridesGiven: 61, cancellations: 4 }, false, 'Lives in Isnapur, works in Financial District.', { brand: 'Hyundai', model: 'Creta', color: 'Blue', reg: 'TS 07 FB 3390', type: 'SUV' }],
  ['u_sneha', 'Sneha Patel', 27, '#EA580C', 4.7, 40, { ridesGiven: 44, cancellations: 1 }, true, 'Data analyst at Wipro. Starts from Malkapur Chintal every weekday.', { brand: 'Maruti', model: 'Baleno', color: 'Red', reg: 'TS 10 CD 2245', type: 'Hatchback' }],
  ['u_vikram', 'Vikram Rao', 42, '#0891B2', 4.9, 210, { ridesGiven: 230, cancellations: 3 }, true, 'SUV with space for 2 more. Leaves Sangareddy at 8 AM sharp.', { brand: 'Toyota', model: 'Innova Crysta', color: 'Grey', reg: 'TS 09 FA 9001', type: 'SUV' }],
  ['u_ananya', 'Ananya Iyer', 26, '#16A34A', 4.5, 18, { ridesGiven: 20, cancellations: 2 }, false, 'EV driver 🌱 Takes the Shankarpally road to Financial District.', { brand: 'Tata', model: 'Nexon EV', color: 'Teal', reg: 'TS 11 EV 0042', type: 'EV' }],
  ['u_kiran', 'Kiran Rao', 24, '#CA8A04', 4.7, 31, { ridesTaken: 48, cancellations: 1 }, true, 'Student at JNTU. Always on time.', null],
  ['u_meera', 'Meera Nair', 30, '#9333EA', 4.8, 22, { ridesTaken: 35, cancellations: 0 }, true, 'HR manager. Quiet traveller.', null],
  ['u_rahul', 'Rahul Verma', 28, '#DC2626', 4.2, 12, { ridesTaken: 15, cancellations: 3 }, false, 'Sales executive.', null],
];

function ensureBots() {
  for (const [id, name, age, color, avg, count, stats, trusted, bio, vehicle] of BOTS) {
    if (Users.get(id)) continue;
    Users.insert({
      ...newUser('bot:' + id), id, isBot: true, name, age, color, bio, vehicle, trusted, stats: { ridesGiven: 0, ridesTaken: 0, ...stats },
      verification: id === 'u_ananya' || !vehicle ? (vehicle ? 'pending' : 'verified') : 'verified', ratingSeed: { avg, count }, joined: 'Mar 2024',
    });
  }
  if (!Reports.count()) {
    Reports.insert({ id: uid('rp_'), byId: 'u_meera', targetId: 'u_rahul', type: 'No-show', details: 'Did not turn up at the pickup point and stopped replying.', status: 'open', at: Date.now() - 864e5 });
  }
}

const MIN = 60000;
const dayAt = (off, h, m) => { const d = new Date(); d.setDate(d.getDate() + off); d.setHours(h, m, 0, 0); return d.getTime(); };
// Next occurrence of a clock time that is still at least 20 minutes away.
const next = (h, m) => (dayAt(0, h, m) > Date.now() + 20 * MIN ? dayAt(0, h, m) : dayAt(1, h, m));
const soon = (mins) => Math.ceil((Date.now() + mins * MIN) / (5 * MIN)) * 5 * MIN;

// [driver, corridor, origin, typed stops (start … destination), time, seats, riders]
const TEMPLATES = () => [
  ['u_ravi', 'orr', 'sangareddy', ['Sangareddy New Bus Stand', 'Pothireddypally', 'Kandi (IIT)', 'Rudraram', 'Isnapur X Road', 'Patancheru ORR', 'Wipro Circle', 'HITEC City'], soon(60), 3, [['u_rahul', 0, 'sangareddy']]],
  ['u_sneha', 'orr', 'sangareddy', ['Malkapur Chintal', 'SRD X Road', 'ORR', 'ICICI', 'Wipro Circle'], soon(45), 3, []],
  ['u_priya', 'shankarpally', 'sangareddy', ['Sangareddy X Road', 'Shankarpally', 'Mokila', 'Financial District', 'HITEC City (Cyber Towers)'], soon(90), 3, []],
  ['u_arjun', 'orr', 'isnapur', ['Isnapur', 'Muthangi', 'Patancheru ORR', 'Nanakramguda', 'Financial District'], soon(120), 3, []],
  ['u_vikram', 'orr', 'sangareddy', ['Sangareddy Old Bus Stand', 'Kandi', 'Isnapur', 'ORR', 'ICICI Towers', 'HITEC City'], next(8, 0), 2, [['u_kiran', 0, 'sangareddy'], ['u_meera', 2, 'isnapur']]],
  ['u_ananya', 'shankarpally', 'sangareddy', ['Sangareddy', 'Shankarpally', 'Kokapet', 'Wipro Circle'], next(8, 30), 3, []],
  ['u_ravi', 'orr', 'sangareddy', ['Sangareddy New Bus Stand', 'Kandi (IIT)', 'Isnapur X Road', 'ORR', 'Wipro Circle', 'HITEC City'], next(9, 15), 3, []],
  ['u_arjun', 'orr', 'isnapur', ['Isnapur X Road', 'Patancheru', 'ORR', 'Financial District', 'Gachibowli', 'HITEC City'], next(9, 0), 4, []],
];

/** Keep a fresh set of upcoming demo rides on the fixed corridors. */
export async function refreshDemoRides() {
  ensureBots();
  const upcoming = Rides.where('status = \'scheduled\' AND time > ?', Date.now() + 20 * MIN)
    .filter((r) => r.corridor && Users.get(r.driverId)?.isBot && !r.demo);
  if (upcoming.length >= 5) return;
  for (const [driverId, corridor, origin, names, time, seats, riders] of TEMPLATES()) {
    const stops = placeStops(corridor, names);
    const ride = Rides.insert({
      id: uid('r_'), driverId, corridor, origin, stops, ...rideShape(corridor, stops),
      time, flex: 15, seats, price: FARES[origin], prefs: [], recurring: 'none', community: null, notes: '', status: 'scheduled',
      posKm: 0, delayMin: 0, vehicle: Users.get(driverId).vehicle, createdAt: Date.now(),
    });
    for (const [pid, pickupIdx, o] of riders) {
      Bookings.insert({ id: uid('b_'), rideId: ride.id, passengerId: pid, seats: 1, pickupIdx, dropIdx: names.length - 1, origin: o, status: 'confirmed', amount: FARES[o], paid: false, createdAt: Date.now() });
    }
  }
  console.log('[seed] demo rides refreshed');
}
