// Core business logic. Every mutation persists to SQLite, writes notifications,
// and pushes realtime updates to the affected users.
import { Users, Rides, Bookings, Messages, Notifications, Reports, Payments, Alerts, Audit, IdCards, HelpRequests, uid } from './db.js';
import { send, sync } from './realtime.js';
import { project, pointAt, etaMin } from './geo.js';
import { CORRIDORS, ORIGINS, FARES, buildStops, servesOrigin, suggestPickup, suggestDrop, checkBoarding, rideShape, geomOf } from './corridors.js';
import { sendSms } from './sms.js';

// Demo members are on by default in development and off in production (override with DEMO_BOTS=1/0).
export const DEMO = process.env.DEMO_BOTS ? process.env.DEMO_BOTS !== '0' : process.env.NODE_ENV !== 'production';
const MIN = 60000;
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'Not allowed') => new HttpError(403, m);
const notFound = (m = 'Not found') => new HttpError(404, m);
const first = (n = '') => n.split(' ')[0];
const later = (ms, fn) => setTimeout(() => { try { fn(); } catch (e) { console.error('[job]', e); } }, ms);
const isBot = (id) => !!Users.get(id)?.isBot;
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: process.env.TZ_NAME || 'Asia/Kolkata' });
export const ACTIVE = ['requested', 'confirmed', 'picked'];
export const BOOKED = ['confirmed', 'picked', 'completed'];

/* ---------------- users ---------------- */
export function newUser(email) {
  const colors = ['#0B8A6B', '#2563EB', '#DB2777', '#7C3AED', '#EA580C', '#0891B2', '#CA8A04'];
  return {
    id: uid('u_'), email, phone: '', isBot: false, isAdmin: false, name: '', age: '', gender: '', photo: null, bio: '',
    role: 'taker', color: colors[Math.floor(Math.random() * colors.length)], vehicle: null,
    work: { status: 'none' }, ratingSeed: { avg: 0, count: 0 }, createdAt: Date.now(), joined: new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
    lastPostAt: null, suspended: false,
    data: { favorites: [], blocked: [], emergency: [], savedPlaces: [], savedRoutes: [], recentSearches: [], commute: null, holidayMode: false, communities: [], subscriptions: [] },
    prefs: { notif: { bookings: true, chat: true, matches: true, reminders: true, favorites: true }, shareLocation: true, allowCalls: true },
  };
}

export function userStats(id) {
  const asP = Bookings.where('"passengerId" = ?', id);
  const asD = Rides.where('"driverId" = ?', id);
  const ridesTaken = asP.filter((b) => b.status === 'completed').length;
  const ridesGiven = asD.filter((r) => r.status === 'completed').length;
  const cancellations = asP.filter((b) => b.status === 'cancelled' && b.cancelledBy === id).length + asD.filter((r) => r.status === 'cancelled' && !r.removedByAdmin).length;
  const completed = ridesTaken + ridesGiven;
  return { ridesTaken, ridesGiven, cancellations, completed, cancelRate: completed + cancellations ? cancellations / (completed + cancellations) : 0 };
}

export function publicUser(u) {
  if (!u) return null;
  const st = u.isBot ? { ...u.stats, completed: (u.stats.ridesGiven || 0) + (u.stats.ridesTaken || 0) } : userStats(u.id);
  return {
    id: u.id, name: u.name || 'New member', age: u.age, color: u.color, photo: u.photo, bio: u.bio, joined: u.joined,
    verified: u.work?.status === 'verified',
    trusted: u.isBot ? !!u.trusted : st.completed >= 5 && st.cancelRate < 0.1,
    vehicle: u.vehicle ? { brand: u.vehicle.brand, model: u.vehicle.model, color: u.vehicle.color, type: u.vehicle.type } : null,
    ridesGiven: st.ridesGiven, ridesTaken: st.ridesTaken, cancellations: st.cancellations, completed: st.completed, cancelRate: st.cancelRate,
    suspended: !!u.suspended, demo: !!u.isBot,
    workVerified: u.work?.status === 'verified', company: u.work?.status === 'verified' ? u.work.company : null,
  };
}

/* ---------------- rides ---------------- */
export function seatsLeft(ride) {
  const taken = Bookings.where('"rideId" = ? AND status IN (\'confirmed\',\'picked\',\'completed\')', ride.id).reduce((a, b) => a + b.seats, 0);
  return Math.max(0, ride.seats - taken);
}
export const isExpired = (ride) => ride.status === 'scheduled' && ride.time + (ride.flex + 30) * MIN < Date.now();
const maskReg = (reg = '') => reg.slice(0, 5) + ' •• ••' + reg.slice(-2);

export function rideOut(ride, viewerId) {
  if (!ride) return null;
  const { _cum, ...r } = ride;
  const mine = ride.driverId === viewerId;
  const myB = Bookings.where('"rideId" = ? AND "passengerId" = ?', ride.id, viewerId);
  const live = mine || myB.some((b) => ['confirmed', 'picked'].includes(b.status));
  const revealed = live || myB.some((b) => b.status === 'completed');
  return {
    ...r,
    status: isExpired(ride) ? 'expired' : ride.status,
    seatsLeft: seatsLeft(ride),
    waitlistCount: Bookings.count('"rideId" = ? AND status = \'waitlist\'', ride.id),
    live: live && ride.status === 'started' ? ride.live : null,
    vehicle: ride.vehicle ? { ...ride.vehicle, reg: revealed ? ride.vehicle.reg : maskReg(ride.vehicle.reg) } : null,
  };
}
const saveRide = (r) => { delete r._cum; return Rides.save(r); };
const getRide = (id) => Rides.get(id) || (() => { throw notFound('Ride not found'); })();
const getBooking = (id) => Bookings.get(id) || (() => { throw notFound('Booking not found'); })();
const members = (ride, statuses = ['confirmed', 'picked']) => Bookings.where('"rideId" = ?', ride.id).filter((b) => statuses.includes(b.status));

/* ---------------- notifications ---------------- */
const CAT = { booking: 'bookings', track: 'bookings', done: 'bookings', chat: 'chat', match: 'matches', reminder: 'reminders', fav: 'favorites', system: 'bookings', help: 'bookings' };
export function notify(userId, n) {
  const u = Users.get(userId);
  if (!u || u.isBot) return;
  const row = Notifications.insert({ id: uid('n_'), userId, at: Date.now(), read: false, ...n });
  send(userId, { type: 'notification', n: row, toast: u.prefs?.notif?.[CAT[n.type]] !== false });
  sync(userId);
}
function chat(rideId, fromId, text, system = false) {
  Messages.insert({ id: uid('m_'), rideId, from: fromId, text: String(text).slice(0, 500), system, at: Date.now() });
}
function audit(adminId, action, target) {
  Audit.insert({ id: uid('a_'), at: Date.now(), adminId, action, target });
}
function pushLive(ride) {
  const msg = { type: 'live', rideId: ride.id, live: ride.live, status: ride.status };
  send(ride.driverId, msg);
  members(ride).forEach((b) => send(b.passengerId, msg));
}
const touchRide = (ride) => sync(ride.driverId, Bookings.where('"rideId" = ?', ride.id).map((b) => b.passengerId));

