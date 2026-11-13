import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { Users, Sessions, Otps, Rides, Bookings, Reports, Audit, Alerts, Notifications, IdCards, sha } from './db.js';
import * as E from './engine.js';
import { buildState, meify } from './state.js';
import { attachRealtime, sync } from './realtime.js';
import { CITY } from './geo.js';
import { FARES, CORRIDORS, servesOrigin, suggestPickup, suggestDrop, loadCorridors, publicCorridors } from './corridors.js';
import { smsConfigured } from './sms.js';
import { sendEmailOtp, mailConfigured } from './mail.js';
import { refreshDemoRides } from './seed.js';

const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.API_PORT || (PROD && process.env.PORT) || 8787);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const OPEN_ADMIN = !PROD && process.env.OPEN_ADMIN !== '0'; // dev: everyone can open the admin demo
const COMMUNITIES = ['hitec_park', 'jntu', 'myhome'];

const app = express();
app.disable('x-powered-by');
if (PROD) app.set('trust proxy', 1); // behind the host's HTTPS proxy: use the real client IP for rate limits
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.json({ limit: '3mb' }));

/* ---------------- helpers ---------------- */
const h = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(req.user ? meify(out ?? { ok: true }, req.user.id) : out ?? { ok: true });
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : e.message, conflictId: e.conflictId, code: e.code });
  }
};
const idOf = (req, x) => (x === 'me' ? req.user.id : x);
const maskEmail = (e = '') => { const [a, d] = String(e).split('@'); return d ? a.slice(0, 2) + '•••@' + d : ''; };

function userFromToken(token) {
  if (!token) return null;
  const s = Sessions.get(sha(token));
  if (!s || s.expires < Date.now()) return null;
  return Users.get(s.userId);
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const user = userFromToken(token);
  if (!user) return res.status(401).json({ error: 'Please log in again' });
  if (user.suspended && req.method !== 'GET' && !req.path.startsWith('/auth')) return res.status(403).json({ error: 'Your account is suspended. Contact support.' });
  req.user = user;
  next();
}
const isAdmin = (u) => u.isAdmin || OPEN_ADMIN;
function admin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admins only' });
  next();
}

// Tiny in-memory rate limiter (per IP + key).
const hits = new Map();
function limit(key, max, windowMs) {
  return (req, res, next) => {
    const k = key + ':' + req.ip;
    const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Too many attempts. Please wait a minute.' });
    arr.push(now);
    hits.set(k, arr);
    next();
  };
}

/* ---------------- public ---------------- */
app.get('/api/config', (req, res) => res.json({
  demo: E.DEMO, city: CITY, sms: smsConfigured, email: mailConfigured, ...publicCorridors(),
  tiles: { url: process.env.TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: process.env.TILE_ATTRIBUTION || '© OpenStreetMap contributors' },
}));

const cleanEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 120);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Sign-in: a one-time code is emailed; the mobile number is collected during setup for calls.
app.post('/api/auth/otp', limit('otp', 5, 60000), h(async (req) => {
  const email = cleanEmail(req.body.email);
  if (!EMAIL_RE.test(email)) throw new E.HttpError(400, 'Enter a valid email address');
  if (PROD && !mailConfigured) throw new E.HttpError(503, 'Sign-in emails are not set up yet. Please try again later.');
  const key = 'email:' + email;
  const prev = Otps.get(key);
  if (prev && Date.now() - prev.sentAt < 30000) throw new E.HttpError(429, 'Please wait 30 seconds before requesting a new code');
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  Otps.save({ id: key, hash: sha(key + code), expires: Date.now() + 10 * 60000, attempts: 0, sentAt: Date.now() });
  try { await sendEmailOtp(email, code); } catch (e) {
    console.error('[mail]', e.message);
    throw new E.HttpError(502, "We couldn't send the email. Check the address and try again.");
  }
  return { ok: true, email, devCode: !PROD && !mailConfigured ? code : undefined };
}));

