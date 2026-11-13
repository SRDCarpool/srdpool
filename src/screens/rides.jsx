import { useState } from 'react';
import { useStore, getUser, seatsLeft, rideById, BOOKED } from '../store';
import { Header, Icon, Segmented, Avatar, Empty, RouteStops, RouteLine, VIA, SlideToConfirm, Sheet, Stepper, Toggle, MapView, useNav } from '../ui';
import { CancelSheet, CallSheet, useRide } from './find';
import { fmtTime, fmtDay, rupee } from '../geo';
import { useT } from '../i18n';

const STATUS_BADGE = {
  requested: ['gray', 'Requested'], confirmed: ['green', 'Confirmed'], picked: ['blue', 'On board'],
  completed: ['green', 'Completed'], cancelled: ['red', 'Cancelled'], rejected: ['red', 'Not accepted'],
  noshow: ['red', 'No-show'], scheduled: ['gold', 'Scheduled'], started: ['blue', 'In progress'], expired: ['gray', 'Expired'], waitlist: ['gray', 'Waiting list'], transferred: ['blue', 'Moved to another car'],
};

export function MyRides() {
  const { state } = useStore();
  const nav = useNav();
  const t = useT();
  const [tab, setTab] = useState('upcoming');
  const items = [];
  for (const r of state.rides.filter((x) => x.driverId === 'me')) {
    const bucket = ['scheduled', 'started'].includes(r.status) ? 'upcoming' : r.status === 'cancelled' ? 'cancelled' : 'completed';
    items.push({ id: r.id, ride: r, mine: true, status: r.status, bucket });
  }
  for (const b of state.bookings.filter((x) => x.passengerId === 'me')) {
    const r = rideById(state, b.rideId);
    if (!r) continue;
    const st = b.status;
    const bucket = ['requested', 'confirmed', 'picked', 'waitlist'].includes(st) ? 'upcoming' : ['cancelled', 'rejected', 'transferred'].includes(st) ? 'cancelled' : 'completed';
    items.push({ id: b.id, ride: r, booking: b, mine: false, status: st, bucket });
  }
  const list = items.filter((i) => i.bucket === tab).sort((a, b) => (tab === 'upcoming' ? a.ride.time - b.ride.time : b.ride.time - a.ride.time));
  const count = (k) => items.filter((i) => i.bucket === k).length;

  return (
    <div className="screen">
      <Header title={t('myRides')} back={false} />
      <Segmented value={tab} onChange={setTab} options={[['upcoming', `${t('upcoming')} (${count('upcoming')})`], ['completed', t('completed')], ['cancelled', t('cancelled')]]} />
      <div className="stack" style={{ marginTop: 14 }}>
        {list.map((i) => <RideItem key={i.id} ride={i.ride} booking={i.booking} mine={i.mine} status={i.status} onClick={() => nav.openRide(i.ride.id)} />)}
        {!list.length && (
          <div className="card">
            <Empty icon="calendar" title={tab === 'upcoming' ? 'No upcoming rides' : tab === 'completed' ? 'No completed rides yet' : 'No cancelled rides'}
              text={tab === 'upcoming' ? 'Find a ride or offer your empty seats.' : null}
              action={tab === 'upcoming' && <div className="btn-row"><button className="btn ghost" onClick={() => nav.tab('find')}>Find a ride</button><button className="btn" onClick={() => nav.tab('post')}>Offer a ride</button></div>} />
          </div>
        )}
      </div>
    </div>
  );
}

