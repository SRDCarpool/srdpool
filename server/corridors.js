// The fixed commuter corridors SRDPool serves, their fixed boarding / get-down points, and fares.
// Rides run Sangareddy / Isnapur ⇄ Financial District / HITEC City, in both directions.
import { roadRoute, cumLengths, project, pointAt, distKm } from './geo.js';

export const DESTINATION = 'Financial District / HITEC City';
export const FARES = { sangareddy: 150, isnapur: 120 };
export const ORIGINS = {
  sangareddy: { id: 'sangareddy', name: 'Sangareddy', lat: 17.618, lng: 78.083 },
  isnapur: { id: 'isnapur', name: 'Isnapur', lat: 17.5453, lng: 78.2132 },
};

/*
 * Fixed points. Ride Takers can only board / get down at these.
 *   To office:  board at a HOME point, get down at an OFFICE point.
 *   Going home: board at an OFFICE point, get down at a HOME point.
 * Listed in to-office travel order. Fare follows the home point: Isnapur ₹120, the others ₹150.
 * Office coordinates are approximate — adjust here if a point sits in the wrong place.
 */
export const HOME_POINTS = [
  { name: 'Sangareddy', lat: 17.618, lng: 78.083, re: /sangareddy(?!\s*x)|\bsrd\b(?!\s*x)|bus\s*stand/i, area: 'sangareddy' },
  { name: 'SRD X Road', lat: 17.607, lng: 78.091, re: /srd\s*x|sangareddy\s*x/i, area: 'sangareddy' },
  { name: 'Kandi', lat: 17.5813, lng: 78.1085, re: /kandi|\biit\b/i, area: 'sangareddy' },
  { name: 'Isnapur', lat: 17.5453, lng: 78.2132, re: /isnapur/i, area: 'isnapur' },
];
export const OFFICE_POINTS = [
  { name: 'GAR', lat: 17.4, lng: 78.3352, re: /\bgar\b/i },
  { name: 'Cyient Signal', lat: 17.4192, lng: 78.3372, re: /cyient/i },
  { name: 'Capgemini', lat: 17.4194, lng: 78.3392, re: /capgemini/i },
  { name: 'ICICI', lat: 17.4196, lng: 78.3412, re: /icici/i },
  { name: 'Wipro Circle', lat: 17.4261, lng: 78.3379, re: /wipro/i },
  { name: 'Gachibowli', lat: 17.4401, lng: 78.3489, re: /gachibowli/i },
  { name: 'HITEC City', lat: 17.4432, lng: 78.3876, re: /hitec|hi[\s-]?tech|cyber/i },
];
const ALL_POINTS = [...HOME_POINTS.map((p) => ({ ...p, side: 'home' })), ...OFFICE_POINTS.map((p) => ({ ...p, side: 'office' }))];
export const matchPoint = (name) => ALL_POINTS.find((p) => p.re.test(name)) || null;
export const areaOf = (pointName) => HOME_POINTS.find((p) => p.name === pointName)?.area || null;

const P = (name, lat, lng) => ({ name, area: '', lat, lng });
const OFFICE_WAY = OFFICE_POINTS.map((p) => P(p.name, p.lat, p.lng));
export const CORRIDORS = {
  orr: {
    id: 'orr',
    direction: 'work',
    base: 'orr',
    label: 'Via Isnapur & ORR',
    detail: 'Sangareddy → SRD X Road → Kandi → Isnapur → Patancheru ORR → GAR → ICICI → Wipro Circle → Gachibowli → HITEC City',
    serves: ['sangareddy', 'isnapur'],
    waypoints: [P('Sangareddy', 17.618, 78.083), P('SRD X Road', 17.607, 78.091), P('Kandi', 17.5813, 78.1085), P('Rudraram', 17.5638, 78.1649), P('Isnapur', 17.5453, 78.2132), P('Patancheru ORR', 17.5262, 78.253), ...OFFICE_WAY],
  },
  shankarpally: {
    id: 'shankarpally',
    direction: 'work',
    base: 'shankarpally',
    label: 'Via Shankarpally (alternative)',
    detail: 'Sangareddy → SRD X Road → Shankarpally → Mokila → GAR → ICICI → Wipro Circle → Gachibowli → HITEC City',
    serves: ['sangareddy'],
    waypoints: [P('Sangareddy', 17.618, 78.083), P('SRD X Road', 17.607, 78.091), P('Shankarpally', 17.4562, 78.1302), P('Mokila', 17.4263, 78.1881), ...OFFICE_WAY],
  },
};
// Return trips: the same two routes in reverse (Financial District / HITEC City → home).
for (const c of Object.values({ ...CORRIDORS })) {
  CORRIDORS[c.id + '_home'] = {
    ...c, id: c.id + '_home', direction: 'home',
    label: c.id === 'orr' ? 'Via ORR & Isnapur' : 'Via Shankarpally (alternative)',
    detail: c.detail.split(' → ').reverse().join(' → '),
    waypoints: [...c.waypoints].reverse(),
  };
}
export const corridorId = (base, direction) => (direction === 'home' ? base + '_home' : base);
/** Which side Ride Takers board on, and which side they get down on. */
export const sidesFor = (direction) => (direction === 'home' ? { board: 'office', drop: 'home' } : { board: 'home', drop: 'office' });

