// The fixed commuter corridors Saathi serves, and their fares.
// Passengers can only travel from Sangareddy or Isnapur to Financial District / HITEC City.
import { roadRoute, cumLengths, project, pointAt, distKm } from './geo.js';

export const DESTINATION = 'Financial District / HITEC City';
export const FARES = { sangareddy: 150, isnapur: 120 };
export const ORIGINS = {
  sangareddy: { id: 'sangareddy', name: 'Sangareddy', lat: 17.618, lng: 78.083 },
  isnapur: { id: 'isnapur', name: 'Isnapur', lat: 17.5453, lng: 78.2132 },
};

const P = (name, lat, lng) => ({ name, area: '', lat, lng });
export const CORRIDORS = {
  orr: {
    id: 'orr',
    label: 'Via Isnapur & ORR',
    detail: 'Sangareddy → Kandi → Rudraram → Isnapur → Patancheru ORR → Financial District → HITEC City',
    serves: ['sangareddy', 'isnapur'],
    waypoints: [P('Sangareddy', 17.618, 78.083), P('Kandi', 17.5813, 78.1085), P('Rudraram', 17.5638, 78.1649), P('Isnapur', 17.5453, 78.2132), P('Patancheru ORR', 17.5262, 78.253), P('Financial District', 17.42, 78.3287), P('HITEC City', 17.4432, 78.3876)],
  },
  shankarpally: {
    id: 'shankarpally',
    label: 'Via Shankarpally (alternative)',
    detail: 'Sangareddy → Shankarpally → Mokila → Financial District → HITEC City',
    serves: ['sangareddy'],
    waypoints: [P('Sangareddy', 17.618, 78.083), P('Shankarpally', 17.4562, 78.1302), P('Mokila', 17.4263, 78.1881), P('Financial District', 17.42, 78.3287), P('HITEC City', 17.4432, 78.3876)],
  },
};

// Landmarks drivers commonly type, used to place their pickup points on the route.
const LANDMARKS = [
  [/srd\s*x|sangareddy\s*x/i, 17.607, 78.091],
  [/malkapur|chintal/i, 17.625, 78.07],
  [/sangareddy|srd|bus\s*stand/i, 17.618, 78.083],
  [/pothireddy/i, 17.598, 78.104],
  [/kandi|iit/i, 17.5813, 78.1085],
  [/rudraram/i, 17.5638, 78.1649],
  [/isnapur/i, 17.5453, 78.2132],
  [/muthangi/i, 17.5418, 78.228],
  [/patancheru/i, 17.5286, 78.2674],
  [/\borr\b|outer\s*ring/i, 17.5262, 78.253],
  [/kollur/i, 17.472, 78.248],
  [/tellapur/i, 17.4655, 78.2863],
  [/shankar\s*pall/i, 17.4562, 78.1302],
  [/mokila/i, 17.4263, 78.1881],
  [/kokapet/i, 17.3949, 78.3365],
  [/narsingi/i, 17.3915, 78.3599],
  [/icici/i, 17.4196, 78.3412],
  [/wipro/i, 17.4261, 78.3379],
  [/nanakramguda/i, 17.4218, 78.338],
  [/financial\s*dist|\bfd\b/i, 17.42, 78.3287],
  [/gachibowli/i, 17.4436, 78.352],
  [/hitec|hi[\s-]?tech|cyber|madhapur|mindspace/i, 17.4432, 78.3876],
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
  }
  console.log('[corridors] loaded', Object.values(CORRIDORS).map((c) => `${c.id} ${c.distanceKm}km (${c.routeSource})`).join(', '));
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

export const servesOrigin = (ride, origin) =>
  !!CORRIDORS[ride.corridor] && CORRIDORS[ride.corridor].serves.includes(origin) && (origin === 'isnapur' || ride.origin === 'sangareddy');

/** Best pickup stop for a passenger from `origin`. */
export function suggestPickup(ride, origin) {
  if (origin !== 'isnapur') return 0;
  const target = CORRIDORS[ride.corridor].isnapurPos;
  const named = ride.stops.findIndex((s, i) => i < ride.stops.length - 1 && /isnapur/i.test(s.name));
  if (named >= 0) return named;
  let best = 0, bd = Infinity;
  ride.stops.forEach((s, i) => { if (i < ride.stops.length - 1 && Math.abs(s.pos - target) < bd) { bd = Math.abs(s.pos - target); best = i; } });
  return best;
}

export function publicCorridors() {
  return {
    destination: DESTINATION,
    fares: FARES,
    origins: ORIGINS,
    corridors: Object.values(CORRIDORS).map(({ id, label, detail, serves, geometry, distanceKm, durationMin, waypoints }) => ({ id, label, detail, serves, geometry, distanceKm, durationMin, waypoints })),
  };
}

export { distKm };