app.post('/api/auth/verify', limit('verify', 10, 60000), h(async (req) => {
  const email = cleanEmail(req.body.email);
  const key = 'email:' + email;
  const o = Otps.get(key);
  if (!o || o.expires < Date.now()) throw new E.HttpError(400, 'Code expired. Request a new one.');
  if (o.attempts >= 5) throw new E.HttpError(429, 'Too many wrong attempts. Request a new code.');
  if (sha(key + String(req.body.code || '').trim()) !== o.hash) {
    o.attempts++;
    Otps.save(o);
    throw new E.HttpError(400, 'Incorrect code. Please try again.');
  }
  Otps.remove(key);
  let user = Users.where('email = ?', email)[0];
  const isNew = !user;
  if (!user) user = Users.insert(E.newUser(email));
  if (ADMIN_EMAILS.includes(email) && !user.isAdmin) { user.isAdmin = true; Users.save(user); }
  const token = crypto.randomBytes(32).toString('base64url');
  Sessions.insert({ id: sha(token), userId: user.id, createdAt: Date.now(), expires: Date.now() + 90 * 864e5 });
  return { token, isNew };
}));

/* ---------------- everything below needs a session ---------------- */
app.use('/api', auth);

app.post('/api/auth/logout', h((req) => {
  Sessions.remove(sha((req.headers.authorization || '').replace(/^Bearer /, '')));
}));

app.get('/api/state', h((req) => buildState(req.user.id, { admin: isAdmin(req.user) })));

app.patch('/api/me', h((req) => {
  const u = req.user;
  const p = req.body;
  if (p.name != null) { const n = String(p.name).trim(); if (n.length < 2) throw new E.HttpError(400, 'Enter your name'); u.name = n.slice(0, 60); }
  if (p.age != null) { const a = Number(p.age); if (!(a >= 18 && a < 100)) throw new E.HttpError(400, 'You must be 18 or older'); u.age = a; }
  for (const k of ['gender', 'bio']) if (p[k] != null) u[k] = String(p[k]).slice(0, k === 'bio' ? 300 : 80);
  if (p.phone != null) {
    const digits = String(p.phone).replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) throw new E.HttpError(400, 'Enter a valid 10-digit Indian mobile number');
    u.phone = '+91 ' + digits;
  }
  if (p.photo !== undefined) {
    if (p.photo && !/^data:image\/(png|jpe?g|webp);base64,/.test(p.photo)) throw new E.HttpError(400, 'Unsupported photo');
    u.photo = p.photo || null;
  }
  if (p.role) u.role = p.role === 'giver' ? 'giver' : 'taker';
  Users.save(u);
  sync(u.id);
}));

// Per-user lists & settings
const DATA_KEYS = { commute: 'object', holidayMode: 'boolean', savedPlaces: 'array', savedRoutes: 'array', recentSearches: 'array', emergency: 'array' };
app.put('/api/me/data/:key', h((req) => {
  const kind = DATA_KEYS[req.params.key];
  if (!kind) throw new E.HttpError(400, 'Unknown setting');
  const v = req.body.value;
  if (kind === 'array' && !Array.isArray(v)) throw new E.HttpError(400, 'Invalid value');
  if (kind === 'boolean' && typeof v !== 'boolean') throw new E.HttpError(400, 'Invalid value');
  if (JSON.stringify(v ?? null).length > 20000) throw new E.HttpError(400, 'Too much data');
  req.user.data[req.params.key] = kind === 'array' ? v.slice(0, 20) : v;
  Users.save(req.user);
  sync(req.user.id);
}));
app.put('/api/me/prefs', h((req) => {
  const p = req.body;
  const u = req.user;
  if (p.notif) for (const k of Object.keys(u.prefs.notif)) if (typeof p.notif[k] === 'boolean') u.prefs.notif[k] = p.notif[k];
  for (const k of ['shareLocation', 'allowCalls']) if (typeof p[k] === 'boolean') u.prefs[k] = p[k];
  Users.save(u);
  sync(u.id);
}));
for (const list of ['favorites', 'blocked']) {
  app.post(`/api/me/${list}/:userId`, h((req) => {
    const id = req.params.userId;
    if (id === req.user.id || id === 'me' || !Users.get(id)) throw new E.HttpError(400, 'Invalid member');
    const u = req.user;
    const on = !u.data[list].includes(id);
    u.data[list] = on ? [...u.data[list], id] : u.data[list].filter((x) => x !== id);
    if (list === 'blocked' && on) u.data.favorites = u.data.favorites.filter((x) => x !== id);
    Users.save(u);
    sync(u.id);
    return { on };
  }));
}
app.post('/api/me/vehicle', h((req) => {
  // Vehicle details only identify the car for Ride Takers; there is no driving licence check.
  const { vehicle: v } = req.body;
  const reg = String(v?.reg || '').toUpperCase().trim();
  if (!v?.brand || !v?.model || !v?.color || !/^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{3,4}$/.test(reg)) throw new E.HttpError(400, 'Check the vehicle details and registration number');
  const u = req.user;
  u.vehicle = { brand: String(v.brand).slice(0, 30), model: String(v.model).slice(0, 30), color: String(v.color).slice(0, 20), reg, type: ['Hatchback', 'Sedan', 'SUV', 'EV'].includes(v.type) ? v.type : 'Sedan' };
  delete u.licence;
  Users.save(u);
  sync(u.id);
}));
app.post('/api/me/work-verification', h((req) => E.submitWork(req.user.id, req.body)));
app.post('/api/me/communities/:id', h((req) => {
  if (!COMMUNITIES.includes(req.params.id)) throw new E.HttpError(404, 'Unknown community');
  const u = req.user;
  u.data.communities = req.body.join ? [...new Set([...u.data.communities, req.params.id])] : u.data.communities.filter((x) => x !== req.params.id);
  Users.save(u);
  sync(u.id);
}));
app.post('/api/notifications/read', h((req) => {
  Notifications.where('"userId" = ?', req.user.id).filter((n) => !n.read).forEach((n) => { n.read = true; Notifications.save(n); });
  sync(req.user.id);
}));

