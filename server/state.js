// Builds the per-user snapshot the app renders from. The caller's own id is
// replaced with "me" so the client can stay identity-agnostic.
import { Users, Rides, Bookings, Messages, Notifications, Payments, Reports, Alerts } from './db.js';
import { publicUser, rideOut, helpFor } from './engine.js';

export function meify(value, userId) {
  if (value === userId) return 'me';
  if (Array.isArray(value)) return value.map((v) => meify(v, userId));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k === userId ? 'me' : k] = meify(v, userId);
    return out;
  }
  return value;
}

export function privateMe(u) {
  return {
    id: u.id, phone: u.phone, name: u.name, age: u.age, gender: u.gender, photo: u.photo, bio: u.bio, email: u.email, role: u.role,
    vehicle: u.vehicle, licence: u.licence ? u.licence.slice(0, 4) + '••••' + u.licence.slice(-3) : '', verification: u.verification,
    verificationAt: u.verificationAt, work: u.work || { status: 'none' }, isAdmin: !!u.isAdmin, lastPostAt: u.lastPostAt, suspended: !!u.suspended,
  };
}

export function buildState(userId, { admin = false } = {}) {
  const u = Users.get(userId);
  const myBookings = Bookings.where('"passengerId" = ?', userId);
  const myRides = Rides.where('"driverId" = ?', userId);
  const notifications = Notifications.where('"userId" = ? ORDER BY at DESC LIMIT 80', userId);
  const ids = new Set([...myRides.map((r) => r.id), ...myBookings.map((b) => b.rideId), ...notifications.map((n) => n.rideId).filter(Boolean)]);
  const rides = [...ids].map((id) => Rides.get(id)).filter(Boolean);
  const bookings = [...myBookings, ...myRides.flatMap((r) => Bookings.where('"rideId" = ? AND "passengerId" != ?', r.id, userId))];
  const reports = Reports.where('"byId" = ? ORDER BY at DESC', userId);
  const users = {};
  const addUser = (id) => { if (id && !users[id]) { const p = publicUser(Users.get(id)); if (p) users[id] = p; } };
  [userId, ...rides.map((r) => r.driverId), ...bookings.map((b) => b.passengerId), ...u.data.favorites, ...u.data.blocked, ...reports.map((r) => r.targetId)].forEach(addUser);

  const chats = {};
  for (const r of rides) {
    const member = r.driverId === userId || myBookings.some((b) => b.rideId === r.id && ['confirmed', 'picked', 'completed'].includes(b.status));
    if (member) {
      const msgs = Messages.where('"rideId" = ? ORDER BY at', r.id);
      if (msgs.length) { chats[r.id] = msgs; msgs.forEach((m) => addUser(m.from)); }
    }
  }
  const out = rides.map((r) => {
    const o = rideOut(r, userId);
    if (!['scheduled', 'started'].includes(o.status)) delete o.geometry;
    return o;
  });
  return meify({
    me: privateMe(u), users, rides: out, bookings, notifications, chats,
    payments: Payments.where('"userId" = ? ORDER BY rowid DESC', userId),
    reports, alerts: Alerts.where('"userId" = ?', userId),
    help: helpFor(userId), ...u.data, prefs: u.prefs, admin,
  }, userId);
}
