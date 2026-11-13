import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, post, getToken, setToken, connectSocket } from './api';

const Ctx = createContext(null);
const LOCAL_KEY = 'saathi-local-v2';
const CACHE_KEY = 'saathi-cache-v3';
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch { return {}; } };
const writeLocal = (v) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(v)); } catch { /* ignore */ } };
const tid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- selectors (shape-compatible with the screens) ---------------- */
export const BOOKED = ['confirmed', 'picked', 'completed'];
export const ACTIVE = ['requested', 'confirmed', 'picked'];
export function getUser(s, id) {
  return s.users?.[id] || s.extraUsers?.[id] || { id, name: 'Member', rating: null, color: '#64748B' };
}
export const rideById = (s, id) => s.rides?.find((r) => r.id === id) || s.extraRides?.[id] || null;
export const seatsLeft = (s, ride) => ride?.seatsLeft ?? 0;
export const myBooking = (s, rideId) => [...(s.bookings || [])].reverse().find((b) => b.rideId === rideId && b.passengerId === 'me');
export const isExpired = (ride) => ride?.status === 'expired';

export function rideRoute(s, rideId) {
  const ride = rideById(s, rideId);
  if (!ride) return ['ride', { rideId }];
  if (ride.driverId === 'me') return ride.status === 'started' ? ['track', { rideId }] : ['manage', { rideId }];
  const b = myBooking(s, rideId);
  if (ride.status === 'started' && b && ['confirmed', 'picked'].includes(b.status)) return ['track', { rideId }];
  return ['ride', { rideId }];
}