app.get('/api/users/:id', h((req) => {
  const u = Users.get(idOf(req, req.params.id));
  if (!u) throw new E.HttpError(404, 'Member not found');
  const pub = E.publicUser(u);
  const together = Bookings.where('"passengerId" = ? AND status = \'completed\'', req.user.id)
    .map((b) => ({ b, r: Rides.get(b.rideId) })).filter((x) => x.r?.driverId === u.id)
    .map(({ b, r }) => ({ time: r.time, from: r.stops[b.pickupIdx].name, to: r.stops[b.dropIdx].name }));
  return { ...pub, together };
}));

/* ---------------- fixed-route search (ride takers) ---------------- */
const MIN = 60000;
app.post('/api/search', h((req) => {
  const { origin, via = 'any', date, time, window: win } = req.body;
  const direction = req.body.direction === 'home' ? 'home' : 'work';
  const me = req.user;
  if (!FARES[origin]) throw new E.HttpError(400, 'Choose Sangareddy or Isnapur');
  const day = date ? new Date(date).toDateString() : null;
  const out = [];
  for (const ride of Rides.where('status = \'scheduled\' AND time > ?', Date.now() - 60 * MIN)) {
    if (E.isExpired(ride) || ride.driverId === me.id || !ride.corridor) continue;
    const c = CORRIDORS[ride.corridor];
    if (!c || c.direction !== direction) continue;
    if (!servesOrigin(ride, origin) || (via !== 'any' && c.base !== via)) continue;
    const driver = Users.get(ride.driverId);
    if (!driver || driver.suspended || me.data.blocked.includes(ride.driverId) || driver.data?.blocked?.includes(me.id)) continue;
    if (day && new Date(ride.time).toDateString() !== day) continue;
    let timeDiff = 0, outside = false;
    if (time) {
      const [hh, mm] = String(time).split(':').map(Number);
      const want = new Date(ride.time);
      want.setHours(hh, mm, 0, 0);
      timeDiff = Math.abs(ride.time - want.getTime()) / MIN;
      outside = !!win && timeDiff > win + ride.flex;
    }
    out.push({
      ride: E.rideOut(ride, me.id), driver: E.publicUser(driver), left: E.seatsLeft(ride), fav: me.data.favorites.includes(ride.driverId),
      pickupIdx: suggestPickup(ride, origin), dropIdx: suggestDrop(ride, origin), fare: FARES[origin], timeDiff, outside,
    });
  }
  return out.sort((a, b) => (b.fav - a.fav) || (a.ride.time - b.ride.time));
}));