function RideItem({ ride, booking, mine, status, onClick }) {
  const { state } = useStore();
  const [tone, label] = STATUS_BADGE[status] || ['gray', status];
  const driver = getUser(state, ride.driverId);
  const reqs = mine ? state.bookings.filter((b) => b.rideId === ride.id && b.status === 'requested').length : 0;
  const filled = ride.seats - seatsLeft(state, ride);
  const from = ride.stops[booking ? booking.pickupIdx : 0];
  const to = ride.stops[booking ? booking.dropIdx : ride.stops.length - 1];
  return (
    <button className="card ride-card" onClick={onClick}>
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <div className="hstack" style={{ gap: 6 }}>
          <span className={'mini-tag ' + (mine ? 'amber' : 'blue')}>{mine ? '🚗 Driving' : '🙋 Riding'}</span>
          <span className={'badge sm ' + tone}>{status === 'started' && <span className="pulse" style={{ width: 7, height: 7 }} />} {label}</span>
        </div>
        <small>{fmtDay(ride.time)}</small>
      </div>
      <div className="hstack" style={{ marginTop: 10, alignItems: 'flex-start' }}>
        <div className="grow">
          <b style={{ fontSize: 18 }}>{fmtTime(ride.time)}</b>
          <div className="rc-route" style={{ margin: '6px 0 0' }}>
            <div className="rc-line"><span className="pdot green" /><b>{from.name}</b></div>
            <div className="rc-line"><span className="pdot red" /><b>{to.name}</b></div>
          </div>
        </div>
        {!mine && <Avatar user={driver} size={40} />}
      </div>
      <div className="rc-foot">
        {mine ? (
          <>
            <small className="grow">{filled}/{ride.seats} seats filled · {rupee(ride.price)}/seat{ride.recurring !== 'none' ? ' · 🔁' : ''}</small>
            {reqs > 0 && <span className="badge red">{reqs} request{reqs > 1 ? 's' : ''}</span>}
          </>
        ) : (
          <>
            <small className="grow">with {driver.name} · {rupee(booking?.amount ?? ride.price)}</small>
            {booking?.status === 'completed' && !booking.paid && <span className="badge gray">Unpaid</span>}
          </>
        )}
      </div>
    </button>
  );
}

const DRIVER_CANCEL = ['Change of plans', 'Vehicle issue', 'Not feeling well', 'Emergency', 'Too few passengers', 'Other'];