/* ---------------- provider ---------------- */
export function StoreProvider({ children }) {
  const [local, setLocalState] = useState(() => ({ lang: 'en', onboarded: false, ...readLocal() }));
  const [snap, setSnap] = useState(() => { try { return getToken() ? JSON.parse(localStorage.getItem(CACHE_KEY)) : null; } catch { return null; } });
  const [config, setConfig] = useState(null);
  const [toast, setToastState] = useState(null);
  const [extra, setExtra] = useState({ rides: {}, users: {} });
  const [authed, setAuthed] = useState(!!getToken());
  const [loading, setLoading] = useState(!!getToken());
  const [version, setVersion] = useState(0);
  const [online, setOnline] = useState(true);
  const sock = useRef(null);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const setLocal = (patch) => setLocalState((l) => { const n = { ...l, ...patch }; writeLocal(n); return n; });
  const showToast = useCallback((title, body, extraFields = {}) => setToastState({ id: tid(), title, body, ...extraFields }), []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    try {
      const s = await api('/state');
      setSnap(s);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* quota */ }
      setOnline(true);
    } catch (e) {
      if (e.status === 401) { setToken(null); setAuthed(false); setSnap(null); }
      else if (e.status === 0) setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { api('/config').then(setConfig).catch(() => setConfig({ demo: false, tiles: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' } })); }, []);

  // Realtime
  useEffect(() => {
    if (!authed) return;
    refresh();
    let t;
    sock.current = connectSocket((msg) => {
      if (msg.type === 'sync') {
        clearTimeout(t);
        t = setTimeout(() => { refresh(); setVersion((v) => v + 1); }, 80);
      } else if (msg.type === 'notification') {
        if (msg.toast) setToastState({ id: tid(), title: msg.n.title, body: msg.n.body, rideId: msg.n.rideId, helpId: msg.n.helpId, kind: msg.n.type });
      } else if (msg.type === 'live') {
        const patch = (r) => (r && r.id === msg.rideId ? { ...r, live: msg.live, status: msg.status } : r);
        setSnap((s) => (s ? { ...s, rides: s.rides.map(patch) } : s));
        setExtra((e) => (e.rides[msg.rideId] ? { ...e, rides: { ...e.rides, [msg.rideId]: patch(e.rides[msg.rideId]) } } : e));
      }
    }, (up) => up && setOnline(true));
    return () => { clearTimeout(t); sock.current?.close(); };
  }, [authed, refresh]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToastState((x) => (x?.id === toast.id ? null : x)), 3800);
    return () => clearTimeout(t);
  }, [toast?.id]);

  // Driver phone GPS → server, while one of my rides is live and not simulated.
  const liveRide = snap?.rides?.find((r) => r.driverId === 'me' && r.status === 'started' && !r.simulate);
  useEffect(() => {
    if (!liveRide || !navigator.geolocation || snap?.prefs?.shareLocation === false) return;
    const id = navigator.geolocation.watchPosition(
      (p) => sock.current?.send({ type: 'loc', rideId: liveRide.id, lat: p.coords.latitude, lng: p.coords.longitude }),
      () => showToast('Location unavailable', 'Allow location access so passengers can track you'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [liveRide?.id]);

  /* ---------------- actions ---------------- */
  const actions = useMemo(() => {
    const run = async (fn, okMsg) => {
      try {
        const r = await fn();
        if (okMsg) showToast(okMsg);
        refresh();
        return r;
      } catch (e) {
        showToast(e.message);
        return null;
      }
    };
    const setData = (key, value) => {
      setSnap((s) => (s ? { ...s, [key]: value } : s));
      return run(() => api('/me/data/' + key, { method: 'PUT', body: { value } }));
    };
    const cur = () => snapRef.current || {};
    return {
      /* local */
      finishOnboarding: () => setLocal({ onboarded: true }),
      setLang: (lang) => setLocal({ lang }),
      toast: showToast,

      /* auth */
      requestOtp: (phone) => post('/auth/otp', { phone }),
      verifyOtp: async (phone, code) => {
        const r = await post('/auth/verify', { phone, code });
        setToken(r.token);
        setLoading(true);
        setAuthed(true);
        return r;
      },
      logout: async () => {
        try { await post('/auth/logout'); } catch { /* ignore */ }
        setToken(null);
        localStorage.removeItem(CACHE_KEY);
        setSnap(null);
        setAuthed(false);
      },
      updateMe: (patch) => run(() => api('/me', { method: 'PATCH', body: patch })),
      setRole: (role) => run(() => api('/me', { method: 'PATCH', body: { role } }), role === 'giver' ? 'You are now a Ride Giver 🚗' : 'You are now a Ride Taker 🙋'),
      setPref: (path, value) => {
        const [a, b] = path.split('.');
        const body = b ? { [a]: { [b]: value } } : { [a]: value };
        setSnap((s) => s && { ...s, prefs: b ? { ...s.prefs, [a]: { ...s.prefs[a], [b]: value } } : { ...s.prefs, [a]: value } });
        return run(() => api('/me/prefs', { method: 'PUT', body }));
      },
      markAllRead: () => run(() => post('/notifications/read')),

      /* fetching */
      fetchRide: async (id) => {
        const r = await api('/rides/' + id);
        setExtra((e) => ({ rides: { ...e.rides, [id]: r.ride }, users: { ...e.users, ...r.users } }));
        return r;
      },
      fetchUser: (id) => api('/users/' + id),
      search: async (q) => {
        const res = await post('/search', q);
        setExtra((e) => ({
          rides: { ...e.rides, ...Object.fromEntries(res.map((x) => [x.ride.id, x.ride])) },
          users: { ...e.users, ...Object.fromEntries(res.map((x) => [x.driver.id, x.driver])) },
        }));
        return res;
      },
      /* saved things */
      addRecentSearch: (q) => setData('recentSearches', [q, ...(cur().recentSearches || []).filter((r) => !(r.from.name === q.from.name && r.to.name === q.to.name))].slice(0, 5)),
      saveRoute: (r) => {
        if ((cur().savedRoutes || []).some((x) => x.from.name === r.from.name && x.to.name === r.to.name)) return;
        showToast('Route saved', `${r.from.name} → ${r.to.name}`);
        return setData('savedRoutes', [...(cur().savedRoutes || []), { id: tid(), ...r }]);
      },
      removeRoute: (id) => setData('savedRoutes', (cur().savedRoutes || []).filter((r) => r.id !== id)),
      savePlace: (label, place) => setData('savedPlaces', [...(cur().savedPlaces || []).filter((p) => p.label !== label), { id: tid(), label, place }]),
      removePlace: (id) => setData('savedPlaces', (cur().savedPlaces || []).filter((p) => p.id !== id)),
      setCommute: (c) => { if (c) showToast('Daily commute saved', "We'll suggest matching rides automatically"); return setData('commute', c); },
      setHoliday: (v) => { showToast(v ? 'Ride alerts paused 🌴' : 'Ride alerts resumed'); return setData('holidayMode', v); },
      addEmergency: (c) => setData('emergency', [...(cur().emergency || []), { id: tid(), ...c }]),
      removeEmergency: (id) => setData('emergency', (cur().emergency || []).filter((c) => c.id !== id)),
      toggleFavorite: (userId) => run(async () => {
        const r = await post(`/me/favorites/${userId}`);
        const u = getUser({ ...cur(), extraUsers: extra.users }, userId);
        showToast(r.on ? `${u.name.split(' ')[0]} added to favourites ❤️` : 'Removed from favourites', r.on ? 'Their rides will be shown first' : '');
      }),
      block: (userId) => run(() => post(`/me/blocked/${userId}`), "Member blocked — you won't see each other's rides"),
      unblock: (userId) => run(() => post(`/me/blocked/${userId}`)),
      submitWork: async (data) => {
        try {
          await post('/me/work-verification', data);
          refresh();
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
      submitVehicle: (vehicle, licence) => run(() => post('/me/vehicle', { vehicle, licence })),
      joinCommunity: (id) => run(() => post(`/me/communities/${id}`, { join: true }), 'Community joined ✅'),
      leaveCommunity: (id) => run(() => post(`/me/communities/${id}`, { join: false })),

      /* passenger */
      requestBooking: ({ rideId, pickupIdx, dropIdx, seats, note, origin }) => run(() => post(`/rides/${rideId}/book`, { pickupIdx, dropIdx, seats, note, origin })),
      joinWaitlist: ({ rideId, pickupIdx, dropIdx, seats, origin }) => run(() => post(`/rides/${rideId}/waitlist`, { join: true, pickupIdx, dropIdx, seats, origin })),
      leaveWaitlist: (rideId) => run(() => post(`/rides/${rideId}/waitlist`, { join: false })),
      cancelBooking: (id, reason) => run(() => post(`/bookings/${id}/cancel`, { reason })),
      confirmBoarded: (id) => run(() => post(`/bookings/${id}/board`), 'Boarding confirmed ✅'),
      demoStartRide: (rideId) => run(() => post(`/rides/${rideId}/demo-start`)),
      subscribe: (rideId) => run(() => post(`/rides/${rideId}/subscribe`)),
      pay: (id) => run(() => post(`/bookings/${id}/pay`)),

      /* driver */
      postRide: async (data) => {
        try {
          const ride = await post('/rides', data);
          refresh();
          showToast('Ride published 🎉', "We'll notify you when someone requests a seat");
          return { ok: true, id: ride.id };
        } catch (e) {
          return { ok: false, error: e.message, conflictId: e.body?.conflictId };
        }
      },
      editRide: (id, patch) => run(() => api(`/rides/${id}`, { method: 'PATCH', body: patch })),
      cancelRide: (id, reason) => run(() => post(`/rides/${id}/cancel`, { reason })),
      respondRequest: (id, accept) => run(() => post(`/bookings/${id}/respond`, { accept }), accept ? 'Passenger confirmed ✅' : 'Request declined'),
      startRide: (id, simulate) => run(() => post(`/rides/${id}/start`, { simulate })),
      markPicked: (id) => run(() => post(`/bookings/${id}/picked`), 'Picked up ✅'),
      markNoShow: (id) => run(() => post(`/bookings/${id}/noshow`), 'Marked as no-show'),
      sendDelay: (id, mins) => run(() => post(`/rides/${id}/delay`, { mins })),
      endRide: (id) => run(() => post(`/rides/${id}/end`)),
      requestHelp: async (rideId, body) => {
        try { const r = await post(`/rides/${rideId}/help`, body); refresh(); return { ok: true, req: r }; } catch (e) { showToast(e.message); return { ok: false }; }
      },
      offerHelp: async (helpId, rideId) => {
        try { const r = await post(`/help/${helpId}/offer`, { rideId }); refresh(); return { ok: true, ...r }; } catch (e) { showToast(e.message); refresh(); return { ok: false }; }
      },
      declineHelp: (helpId) => run(() => post(`/help/${helpId}/decline`)),
      cancelHelp: (helpId) => run(() => post(`/help/${helpId}/cancel`), 'Glad it is fixed — continuing the ride'),

      /* chat, ratings, safety */
      sendChat: (rideId, text) => run(() => post(`/rides/${rideId}/messages`, { text })),
      report: (body) => run(() => post('/reports', body)),
      sosAlert: (rideId) => run(() => post('/sos', { rideId })),
      createAlert: ({ origin, via }) => run(() => post('/alerts', { origin, via })),
      removeAlert: (id) => run(() => api('/alerts/' + id, { method: 'DELETE' })),
      refresh,
    };
  }, [refresh, showToast, extra.users]);

  const state = useMemo(() => ({
    ...(snap || {}),
    users: snap?.users || {},
    rides: snap?.rides || [],
    bookings: snap?.bookings || [],
    notifications: snap?.notifications || [],
    chats: snap?.chats || {},
    favorites: snap?.favorites || [],
    blocked: snap?.blocked || [],
    savedPlaces: snap?.savedPlaces || [],
    savedRoutes: snap?.savedRoutes || [],
    recentSearches: snap?.recentSearches || [],
    emergency: snap?.emergency || [],
    communities: snap?.communities || [],
    subscriptions: snap?.subscriptions || [],
    payments: snap?.payments || [],
    alerts: snap?.alerts || [],
    help: snap?.help || [],
    reports: snap?.reports || [],
    me: snap?.me || {},
    prefs: snap?.prefs || { notif: {} },
    extraRides: extra.rides,
    extraUsers: extra.users,
    lang: local.lang,
    onboarded: local.onboarded,
    auth: authed ? { phone: snap?.me?.phone } : null,
    toast,
    config,
    version,
    online,
    loading,
  }), [snap, extra, local, authed, toast, config, version, online, loading]);

  return <Ctx.Provider value={{ state, ...actions }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

/** Load something async and re-run when deps or server state version change. */
export function useAsync(fn, deps) {
  const { state } = useStore();
  const [res, setRes] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let live = true;
    setRes((r) => ({ ...r, loading: true }));
    Promise.resolve(fn())
      .then((data) => live && setRes({ data, loading: false, error: null }))
      .catch((error) => live && setRes({ data: null, loading: false, error }));
    return () => { live = false; };
  }, [...deps, state.version]); // eslint-disable-line react-hooks/exhaustive-deps
  return res;
}