// Other landmarks Ride Givers commonly type, used to place their own points on the route.
const LANDMARKS = [
  ...ALL_POINTS.map((p) => [p.re, p.lat, p.lng]),
  [/malkapur|chintal/i, 17.625, 78.07],
  [/pothireddy/i, 17.598, 78.104],
  [/rudraram/i, 17.5638, 78.1649],
  [/muthangi/i, 17.5418, 78.228],
  [/patancheru/i, 17.5286, 78.2674],
  [/\borr\b|outer\s*ring/i, 17.5262, 78.253],
  [/kollur/i, 17.472, 78.248],
  [/tellapur/i, 17.4655, 78.2863],
  [/shankar\s*pall/i, 17.4562, 78.1302],
  [/mokila/i, 17.4263, 78.1881],
  [/kokapet/i, 17.3949, 78.3365],
  [/narsingi/i, 17.3915, 78.3599],
  [/nanakramguda/i, 17.4218, 78.338],
  [/financial\s*dist|\bfd\b/i, 17.42, 78.3287],
  [/madhapur|mindspace/i, 17.4483, 78.3915],
];

export async function loadCorridors() {
  for (const c of Object.values(CORRIDORS)) {
    const r = await roadRoute(c.waypoints);
    c.geometry = r.geometry;
    c.cum = cumLengths(r.geometry);
    c.distanceKm = r.distanceKm;
    c.durationMin = r.durationMin;
    c.routeSource = r.routeSource;
    c.isnapurPos = project(ORIGINS.isnapur, c.geometry, c.cum).pos;
    // Fixed points that this corridor actually passes, in travel order.
    const order = c.direction === 'home' ? [...ALL_POINTS].reverse() : ALL_POINTS;
    let min = 0;
    c.fixed = [];
    for (const p of order) {
      const pr = project(p, c.geometry, c.cum, min);
      if (pr.dist > 1.5) continue;
      min = pr.pos;
      c.fixed.push({ name: p.name, side: p.side, pos: +pr.pos.toFixed(3) });
    }
  }
  console.log('[corridors] loaded', Object.values(CORRIDORS).map((c) => `${c.id} ${c.distanceKm}km (${c.routeSource}) · ${c.fixed.map((f) => f.name).join('/')}`).join(' | '));
}

/** Place typed stop names along the corridor (known landmarks, else evenly spaced). */
export function placeStops(corridorId, names) {
  const c = CORRIDORS[corridorId];
  const total = c.distanceKm;
  const pos = names.map(() => null);
  let min = 0;
  names.forEach((name, i) => {
    const lm = LANDMARKS.find(([re]) => re.test(name));
    if (!lm) return;
    const p = project({ lat: lm[1], lng: lm[2] }, c.geometry, c.cum, min);
    if (p.dist < 4) { pos[i] = p.pos; min = p.pos; }
  });
  if (pos[0] == null) pos[0] = 0;
  if (pos[pos.length - 1] == null) pos[pos.length - 1] = total;
  pos[pos.length - 1] = Math.max(pos[pos.length - 1], ...pos.filter((x) => x != null));
  for (let i = 1; i < pos.length - 1; i++) {
    if (pos[i] != null) continue;
    let j = i;
    while (pos[j] == null) j++;
    const a = pos[i - 1], b = pos[j], n = j - i + 1;
    for (let k = i; k < j; k++) pos[k] = a + ((b - a) * (k - i + 1)) / n;
  }
  return names.map((name, i) => {
    const pt = pointAt(c.geometry, pos[i], c.cum);
    return { name, area: '', lat: +pt.lat.toFixed(5), lng: +pt.lng.toFixed(5), pos: +pos[i].toFixed(3) };
  });
}

/**
 * A ride's stops: the Ride Giver's typed points, plus every fixed point the ride passes.
 * Typed names that match a fixed point (e.g. "Sangareddy New Bus Stand") become that point.
 * Fixed points the Ride Giver didn't type are added with auto: true.
 */
