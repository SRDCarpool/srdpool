import { useState } from 'react';
import { useStore, useAsync, getUser, myBooking, seatsLeft, rideById } from '../store';
import { Header, Icon, Chip, Segmented, Stepper, Sheet, RideCard, Empty, Avatar, Badges, MapView, StatusSteps, RouteLine, VIA, useNav } from '../ui';
import { fmtTime, fmtDay, first, rupee, etaMin, km, distKm } from '../geo';
import { useT } from '../i18n';
import { isVerifiedOrPending } from './verify';

const dayTs = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
};
const DEFAULT_FARES = { sangareddy: 150, isnapur: 120 };
const ORIGIN_NAMES = { sangareddy: 'Sangareddy', isnapur: 'Isnapur' };
export const useFares = () => useStore().state.config?.fares || DEFAULT_FARES;
const lastOrigin = () => { try { return localStorage.getItem('saathi-origin') || 'sangareddy'; } catch { return 'sangareddy'; } };

/** Corridor preview map for the taker's chosen route. */
function CorridorMap({ via, origin }) {
  const { state } = useStore();
  const id = origin === 'isnapur' || via === 'any' ? 'orr' : via;
  const c = state.config?.corridors?.find((x) => x.id === id);
  if (!c) return null;
  const wp = c.waypoints || [];
  let stops = wp, geometry = c.geometry;
  if (origin === 'isnapur') {
    const isn = wp.find((w) => w.name === 'Isnapur');
    stops = wp.slice(wp.indexOf(isn));
    let best = 0, bd = Infinity;
    c.geometry.forEach(([lat, lng], i) => { const d = distKm({ lat, lng }, isn); if (d < bd) { bd = d; best = i; } });
    geometry = c.geometry.slice(best);
  }
  return <MapView ride={{ id: 'corridor-' + id + origin, stops: stops.map((s) => ({ ...s, pos: 0 })), geometry }} height={170} />;
}

