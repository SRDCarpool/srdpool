import { createContext, useContext, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PREFS } from './data';
import { fmtTime, fmtDay, rupee } from './geo';
import { useStore, getUser, seatsLeft } from './store';

export const NavCtx = createContext(null);
export const useNav = () => useContext(NavCtx);

/* ---------------- icons ---------------- */
const P = {
  home: <><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></>,
  search: <><circle cx="11" cy="11" r="7.5" /><path d="m20.5 20.5-4.2-4.2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  plusc: <><circle cx="12" cy="12" r="9.5" /><path d="M12 8v8M8 12h8" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></>,
  star: <><path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" /></>,
  heart: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  chat: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5h.5a8.5 8.5 0 0 1 8 8z" /></>,
  phone: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></>,
  back: <><path d="m15 18-6-6 6-6" /></>,
  right: <><path d="m9 18 6-6-6-6" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  swap: <><path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" /></>,
  car: <><path d="M5 17H3.5a.5.5 0 0 1-.5-.5V13l2.2-5.2A2 2 0 0 1 7 6.5h10a2 2 0 0 1 1.8 1.3L21 13v3.5a.5.5 0 0 1-.5.5H19M3 13h18M9 17h6" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
  send: <><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></>,
  globe: <><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5a14.6 14.6 0 0 1 4 9.5 14.6 14.6 0 0 1-4 9.5 14.6 14.6 0 0 1-4-9.5 14.6 14.6 0 0 1 4-9.5z" /></>,
  help: <><circle cx="12" cy="12" r="9.5" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  rupee: <><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 0 0-10" /></>,
  bag: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  nav: <><path d="M3 11 22 2l-9 19-2-8z" /></>,
  edit: <><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" /></>,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  chart: <><path d="M12 20V10M18 20V4M6 20v-4" /></>,
  locate: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" /></>,
  filter: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></>,
  bookmark: <><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
  info: <><circle cx="12" cy="12" r="9.5" /><path d="M12 16v-4M12 8h.01" /></>,
  more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  leaf: <><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z" /><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  repeat: <><path d="m17 1 4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
  ban: <><circle cx="12" cy="12" r="9.5" /><path d="m5.3 5.3 13.4 13.4" /></>,
  wifi: <><path d="M1 1l22 22M16.7 11.1A11 11 0 0 1 19 12.6M5 12.6a11 11 0 0 1 5.2-2.5M10.7 5.1A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.7-2.9M8.5 16.1a6 6 0 0 1 7 0M12 20h.01" /></>,
  seat: <><path d="M7 3v9a2 2 0 0 0 2 2h7l2 7M7 14l-2 7M9 9h6" /></>,
};
export function Icon({ name, size = 20, stroke = 2, fill = 'none', style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      {P[name]}
    </svg>
  );
}

/* ---------------- primitives ---------------- */
export function Avatar({ user, size = 44, ring }) {
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={'avatar' + (ring ? ' ring' : '')} style={{ width: size, height: size, background: user?.color || '#94A3B8', fontSize: size * 0.38 }}>
      {user?.photo ? <img src={user.photo} alt="" /> : initials}
    </div>
  );
}

export function Header({ title, sub, back = true, right, onBack }) {
  const nav = useNav();
  return (
    <header className="header">
      {back ? (
        <button className="icon-btn" onClick={onBack || nav.back} aria-label="Back"><Icon name="back" size={22} /></button>
      ) : <span style={{ width: 8 }} />}
      <div className="header-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="header-right">{right}</div>
    </header>
  );
}