/* ---------------- posting ---------------- */
const cleanText = (s, max = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function postRide(userId, b) {
  const user = Users.get(userId);
  requireWorkDetails(user);
  if (!user.vehicle) throw bad('Add your vehicle before offering a ride');
  const start = cleanText(b.start), dest = cleanText(b.destination);
  const points = (Array.isArray(b.points) ? b.points : []).map((p) => cleanText(p, 40)).filter(Boolean).slice(0, 10);
  if (start.length < 2) throw bad('Type your starting point');
  if (dest.length < 2) throw bad('Type your destination');
  const corridor = CORRIDORS[b.corridor] ? b.corridor : 'orr';
  const origin = b.origin === 'isnapur' ? 'isnapur' : 'sangareddy';
  if (!CORRIDORS[corridor].serves.includes(origin)) throw bad('Isnapur rides go via the ORR route');
  const time = Number(b.time);
  if (!(time > Date.now() - 5 * MIN) || time > Date.now() + 30 * 864e5) throw bad('Pick a departure time within the next 30 days');
  const seats = Math.round(b.seats);
  if (!(seats >= 1 && seats <= 7)) throw bad('Seats must be between 1 and 7');

  // Spam & duplicate control: one active ride per 90-minute window.
  const conflict = Rides.where('"driverId" = ? AND status = \'scheduled\'', userId).find((r) => !isExpired(r) && Math.abs(r.time - time) < 90 * MIN);
  if (conflict) {
    const same = conflict.stops[0].name.toLowerCase() === start.toLowerCase() && conflict.stops.at(-1).name.toLowerCase() === dest.toLowerCase();
    const e = bad(same
      ? `This looks like a duplicate of your ${fmtTime(conflict.time)} ride on the same route. Edit that ride instead.`
      : `You already have a ride at ${fmtTime(conflict.time)}. To avoid spam, rides must be at least 1 hr 30 min apart.`);
    e.conflictId = conflict.id;
    throw e;
  }

  const stops = buildStops(corridor, [start, ...points, dest]);
  const ride = saveRide({
    id: uid('r_'), driverId: userId, corridor, direction: CORRIDORS[corridor].direction, origin, stops, ...rideShape(corridor, stops), fixedV: 3,
    time, flex: 15, seats, price: FARES[origin], prefs: [], recurring: 'none', community: null, notes: cleanText(b.notes, 300),
    status: 'scheduled', posKm: 0, delayMin: 0, vehicle: user.vehicle, createdAt: Date.now(),
  });
  user.lastPostAt = Date.now();
  Users.save(user);
  notifyMatches(ride);
  if (DEMO) {
    later(5000, () => botRequest(ride.id, 'u_kiran', origin));
    if (seats > 1) later(12000, () => botRequest(ride.id, 'u_meera', 'isnapur'));
  }
  sync(userId);
  return rideOut(ride, userId);
}

/** Ride alerts and favourite-driver notifications for a new ride. */
function notifyMatches(ride) {
  const driver = Users.get(ride.driverId);
  const done = new Set([ride.driverId]);
  const line = `${ride.stops[0].name} → ${ride.stops.at(-1).name} · ${fmtTime(ride.time)}`;
  for (const a of Alerts.where()) {
    if (done.has(a.userId)) continue;
    const u = Users.get(a.userId);
    if (!u || u.data.holidayMode || u.data.blocked.includes(ride.driverId)) continue;
    const c = CORRIDORS[ride.corridor];
    if (servesOrigin(ride, a.origin) && (a.direction || 'work') === c.direction && (!a.via || a.via === 'any' || a.via === c.base)) {
      done.add(a.userId);
      notify(a.userId, { type: 'match', title: c.direction === 'home' ? `New ride home to ${ORIGINS[a.origin].name} 🔔` : `New ride from ${ORIGINS[a.origin].name} 🔔`, body: `${first(driver.name)} · ${line}`, rideId: ride.id });
    }
  }
  for (const u of Users.where('"isBot" = 0')) {
    if (done.has(u.id) || u.data.holidayMode || !u.data.favorites.includes(ride.driverId)) continue;
    notify(u.id, { type: 'fav', title: `${first(driver.name)} ❤️ posted a new ride`, body: line, rideId: ride.id });
  }
}

function ownRide(userId, rideId) {
  const ride = getRide(rideId);
  if (ride.driverId !== userId) throw forbidden('Only the Ride Giver can do that');
  return ride;
}

export function editRide(userId, rideId, p) {
  const ride = ownRide(userId, rideId);
  if (ride.status !== 'scheduled') throw bad('Only scheduled rides can be edited');
  const booked = ride.seats - seatsLeft(ride);
  if (p.time != null) { if (!(+p.time > Date.now())) throw bad('Pick a future time'); ride.time = +p.time; ride.reminded = false; }
  if (p.seats != null) { if (p.seats < Math.max(1, booked) || p.seats > 7) throw bad(`At least ${booked} seats are already booked`); ride.seats = Math.round(p.seats); }
  if (p.notes != null) ride.notes = String(p.notes).slice(0, 300);
  saveRide(ride);
  chat(ride.id, userId, `ℹ️ Ride updated: departs ${fmtTime(ride.time)}${p.notes ? ' · ' + ride.notes : ''}`, true);
  const pax = members(ride, ['confirmed']);
  pax.forEach((b) => notify(b.passengerId, { type: 'booking', title: 'Ride details changed', body: `${first(Users.get(userId).name)}'s ride now departs at ${fmtTime(ride.time)}`, rideId }));
  notify(userId, { type: 'system', title: 'Ride updated', body: pax.length ? `${pax.length} confirmed passenger(s) were notified` : 'Changes saved', rideId });
  touchRide(ride);
}

export function cancelRide(userId, rideId, reason) {
  const ride = ownRide(userId, rideId);
  if (!['scheduled', 'started'].includes(ride.status)) throw bad('This ride cannot be cancelled');
  closeHelp(rideId);
  ride.status = 'cancelled';
  ride.cancelReason = String(reason || 'Other').slice(0, 100);
  saveRide(ride);
  for (const b of Bookings.where('"rideId" = ?', rideId).filter((x) => [...ACTIVE, 'waitlist'].includes(x.status))) {
    b.status = 'cancelled'; b.cancelledBy = 'driver'; b.reason = ride.cancelReason;
    if (b.paid) refund(b, 1);
    Bookings.save(b);
    notify(b.passengerId, { type: 'booking', title: 'Your ride was cancelled', body: `${first(Users.get(userId).name)}: ${ride.cancelReason}. Any payment will be fully refunded.`, rideId });
  }
  notify(userId, { type: 'booking', title: 'Ride cancelled', body: 'All passengers have been notified and refunded if they paid.', rideId });
  touchRide(ride);
}

export function startRide(userId, rideId, simulate) {
  const ride = ownRide(userId, rideId);
  if (ride.status !== 'scheduled') throw bad('Ride already started or finished');
  beginRide(ride, !!simulate);
}
function beginRide(ride, simulate, approachKm = 0) {
  ride.status = 'started';
  ride.startedAt = Date.now();
  ride.posKm = (ride.startKm || 0) - approachKm;
  ride.simulate = simulate;
  ride.arrived = false;
  ride.live = { ...pointAt(geomOf(ride), ride.posKm), posKm: ride.posKm, at: Date.now() };
  saveRide(ride);
  const driver = Users.get(ride.driverId);
  chat(ride.id, ride.driverId, '🚗 I have started the ride. Track me live in the app.', true);
  const pax = members(ride, ['confirmed']);
  pax.forEach((b) => notify(b.passengerId, { type: 'track', title: `${first(driver.name)} has started the ride 🚗`, body: 'Tap to see live location', rideId: ride.id }));
  notify(ride.driverId, { type: 'track', title: 'Ride started', body: `${pax.length} passenger(s) notified · live location is ON`, rideId: ride.id });
  touchRide(ride);
  pushLive(ride);
}

/** Demo only: make a bot driver start their ride now. */
export function demoStart(userId, rideId) {
  if (!DEMO) throw forbidden();
  const ride = getRide(rideId);
  if (!isBot(ride.driverId)) throw bad('Only demo Ride Givers can be started remotely');
  if (!members(ride, ['confirmed']).some((b) => b.passengerId === userId)) throw bad('You need a confirmed seat');
  if (ride.status !== 'scheduled') throw bad('Ride already started');
  beginRide(ride, true, 2.2);
}

export function endRide(userId, rideId) {
  const ride = ownRide(userId, rideId);
  if (ride.status !== 'started') throw bad('Ride is not in progress');
  completeRide(ride);
}

export function sendDelay(userId, rideId, mins) {
  const ride = ownRide(userId, rideId);
  mins = [5, 10, 15].includes(+mins) ? +mins : 10;
  ride.delayMin = (ride.delayMin || 0) + mins;
  saveRide(ride);
  chat(ride.id, userId, `⏱ Running about ${mins} min late. Sorry for the wait!`, true);
  members(ride).forEach((b) => notify(b.passengerId, { type: 'track', title: `${first(Users.get(userId).name)} is running ${mins} min late`, body: 'Your pickup time has been updated', rideId }));
  send(userId, { type: 'notification', toast: true, n: { title: 'Passengers notified', body: `Running ${mins} min late` } });
  touchRide(ride);
}

/** Driver GPS update from the phone. */
export function updateLocation(userId, rideId, lat, lng) {
  const ride = ownRide(userId, rideId);
  if (ride.status !== 'started' || ride.simulate) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const p = project({ lat, lng }, geomOf(ride));
  const target = p.dist < 0.5 ? Math.max(ride.posKm - 0.2, p.pos) : ride.posKm;
  processRide(ride, target, false, { lat, lng });
}

const SIM_SPEED = Number(process.env.SIM_SPEED_KM || 0.22); // km per second while simulating

function processRide(ride, target, simulated, gps) {
  const driver = Users.get(ride.driverId);
  const humanDriver = !driver.isBot;
  let hold = false;
  // Real GPS: evaluate pickups/drops at the new position. Simulation moves after
  // the checks so the car can wait at a pickup point.
  if (!simulated) ride.posKm = target;
  for (const b of members(ride)) {
    const pPos = ride.stops[b.pickupIdx].pos, dPos = ride.stops[b.dropIdx].pos;
    const pax = Users.get(b.passengerId);
    if (b.status === 'confirmed') {
      const gap = pPos - ride.posKm;
      if (!b.nearNotified && gap <= 1.5 && gap > 0.15) {
        b.nearNotified = true;
        notify(b.passengerId, { type: 'track', title: `${first(driver.name)} is ~${etaMin(ride, gap)} min away`, body: `Please be ready at ${ride.stops[b.pickupIdx].name}`, rideId: ride.id });
      }
      if (gap <= 0.15) {
        if (pax.isBot && driver.isBot) { b.status = 'picked'; b.pickedAt = Date.now(); Bookings.save(b); continue; }
        if (!b.arrivedAt) {
          b.arrivedAt = Date.now();
          notify(b.passengerId, { type: 'track', title: `${first(driver.name)} has arrived at ${ride.stops[b.pickupIdx].name} 📍`, body: `Look for the ${ride.vehicle.color} ${ride.vehicle.model} · ${ride.vehicle.reg}`, rideId: ride.id });
          notify(ride.driverId, { type: 'track', title: `You've reached ${first(pax.name)}'s pickup`, body: 'Tap “Picked up” once they board', rideId: ride.id });
        }
        if (driver.isBot && Date.now() - b.arrivedAt > 15000) {
          b.status = 'picked'; b.pickedAt = Date.now();
          notify(b.passengerId, { type: 'track', title: `${first(driver.name)} marked you as picked up`, body: 'Enjoy your ride!', rideId: ride.id });
        } else if (simulated) hold = true;
        Bookings.save(b);
      } else Bookings.save(b);
    } else if (ride.posKm >= dPos - 0.1) {
      b.status = 'completed';
      b.completedAt = Date.now();
      Bookings.save(b);
      notify(b.passengerId, { type: 'done', title: `You've reached ${ride.stops[b.dropIdx].name} 🎉`, body: 'Thanks for sharing the ride!', rideId: ride.id });
      notify(ride.driverId, { type: 'done', title: `Dropped ${first(pax.name)} at ${ride.stops[b.dropIdx].name}`, rideId: ride.id });
      touchRide(ride);
    }
  }
  if (simulated && !hold) ride.posKm = Math.min(ride.distanceKm, target);
  ride.live = { ...(gps || pointAt(geomOf(ride), ride.posKm)), posKm: ride.posKm, at: Date.now() };
  if (humanDriver && ride.posKm >= ride.distanceKm - 0.4 && !ride.arrived) {
    ride.arrived = true;
    notify(ride.driverId, { type: 'track', title: 'You are near the destination', body: 'Slide to end the ride when everyone is dropped', rideId: ride.id });
  }
  saveRide(ride);
  pushLive(ride);
  if (!humanDriver) {
    const humansActive = members(ride).some((b) => !isBot(b.passengerId));
    if (!humansActive || ride.posKm >= ride.distanceKm) completeRide(ride);
  }
}

function nextOccurrence(ts, rec) {
  const d = new Date(ts);
  do d.setDate(d.getDate() + (rec === 'weekly' ? 7 : 1));
  while (rec === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6));
  return d.getTime();
}