/* ---------------- rides ---------------- */
app.get('/api/rides/:id', h((req) => {
  const r = Rides.get(req.params.id);
  if (!r) throw new E.HttpError(404, 'Ride not found');
  const out = E.rideOut(r, req.user.id);
  const users = { [r.driverId]: E.publicUser(Users.get(r.driverId)) };
  const isDriver = r.driverId === req.user.id;
  const bookings = Bookings.where('"rideId" = ?', r.id).filter((b) => isDriver || b.passengerId === req.user.id);
  bookings.forEach((b) => (users[b.passengerId] = E.publicUser(Users.get(b.passengerId))));
  return { ride: out, users, bookings };
}));
app.post('/api/rides', h((req) => E.postRide(req.user.id, req.body)));
app.patch('/api/rides/:id', h((req) => E.editRide(req.user.id, req.params.id, req.body)));
app.post('/api/rides/:id/cancel', h((req) => E.cancelRide(req.user.id, req.params.id, req.body.reason)));
app.post('/api/rides/:id/start', h((req) => E.startRide(req.user.id, req.params.id, req.body.simulate)));
app.post('/api/rides/:id/demo-start', h((req) => E.demoStart(req.user.id, req.params.id)));
app.post('/api/rides/:id/end', h((req) => E.endRide(req.user.id, req.params.id)));
app.post('/api/rides/:id/delay', h((req) => E.sendDelay(req.user.id, req.params.id, req.body.mins)));
app.post('/api/rides/:id/location', h((req) => E.updateLocation(req.user.id, req.params.id, Number(req.body.lat), Number(req.body.lng))));
app.get('/api/rides/:id/contact/:userId', h((req) => E.contactFor(req.user.id, req.params.id, idOf(req, req.params.userId))));
app.post('/api/rides/:id/help', h((req) => E.requestHelp(req.user.id, req.params.id, req.body)));
app.get('/api/help/:id', h((req) => {
  const r = E.helpFor(req.user.id).find((x) => x.id === req.params.id);
  if (!r) throw new E.HttpError(404, 'Help request not found');
  return r;
}));
app.post('/api/help/:id/offer', h((req) => E.offerHelp(req.user.id, req.params.id, req.body.rideId)));
app.post('/api/help/:id/decline', h((req) => E.declineHelp(req.user.id, req.params.id)));
app.post('/api/help/:id/cancel', h((req) => E.cancelHelp(req.user.id, req.params.id)));
app.post('/api/rides/:id/book', h((req) => E.book(req.user.id, req.params.id, req.body)));
app.post('/api/rides/:id/waitlist', h((req) => E.waitlist(req.user.id, req.params.id, !!req.body.join, req.body)));
app.post('/api/rides/:id/subscribe', h((req) => E.subscribe(req.user.id, req.params.id)));
app.post('/api/rides/:id/messages', h((req) => E.sendMessage(req.user.id, req.params.id, req.body.text)));
app.post('/api/bookings/:id/respond', h((req) => E.respond(req.user.id, req.params.id, !!req.body.accept)));
app.post('/api/bookings/:id/cancel', h((req) => E.cancelBooking(req.user.id, req.params.id, req.body.reason)));
app.post('/api/bookings/:id/board', h((req) => E.board(req.user.id, req.params.id)));
app.post('/api/bookings/:id/picked', h((req) => E.markPassenger(req.user.id, req.params.id, 'picked')));
app.post('/api/bookings/:id/noshow', h((req) => E.markPassenger(req.user.id, req.params.id, 'noshow')));
app.post('/api/bookings/:id/pay', h((req) => E.pay(req.user.id, req.params.id)));
app.post('/api/reports', h((req) => E.report(req.user.id, { ...req.body, targetId: idOf(req, req.body.targetId) })));
app.post('/api/sos', h((req) => E.sos(req.user.id, req.body.rideId)));
app.post('/api/alerts', h((req) => E.createAlert(req.user.id, req.body.origin, req.body.via, req.body.direction)));
app.delete('/api/alerts/:id', h((req) => {
  const a = Alerts.get(req.params.id);
  if (a?.userId === req.user.id) Alerts.remove(a.id);
  sync(req.user.id);
}));