export function Sheet({ open, onClose, title, children, tall }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className={'sheet' + (tall ? ' tall' : '')} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function SlideToConfirm({ label, onConfirm, tone = 'primary', disabled }) {
  const track = useRef(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const [done, setDone] = useState(false);
  const max = () => (track.current ? track.current.offsetWidth - 60 : 200);
  const start = useRef(0);
  const down = (e) => {
    if (disabled || done) return;
    setDrag(true);
    start.current = e.clientX - x;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => drag && setX(Math.max(0, Math.min(max(), e.clientX - start.current)));
  const up = () => {
    if (!drag) return;
    setDrag(false);
    if (x > max() * 0.85) {
      setX(max());
      setDone(true);
      setTimeout(() => { onConfirm(); setDone(false); setX(0); }, 250);
    } else setX(0);
  };
  const key = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onConfirm(); }
  };
  return (
    <div ref={track} className={`slider ${tone}` + (disabled ? ' disabled' : '')}>
      <div className="slider-fill" style={{ width: x + 56 }} />
      <span className="slider-label" style={{ opacity: 1 - x / (max() || 1) }}>{label}</span>
      <div
        className="slider-knob" role="button" tabIndex={0} aria-label={label} onKeyDown={key}
        style={{ transform: `translateX(${x}px)`, transition: drag ? 'none' : 'transform .25s' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      >
        <Icon name={done ? 'check' : 'right'} size={26} stroke={2.6} />
      </div>
    </div>
  );
}

export function Badges({ user, small }) {
  return (
    <>
      {user.workVerified && <span className={'badge blue' + (small ? ' sm' : '')}>🏢 {user.company || 'Work verified'}</span>}
      {user.verified && <span className={'badge green' + (small ? ' sm' : '')}><Icon name="shield" size={12} /> Verified Ride Giver</span>}
      {user.trusted && <span className={'badge gold' + (small ? ' sm' : '')}>★ Trusted</span>}
    </>
  );
}

const STAGES = [
  ['requested', 'Requested'],
  ['confirmed', 'Confirmed'],
  ['started', 'Ride started'],
  ['picked', 'Picked up'],
  ['completed', 'Completed'],
];
export function StatusSteps({ booking, ride }) {
  if (booking.status === 'transferred') return <div className="note"><Icon name="car" size={16} /><span>Moved to another Ride Giver's car after a breakdown.</span></div>;
  if (['cancelled', 'rejected', 'noshow', 'expired'].includes(booking.status)) {
    const label = { rejected: 'Request not accepted', noshow: 'Marked as no-show', expired: 'Ride expired', cancelled: 'Cancelled' }[booking.status];
    return <div className="status-cancel"><Icon name="x" size={16} /> {label}{booking.reason ? ` · ${booking.reason}` : ''}</div>;
  }
  if (booking.status === 'waitlist') return <div className="note"><Icon name="clock" size={16} /> You're on the waiting list — we'll notify you when a seat opens.</div>;
  let idx = { requested: 0, confirmed: 1, picked: 3, completed: 4 }[booking.status] ?? 0;
  if (booking.status === 'confirmed' && ride.status === 'started') idx = 2;
  return (
    <div className="steps">
      {STAGES.map(([k, label], i) => (
        <div key={k} className={'step' + (i < idx ? ' done' : '') + (i === idx ? ' now' : '')}>
          <span className="dot">{i < idx ? <Icon name="check" size={11} stroke={3} /> : null}</span>
          <span className="lbl">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 6 }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">−</button>
      <b>{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase">+</button>
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={'toggle' + (checked ? ' on' : '')} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Chip({ on, onClick, children }) {
  return <button className={'chip' + (on ? ' on' : '')} onClick={onClick} type="button">{children}</button>;
}

export function Empty({ icon = 'car', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-ic"><Icon name={icon} size={30} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Row({ icon, title, sub, onClick, right, danger }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={'row' + (danger ? ' danger' : '')} onClick={onClick}>
      {icon && <span className="row-ic"><Icon name={icon} size={19} /></span>}
      <span className="row-txt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {right !== undefined ? right : onClick && <Icon name="right" size={18} className="muted" />}
    </Tag>
  );
}

/** Vertical timeline of a ride's stops, highlighting the passenger's segment. */
export function RouteStops({ ride, pickupIdx, dropIdx, compact }) {
  const stops = ride.stops || [];
  const show = stops.map((s, i) => [s, i]).filter(([, i]) => !compact || i === 0 || i === stops.length - 1 || i === pickupIdx || i === dropIdx);
  return (
    <ol className="stops">
      {show.map(([s, i]) => {
        const tag = i === pickupIdx ? 'Your pickup' : i === dropIdx ? 'Your drop' : null;
        const inSeg = pickupIdx != null && i >= pickupIdx && i <= dropIdx;
        return (
          <li key={i} className={(tag ? 'hl ' : '') + (inSeg ? 'seg' : '')}>
            <span className="sdot" />
            <div>
              <b>{s.name}</b> {s.area && <small>{s.area}</small>}
              {tag && <span className="tag">{tag}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- map (Leaflet + OpenStreetMap tiles) ---------------- */
const dotIcon = (cls) => L.divIcon({ className: '', html: `<div class="mk ${cls}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
const carIcon = L.divIcon({ className: '', html: '<div class="mk-car"><div class="mk-pulse"></div>🚗</div>', iconSize: [36, 36], iconAnchor: [18, 18] });

const sosIcon = L.divIcon({ className: '', html: '<div class="mk-sos">🆘</div>', iconSize: [34, 34], iconAnchor: [17, 17] });

export function MapView({ ride, live, pickupIdx, dropIdx, height = 260, follow = false, showLabels = true, alert }) {
  const { state } = useStore();
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const car = useRef(null);
  const userMoved = useRef(false);
  const alertMk = useRef(null);
  const stops = ride?.stops || [];
  const geometry = ride?.geometry?.length ? ride.geometry : stops.map((s) => [s.lat, s.lng]);
  const key = (ride?.id || '') + ':' + geometry.length + ':' + stops.length + ':' + pickupIdx + ':' + dropIdx;

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true });
    const t = state.config?.tiles || { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors' };
    L.tileLayer(t.url, { maxZoom: 19, attribution: t.attribution }).addTo(map.current);
    map.current.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    map.current.on('dragstart', () => (userMoved.current = true));
    layers.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; car.current = null; };
  }, []); // eslint-disable-line

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.clearLayers();
    if (!geometry.length) { m.setView([state.config?.city?.lat || 17.42, state.config?.city?.lng || 78.44], 11); return; }
    L.polyline(geometry, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(layers.current);
    const line = L.polyline(geometry, { color: '#0B8A6B', weight: 5 }).addTo(layers.current);
    stops.forEach((s, i) => {
      const end = i === 0 || i === stops.length - 1;
      const cls = i === pickupIdx ? 'pick' : i === dropIdx ? 'drop' : end ? 'end' : 'stop';
      const mk = L.marker([s.lat, s.lng], { icon: dotIcon(cls), keyboard: false }).addTo(layers.current);
      if (showLabels && (end || i === pickupIdx || i === dropIdx || stops.length <= 4)) mk.bindTooltip(s.name, { permanent: true, direction: 'top', offset: [0, -8], className: 'mk-label' });
    });
    m.fitBounds(line.getBounds(), { padding: [36, 36] });
    setTimeout(() => m.invalidateSize(), 60);
  }, [key]); // eslint-disable-line

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!live) { car.current?.remove(); car.current = null; return; }
    const ll = [live.lat, live.lng];
    if (!car.current) car.current = L.marker(ll, { icon: carIcon, zIndexOffset: 1000 }).addTo(m);
    else car.current.setLatLng(ll);
    if (follow && !userMoved.current) m.panTo(ll, { animate: true });
  }, [live?.lat, live?.lng, follow]); // eslint-disable-line

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    alertMk.current?.remove();
    alertMk.current = alert ? L.marker([alert.lat, alert.lng], { icon: sosIcon, zIndexOffset: 900 }).addTo(m) : null;
  }, [alert?.lat, alert?.lng]); // eslint-disable-line

  return <div className="map" style={{ height }} ref={el} role="region" aria-label="Route map" />;
}

/* ---------------- ride card ---------------- */
export const VIA = { orr: 'Via Isnapur & ORR', shankarpally: 'Via Shankarpally' };

/** "9:00 AM Malkapur Chintal > SRD X Road > ORR > ICICI > Wipro Circle" */
export function RouteLine({ ride, pickupIdx, dropIdx, withTime = true }) {
  return (
    <div className="route-line">
      {withTime && <b className="rl-time">{fmtTime(ride.time)}</b>}
      {ride.stops.map((s, i) => (
        <span key={i} className={'rl-stop' + (i === pickupIdx ? ' pick' : i === dropIdx ? ' drop' : '')}>
          {i > 0 && <span className="rl-sep">›</span>}{s.name}
        </span>
      ))}
    </div>
  );
}

export function RideCard({ ride, fare, pickupIdx, onClick, fav }) {
  const { state } = useStore();
  const driver = getUser(state, ride.driverId);
  const left = seatsLeft(state, ride);
  return (
    <button className="card ride-card" onClick={onClick}>
      <div className="rc-top">
        <div className="rc-time">
          <b>{fmtTime(ride.time)}</b>
          <small>{fmtDay(ride.time)}</small>
        </div>
        <div className="rc-price">
          <b>{rupee(fare ?? ride.price)}</b>
          <small>per seat</small>
        </div>
      </div>
      <div style={{ margin: '10px 0 4px' }}><RouteLine ride={ride} pickupIdx={pickupIdx} withTime={false} /></div>
      <div className="rc-tags"><span className={'mini-tag ' + (ride.corridor === 'shankarpally' ? 'amber' : 'green')}>{VIA[ride.corridor] || 'Fixed route'}</span>{pickupIdx != null && <span className="mini-tag blue">Board at {ride.stops[pickupIdx].name}</span>}</div>
      <div className="rc-foot">
        <Avatar user={driver} size={34} />
        <div className="rc-driver">
          <b>{driver.name} {fav && <Icon name="heart" size={13} fill="var(--danger)" stroke={0} />}</b>
          <small>{ride.vehicle?.color} {ride.vehicle?.brand} {ride.vehicle?.model}{driver.verified ? ' · ✓ Verified' : ''}</small>
        </div>
        <span className={'seats' + (left === 0 ? ' full' : '')}>{left === 0 ? 'Full' : `${left} seat${left > 1 ? 's' : ''}`}</span>
      </div>
    </button>
  );
}