function closeHelp(rideId) {
  HelpRequests.where('"rideId" = ? AND status = \'open\'', rideId).forEach((h) => { h.status = 'closed'; HelpRequests.save(h); });
}

function completeRide(ride) {
  closeHelp(ride.id);
  ride.status = 'completed';
  ride.completedAt = Date.now();
  ride.arrived = true;
  ride.live = null;
  saveRide(ride);
  for (const b of Bookings.where('"rideId" = ?', ride.id)) {
    if (b.status === 'picked') { b.status = 'completed'; b.completedAt = Date.now(); notify(b.passengerId, { type: 'done', title: 'Ride completed 🎉', body: 'Thanks for riding with SRDPool', rideId: ride.id }); }
    else if (b.status === 'confirmed') b.status = 'noshow';
    else if (['requested', 'waitlist'].includes(b.status)) b.status = 'expired';
    Bookings.save(b);
  }
  if (!isBot(ride.driverId)) {
    notify(ride.driverId, { type: 'done', title: 'Ride completed 🎉', body: 'Live location sharing has stopped.', rideId: ride.id });
    if (ride.recurring !== 'none') {
      const { id, startedAt, completedAt, live, ratedIds, arrived, reminded, ...rest } = ride;
      const next = saveRide({ ...rest, id: uid('r_'), time: nextOccurrence(ride.time, ride.recurring), status: 'scheduled', posKm: 0, delayMin: 0, createdAt: Date.now() });
      autoSubscribe(ride, next);
    }
  }
  touchRide(ride);
  pushLive(ride);
}

/** Passengers subscribed to a recurring ride get a seat request on the next trip. */
function autoSubscribe(prev, next) {
  for (const u of Users.where('"isBot" = 0').filter((u) => u.data.subscriptions.includes(prev.id))) {
    const old = Bookings.where('"rideId" = ? AND "passengerId" = ?', prev.id, u.id)[0];
    u.data.subscriptions = u.data.subscriptions.filter((x) => x !== prev.id).concat(next.id);
    Users.save(u);
    if (old) {
      Bookings.insert({ id: uid('b_'), rideId: next.id, passengerId: u.id, seats: old.seats, pickupIdx: old.pickupIdx, dropIdx: old.dropIdx, status: 'requested', amount: next.price * old.seats, paid: false, createdAt: Date.now(), note: 'Recurring subscription' });
      notify(next.driverId, { type: 'booking', title: `${first(u.name)} requested your next recurring ride`, rideId: next.id });
      notify(u.id, { type: 'booking', title: 'Seat requested for your next recurring ride', body: fmtTime(next.time), rideId: next.id });
    }
  }
}