export function buildStops(corridorId, names) {
  const c = CORRIDORS[corridorId];
  const typed = placeStops(corridorId, names);
  const used = new Set();
  for (const s of typed) {
    const m = matchPoint(s.name);
    const f = m && c.fixed.find((x) => x.name === m.name);
    if (f && !used.has(f.name)) { s.fixed = f.name; s.side = f.side; s.pos = f.pos; used.add(f.name); }
  }
  // Keep typed points in the order the Ride Giver entered them, now that fixed ones sit at their exact spot.
  for (let i = 1; i < typed.length; i++) {
    if (typed[i].pos < typed[i - 1].pos) typed[i].pos = typed[i - 1].pos;
    const pt = pointAt(c.geometry, typed[i].pos, c.cum);
    typed[i].lat = +pt.lat.toFixed(5);
    typed[i].lng = +pt.lng.toFixed(5);
  }
  const start = typed[0].pos, end = typed[typed.length - 1].pos;
  const autos = c.fixed
    .filter((f) => !used.has(f.name) && f.pos > start - 0.3 && f.pos < end + 0.3)
    .map((f) => {
      const pos = Math.min(Math.max(f.pos, start), end);
      const pt = pointAt(c.geometry, pos, c.cum);
      return { name: f.name, area: '', lat: +pt.lat.toFixed(5), lng: +pt.lng.toFixed(5), pos: +pos.toFixed(3), fixed: f.name, side: f.side, auto: true };
    });
  const middle = [...typed.slice(1, -1), ...autos].sort((a, b) => a.pos - b.pos || (a.auto ? 1 : 0) - (b.auto ? 1 : 0));
  return [typed[0], ...middle, typed[typed.length - 1]];
}

/** The part of the corridor a ride actually covers (positions stay corridor-absolute). */
export function rideShape(corridorId, stops) {
  const c = CORRIDORS[corridorId];
  const start = stops[0].pos, end = stops[stops.length - 1].pos;
  const s0 = pointAt(c.geometry, start, c.cum);
  const geometry = [[s0.lat, s0.lng]];
  c.geometry.forEach((g, i) => { if (c.cum[i] > start && c.cum[i] < end) geometry.push(g); });
  const e = pointAt(c.geometry, end, c.cum);
  geometry.push([e.lat, e.lng]);
  return {
    geometry: geometry.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]), startKm: start, distanceKm: +end.toFixed(3),
    durationMin: Math.max(1, Math.round((c.durationMin * end) / c.distanceKm)), routeSource: c.routeSource,
  };
}
export const geomOf = (ride) => CORRIDORS[ride.corridor]?.geometry || ride.geometry;

const dirOf = (ride) => CORRIDORS[ride.corridor]?.direction || 'work';
const fixedIdx = (ride, side, test = () => true) => ride.stops.map((s, i) => [s, i]).filter(([s]) => s.fixed && s.side === side && test(s)).map(([, i]) => i);

/** Does this ride let a Ride Taker from `origin` (their home area) board and get down at fixed points? */
export function servesOrigin(ride, origin) {
  if (!CORRIDORS[ride.corridor]) return false;
  const home = fixedIdx(ride, 'home', (s) => areaOf(s.fixed) === origin);
  const office = fixedIdx(ride, 'office');
  if (!home.length || !office.length) return false;
  return dirOf(ride) === 'work' ? home[0] < office[office.length - 1] : office[0] < home[home.length - 1];
}

/** Suggested boarding point for a Ride Taker from `origin`. */
export function suggestPickup(ride, origin) {
  if (dirOf(ride) === 'home') return fixedIdx(ride, 'office')[0] ?? 0;
  return fixedIdx(ride, 'home', (s) => areaOf(s.fixed) === origin)[0] ?? 0;
}

/** Suggested get-down point: the furthest office point going in, the home point going home. */
export function suggestDrop(ride, origin) {
  const last = ride.stops.length - 1;
  if (dirOf(ride) === 'work') return fixedIdx(ride, 'office').at(-1) ?? last;
  const home = fixedIdx(ride, 'home', (s) => areaOf(s.fixed) === origin);
  return (origin === 'isnapur' ? home[0] : home.at(-1)) ?? last;
}

/** Validate a Ride Taker's choice and work out their fare area. Returns { origin } or { error }. */
export function checkBoarding(ride, pickupIdx, dropIdx) {
  const { board, drop } = sidesFor(dirOf(ride));
  const p = ride.stops[pickupIdx], d = ride.stops[dropIdx];
  if (!p?.fixed || p.side !== board) return { error: `You can only board at ${board === 'home' ? 'Sangareddy, SRD X Road, Kandi or Isnapur' : 'the office points'}` };
  if (!d?.fixed || d.side !== drop) return { error: `You can only get down at ${drop === 'office' ? 'the office points' : 'Isnapur, Kandi, SRD X Road or Sangareddy'}` };
  return { origin: areaOf(board === 'home' ? p.fixed : d.fixed) };
}

export function publicCorridors() {
  return {
    destination: DESTINATION,
    fares: FARES,
    origins: ORIGINS,
    homePoints: HOME_POINTS.map(({ name, area }) => ({ name, area })),
    officePoints: OFFICE_POINTS.map(({ name }) => ({ name })),
    corridors: Object.values(CORRIDORS).map(({ id, direction, base, label, detail, serves, geometry, distanceKm, durationMin, waypoints, fixed }) => ({ id, direction, base, label, detail, serves, geometry, distanceKm, durationMin, waypoints, fixed })),
  };
}

export { distKm };
