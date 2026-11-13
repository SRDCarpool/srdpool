// Client helpers for rides whose stops are real places: { name, area, lat, lng, pos }.
export const routeIds = (ride) => ride?.stops || [];
export const stopPos = (ride, idx) => ride?.stops?.[idx]?.pos ?? 0;
export const routeLen = (ride) => ride?.distanceKm || 0;
export const placeName = (p) => (p && typeof p === 'object' ? p.name : p || '');

export function distKm(a, b) {
  const lat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  return Math.hypot((a.lat - b.lat) * 110.57, (a.lng - b.lng) * 111.32 * Math.cos(lat));
}

const speed = (ride) => Math.min(45, Math.max(15, ride?.distanceKm / Math.max(1, (ride?.durationMin || 0) / 60) || 25));
/** Minutes to travel `kmLeft` along this ride's road route. */
export const etaMin = (kmLeft, ride) => Math.max(1, Math.round((Math.max(0, kmLeft) / speed(ride)) * 60));
export const roadKm = (km) => Math.max(0, km);

/* ---------------- formatting ---------------- */
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
export function fmtDay(ts) {
  const d = new Date(ts), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(now)) / 86400e3);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
export const fmtWhen = (ts) => `${fmtDay(ts)}, ${fmtTime(ts)}`;
export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return fmtDay(ts);
}
export const km = (v) => `${v < 1 ? v.toFixed(1) : Math.round(v * 10) / 10} km`;
export const rupee = (v) => `₹${Math.round(v)}`;
export const first = (name = '') => name.split(' ')[0];
export const samePlace = (a, b) => !!a && !!b && distKm(a, b) < 0.2;
export const shortPlace = (p) => ({ name: p.name, area: p.area || '', lat: p.lat, lng: p.lng });
