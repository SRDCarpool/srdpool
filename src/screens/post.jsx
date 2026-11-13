import { useState } from 'react';
import { useStore } from '../store';
import { Header, Icon, Chip, Stepper, Segmented, useNav } from '../ui';
import { fmtDay, fmtTime, rupee } from '../geo';
import { useFares } from './find';
import { useT } from '../i18n';
import { VerifyPrompt, isVerifiedOrPending } from './verify';

const nextSlot = () => {
  const d = new Date(Date.now() + 45 * 60000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const POINT_IDEAS = ['SRD X Road', 'Kandi', 'Isnapur', 'Patancheru', 'ORR', 'Shankarpally', 'ICICI', 'Wipro Circle'];

export default function PostRide() {
  const { state, postRide } = useStore();
  const nav = useNav();
  const t = useT();
  const fares = useFares();
  const v = state.me.vehicle;
  const [start, setStart] = useState('');
  const [dest, setDest] = useState('');
  const [points, setPoints] = useState([]);
  const [point, setPoint] = useState('');
  const [day, setDay] = useState(0);
  const [time, setTime] = useState(nextSlot());
  const [seats, setSeats] = useState(3);
  const [manual, setManual] = useState(null); // { origin, corridor } once the driver overrides detection
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const all = [start, ...points, dest].join(' ');
  const OFFICE = /hitec|hi[\s-]?tech|cyber|financial|\bfd\b|wipro|icici|gachibowli|nanakramguda|madhapur|mindspace|kokapet/i;
  const detectedDir = OFFICE.test(start) && !OFFICE.test(dest) ? 'home' : 'work';
  const homeEnd = detectedDir === 'home' ? dest : start;
  const detected = {
    direction: detectedDir,
    origin: /isnapur|patancheru|muthangi/i.test(homeEnd) ? 'isnapur' : 'sangareddy',
    corridor: /shankar\s*pall/i.test(all) ? 'shankarpally' : 'orr',
  };
  const base = { ...detected, ...(manual || {}) };
  const route = { ...base, corridor: base.origin === 'isnapur' ? 'orr' : base.corridor };
  const goingHome = route.direction === 'home';

  const when = () => {
    const d = new Date();
    d.setDate(d.getDate() + day);
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const addPoint = (p = point) => {
    const x = p.trim();
    if (!x || points.length >= 10) return;
    setPoints([...points, x]);
    setPoint('');
  };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= points.length) return;
    const n = [...points];
    [n[i], n[j]] = [n[j], n[i]];
    setPoints(n);
  };
  const valid = v && isVerifiedOrPending(state) && start.trim().length >= 2 && dest.trim().length >= 2 && time;

  const submit = async () => {
    setErr(null);
    const ts = when();
    if (ts < Date.now()) return setErr({ msg: 'That time has already passed. Please pick a later time.' });
    setBusy(true);
    const res = await postRide({ start, destination: dest, points, time: ts, seats, corridor: goingHome ? route.corridor + '_home' : route.corridor, origin: route.origin });
    setBusy(false);
    if (!res.ok) return setErr({ msg: res.error, id: res.conflictId });
    nav.replace('manage', { rideId: res.id, fresh: true });
  };

  const preview = { time: when(), stops: [start || 'Starting point', ...points, dest || 'Destination'].map((name) => ({ name })) };

  return (
    <div className="screen">
      <Header title={t('offerRide')} sub="Sangareddy / Isnapur ⇄ Financial District / HITEC City" back={nav.depth > 1} />

      {!isVerifiedOrPending(state) && <div style={{ marginBottom: 12 }}><VerifyPrompt compact /></div>}
      {!v ? (
        <button className="card" style={{ textAlign: 'left', marginBottom: 12 }} onClick={() => nav.go('page', { page: 'vehicle' })}>
          <div className="hstack">
            <span className="row-ic amber"><Icon name="car" size={20} /></span>
            <div className="grow"><b>Add your vehicle first</b><small style={{ display: 'block' }}>Model, colour & number plate — takes 30 seconds</small></div>
            <Icon name="right" className="muted" />
          </div>
        </button>
      ) : null}

      <div className="card">
        <div className="field" style={{ marginTop: 0 }}>
          <label className="label" htmlFor="st">Starting point</label>
          <input id="st" className="input" placeholder={goingHome ? 'e.g. Wipro Circle' : 'e.g. Malkapur Chintal'} value={start} onChange={(e) => setStart(e.target.value)} maxLength={60} />
        </div>
        <div className="field">
          <label className="label" htmlFor="ds">Destination</label>
          <input id="ds" className="input" placeholder={goingHome ? 'e.g. Sangareddy New Bus Stand' : 'e.g. Wipro Circle'} value={dest} onChange={(e) => setDest(e.target.value)} maxLength={60} />
          <div className="opts" style={{ padding: '8px 0 0' }}>
            {(goingHome ? ['Sangareddy', 'Isnapur', 'Kandi'] : ['Financial District', 'HITEC City', 'Wipro Circle']).map((d) => <Chip key={d} on={dest === d} onClick={() => setDest(d)}>{d}</Chip>)}
          </div>
        </div>
        <div className="field">
          <span className="label">Date</span>
          <div className="opts" style={{ padding: 0 }}>
            {[0, 1, 2].map((d) => <Chip key={d} on={day === d} onClick={() => setDay(d)}>{fmtDay(Date.now() + d * 86400e3)}</Chip>)}
          </div>
        </div>
        <div className="field field-row">
          <div>
            <label className="label" htmlFor="tm">Time</label>
            <input id="tm" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div>
            <span className="label">Seats available</span>
            <Stepper value={seats} onChange={setSeats} max={v?.type === 'SUV' ? 6 : 4} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b>Pickup points</b>
        <small style={{ display: 'block' }}>Add the places you pass, in order</small>
        {points.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {points.map((p, i) => (
              <div key={i + p} className="point-row">
                <span className="num">{i + 1}</span>
                <span className="grow" style={{ fontWeight: 650 }}>{p}</span>
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p} up`} style={{ width: 32, height: 32 }}><Icon name="back" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
                <button className="icon-btn" onClick={() => setPoints(points.filter((_, k) => k !== i))} aria-label={`Remove ${p}`} style={{ width: 32, height: 32 }}><Icon name="x" size={16} /></button>
              </div>
            ))}
          </div>
        )}
        <form className="hstack" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); addPoint(); }}>
          <input className="input grow" placeholder="e.g. SRD X Road" value={point} onChange={(e) => setPoint(e.target.value)} maxLength={40} aria-label="Pickup point" />
          <button className="btn ghost" type="submit" disabled={!point.trim()} style={{ height: 50 }}><Icon name="plus" /> Add</button>
        </form>
        <div className="opts" style={{ padding: '10px 0 0' }}>
          {POINT_IDEAS.filter((p) => !points.includes(p)).map((p) => <Chip key={p} onClick={() => addPoint(p)}>+ {p}</Chip>)}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, background: 'var(--primary-50)', boxShadow: 'none' }}>
        <small style={{ fontWeight: 700, color: 'var(--primary-d)' }}>PASSENGERS WILL SEE</small>
        <div className="route-line" style={{ marginTop: 6, fontSize: 15 }}>
          <b className="rl-time">{fmtTime(preview.time)}</b>
          {preview.stops.map((s, i) => <span key={i} className="rl-stop">{i > 0 && <span className="rl-sep">›</span>}{s.name}</span>)}
        </div>
        <div className="divider" />
        <span className="label">Direction</span>
        <Segmented value={route.direction} onChange={(d) => setManual({ ...route, direction: d })} options={[['work', '🏢 To office'], ['home', '🏠 Going home']]} />
        <span className="label" style={{ marginTop: 10 }}>Route</span>
        <Segmented value={route.corridor} onChange={(c) => setManual({ ...route, corridor: c })}
          options={route.origin === 'isnapur' ? [['orr', 'Via ORR']] : [['orr', goingHome ? 'Via ORR & Isnapur' : 'Via Isnapur & ORR'], ['shankarpally', 'Via Shankarpally']]} />
        <span className="label" style={{ marginTop: 10 }}>{goingHome ? 'Ending area' : 'Starting area'}</span>
        <Segmented value={route.origin} onChange={(o) => setManual({ ...route, origin: o, corridor: o === 'isnapur' ? 'orr' : route.corridor })} options={[['sangareddy', 'Sangareddy'], ['isnapur', 'Isnapur']]} />
        <small style={{ display: 'block', marginTop: 10 }}>
          Fixed fares: {route.origin === 'sangareddy' ? <>Sangareddy {rupee(fares.sangareddy)}{route.corridor === 'orr' && <> · Isnapur {rupee(fares.isnapur)}</>}</> : <>Isnapur {rupee(fares.isnapur)}</>} per seat
        </small>
        {(() => {
          const c = state.config?.corridors?.find((x) => x.id === (goingHome ? route.corridor + '_home' : route.corridor));
          if (!c?.fixed) return null;
          const names = (side) => c.fixed.filter((f) => f.side === side).map((f) => f.name).join(' · ');
          return (
            <small style={{ display: 'block', marginTop: 6 }}>
              Ride Takers board at <b>{names(goingHome ? 'office' : 'home')}</b> and get down at <b>{names(goingHome ? 'home' : 'office')}</b> — only the points your route passes.
            </small>
          );
        })()}
      </div>

      {err && (
        <div className="note danger" style={{ marginTop: 12 }}>
          <Icon name="alert" size={18} />
          <span>{err.msg} {err.id && <button className="link" onClick={() => nav.go('manage', { rideId: err.id })}>Open that ride</button>}</span>
        </div>
      )}

      <div className="sticky-cta">
        <button className="btn block" disabled={!valid || busy} onClick={submit}>
          <Icon name="check" /> {busy ? 'Posting…' : 'Post Ride'}
        </button>
      </div>
    </div>
  );
}
