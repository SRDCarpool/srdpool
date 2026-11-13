// Maps & geometry: road routing (OSRM), place search (Nominatim), route matching.
// Providers are configurable via env; defaults are the free OpenStreetMap services,
// which are fine for development but have usage limits — see README.
import { GeoCache } from './db.js';

const OSRM_URL = process.env.OSRM_URL || 'https://router.project-osrm.org';
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const UA = process.env.GEO_USER_AGENT || 'SRDPool-carpool-dev/0.1';
export const CITY = { name: process.env.CITY_NAME || 'Hyderabad', lat: Number(process.env.CITY_LAT || 17.42), lng: Number(process.env.CITY_LNG || 78.44) };

/* ---------------- geometry ---------------- */
const KY = 110.57;
const kx = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);
export function distKm(a, b) {
  const lat = (a.lat + b.lat) / 2;
  return Math.hypot((a.lat - b.lat) * KY, (a.lng - b.lng) * kx(lat));
}
const P = (p) => (Array.isArray(p) ? { lat: p[0], lng: p[1] } : p);

export function cumLengths(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + distKm(P(pts[i - 1]), P(pts[i])));
  return c;
}

/** Closest point on polyline at or after `minPos` km. */
export function project(pt, pts, cum = cumLengths(pts), minPos = 0) {
  let best = { dist: Infinity, pos: 0, lat: 0, lng: 0 };
  const K = kx(pt.lat);
  for (let i = 0; i < pts.length - 1; i++) {
    if (cum[i + 1] < minPos) continue;
    const A = P(pts[i]), B = P(pts[i + 1]);
    const ax = A.lng * K, ay = A.lat * KY, bx = B.lng * K, by = B.lat * KY, px = pt.lng * K, py = pt.lat * KY;
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1e-12;
    let t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    const segLen = cum[i + 1] - cum[i];
    if (cum[i] + t * segLen < minPos) t = segLen ? (minPos - cum[i]) / segLen : 0;
    const qx = ax + t * dx, qy = ay + t * dy;
    const d = Math.hypot(px - qx, py - qy);
    if (d < best.dist) best = { dist: d, pos: cum[i] + t * segLen, lat: A.lat + (B.lat - A.lat) * t, lng: A.lng + (B.lng - A.lng) * t };
  }
  return best;
}

export function pointAt(pts, pos, cum = cumLengths(pts)) {
  let i = 0;
  while (i < pts.length - 2 && cum[i + 1] < pos) i++;
  const A = P(pts[i]), B = P(pts[i + 1] || pts[i]);
  const seg = cum[i + 1] - cum[i] || 1e-9;
  const t = Math.min(1, (pos - cum[i]) / seg); // negative t = before the start
  return { lat: A.lat + (B.lat - A.lat) * t, lng: A.lng + (B.lng - A.lng) * t };
}

/**
 * Route-based matching on the real road geometry: both passenger points must lie
 * near the driver's route, in travel order. Pickup/drop are snapped to the
 * driver's named stops (smart pickup suggestion with no detour).
 */
export function matchRide(ride, from, to, maxKm = 4) {
  const pts = ride.geometry;
  const cum = ride._cum || (ride._cum = cumLengths(pts));
  const p = project(from, pts, cum), q = project(to, pts, cum);
  if (p.dist > maxKm || q.dist > maxKm || q.pos - p.pos < 1) return null;
  const stops = ride.stops;
  let pi = 0, pd = Infinity;
  stops.forEach((s, i) => {
    if (i < stops.length - 1 && s.pos < q.pos - 0.5) {
      const d = distKm(s, from);
      if (d < pd) { pd = d; pi = i; }
    }
  });
  let di = stops.length - 1, dd = Infinity;
  stops.forEach((s, i) => {
    if (i > pi) {
      const d = distKm(s, to);
      if (d < dd) { dd = d; di = i; }
    }
  });
  if (pd > maxKm + 1 || dd > maxKm + 1) return null;
  return { pickupIdx: pi, dropIdx: di, pickupWalk: pd, dropWalk: dd, detour: p.dist + q.dist };
}

/* ---------------- HTTP helpers with cache ---------------- */
async function cached(key, ttlMs, fn) {
  const hit = GeoCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  GeoCache.save({ id: key, at: Date.now(), value });
  return value;
}