/* ---------------- booking (passenger) ---------------- */
export function book(userId, rideId, { pickupIdx, dropIdx, seats = 1, note = '', origin = 'sangareddy' }) {
  const ride = getRide(rideId);
  const user = Users.get(userId);
  const driver = Users.get(ride.driverId);
  if (!user.isBot) requireWorkDetails(user);
  if (ride.driverId === userId) throw bad("You can't book your own ride");
  if (ride.status !== 'scheduled' || isExpired(ride)) throw bad('This ride is no longer available');
  if (driver.suspended || user.data.blocked.includes(ride.driverId) || driver.data?.blocked?.includes(userId)) throw bad('This ride is not available');
  pickupIdx = Math.round(pickupIdx); dropIdx = Math.round(dropIdx); seats = Math.round(seats);
  if (!(pickupIdx >= 0 && dropIdx > pickupIdx && dropIdx < ride.stops.length)) throw bad('Invalid pickup or drop point');
  // Ride Takers board and get down only at the fixed points; the fare follows the home-side point.
  const chk = checkBoarding(ride, pickupIdx, dropIdx);
  if (chk.error) throw bad(chk.error);
  origin = chk.origin;
  if (!(seats >= 1 && seats <= 4)) throw bad('Book between 1 and 4 seats');
  if (Bookings.where('"rideId" = ? AND "passengerId" = ?', rideId, userId).some((b) => ACTIVE.includes(b.status))) throw bad('You already have a booking on this ride');
  if (seatsLeft(ride) < seats) throw bad('Not enough seats left — join the waiting list instead');
  Bookings.where('"rideId" = ? AND "passengerId" = ? AND status = \'waitlist\'', rideId, userId).forEach((w) => Bookings.remove(w.id));
  const b = Bookings.insert({ id: uid('b_'), rideId, passengerId: userId, seats, pickupIdx, dropIdx, note: String(note).slice(0, 200), status: 'requested', origin, amount: FARES[origin] * seats, paid: false, createdAt: Date.now() });
  notify(userId, { type: 'booking', title: 'Request sent', body: `Waiting for ${first(driver.name)} to accept`, rideId });
  notify(ride.driverId, { type: 'booking', title: `${first(user.name)} wants to join your ride`, body: `Pickup at ${ride.stops[pickupIdx].name} · ${seats} seat${seats > 1 ? 's' : ''}`, rideId });
  if (driver.isBot) later(3500, () => respond(ride.driverId, b.id, true));
  touchRide(ride);
  return b;
}

export function respond(driverId, bookingId, accept) {
  const b = getBooking(bookingId);
  const ride = getRide(b.rideId);
  if (ride.driverId !== driverId) throw forbidden();
  if (b.status !== 'requested') return;
  const dn = first(Users.get(driverId).name), pn = first(Users.get(b.passengerId).name);
  if (accept && (ride.status !== 'scheduled' || seatsLeft(ride) < b.seats)) {
    if (isBot(driverId)) accept = false; else throw bad('No seats left — increase seats or decline');
  }
  b.status = accept ? 'confirmed' : 'rejected';
  if (accept) b.confirmedAt = Date.now();
  Bookings.save(b);
  if (accept) {
    notify(b.passengerId, { type: 'booking', title: `${dn} accepted your request 🎉`, body: `Seat confirmed · ${fmtTime(ride.time)} at ${ride.stops[b.pickupIdx].name}`, rideId: ride.id });
    if (isBot(driverId)) chat(ride.id, driverId, `Hi ${pn}! Your seat is confirmed. ${ride.notes || 'See you at the pickup point.'}`);
    if (isBot(b.passengerId)) chat(ride.id, b.passengerId, `Thanks for accepting! I'll be at ${ride.stops[b.pickupIdx].name} on time.`);
  } else {
    notify(b.passengerId, { type: 'booking', title: 'Request not accepted', body: 'Try another ride or join the waiting list.', rideId: ride.id });
  }
  touchRide(ride);
}

export function waitlist(userId, rideId, join, { pickupIdx = 0, dropIdx, seats = 1, origin = 'sangareddy' } = {}) {
  const ride = getRide(rideId);
  const existing = Bookings.where('"rideId" = ? AND "passengerId" = ? AND status = \'waitlist\'', rideId, userId);
  if (!join) { existing.forEach((w) => Bookings.remove(w.id)); return sync(userId); }
  if (existing.length) return;
  if (ride.driverId === userId || ride.status !== 'scheduled') throw bad('Cannot join this waiting list');
  const chk = dropIdx != null ? checkBoarding(ride, pickupIdx, dropIdx) : {};
  if (chk.error) throw bad(chk.error);
  if (chk.origin) origin = chk.origin;
  Bookings.insert({ id: uid('b_'), rideId, passengerId: userId, seats, pickupIdx, dropIdx: dropIdx ?? ride.stops.length - 1, status: 'waitlist', origin: FARES[origin] ? origin : 'sangareddy', amount: (FARES[origin] || FARES.sangareddy) * seats, paid: false, createdAt: Date.now() });
  notify(userId, { type: 'booking', title: "You're on the waiting list", body: "We'll notify you the moment a seat opens up", rideId });
  if (DEMO) later(10000, () => {
    const other = members(getRide(rideId), ['confirmed']).find((b) => isBot(b.passengerId));
    if (other) cancelBooking(other.passengerId, other.id, 'Plans changed');
  });
}

function seatFreed(ride) {
  if (!seatsLeft(ride)) return;
  Bookings.where('"rideId" = ? AND status = \'waitlist\'', ride.id).forEach((w) =>
    notify(w.passengerId, { type: 'booking', title: 'A seat just opened up! 🪑', body: `On ${first(Users.get(ride.driverId).name)}'s ride ${ride.stops[0].name} → ${ride.stops.at(-1).name}. Book it now.`, rideId: ride.id }));
}

function refund(b, share) {
  const amount = Math.round(b.amount * share);
  if (amount) Payments.insert({ id: uid('p_'), userId: b.passengerId, bookingId: b.id, amount: -amount, method: 'UPI refund', at: Date.now(), status: 'refund initiated', ref: 'RF' + Date.now().toString().slice(-10) });
}

export function cancelBooking(userId, bookingId, reason) {
  const b = getBooking(bookingId);
  if (b.passengerId !== userId) throw forbidden();
  if (!ACTIVE.includes(b.status) || b.status === 'picked') throw bad('This booking cannot be cancelled');
  const ride = getRide(b.rideId);
  const wasConfirmed = b.status === 'confirmed';
  b.status = 'cancelled'; b.cancelledBy = userId; b.reason = String(reason || 'Other').slice(0, 100);
  if (b.paid) refund(b, ride.time - Date.now() < 60 * MIN ? 0.5 : 1);
  Bookings.save(b);
  notify(userId, { type: 'booking', title: 'Booking cancelled', body: `${first(Users.get(ride.driverId).name)} has been notified.`, rideId: ride.id });
  notify(ride.driverId, { type: 'booking', title: `${first(Users.get(userId).name)} cancelled their booking`, body: b.reason, rideId: ride.id });
  if (wasConfirmed) seatFreed(ride);
  touchRide(ride);
}