export function ManageRide({ rideId, fresh }) {
  const { state, respondRequest, startRide, cancelRide, editRide, sendDelay } = useStore();
  const nav = useNav();
  const t = useT();
  const { ride, loading } = useRide(rideId);
  const [cancel, setCancel] = useState(false);
  const [edit, setEdit] = useState(false);
  const [call, setCall] = useState(null);
  const [simulate, setSimulate] = useState(!!state.config?.demo);
  if (!ride) return <div className="screen no-tab"><Header title="Ride" />{loading ? <div className="center pad"><span className="spinner" style={{ display: 'inline-block' }} /></div> : <Empty title="Ride not found" />}</div>;
  const stops = ride.stops;
  const bks = state.bookings.filter((b) => b.rideId === rideId);
  const requests = bks.filter((b) => b.status === 'requested').sort((a, b) => state.favorites.includes(b.passengerId) - state.favorites.includes(a.passengerId));
  const pax = bks.filter((b) => [...BOOKED, 'noshow'].includes(b.status));
  const waiting = bks.filter((b) => b.status === 'waitlist').length;
  const left = seatsLeft(state, ride);
  const expired = ride.status === 'expired';

  return (
    <div className="screen no-tab">
      <Header title={`${stops[0].name} → ${stops.at(-1).name}`} sub={`${fmtDay(ride.time)} · ${fmtTime(ride.time)}`}
        onBack={fresh ? () => nav.tab('rides') : undefined}
        right={ride.status === 'scheduled' && <button className="icon-btn" onClick={() => setEdit(true)} aria-label="Edit ride"><Icon name="edit" /></button>} />

      {fresh && <div className="note green" style={{ marginBottom: 12 }}><Icon name="check" size={18} /><span><b>Your ride is live!</b> Riders with alerts for this route are being notified.</span></div>}
      {ride.status === 'cancelled' && <div className="note danger" style={{ marginBottom: 12 }}><Icon name="x" size={18} /> Cancelled · {ride.cancelReason}</div>}
      {expired && <div className="note warn" style={{ marginBottom: 12 }}><Icon name="clock" size={18} /> This ride has expired and is hidden from search.</div>}

      {ride.geometry && <MapView ride={ride} height={170} showLabels={false} />}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="hstack" style={{ justifyContent: 'space-between' }}>
          <div><b style={{ fontSize: 22 }}>{fmtTime(ride.time)}</b>{ride.delayMin > 0 && <span className="badge red" style={{ marginLeft: 8 }}>+{ride.delayMin}m</span>}<small style={{ display: 'block' }}>±{ride.flex} min · {ride.recurring !== 'none' ? `🔁 ${ride.recurring}` : 'one-time'} · {ride.distanceKm?.toFixed(1)} km</small></div>
          <div style={{ textAlign: 'right' }}><b style={{ fontSize: 18 }}>{ride.seats - left}/{ride.seats}</b><small style={{ display: 'block' }}>seats filled</small></div>
        </div>
        <div className="divider" />
        <RouteLine ride={ride} />
        <small style={{ display: 'block', marginTop: 6 }}>{VIA[ride.corridor]}</small>
        <div className="divider" />
        <div className="kv"><span>Fixed fares</span><b>{ride.origin === 'isnapur' ? 'Isnapur ₹120' : `Sangareddy ₹150${ride.corridor?.startsWith('orr') ? ' · Isnapur ₹120' : ''}`}</b></div>
        <div className="kv"><span>Expected from confirmed</span><b style={{ color: 'var(--primary-d)' }}>{rupee(pax.filter((b) => b.status !== 'noshow').reduce((a, b) => a + b.amount, 0))}</b></div>
      </div>

      {requests.length > 0 && (
        <div className="section">
          <div className="section-head"><h3>Requests ({requests.length})</h3><small>Favourites shown first</small></div>
          <div className="stack">
            {requests.map((b) => {
              const u = getUser(state, b.passengerId);
              const fav = state.favorites.includes(u.id);
              return (
                <div key={b.id} className="card">
                  <button className="hstack" style={{ width: '100%' }} onClick={() => nav.go('driver', { userId: u.id })}>
                    <Avatar user={u} size={46} />
                    <div className="grow">
                      <b>{u.name} {fav && <span className="badge sm red">♥ Favourite</span>}</b>
                      <small style={{ display: 'block' }}>{u.completed || 0} rides · {u.cancellations || 0} cancellations · from {b.origin === 'isnapur' ? 'Isnapur' : 'Sangareddy'}</small>
                    </div>
                  </button>
                  <div className="note" style={{ marginTop: 10, background: '#f4f7f9', color: 'var(--ink2)' }}>
                    <Icon name="pin" size={16} /> {stops[b.pickupIdx].name} → {stops[b.dropIdx].name} · {b.seats} seat · {rupee(b.amount)}
                  </div>
                  {b.note && <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>“{b.note}”</p>}
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button className="btn outline sm" onClick={() => respondRequest(b.id, false)}>Decline</button>
                    <button className="btn sm" onClick={() => respondRequest(b.id, true)} disabled={left < b.seats}><Icon name="check" size={17} /> Accept</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-head"><h3>Passengers ({pax.length})</h3>{waiting > 0 && <small>{waiting} on waiting list</small>}</div>
        {pax.length ? (
          <div className="card menu">
            {pax.map((b) => {
              const u = getUser(state, b.passengerId);
              const [tone, label] = STATUS_BADGE[b.status];
              return (
                <div key={b.id} className="row">
                  <button onClick={() => nav.go('driver', { userId: u.id })}><Avatar user={u} size={40} /></button>
                  <span className="row-txt"><b>{u.name}</b><small>{stops[b.pickupIdx].name} → {stops[b.dropIdx].name}</small></span>
                  <span className={'badge sm ' + tone}>{label}</span>
                  {['scheduled', 'started'].includes(ride.status) && <button className="icon-btn" onClick={() => setCall(u)} aria-label={`Call ${u.name}`}><Icon name="phone" size={18} /></button>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card"><p className="muted">No confirmed passengers yet. You'll get a notification for each request.</p></div>
        )}
      </div>

      {ride.status === 'scheduled' && (
        <>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn outline" onClick={() => nav.go('chat', { rideId })} disabled={!pax.length}><Icon name="chat" /> Message all</button>
            <button className="btn outline" onClick={() => setEdit(true)}><Icon name="edit" /> Edit</button>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <b>Running late?</b><small style={{ display: 'block' }}>Notify all confirmed passengers in one tap</small>
            <div className="opts" style={{ padding: '10px 0 0' }}>
              {[5, 10, 15].map((m) => <button key={m} className="chip" onClick={() => sendDelay(rideId, m)}>⏱ {m} min late</button>)}
            </div>
          </div>
          {state.config?.demo && (
            <div className="card hstack" style={{ marginTop: 12 }}>
              <div className="grow"><b>Simulate the drive</b><small style={{ display: 'block' }}>Demo: move the car along the route instead of using this device's GPS</small></div>
              <Toggle checked={simulate} onChange={setSimulate} label="Simulate drive" />
            </div>
          )}
          <div className="sticky-cta">
            <SlideToConfirm label={t('slideStart')} onConfirm={async () => { await startRide(rideId, simulate); nav.replace('track', { rideId }); }} />
            <button className="btn danger-ghost block" style={{ marginTop: 10 }} onClick={() => setCancel(true)}>Cancel ride</button>
          </div>
        </>
      )}
      {ride.status === 'started' && <div className="sticky-cta"><button className="btn block" onClick={() => nav.replace('track', { rideId })}><span className="pulse" /> Open live ride</button></div>}
      {ride.status === 'completed' && <div className="sticky-cta"><button className="btn ghost block" onClick={() => nav.go('done', { rideId })}><Icon name="check" /> Ride summary</button></div>}

      <CancelSheet open={cancel} onClose={() => setCancel(false)} title="Cancel this ride" reasons={DRIVER_CANCEL}
        policy={pax.length ? `${pax.length} confirmed passenger(s) will be notified and fully refunded. Frequent cancellations lower your reliability score.` : null}
        onConfirm={(r) => cancelRide(rideId, r)} />
      <EditSheet key={ride.time + ':' + ride.seats} open={edit} onClose={() => setEdit(false)} ride={ride} minSeats={ride.seats - left} onSave={(p) => editRide(rideId, p)} />
      <CallSheet open={!!call} onClose={() => setCall(null)} user={call} rideId={rideId} />
    </div>
  );
}

function EditSheet({ open, onClose, ride, onSave, minSeats }) {
  const d = new Date(ride.time);
  const [time, setTime] = useState(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const [seats, setSeats] = useState(ride.seats);
  const [notes, setNotes] = useState(ride.notes || '');
  const save = () => {
    const [h, m] = time.split(':').map(Number);
    const nd = new Date(ride.time);
    nd.setHours(h, m, 0, 0);
    onSave({ time: nd.getTime(), seats, notes });
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Edit ride">
      <div><label className="label">Departure time</label><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
      <div className="hstack field"><span className="grow"><b>Seats</b><small style={{ display: 'block' }}>{minSeats} already booked</small></span><Stepper value={seats} onChange={setSeats} min={Math.max(1, minSeats)} max={7} /></div>
      <div className="field"><label className="label">Note for passengers</label><textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="note" style={{ marginTop: 12 }}><Icon name="bell" size={18} /> Confirmed passengers are notified automatically.</div>
      <button className="btn block" style={{ marginTop: 14 }} onClick={save}>Save changes</button>
    </Sheet>
  );
}