export function FindRide() {
  const { state, search, createAlert } = useStore();
  const nav = useNav();
  const t = useT();
  const fares = useFares();
  const [origin, setOriginState] = useState(lastOrigin);
  const [via, setVia] = useState('any');
  const [day, setDay] = useState(0);
  const [time, setTime] = useState('');
  const setOrigin = (o) => { setOriginState(o); if (o === 'isnapur') setVia('any'); try { localStorage.setItem('saathi-origin', o); } catch { /* ignore */ } };

  const q = { origin, via: origin === 'isnapur' ? 'orr' : via, date: dayTs(day), time, window: time ? 45 : 0 };
  const res = useAsync(() => search(q), [origin, via, day, time]);
  const list = res.data || [];
  const main = list.filter((r) => !r.outside);
  const alts = list.filter((r) => r.outside).slice(0, 3);
  const hasAlert = state.alerts.some((a) => a.origin === origin && (a.via || 'any') === q.via);
  const open = (r) => nav.go('ride', { rideId: r.ride.id, origin, pickupIdx: r.pickupIdx });

  return (
    <div className="screen">
      <Header title={t('findRide')} sub="Fixed route · fixed fare" back={nav.depth > 1} />

      <span className="label">Where do you board?</span>
      <div className="stack">
        {['sangareddy', 'isnapur'].map((o) => (
          <button key={o} className={'origin-card' + (origin === o ? ' on' : '')} onClick={() => setOrigin(o)} aria-pressed={origin === o}>
            <span className="row-ic green"><Icon name="pin" size={20} /></span>
            <span><b style={{ fontSize: 16, display: 'block' }}>{ORIGIN_NAMES[o]}</b><small>to Financial District / HITEC City</small></span>
            <span className="fare">{rupee(fares[o])}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hstack">
          <span className="pdot red" />
          <div className="grow"><small style={{ display: 'block', fontWeight: 600 }}>DESTINATION</small><b>Financial District / HITEC City</b></div>
          <Icon name="lock" size={16} className="muted" />
        </div>
        <div className="divider" />
        <span className="label">Route</span>
        {origin === 'sangareddy' ? (
          <Segmented value={via} onChange={setVia} options={[['any', 'Any route'], ['orr', 'Via ORR'], ['shankarpally', 'Via Shankarpally']]} />
        ) : (
          <div className="note green"><Icon name="nav" size={18} /><span>From Isnapur, rides take the <b>ORR</b> (Isnapur → Patancheru ORR → Financial District).</span></div>
        )}
        {origin === 'sangareddy' && via === 'shankarpally' && <small style={{ display: 'block', marginTop: 8 }}>Alternative route: Sangareddy → Shankarpally → Mokila → Financial District → HITEC City</small>}
        {origin === 'sangareddy' && via === 'orr' && <small style={{ display: 'block', marginTop: 8 }}>Sangareddy → Kandi → Isnapur → Patancheru ORR → Financial District → HITEC City</small>}
        <div style={{ marginTop: 12 }}><CorridorMap via={via} origin={origin} /></div>
        <div className="opts" style={{ padding: '12px 0 0' }}>
          <Chip on={day === 0} onClick={() => setDay(0)}>Today</Chip>
          <Chip on={day === 1} onClick={() => setDay(1)}>Tomorrow</Chip>
          <Chip on={day === 2} onClick={() => setDay(2)}>{fmtDay(dayTs(2))}</Chip>
          <label className="chip" style={{ paddingRight: 6 }}>
            <Icon name="clock" size={15} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Preferred time"
              style={{ border: 0, background: 'none', outline: 'none', width: time ? 96 : 24, fontWeight: 650 }} />
            {!time && 'Any time'}
          </label>
          {time && <button className="link" onClick={() => setTime('')}>Clear</button>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h3>{res.loading && !res.data ? 'Looking for rides…' : `${main.length} ride${main.length !== 1 ? 's' : ''} · ${fmtDay(dayTs(day))}`}</h3></div>
        {res.error && <div className="note danger"><Icon name="alert" size={18} /> {res.error.message}</div>}
        <div className="stack">
          {main.map((r) => <RideCard key={r.ride.id} ride={r.ride} fare={r.fare} pickupIdx={r.pickupIdx} fav={r.fav} onClick={() => open(r)} />)}
        </div>
        {alts.length > 0 && (
          <div className="section">
            <div className="section-head"><h3>Other times</h3></div>
            <div className="stack">{alts.map((r) => <RideCard key={r.ride.id} ride={r.ride} fare={r.fare} pickupIdx={r.pickupIdx} fav={r.fav} onClick={() => open(r)} />)}</div>
          </div>
        )}
        {!main.length && !res.loading && (
          <div className="card">
            <Empty icon="bell" title={`No rides from ${ORIGIN_NAMES[origin]} yet`}
              text="Turn on an alert and we'll notify you as soon as a Ride Giver posts one."
              action={<button className="btn block" disabled={hasAlert} onClick={() => createAlert({ origin, via: q.via })}><Icon name="bell" /> {hasAlert ? 'Alert is on' : 'Notify me'}</button>} />
          </div>
        )}
        {main.length > 0 && !hasAlert && (
          <button className="row" style={{ marginTop: 12 }} onClick={() => createAlert({ origin, via: q.via })}>
            <span className="row-ic blue"><Icon name="bell" size={18} /></span>
            <span className="row-txt"><b>Notify me about new rides from {ORIGIN_NAMES[origin]}</b><small>Get an alert when a Ride Giver posts</small></span>
          </button>
        )}
      </div>
    </div>
  );
}

const CANCEL_REASONS = ['My plans changed', 'Found another ride', 'Ride Giver asked me to cancel', 'Running late', 'Other'];

export function CancelSheet({ open, onClose, onConfirm, title = 'Cancel booking', reasons = CANCEL_REASONS, policy }) {
  const [r, setR] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="muted" style={{ marginBottom: 12 }}>Please tell us why — it helps keep the community reliable.</p>
      <div className="check-list">
        {reasons.map((x) => (
          <button key={x} className={'check-item' + (r === x ? ' on' : '')} onClick={() => setR(x)}>
            <span className="box">{r === x && <Icon name="check" size={14} stroke={3} />}</span>{x}
          </button>
        ))}
      </div>
      {policy && <div className="note warn" style={{ marginTop: 14 }}><Icon name="info" size={18} /><span>{policy}</span></div>}
      <button className="btn danger block" style={{ marginTop: 16 }} disabled={!r} onClick={() => { onConfirm(r); onClose(); setR(''); }}>Confirm cancellation</button>
    </Sheet>
  );
}

export function CallSheet({ open, onClose, user }) {
  const { toast } = useStore();
  return (
    <Sheet open={open} onClose={onClose} title={`Call ${first(user?.name)}`}>
      <div className="note green"><Icon name="lock" size={18} /><span>Calls are connected through a masked number. Neither of you sees the other's real phone number.</span></div>
      <button className="btn block" style={{ marginTop: 16 }} onClick={() => { toast('Masked calling is not connected yet', 'Use in-app chat for now'); onClose(); }}>
        <Icon name="phone" /> Call securely
      </button>
    </Sheet>
  );
}

/** Ride from state, or fetched from the API when it isn't part of my snapshot. */
export function useRide(rideId) {
  const { state, fetchRide } = useStore();
  const inSnap = state.rides.find((r) => r.id === rideId);
  const res = useAsync(() => (inSnap ? null : fetchRide(rideId)), [rideId, !!inSnap]);
  return { ride: rideById(state, rideId), loading: !inSnap && res.loading && !rideById(state, rideId), error: res.error };
}

export function RideDetail({ rideId, origin: originParam, pickupIdx: pIdx }) {
  const { state, requestBooking, joinWaitlist, leaveWaitlist, cancelBooking, demoStartRide, toggleFavorite, pay } = useStore();
  const nav = useNav();
  const t = useT();
  const fares = useFares();
  const { ride, loading, error } = useRide(rideId);
  const [seats, setSeats] = useState(1);
  const [cancel, setCancel] = useState(false);
  const [call, setCall] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null);
  const [drop, setDrop] = useState(null);
  if (!ride) return <div className="screen no-tab"><Header title="Ride" />{loading ? <div className="center pad"><span className="spinner" style={{ display: 'inline-block' }} /></div> : <Empty title="Ride not found" text={error?.message || 'It may have been removed.'} />}</div>;

  const stops = ride.stops;
  const driver = getUser(state, ride.driverId);
  const b = myBooking(state, ride.id);
  const activeB = b && ['requested', 'confirmed', 'picked', 'completed'].includes(b.status) ? b : null;
  const onWait = b?.status === 'waitlist';
  const origin = activeB?.origin || originParam || (ride.origin === 'isnapur' ? 'isnapur' : 'sangareddy');
  const fare = fares[origin];
  const pi = activeB?.pickupIdx ?? pick ?? pIdx ?? 0;
  const di = activeB?.dropIdx ?? (drop != null && drop > pi ? drop : stops.length - 1);
  const left = seatsLeft(state, ride);
  const fav = state.favorites.includes(ride.driverId);
  const confirmed = activeB && ['confirmed', 'picked', 'completed'].includes(activeB.status);
  const segKm = stops[di].pos - stops[pi].pos;
  const pickupEta = ride.time + (stops[pi].pos - stops[0].pos > 0.5 ? etaMin(stops[pi].pos - stops[0].pos, ride) * 60000 : 0);
  const late = ride.time - Date.now() < 60 * 60000;
  const doBook = async () => { setBusy(true); await requestBooking({ rideId: ride.id, pickupIdx: pi, dropIdx: di, seats, note, origin }); setBusy(false); };
  const canChoose = !activeB && ride.status === 'scheduled';

  return (
    <div className="screen no-tab">
      <Header title={`${stops[pi].name} → ${stops[di].name}`} sub={`${fmtDay(ride.time)} · ${fmtTime(ride.time)} · ${VIA[ride.corridor] || ''}`}
        right={<button className="icon-btn" onClick={() => toggleFavorite(ride.driverId)} aria-label="Favourite this Ride Giver"><Icon name="heart" fill={fav ? 'var(--danger)' : 'none'} style={{ color: fav ? 'var(--danger)' : undefined }} /></button>} />

      <MapView ride={ride} pickupIdx={pi} dropIdx={di} height={210} live={ride.live} showLabels={false} />

      {(activeB || onWait) && (
        <div className="card" style={{ marginTop: 12 }}>
          <StatusSteps booking={activeB || b} ride={ride} />
          {activeB?.status === 'requested' && <div className="note" style={{ marginTop: 12 }}><Icon name="clock" size={18} /> Request sent. {first(driver.name)} usually responds within a few minutes.</div>}
        </div>
      )}
      {b && ['cancelled', 'rejected', 'noshow', 'expired', 'transferred'].includes(b.status) && (
        <div className="card" style={{ marginTop: 12 }}>
          <StatusSteps booking={b} ride={ride} />
          {b.transferredTo && <button className="btn block" style={{ marginTop: 10 }} onClick={() => nav.replace('ride', { rideId: b.transferredTo.rideId })}><Icon name="car" /> Open your new ride</button>}
        </div>
      )}
      {['cancelled', 'expired'].includes(ride.status) && !b && <div className="note danger" style={{ marginTop: 12 }}><Icon name="x" size={18} /> This ride is no longer available.</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div><b style={{ fontSize: 22 }}>{fmtTime(ride.time)}</b>{ride.delayMin > 0 && <span className="badge red" style={{ marginLeft: 8 }}>+{ride.delayMin} min late</span>}<small style={{ display: 'block' }}>Departs {stops[0].name}</small></div>
          <div style={{ textAlign: 'right' }}><b style={{ fontSize: 15 }}>~{fmtTime(pickupEta)}</b><small style={{ display: 'block' }}>at your pickup</small></div>
        </div>
        <RouteLine ride={ride} pickupIdx={pi} dropIdx={di} />
        {canChoose && (
          <>
            <div className="divider" />
            <span className="label">Board at</span>
            <div className="opts" style={{ padding: 0 }}>
              {stops.slice(0, -1).map((s, i) => <Chip key={i} on={pi === i} onClick={() => { setPick(i); if (drop != null && drop <= i) setDrop(null); }}>{s.name}</Chip>)}
            </div>
            <span className="label" style={{ marginTop: 12 }}>Get down at</span>
            <div className="opts" style={{ padding: 0 }}>
              {stops.map((s, i) => i > pi && <Chip key={i} on={di === i} onClick={() => setDrop(i)}>{s.name}</Chip>)}
            </div>
          </>
        )}
        <div className="hstack" style={{ marginTop: 12, gap: 16, flexWrap: 'wrap' }}>
          <small><Icon name="nav" size={13} /> ~{km(segKm)} by road</small>
          <small><Icon name="clock" size={13} /> ~{etaMin(segKm, ride)} min</small>
          <small><Icon name="users" size={13} /> {left} of {ride.seats} seats left</small>
        </div>
      </div>

      <button className="card" style={{ marginTop: 12, textAlign: 'left' }} onClick={() => nav.go('driver', { userId: ride.driverId })}>
        <div className="hstack">
          <Avatar user={driver} size={52} />
          <div className="grow">
            <b style={{ fontSize: 16 }}>{driver.name}</b>
            <small style={{ display: 'block' }}>{driver.completed || 0} rides · {driver.cancellations || 0} cancellations</small>
            <div className="hstack" style={{ gap: 6, marginTop: 6 }}><Badges user={driver} small /></div>
          </div>
          <Icon name="right" className="muted" />
        </div>
        <div className="divider" />
        <div className="hstack">
          <span className="row-ic"><Icon name="car" size={19} /></span>
          <div className="grow"><b>{ride.vehicle?.color} {ride.vehicle?.brand} {ride.vehicle?.model}</b><small style={{ display: 'block' }}>{ride.vehicle?.type}</small></div>
          <span className="vehicle-plate">{ride.vehicle?.reg}</span>
        </div>
        {!confirmed && <small style={{ display: 'block', marginTop: 8 }}><Icon name="lock" size={12} /> Full number plate is shown after your booking is confirmed</small>}
      </button>

      {ride.notes && <div className="card" style={{ marginTop: 12 }}><b>Note from {first(driver.name)}</b><p className="muted" style={{ marginTop: 4 }}>“{ride.notes}”</p></div>}

      <div className="card" style={{ marginTop: 12 }}>
        <b>Fare</b>
        <div className="kv" style={{ marginTop: 6 }}><span>Fixed fare from {ORIGIN_NAMES[origin]}</span><span>{rupee(fare)} / seat</span></div>
        <div className="kv"><span>Seats</span><span>× {activeB ? activeB.seats : seats}</span></div>
        <div className="kv total"><span>Total</span><span>{rupee(activeB ? activeB.amount : fare * seats)}</span></div>
        {activeB && <div className="hstack" style={{ marginTop: 6 }}><span className={'badge ' + (activeB.paid ? 'green' : 'gray')}>{activeB.paid ? 'Paid' : 'Payment pending'}</span><small>Pay by UPI or cash</small></div>}
        <details style={{ marginTop: 10 }}>
          <summary className="link" style={{ cursor: 'pointer' }}>Cancellation & refund policy</summary>
          <ul className="muted" style={{ fontSize: 13.5, paddingLeft: 18, margin: '8px 0 0' }}>
            <li>Free cancellation up to 1 hour before departure.</li>
            <li>Within 1 hour: 50% of the fare goes to the Ride Giver.</li>
            <li>Ride Giver cancels: full refund, always.</li>
          </ul>
        </details>
      </div>

      {confirmed && activeB.status !== 'completed' && (
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn outline" onClick={() => nav.go('chat', { rideId: ride.id })}><Icon name="chat" /> Chat</button>
          <button className="btn outline" onClick={() => setCall(true)}><Icon name="phone" /> Call</button>
          <button className="btn outline" onClick={() => nav.openSOS(ride.id)} style={{ color: 'var(--danger)' }}><Icon name="shield" /> Safety</button>
        </div>
      )}

      <div className="sticky-cta">
        {canChoose && (
          left >= seats ? (
            <div className="stack">
              <input className="input" placeholder={`Note for ${first(driver.name)} (optional)`} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="hstack">
                <Stepper value={seats} onChange={setSeats} max={Math.max(1, Math.min(4, left))} />
                {isVerifiedOrPending(state)
                  ? <button className="btn grow" disabled={busy} onClick={doBook}>{t('request')} · {rupee(fare * seats)}</button>
                  : <button className="btn grow" onClick={() => nav.go('page', { page: 'verify' })}><Icon name="shield" /> Verify yourself to book</button>}
              </div>
            </div>
          ) : onWait ? (
            <button className="btn outline block" onClick={() => leaveWaitlist(ride.id)}><Icon name="clock" /> On waiting list · Leave</button>
          ) : (
            <button className="btn dark block" onClick={() => joinWaitlist({ rideId: ride.id, pickupIdx: pi, dropIdx: di, seats, origin })}><Icon name="clock" /> Ride full · Join waiting list</button>
          )
        )}
        {activeB?.status === 'requested' && <button className="btn danger-ghost block" onClick={() => setCancel(true)}>Cancel request</button>}
        {activeB?.status === 'confirmed' && ride.status === 'scheduled' && (
          <div className="stack">
            {state.config?.demo && driver.demo && <button className="btn block" onClick={() => demoStartRide(ride.id)}><Icon name="car" /> Demo: Ride Giver starts the ride</button>}
            <button className="btn danger-ghost block" onClick={() => setCancel(true)}>Cancel booking</button>
          </div>
        )}
        {ride.status === 'started' && activeB && ['confirmed', 'picked'].includes(activeB.status) && (
          <button className="btn block" onClick={() => nav.replace('track', { rideId: ride.id })}><span className="pulse" /> Track live location</button>
        )}
        {activeB?.status === 'completed' && !activeB.paid && <button className="btn block" onClick={() => pay(activeB.id)}>Pay {rupee(activeB.amount)} via UPI</button>}
      </div>

      <CancelSheet open={cancel} onClose={() => setCancel(false)} onConfirm={(r) => cancelBooking(activeB.id, r)}
        policy={late ? 'Departure is within 1 hour — 50% of the fare may be retained if already paid.' : 'Free cancellation — you are more than 1 hour before departure.'} />
      <CallSheet open={call} onClose={() => setCall(false)} user={driver} />
    </div>
  );
}

export function DriverProfile({ userId }) {
  const { state, fetchUser, toggleFavorite, block, unblock, report } = useStore();
  const nav = useNav();
  const { data: u, loading } = useAsync(() => fetchUser(userId), [userId]);
  const [rep, setRep] = useState(false);
  if (!u) return <div className="screen no-tab"><Header title="Member profile" />{loading ? <div className="center pad"><span className="spinner" style={{ display: 'inline-block' }} /></div> : <Empty title="Member not found" />}</div>;
  const fav = state.favorites.includes(userId);
  const blocked = state.blocked.includes(userId);
  const done = u.completed || 0;
  const reliability = done ? Math.round(100 * (1 - (u.cancellations || 0) / (done + (u.cancellations || 0)))) : 100;
  return (
    <div className="screen no-tab">
      <Header title="Member profile" />
      <div className="profile-head">
        <Avatar user={u} size={92} />
        <h2>{u.name}</h2>
        <div className="hstack" style={{ gap: 6 }}><Badges user={u} /></div>
        <small>Member since {u.joined}{u.age ? ` · ${u.age} yrs` : ''}</small>
      </div>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat"><b>{done}</b><small>rides done</small></div>
        <div className="stat"><b>{u.cancellations || 0}</b><small>cancellations</small></div>
        <div className="stat"><b>{reliability}%</b><small>reliability</small></div>
      </div>
      {u.bio && <div className="card" style={{ marginTop: 12 }}><p>{u.bio}</p></div>}
      <div className="card menu" style={{ marginTop: 12 }}>
        <div className="row"><span className="row-ic green"><Icon name="phone" size={18} /></span><span className="row-txt"><b>Mobile number verified</b></span><Icon name="check" className="muted" /></div>
        {u.vehicle && <div className="row"><span className={'row-ic ' + (u.verified ? 'green' : 'amber')}><Icon name="shield" size={18} /></span><span className="row-txt"><b>Driving licence & vehicle</b><small>{u.verified ? 'Verified by Saathi' : 'Verification in progress'}</small></span>{u.verified && <Icon name="check" className="muted" />}</div>}
        {u.vehicle && <div className="row"><span className="row-ic"><Icon name="car" size={18} /></span><span className="row-txt"><b>{u.vehicle.color} {u.vehicle.brand} {u.vehicle.model}</b><small>{u.vehicle.type}</small></span></div>}
      </div>
      {u.together?.length > 0 && (
        <div className="section">
          <div className="section-head"><h3>Your rides together ({u.together.length})</h3></div>
          <div className="card menu">
            {u.together.map((r, i) => (
              <div key={i} className="row"><span className="row-ic"><Icon name="check" size={18} /></span><span className="row-txt"><b>{r.from} → {r.to}</b><small>{fmtDay(r.time)}, {fmtTime(r.time)}</small></span></div>
            ))}
          </div>
        </div>
      )}
      {userId !== 'me' && (
        <div className="stack" style={{ marginTop: 16 }}>
          <button className={'btn block ' + (fav ? 'outline' : '')} onClick={() => toggleFavorite(userId)}><Icon name="heart" fill={fav ? 'var(--danger)' : 'none'} /> {fav ? 'Remove from favourites' : 'Add to favourites'}</button>
          <div className="btn-row">
            <button className="btn danger-ghost" onClick={() => setRep(true)}><Icon name="flag" /> Report</button>
            <button className="btn outline" onClick={() => (blocked ? unblock(userId) : (block(userId), nav.back()))}><Icon name="ban" /> {blocked ? 'Unblock' : 'Block'}</button>
          </div>
        </div>
      )}
      <ReportSheet open={rep} onClose={() => setRep(false)} onSubmit={(type, details) => report({ targetId: userId, type, details })} name={first(u.name)} />
    </div>
  );
}

const REPORT_TYPES = ['Fake profile', 'Suspicious behaviour', 'Harassment', 'Unsafe driving', 'No-show', 'Inappropriate messages', 'Payment issue'];
export function ReportSheet({ open, onClose, onSubmit, name }) {
  const [type, setType] = useState('');
  const [details, setDetails] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={`Report ${name || 'member'}`}>
      <div className="check-list">
        {REPORT_TYPES.map((x) => (
          <button key={x} className={'check-item' + (type === x ? ' on' : '')} onClick={() => setType(x)}>
            <span className="box">{type === x && <Icon name="check" size={14} stroke={3} />}</span>{x}
          </button>
        ))}
      </div>
      <textarea className="input" style={{ marginTop: 12 }} placeholder="What happened? (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
      <small style={{ display: 'block', marginTop: 8 }}>Reports are confidential. Both sides are heard before any action is taken.</small>
      <button className="btn danger block" style={{ marginTop: 14 }} disabled={!type} onClick={() => { onSubmit(type, details); onClose(); setType(''); setDetails(''); }}>Submit report</button>
    </Sheet>
  );
}