export function board(userId, bookingId) {
  const b = getBooking(bookingId);
  if (b.passengerId !== userId || b.status !== 'confirmed') throw bad('Cannot confirm boarding');
  b.status = 'picked'; b.pickedAt = Date.now();
  Bookings.save(b);
  const ride = getRide(b.rideId);
  notify(ride.driverId, { type: 'track', title: `${first(Users.get(userId).name)} confirmed boarding ✅`, rideId: ride.id });
  touchRide(ride);
}

export function markPassenger(driverId, bookingId, outcome) {
  const b = getBooking(bookingId);
  const ride = ownRide(driverId, b.rideId);
  if (b.status !== 'confirmed') throw bad('Passenger is not waiting for pickup');
  b.status = outcome === 'noshow' ? 'noshow' : 'picked';
  if (b.status === 'picked') b.pickedAt = Date.now();
  Bookings.save(b);
  notify(b.passengerId, outcome === 'noshow'
    ? { type: 'booking', title: 'Marked as no-show', body: 'Contact support if this is a mistake', rideId: ride.id }
    : { type: 'track', title: `${first(Users.get(driverId).name)} marked you as picked up`, body: 'Enjoy your ride!', rideId: ride.id });
  touchRide(ride);
}

export function pay(userId, bookingId) {
  const b = getBooking(bookingId);
  if (b.passengerId !== userId) throw forbidden();
  if (b.paid) return;
  if (!['confirmed', 'picked', 'completed'].includes(b.status)) throw bad('Nothing to pay for this booking');
  b.paid = true;
  Bookings.save(b);
  // Placeholder for a UPI gateway (Razorpay/Cashfree): record as a simulated payment.
  Payments.insert({ id: uid('p_'), userId, bookingId, amount: b.amount, method: 'UPI (test mode)', at: Date.now(), status: 'paid', ref: 'UPI' + Date.now().toString().slice(-10) });
  notify(userId, { type: 'system', title: `Paid ₹${b.amount} ✅`, body: 'Receipt saved in Payments' });
  sync(getRide(b.rideId).driverId);
}

export function subscribe(userId, rideId) {
  const u = Users.get(userId);
  const ride = getRide(rideId);
  if (ride.recurring === 'none') throw bad('This is not a recurring ride');
  const on = !u.data.subscriptions.includes(rideId);
  u.data.subscriptions = on ? [...u.data.subscriptions, rideId] : u.data.subscriptions.filter((x) => x !== rideId);
  Users.save(u);
  send(userId, { type: 'notification', toast: true, n: { title: on ? 'Subscribed 🔁' : 'Unsubscribed', body: on ? "We'll request a seat on each new trip automatically" : '' } });
  sync(userId);
}