/* ---------------- admin ---------------- */
app.get('/api/admin/overview', admin, h(() => {
  const rides = Rides.where();
  const now = Date.now();
  const status = (r) => (E.isExpired(r) ? 'expired' : r.status);
  const week = [...Array(7)].map((_, i) => {
    const start = new Date(now - (6 - i) * 864e5); start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 864e5;
    return { day: start.toLocaleDateString('en-IN', { weekday: 'short' }), n: Bookings.where().filter((b) => b.createdAt >= start.getTime() && b.createdAt < end).length };
  });
  const scheduled = rides.filter((r) => status(r) === 'scheduled');
  const dups = scheduled.filter((r) => scheduled.some((o) => o.id !== r.id && o.driverId === r.driverId && o.stops[0].name.toLowerCase() === r.stops[0].name.toLowerCase() && o.stops.at(-1).name.toLowerCase() === r.stops.at(-1).name.toLowerCase() && Math.abs(o.time - r.time) < 90 * MIN)).map((r) => r.id);
  const users = Users.where('"isBot" = 0').concat(Users.where('"isBot" = 1'));
  const name = (id) => Users.get(id)?.name || 'Unknown';
  return {
    counts: {
      users: users.length, active: rides.filter((r) => r.status === 'started').length, upcoming: scheduled.length,
      completed: rides.filter((r) => r.status === 'completed').length, cancelled: rides.filter((r) => r.status === 'cancelled').length,
      openReports: Reports.count('status = \'open\''), pending: users.filter((u) => u.work?.status === 'pending').length,
      avgSeats: scheduled.length ? +(scheduled.reduce((a, r) => a + (r.seats - E.seatsLeft(r)), 0) / scheduled.length).toFixed(1) : 0,
    },
    week, dups,
    workQueue: users.filter((u) => u.work?.status === 'pending').map((u) => ({ ...E.publicUser(u), work: u.work, idImage: IdCards.where('"userId" = ?', u.id)[0]?.image || null })),
    reports: Reports.where('1=1 ORDER BY at DESC').map((r) => ({ ...r, byName: name(r.byId), targetName: name(r.targetId) })),
    users: users.map((u) => ({ ...E.publicUser(u), phone: u.isBot ? 'demo member' : maskEmail(u.email) + (u.phone ? ' · ' + u.phone.slice(0, 6) + '•••••' + u.phone.slice(-2) : ''), isBot: u.isBot, isDriver: !!u.vehicle })),
    rides: rides.sort((a, b) => b.time - a.time).slice(0, 40).map((r) => ({ id: r.id, from: r.stops[0].name, to: r.stops.at(-1).name, time: r.time, price: r.price, status: status(r), driver: name(r.driverId) })),
    audit: Audit.where('1=1 ORDER BY at DESC LIMIT 100').map((a) => ({ ...a, adminName: name(a.adminId) })),
  };
}));
app.post('/api/admin/work/:userId', admin, h((req) => E.adminWork(req.user.id, idOf(req, req.params.userId), !!req.body.approve)));
app.post('/api/admin/suspend/:userId', admin, h((req) => E.adminSuspend(req.user.id, idOf(req, req.params.userId))));
app.post('/api/admin/reports/:id', admin, h((req) => E.adminReport(req.user.id, req.params.id, req.body.outcome)));
app.post('/api/admin/rides/:id/remove', admin, h((req) => E.adminRemoveRide(req.user.id, req.params.id)));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------------- static (production build) ---------------- */
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/* ---------------- start ---------------- */
const server = http.createServer(app);
attachRealtime(server, userFromToken, (userId, msg) => {
  if (msg.type === 'loc') {
    try { E.updateLocation(userId, msg.rideId, Number(msg.lat), Number(msg.lng)); } catch { /* ignore */ }
  }
});
setInterval(() => { try { E.tick(); } catch (e) { console.error('[tick]', e); } }, 1000);
setInterval(() => { try { E.housekeeping(); } catch (e) { console.error('[housekeeping]', e); } }, 15000);
loadCorridors().then(() => {
  E.upgradeRides();
  if (!E.DEMO) return;
  refreshDemoRides().catch((e) => console.error('[seed]', e));
  setInterval(() => refreshDemoRides().catch((e) => console.error('[seed]', e)), 30 * MIN);
}).catch((e) => console.error('[corridors]', e));
server.listen(PORT, () => console.log(`SRDPool API on http://localhost:${PORT}  (demo bots: ${E.DEMO ? 'on' : 'off'}, SMS: ${smsConfigured ? 'Twilio' : 'console'})`));