let lastNominatim = 0;
async function nominatim(path) {
  // Nominatim usage policy: max 1 request/second, identify the app.
  const wait = lastNominatim + 1100 - Date.now();
  lastNominatim = Math.max(Date.now(), lastNominatim + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(NOMINATIM_URL + path, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Geocoder error ' + res.status);
  return res.json();
}

function toPlace(r) {
  const a = r.address || {};
  const name = r.name || a.suburb || a.neighbourhood || a.road || r.display_name.split(',')[0];
  // Skip administrative noise like "Ward 114" or "... Municipal Corporation West Zone".
  const noisy = (x) => /municipal|corporation|zone|ward|mandal|district/i.test(x);
  const clean = (x) => String(x || '').replace(/^Greater\s+/i, '').trim();
  const parts = [a.neighbourhood, a.suburb, a.city || a.town || a.village, a.state_district].map(clean)
    .filter((x, i, arr) => x && x !== name && !noisy(x) && arr.indexOf(x) === i);
  const fallback = r.display_name.split(',').map((s) => s.trim()).filter((x) => x !== name && !noisy(x) && !/^\d+$/.test(x));
  return { name, area: (parts.length ? parts : fallback).slice(0, 2).join(', '), lat: +r.lat, lng: +r.lon };
}

export const POPULAR = [
  ['Miyapur Metro Station', 17.4968, 78.3614], ['Lingampally', 17.493, 78.317], ['Kukatpally (KPHB)', 17.4849, 78.4138],
  ['Kondapur', 17.46, 78.364], ['HITEC City (Cyber Towers)', 17.4474, 78.3762], ['Madhapur', 17.4483, 78.3915],
  ['Gachibowli', 17.4401, 78.3489], ['Financial District', 17.414, 78.344], ['Jubilee Hills Checkpost', 17.4325, 78.4071],
  ['Banjara Hills', 17.4156, 78.4347], ['Ameerpet Metro', 17.4375, 78.4483], ['Begumpet', 17.4447, 78.4664],
  ['Secunderabad Station', 17.4399, 78.4983], ['Mehdipatnam', 17.3956, 78.44], ['Charminar', 17.3616, 78.4747],
  ['Dilsukhnagar', 17.3688, 78.5247], ['LB Nagar', 17.3457, 78.5522], ['Uppal X Roads', 17.4058, 78.5591],
  ['RGIA Airport', 17.2403, 78.4294],
].map(([name, lat, lng]) => ({ name, area: CITY.name, lat, lng, popular: true }));

export async function searchPlaces(q) {
  q = String(q || '').trim().slice(0, 80);
  if (!q) return POPULAR;
  const local = POPULAR.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  if (q.length < 3) return local;
  try {
    const d = Number(process.env.CITY_RADIUS_DEG || 0.4); // ~45 km around the city centre
    const rows = await cached('s2:' + q.toLowerCase(), 7 * 864e5, () =>
      nominatim(`/search?format=jsonv2&addressdetails=1&limit=10&countrycodes=in&bounded=1&q=${encodeURIComponent(q)}&viewbox=${CITY.lng - d},${CITY.lat + d},${CITY.lng + d},${CITY.lat - d}`),
    );
    const out = [...local];
    // Drop near-duplicates (same name within 600 m), common for long roads split into segments.
    const far = (p) => distKm(p, CITY) > 25;
    const ranked = rows.map(toPlace).sort((x, y) => far(x) - far(y));
    for (const p of ranked) if (!out.some((o) => distKm(o, p) < 0.3 || (o.name === p.name && distKm(o, p) < 0.6))) out.push(p);
    return out.slice(0, 10);
  } catch {
    return local;
  }
}

export async function reversePlace(lat, lng) {
  const key = `r:${lat.toFixed(3)},${lng.toFixed(3)}`;
  try {
    const r = await cached(key, 30 * 864e5, () => nominatim(`/reverse?format=jsonv2&addressdetails=1&zoom=16&lat=${lat}&lon=${lng}`));
    return { ...toPlace(r), lat, lng };
  } catch {
    const near = [...POPULAR].sort((a, b) => distKm(a, { lat, lng }) - distKm(b, { lat, lng }))[0];
    return { name: 'Current location', area: `near ${near.name}`, lat, lng };
  }
}

/** Road route through all stops. Falls back to straight lines if routing is unavailable. */
export async function roadRoute(stops) {
  const coords = stops.map((s) => `${s.lng.toFixed(5)},${s.lat.toFixed(5)}`).join(';');
  let geometry, durationMin, source = 'osrm';
  try {
    const r = await cached('route:' + coords, 30 * 864e5, async () => {
      const res = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
      const j = await res.json();
      if (j.code !== 'Ok') throw new Error(j.code);
      return { geometry: j.routes[0].geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]), duration: j.routes[0].duration };
    });
    geometry = r.geometry;
    durationMin = r.duration / 60;
  } catch {
    source = 'straight';
    geometry = stops.map((s) => [s.lat, s.lng]);
  }
  const cum = cumLengths(geometry);
  const distanceKm = cum[cum.length - 1];
  if (source === 'straight') durationMin = (distanceKm * 1.3 / 25) * 60;
  let min = 0;
  const placed = stops.map((s, i) => {
    const pos = i === 0 ? 0 : i === stops.length - 1 ? distanceKm : project(s, geometry, cum, min).pos;
    min = pos;
    return { name: s.name, area: s.area || '', lat: s.lat, lng: s.lng, pos: +pos.toFixed(3) };
  });
  return { geometry, stops: placed, distanceKm: +distanceKm.toFixed(2), durationMin: Math.round(durationMin), routeSource: source };
}

export const speedKmh = (ride) => Math.min(45, Math.max(15, ride.distanceKm / Math.max(1, ride.durationMin / 60) || 25));
export const etaMin = (ride, km) => Math.max(1, Math.round((Math.max(0, km) / speedKmh(ride)) * 60));