/* ---------------- chat ---------------- */
const AUTO_REPLY = [
  [/where are you/i, "I'm about 5 minutes away, on the main road 🙂"],
  [/arrived|at the pickup|i'm here|im here/i, "Great, I'll be there shortly. I'm in the vehicle shown in the app."],
  [/late/i, 'No problem, thanks for letting me know 👍'],
  [/luggage|bag/i, 'Sure, there is space in the boot.'],
  [/.*/, 'Okay 👍'],
];
export function sendMessage(userId, rideId, text) {
  text = String(text || '').trim();
  if (!text) throw bad('Message is empty');
  const ride = getRide(rideId);
  const pax = members(ride, ['confirmed', 'picked', 'completed']);
  const isDriver = ride.driverId === userId;
  if (!isDriver && !pax.some((b) => b.passengerId === userId)) throw forbidden('Chat opens once your seat is confirmed');
  chat(rideId, userId, text);
  const others = [ride.driverId, ...pax.map((b) => b.passengerId)].filter((id) => id !== userId);
  const name = first(Users.get(userId).name);
  others.forEach((id) => notify(id, { type: 'chat', title: `${name}: ${text.slice(0, 60)}`, rideId }));
  sync(userId);
  const bot = others.find(isBot);
  if (DEMO && bot) later(1800, () => {
    const reply = AUTO_REPLY.find(([re]) => re.test(text))[1];
    chat(rideId, bot, reply);
    [ride.driverId, ...pax.map((b) => b.passengerId)].filter((id) => id !== bot).forEach((id) => notify(id, { type: 'chat', title: `${first(Users.get(bot).name)}: ${reply}`, rideId }));
  });
}

/* ---------------- ratings, reports, safety ---------------- */
export function report(userId, { targetId, type, details = '', rideId = null }) {
  if (!type) throw bad('Choose a reason');
  Reports.insert({ id: uid('rp_'), byId: userId, targetId, type: String(type).slice(0, 40), details: String(details).slice(0, 1000), rideId, status: 'open', at: Date.now() });
  send(userId, { type: 'notification', toast: true, n: { title: 'Report submitted', body: 'Our safety team will review it within 24 hours' } });
  sync(userId);
}

export async function sos(userId, rideId) {
  const u = Users.get(userId);
  const ride = rideId ? Rides.get(rideId) : null;
  const where = ride?.live ? ` Last location: https://maps.google.com/?q=${ride.live.lat.toFixed(5)},${ride.live.lng.toFixed(5)}` : '';
  const veh = ride?.vehicle ? ` Vehicle: ${ride.vehicle.color} ${ride.vehicle.brand} ${ride.vehicle.model} ${ride.vehicle.reg}.` : '';
  const text = `SOS from ${u.name} via SRDPool. They may need help.${veh}${where}`;
  await Promise.allSettled(u.data.emergency.map((c) => sendSms('+91' + c.phone, text)));
  Reports.insert({ id: uid('rp_'), byId: userId, targetId: ride?.driverId === userId ? userId : ride?.driverId || userId, type: 'SOS', details: text, rideId, status: 'open', at: Date.now() });
  notify(userId, { type: 'system', title: '🚨 SOS alert sent', body: u.data.emergency.length ? `${u.data.emergency.map((c) => c.name).join(', ')} received your location` : 'Add trusted contacts in Profile → Emergency contacts' });
}

/* ---------------- alerts ---------------- */
export function createAlert(userId, origin, via = 'any', direction = 'work') {
  if (!ORIGINS[origin]) throw bad('Choose Sangareddy or Isnapur');
  if (!['any', 'orr', 'shankarpally'].includes(via)) via = 'any';
  if (direction !== 'home') direction = 'work';
  if (Alerts.where('"userId" = ?', userId).some((x) => x.origin === origin && x.via === via && (x.direction || 'work') === direction)) return;
  const a = Alerts.insert({ id: uid('al_'), userId, origin, via, direction, at: Date.now() });
  send(userId, { type: 'notification', toast: true, n: { title: 'Ride alert created 🔔', body: `We'll notify you about new rides from ${ORIGINS[origin].name}` } });
  sync(userId);
  if (DEMO) later(12000, () => {
    if (!Alerts.get(a.id) || Users.get(userId).data.holidayMode) return;
    const base = origin === 'isnapur' || via !== 'shankarpally' ? 'orr' : 'shankarpally';
    const corridor = direction === 'home' ? base + '_home' : base;
    const driverId = ['u_ravi', 'u_priya', 'u_sneha', 'u_vikram'][Math.floor(Math.random() * 4)];
    let names = base === 'orr'
      ? [origin === 'isnapur' ? 'Isnapur X Road' : 'Sangareddy New Bus Stand', 'Patancheru', 'ORR', 'Wipro Circle', 'HITEC City']
      : ['Sangareddy New Bus Stand', 'Shankarpally', 'Mokila', 'Financial District', 'HITEC City'];
    if (direction === 'home') names = ['HITEC City', 'Wipro Circle', ...names.slice(1, -2).reverse(), names[0]];
    const stops = buildStops(corridor, names);
    const ride = saveRide({
      id: uid('r_'), driverId, corridor, direction, origin: origin === 'isnapur' ? 'isnapur' : 'sangareddy', stops, ...rideShape(corridor, stops), time: Math.ceil((Date.now() + 100 * MIN) / (5 * MIN)) * 5 * MIN,
      flex: 15, seats: 3, price: FARES[origin], prefs: [], recurring: 'none', status: 'scheduled', posKm: 0, notes: '', delayMin: 0,
      createdAt: Date.now(), vehicle: Users.get(driverId).vehicle, demo: true,
    });
    notifyMatches(ride);
  });
  return a;
}

/* ---------------- bots (demo mode) ---------------- */
function botRequest(rideId, botId, origin = 'sangareddy') {
  const ride = Rides.get(rideId);
  if (!ride || ride.status !== 'scheduled' || seatsLeft(ride) < 1 || !servesOrigin(ride, origin)) return;
  const pickupIdx = suggestPickup(ride, origin), dropIdx = suggestDrop(ride, origin);
  if (Bookings.where('"rideId" = ? AND "passengerId" = ?', rideId, botId).length) return;
  book(botId, rideId, { pickupIdx, dropIdx, seats: 1, origin, note: botId === 'u_kiran' ? 'I have a small backpack only.' : '' });
}

/**
 * One-off upgrade for rides created before fixed boarding points existed (or before the
 * corridor shapes changed): rebuild their stops on the current corridor and keep each
 * booking pointing at the same named stops.
 */
export function upgradeRides() {
  let n = 0;
  for (const ride of Rides.where('status IN (\'scheduled\', \'started\')')) {
    if (ride.fixedV === 3 || !CORRIDORS[ride.corridor]) continue;
    if (ride.stops.some((s) => s.rescue)) { ride.fixedV = 3; saveRide(ride); continue; }
    const names = ride.stops.filter((s) => !s.auto).map((s) => s.name);
    const stops = buildStops(ride.corridor, names);
    for (const b of Bookings.where('"rideId" = ?', ride.id)) {
      const p = stops.findIndex((s) => s.name === ride.stops[b.pickupIdx]?.name);
      const d = stops.findIndex((s, i) => i > p && s.name === ride.stops[b.dropIdx]?.name);
      if (p >= 0 && d > p) { b.pickupIdx = p; b.dropIdx = d; Bookings.save(b); }
    }
    Object.assign(ride, { stops, ...rideShape(ride.corridor, stops), fixedV: 3 });
    if (ride.status === 'scheduled') ride.posKm = 0;
    saveRide(ride);
    n++;
  }
  if (n) console.log(`[upgrade] rebuilt stops for ${n} ride(s)`);
}

/* ---------------- background jobs ---------------- */
export function tick() {
  for (const ride of Rides.where('status = \'started\'')) {
    if (ride.simulate && !ride.breakdown) processRide(ride, ride.posKm + SIM_SPEED, true);
  }
}

export function housekeeping() {
  const now = Date.now();
  for (const ride of Rides.where('status = \'scheduled\' AND time < ?', now + 31 * MIN)) {
    if (isExpired(ride)) {
      ride.status = 'expired';
      saveRide(ride);
      Bookings.where('"rideId" = ?', ride.id).filter((b) => [...ACTIVE, 'waitlist'].includes(b.status)).forEach((b) => { b.status = 'expired'; Bookings.save(b); });
      touchRide(ride);
      continue;
    }
    if (ride.reminded || ride.time < now) continue;
    ride.reminded = true;
    saveRide(ride);
    const mins = Math.round((ride.time - now) / MIN);
    const driver = Users.get(ride.driverId);
    if (!driver.isBot) notify(ride.driverId, { type: 'reminder', title: `Your ride starts in ${mins} min`, body: `${ride.stops[0].name} → ${ride.stops.at(-1).name}. Slide to start when you leave.`, rideId: ride.id });
    members(ride, ['confirmed']).forEach((b) => {
      const u = Users.get(b.passengerId);
      if (!u.data.holidayMode) notify(b.passengerId, { type: 'reminder', title: `Ride with ${first(driver.name)} in ${mins} min`, body: `Be at ${ride.stops[b.pickupIdx].name} by ${fmtTime(ride.time)}`, rideId: ride.id });
    });
  }
}

/* ---------------- breakdown help: move passengers to nearby rides ---------------- */
export const HELP_REASONS = ['Flat tyre', 'Engine trouble', 'Accident', 'Out of fuel', 'Other'];

function nearestStopName(ride, pos) {
  let best = ride.stops[0];
  for (const s of ride.stops) if (Math.abs(s.pos - pos) < Math.abs(best.pos - pos)) best = s;
  return best.name;
}

/** Rides that will pass the breakdown spot soon, haven't passed it yet, and have empty seats. */
function findHelpers(ride, spot) {
  const now = Date.now();
  const owner = Users.get(ride.driverId);
  const dir = CORRIDORS[ride.corridor]?.direction;
  return Rides.where('status = \'started\'').filter((r) => {
    if (r.id === ride.id || !r.corridor || seatsLeft(r) < 1 || r.breakdown) return false;
    if (CORRIDORS[r.corridor]?.direction !== dir) return false;
    const d = Users.get(r.driverId);
    if (!d || d.suspended || d.data?.blocked?.includes(owner.id) || owner.data.blocked.includes(d.id)) return false;
    const p = project(spot, geomOf(r));
    if (p.dist > 2.5) return false;
    const cur = r.live?.posKm ?? r.posKm;
    if (cur > p.pos + 0.3 || r.stops.at(-1).pos <= p.pos + 1) return false;
    r._spotPos = p.pos;
    return true;
  });
}

const waitingBookings = (req) => req.bookingIds.map((id) => Bookings.get(id)).filter((b) => b && b.rideId === req.rideId && ['confirmed', 'picked'].includes(b.status));

export function requestHelp(userId, rideId, { reason, note } = {}) {
  const ride = ownRide(userId, rideId);
  if (ride.status !== 'started') throw bad('You can ask for help during a live ride');
  if (HelpRequests.where('"rideId" = ? AND status = \'open\'', rideId).length) throw bad('A help request is already open for this ride');
  const driver = Users.get(userId);
  const pax = members(ride);
  const loc = ride.live?.lat ? ride.live : pointAt(geomOf(ride), ride.posKm);
  const req = {
    id: uid('h_'), rideId, driverId: userId, reason: HELP_REASONS.includes(reason) ? reason : 'Other', note: String(note || '').slice(0, 200),
    lat: +loc.lat.toFixed(5), lng: +loc.lng.toFixed(5), pos: ride.posKm, placeName: nearestStopName(ride, ride.posKm),
    status: 'open', at: Date.now(), bookingIds: pax.map((b) => b.id), placed: [], offers: [], declined: [],
  };
  const helpers = pax.length ? findHelpers(ride, req) : [];
  req.candidates = helpers.map((r) => r.id);
  req.candidatePos = Object.fromEntries(helpers.map((r) => [r.id, +r._spotPos.toFixed(3)]));
  HelpRequests.insert(req);
  ride.breakdown = { reason: req.reason, at: req.at, helpId: req.id };
  saveRide(ride);
  chat(ride.id, userId, `⚠️ ${req.reason}. I've asked other SRDPool Ride Givers nearby to take you to your destination. Please stay safe.`, true);
  pax.forEach((b) => notify(b.passengerId, { type: 'track', title: `${first(driver.name)}'s car has a problem: ${req.reason}`, body: "We're finding you a seat in another SRDPool ride nearby.", rideId }));
  const seats = pax.reduce((a, b) => a + b.seats, 0);
  helpers.forEach((r, i) => {
    notify(r.driverId, { type: 'help', title: `🆘 ${first(driver.name)} needs help near ${req.placeName}`, body: `${req.reason} · ${seats} passenger seat${seats !== 1 ? 's' : ''} needed. You have ${seatsLeft(r)} empty.`, helpId: req.id, rideId: r.id });
    if (DEMO && isBot(r.driverId)) later(40000 + i * 5000, () => { try { offerHelp(r.driverId, req.id, r.id); } catch { /* already handled */ } });
  });
  notify(userId, !pax.length
    ? { type: 'system', title: 'Breakdown reported', body: 'No passengers on board need a seat.', rideId }
    : helpers.length
      ? { type: 'system', title: `Help request sent to ${helpers.length} nearby Ride Giver${helpers.length > 1 ? 's' : ''}`, body: `${seats} seat${seats > 1 ? 's' : ''} needed near ${req.placeName}`, rideId }
      : { type: 'system', title: 'No nearby rides with empty seats right now', body: "We'll keep your request open. Use SOS if anyone is unsafe.", rideId });
  touchRide(ride);
  sync(helpers.map((r) => r.driverId));
  return helpOut(req, userId);
}

/** Insert a stop into a ride by position, shifting booking indices after it. */
function insertStop(r, stop) {
  let i = r.stops.findIndex((s) => s.pos > stop.pos);
  if (i < 1) i = i === 0 ? 1 : r.stops.length - 1;
  // Keep positions in travel order even if the spot is a little behind the helper's start.
  stop.pos = Math.min(Math.max(stop.pos, r.stops[i - 1].pos), r.stops[i].pos);
  r.stops.splice(i, 0, stop);
  for (const b of Bookings.where('"rideId" = ?', r.id)) {
    let changed = false;
    if (b.pickupIdx >= i) { b.pickupIdx++; changed = true; }
    if (b.dropIdx >= i) { b.dropIdx++; changed = true; }
    if (changed) Bookings.save(b);
  }
  return i;
}

const nearestIdx = (r, pos, from, to) => {
  let best = from, bd = Infinity;
  for (let i = from; i <= to; i++) { const d = Math.abs(r.stops[i].pos - pos); if (d < bd) { bd = d; best = i; } }
  return best;
};

export function offerHelp(helperId, helpId, rideId) {
  const req = HelpRequests.get(helpId);
  if (!req) throw notFound('Help request not found');
  if (req.status !== 'open') throw bad('This request has already been handled — thank you!');
  const r = getRide(rideId);
  if (r.driverId !== helperId) throw forbidden();
  if (!req.candidates.includes(rideId)) throw bad("Your ride doesn't pass this spot");
  if (!stillAhead(req, r)) throw bad('You have already passed this spot — thank you anyway!');
  const ride = getRide(req.rideId);
  const owner = Users.get(req.driverId), helper = Users.get(helperId);
  let free = seatsLeft(r);
  const moving = [];
  const alreadyAboard = (pid) => Bookings.where('"rideId" = ? AND "passengerId" = ?', r.id, pid).some((x) => ACTIVE.includes(x.status));
  for (const b of waitingBookings(req)) if (b.seats <= free && !alreadyAboard(b.passengerId)) { moving.push(b); free -= b.seats; }
  if (!moving.length) throw bad(free ? 'These passengers have already been placed' : 'No empty seats left in your car');

  const spot = project({ lat: req.lat, lng: req.lng }, geomOf(r));
  let rescueIdx = null;
  const g = geomOf(r);
  for (const b of moving) {
    const waitingAhead = b.status === 'confirmed' && ride.stops[b.pickupIdx].pos > req.pos + 0.05;
    let pickupIdx;
    if (waitingAhead) {
      const pp = project(ride.stops[b.pickupIdx], g, undefined, spot.pos).pos;
      pickupIdx = r.stops.length > 2 ? nearestIdx(r, pp, 1, r.stops.length - 2) : null;
      if (pickupIdx != null && r.stops[pickupIdx].pos < spot.pos - 0.05) pickupIdx = null;
    }
    if (pickupIdx == null) {
      if (rescueIdx == null) rescueIdx = insertStop(r, { name: `🆘 Pickup at ${owner.name.split(' ')[0]}'s car (${req.placeName})`, area: '', lat: req.lat, lng: req.lng, pos: +spot.pos.toFixed(3), rescue: true });
      pickupIdx = rescueIdx;
    }
    const dp = project(ride.stops[b.dropIdx], g, undefined, r.stops[pickupIdx].pos).pos;
    const dropIdx = nearestIdx(r, dp, pickupIdx + 1, r.stops.length - 1);
    const nb = Bookings.insert({
      id: uid('b_'), rideId: r.id, passengerId: b.passengerId, seats: b.seats, pickupIdx, dropIdx, origin: b.origin, status: 'confirmed',
      amount: b.amount, paid: false, createdAt: Date.now(), confirmedAt: Date.now(), rescue: true, fromRideId: ride.id, note: 'Moved after a breakdown',
    });
    b.status = 'transferred';
    b.transferredTo = { bookingId: nb.id, rideId: r.id };
    b.reason = `${req.reason} — moved to ${first(helper.name)}'s ride`;
    if (b.paid) refund(b, 1);
    Bookings.save(b);
    req.placed.push(b.id);
    notify(b.passengerId, { type: 'booking', title: `You're moved to ${first(helper.name)}'s ride 🚗`, body: `${r.vehicle.color} ${r.vehicle.brand} ${r.vehicle.model} · ${r.vehicle.reg} picks you up at ${r.stops[pickupIdx].name}`, rideId: r.id });
    chat(r.id, b.passengerId, `Thank you for picking me up! I'm with ${first(owner.name)}'s car near ${req.placeName}.`, true);
  }
  saveRide(r);
  req.offers.push({ rideId, driverId: helperId, seats: moving.reduce((a, b) => a + b.seats, 0), at: Date.now() });
  const left = waitingBookings(req);
  if (!left.length) req.status = 'resolved';
  HelpRequests.save(req);
  notify(req.driverId, {
    type: 'system',
    title: `${first(helper.name)} is taking ${moving.length} passenger${moving.length > 1 ? 's' : ''} 🙏`,
    body: left.length ? `${left.length} still waiting for a seat` : 'Everyone has a seat. You can end your ride when ready.',
    rideId: ride.id,
  });
  notify(helperId, { type: 'system', title: 'Thank you for helping! 🙏', body: `${moving.length} passenger${moving.length > 1 ? 's' : ''} added to your ride — pickup at ${req.placeName}`, rideId: r.id });
  touchRide(ride);
  touchRide(r);
  return { moved: moving.length, remaining: left.length };
}

export function declineHelp(userId, helpId) {
  const req = HelpRequests.get(helpId);
  if (!req) throw notFound();
  if (!req.declined.includes(userId)) req.declined.push(userId);
  HelpRequests.save(req);
  sync(userId);
}

/** The driver fixed the problem: close the request and carry on. */
export function cancelHelp(userId, helpId) {
  const req = HelpRequests.get(helpId);
  if (!req || req.driverId !== userId) throw forbidden();
  if (req.status === 'open') req.status = 'cancelled';
  HelpRequests.save(req);
  const ride = getRide(req.rideId);
  ride.breakdown = null;
  saveRide(ride);
  members(ride).forEach((b) => notify(b.passengerId, { type: 'track', title: 'The problem is fixed — continuing the ride', rideId: ride.id }));
  chat(ride.id, userId, '✅ Problem fixed. Continuing the ride.', true);
  touchRide(ride);
  Rides.where('status IN (\'started\', \'scheduled\')').filter((r) => req.candidates.includes(r.id)).forEach((r) => sync(r.driverId));
}

export function helpOut(req, viewerId) {
  const owner = Users.get(req.driverId);
  const ride = Rides.get(req.rideId);
  const waiting = waitingBookings(req);
  const myRide = Rides.where('"driverId" = ? AND status = \'started\'', viewerId).find((r) => req.candidates.includes(r.id) && stillAhead(req, r));
  return {
    ...req, driver: publicUser(owner), vehicle: ride?.vehicle ? { ...ride.vehicle } : null,
    offers: req.offers.map((o) => ({ ...o, driverName: Users.get(o.driverId)?.name })),
    destination: ride?.stops.at(-1).name, seatsNeeded: waiting.reduce((a, b) => a + b.seats, 0), passengersWaiting: waiting.length,
    myRideId: myRide?.id || null, mySeatsLeft: myRide ? seatsLeft(myRide) : 0, declinedByMe: req.declined.includes(viewerId),
  };
}

/** A helper is still useful only while their live ride hasn't passed the breakdown spot. */
function stillAhead(req, r) {
  if (r.status !== 'started') return false;
  const spot = req.candidatePos?.[r.id] ?? project({ lat: req.lat, lng: req.lng }, geomOf(r)).pos;
  return (r.live?.posKm ?? r.posKm) <= spot + 0.3;
}

/** Help requests relevant to a user (as the Ride Giver asking, a live helper ahead of the spot, or a Ride Taker on board). */
export function helpFor(userId) {
  const myLive = Rides.where('"driverId" = ? AND status = \'started\'', userId);
  const myBookingIds = new Set(Bookings.where('"passengerId" = ?', userId).map((b) => b.id));
  return HelpRequests.where('at > ?', Date.now() - 12 * 3600e3)
    .filter((h) => h.driverId === userId || h.bookingIds.some((id) => myBookingIds.has(id)) || (h.status === 'open' && myLive.some((r) => h.candidates.includes(r.id) && stillAhead(h, r))))
    .map((h) => helpOut(h, userId));
}

/* ---------------- calling ---------------- */
/**
 * A member's phone number is only released to someone on the same live or upcoming
 * ride (Ride Giver ⇄ confirmed Ride Taker), and only if they allow calls.
 */
export function contactFor(viewerId, rideId, targetId) {
  const ride = getRide(rideId);
  if (!['scheduled', 'started'].includes(ride.status)) throw bad('Calling is available for upcoming and live rides only');
  const riders = members(ride).map((b) => b.passengerId);
  const isDriver = (id) => id === ride.driverId;
  const onRide = (id) => isDriver(id) || riders.includes(id);
  if (viewerId === targetId || !onRide(viewerId) || !onRide(targetId) || (!isDriver(viewerId) && !isDriver(targetId))) {
    throw forbidden('You can call the Ride Giver or Ride Takers on your confirmed ride only');
  }
  const t = Users.get(targetId);
  if (t.isBot) throw bad(`${first(t.name)} is a demo member and can't take calls. Use chat instead.`);
  if (t.prefs?.allowCalls === false) throw bad(`${first(t.name)} prefers chat. Send a message instead.`);
  if (!t.phone) throw bad(`${first(t.name)} hasn't added a phone number yet. Use chat instead.`);
  return { phone: t.phone, name: t.name };
}

/* ---------------- work verification ---------------- */
const WORK_STATUS_OK = ['pending', 'verified'];
function requireWorkDetails(user) {
  if (!WORK_STATUS_OK.includes(user.work?.status)) {
    const e = bad('Please verify yourself first (company details and ID card)');
    e.code = 'VERIFY_REQUIRED';
    throw e;
  }
}

export function submitWork(userId, b) {
  const u = Users.get(userId);
  const t = (s, max = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const name = t(b.name), company = t(b.company), workplace = t(b.workplace), designation = t(b.designation);
  if (name.length < 2) throw bad('Enter your full name');
  if (company.length < 2) throw bad('Enter your company name');
  if (workplace.length < 2) throw bad('Enter your place of work');
  if (designation.length < 2) throw bad('Enter your designation');
  if (!['taker', 'giver', 'both'].includes(b.roles)) throw bad('Choose Ride Giver, Ride Taker or both');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(b.idImage || '')) throw bad('Add a clear photo of your ID card');
  if (b.idImage.length > 2_500_000) throw bad('ID card photo is too large');
  IdCards.where('"userId" = ?', userId).forEach((c) => IdCards.remove(c.id));
  IdCards.insert({ id: uid('id_'), userId, image: b.idImage, at: Date.now() });
  u.name = name;
  u.work = { status: 'pending', company, workplace, designation, roles: b.roles, submittedAt: Date.now() };
  if (b.roles !== 'both') u.role = b.roles;
  Users.save(u);
  notify(userId, { type: 'system', title: 'Details submitted for verification', body: 'Your ID card photo is deleted as soon as it is reviewed' });
}

export function adminWork(adminId, userId, approve) {
  const u = Users.get(userId);
  if (!u || u.work?.status !== 'pending') throw bad('Nothing to verify');
  u.work = { ...u.work, status: approve ? 'verified' : 'rejected', reviewedAt: Date.now() };
  Users.save(u);
  const cards = IdCards.where('"userId" = ?', userId);
  cards.forEach((c) => IdCards.remove(c.id));
  audit(adminId, `${approve ? 'Approved' : 'Rejected'} work verification · ID card deleted`, u.name);
  notify(userId, approve
    ? { type: 'system', title: 'You are verified ✅', body: `${u.work.company} · your ID card photo has been deleted` }
    : { type: 'system', title: 'Verification not approved', body: 'Your ID card photo has been deleted. Please resubmit with a clear photo.' });
}

/* ---------------- admin ---------------- */
export function adminSuspend(adminId, userId) {
  const u = Users.get(userId);
  if (!u) throw notFound();
  if (u.id === adminId) throw bad("You can't suspend yourself");
  u.suspended = !u.suspended;
  Users.save(u);
  if (u.suspended) Rides.where('"driverId" = ? AND status = \'scheduled\'', userId).forEach((r) => { r.status = 'cancelled'; r.cancelReason = 'Account suspended'; r.removedByAdmin = true; saveRide(r); touchRide(r); });
  audit(adminId, u.suspended ? 'Suspended account' : 'Restored account', u.name);
}
export function adminReport(adminId, id, outcome) {
  const r = Reports.get(id);
  if (!r) throw notFound();
  r.status = ['dismissed', 'warned', 'actioned'].includes(outcome) ? outcome : 'dismissed';
  Reports.save(r);
  audit(adminId, `Report ${r.status}`, `${r.type} → ${Users.get(r.targetId)?.name || r.targetId}`);
  if (r.byId) notify(r.byId, { type: 'system', title: 'Your report was reviewed', body: `Outcome: ${r.status}. Thank you for keeping SRDPool safe.` });
}
export function adminRemoveRide(adminId, rideId) {
  const ride = getRide(rideId);
  ride.status = 'cancelled';
  ride.cancelReason = 'Removed by admin (spam/duplicate)';
  ride.removedByAdmin = true;
  saveRide(ride);
  Bookings.where('"rideId" = ?', rideId).filter((b) => [...ACTIVE, 'waitlist'].includes(b.status)).forEach((b) => {
    b.status = 'cancelled'; b.cancelledBy = 'admin'; Bookings.save(b);
    notify(b.passengerId, { type: 'booking', title: 'A ride you booked was removed', body: 'It broke community rules. Any payment will be refunded.', rideId });
  });
  audit(adminId, 'Removed ride listing', `${ride.stops[0].name} → ${ride.stops.at(-1).name}`);
  touchRide(ride);
}
