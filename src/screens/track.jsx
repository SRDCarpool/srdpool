import { useEffect, useRef, useState } from 'react';
import { useStore, getUser, myBooking, rideById } from '../store';
import { Header, Icon, Avatar, MapView, SlideToConfirm, Chip, Empty, useNav } from '../ui';
import { CallSheet, ReportSheet, useRide } from './find';
import { fmtTime, first, rupee, etaMin, km } from '../geo';
import { useT } from '../i18n';

export function Track({ rideId }) {
  const { state, confirmBoarded, sendDelay, endRide, toast } = useStore();
  const nav = useNav();
  const t = useT();
  const [call, setCall] = useState(null);
  const { ride } = useRide(rideId);
  const done = useRef(false);
  const mine = ride?.driverId === 'me';
  const b = ride && !mine ? myBooking(state, rideId) : null;

  useEffect(() => {
    if (!ride || done.current) return;
    if (!mine && b?.status === 'completed') { done.current = true; setTimeout(() => nav.replace('done', { bookingId: b.id }), 1500); }
  }, [b?.status]); // eslint-disable-line

  if (!ride) return <div className="screen no-tab"><Header title="Live ride" /><Empty title="Loading ride…" /></div>;
  const stops = ride.stops;
  const driver = getUser(state, ride.driverId);
  const pos = ride.live?.posKm ?? ride.posKm ?? 0;
  const startKm = ride.startKm || 0;
  const pct = Math.max(0, Math.min(100, ((pos - startKm) / ((ride.distanceKm || 1) - startKm || 1)) * 100));

  const share = async () => {
    const where = ride.live ? ` Live location: https://maps.google.com/?q=${ride.live.lat.toFixed(5)},${ride.live.lng.toFixed(5)}` : '';
    const text = `I'm on a Saathi ride with ${driver.name} (${ride.vehicle.color} ${ride.vehicle.brand} ${ride.vehicle.model}, ${ride.vehicle.reg}) from ${stops[0].name} to ${stops.at(-1).name}.${where}`;
    try {
      if (navigator.share) await navigator.share({ title: 'My live ride', text });
      else { await navigator.clipboard.writeText(text); toast('Trip status copied', 'Send it to a trusted contact'); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="screen no-tab" style={{ paddingBottom: 30 }}>
      <Header title={ride.status === 'started' ? 'Live ride' : ride.status === 'completed' ? 'Ride completed' : 'Ride'} sub={`${stops[0].name} → ${stops.at(-1).name}`}
        right={<button className="btn danger sm" onClick={() => nav.openSOS(rideId)} aria-label="SOS">SOS</button>} />
      <div className="map-full"><MapView ride={ride} live={ride.status === 'started' ? ride.live : null} pickupIdx={b?.pickupIdx} dropIdx={b?.dropIdx} height={320} follow /></div>

      <div style={{ height: 6, background: 'var(--line)', margin: '0 -16px' }}>
        <div style={{ height: '100%', width: pct + '%', background: 'var(--primary)', transition: 'width 1s linear' }} />
      </div>

      {mine ? <DriverPanel ride={ride} pos={pos} onCall={setCall} /> : b && <PassengerPanel ride={ride} b={b} pos={pos} driver={driver} onCall={() => setCall(driver)} onBoard={() => confirmBoarded(b.id)} />}

      {ride.status === 'started' && (
        <>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn outline" onClick={() => nav.go('chat', { rideId })}><Icon name="chat" /> Chat</button>
            {!mine && <button className="btn outline" onClick={share}><Icon name="share" /> Share trip</button>}
            {mine && <button className="btn outline" onClick={() => nav.go('chat', { rideId })}><Icon name="send" /> Update all</button>}
          </div>
          {mine && (
            <div className="card" style={{ marginTop: 12 }}>
              <b>Notify a delay</b>
              <div className="opts" style={{ padding: '10px 0 0' }}>{[5, 10, 15].map((m) => <button key={m} className="chip" onClick={() => sendDelay(rideId, m)}>⏱ {m} min</button>)}</div>
            </div>
          )}
          <div className="note" style={{ marginTop: 12 }}>
            <Icon name="lock" size={18} />
            <span>{mine ? (ride.simulate ? 'Simulated drive (demo). ' : "Sharing this phone's GPS. Keep Saathi open while driving. ") + 'Only confirmed passengers can see your location.' : 'Live location is visible only to confirmed passengers on this ride.'} Sharing stops automatically when the ride ends.</span>
          </div>
          {mine && (
            <div className="sticky-cta">
              {ride.arrived && <div className="note green" style={{ marginBottom: 10 }}><Icon name="pin" size={18} /> You've reached {stops.at(-1).name}. Slide to complete the ride.</div>}
              <SlideToConfirm label={t('slideEnd')} tone="danger" onConfirm={async () => { await endRide(rideId); nav.replace('done', { rideId }); }} />
            </div>
          )}
        </>
      )}
      {ride.status === 'completed' && (
        <div className="card" style={{ marginTop: 12 }}>
          <Empty icon="check" title="Ride completed" text="Live location sharing has stopped. Thanks for riding together!"
            action={<button className="btn" onClick={() => nav.replace('done', mine ? { rideId } : { bookingId: b.id })}><Icon name="check" /> Finish</button>} />
        </div>
      )}
      <CallSheet open={!!call} onClose={() => setCall(null)} user={call} />
    </div>
  );
}

function PassengerPanel({ ride, b, pos, driver, onCall, onBoard }) {
  const stops = ride.stops;
  const toPickup = stops[b.pickupIdx].pos - pos, toDrop = stops[b.dropIdx].pos - pos;
  const arrive = (kmLeft) => fmtTime(Date.now() + etaMin(kmLeft, ride) * 60000);
  let title, sub, tone = '';
  if (ride.status !== 'started') { title = 'Waiting for the driver to start'; sub = `Departs ${fmtTime(ride.time)}`; }
  else if (b.status === 'confirmed' && !b.arrivedAt) {
    title = pos < 0 ? `${first(driver.name)} is heading to the start point` : `${first(driver.name)} arrives in ${etaMin(toPickup, ride)} min`;
    sub = `At ${stops[b.pickupIdx].name} around ${arrive(toPickup)} · ${km(Math.max(0, toPickup))} away`;
  } else if (b.status === 'confirmed') { title = `${first(driver.name)} has arrived! 📍`; sub = `Meet at ${stops[b.pickupIdx].name}`; tone = 'green'; }
  else if (b.status === 'picked') { title = `On the way to ${stops[b.dropIdx].name}`; sub = `Arriving around ${arrive(toDrop)} · ${etaMin(toDrop, ride)} min left`; }
  else if (b.status === 'completed') { title = `You've arrived at ${stops[b.dropIdx].name} 🎉`; sub = 'Redirecting to rating…'; tone = 'green'; }
  else title = 'Booking ' + b.status;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className={tone ? 'note green' : ''} style={{ marginBottom: 12 }}>
        <div><b style={{ fontSize: 17 }}>{title}</b><small style={{ display: 'block' }}>{sub}</small></div>
      </div>
      {ride.delayMin > 0 && b.status === 'confirmed' && <div className="note warn" style={{ marginBottom: 12 }}><Icon name="clock" size={18} /> Driver reported a {ride.delayMin} min delay</div>}
      <div className="hstack">
        <Avatar user={driver} size={48} />
        <div className="grow">
          <b>{driver.name}</b>
          <small style={{ display: 'block' }}>{ride.vehicle.color} {ride.vehicle.brand} {ride.vehicle.model}</small>
        </div>
        <button className="icon-btn" style={{ background: 'var(--primary-50)', color: 'var(--primary)' }} onClick={onCall} aria-label="Call driver"><Icon name="phone" size={19} /></button>
      </div>
      <div className="hstack" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <small>Match this number plate</small>
        <span className="vehicle-plate" style={{ fontSize: 16 }}>{ride.vehicle.reg}</span>
      </div>
      {b.status === 'confirmed' && (b.arrivedAt || ride.status === 'started') && (
        <button className="btn block" style={{ marginTop: 14 }} onClick={onBoard} disabled={!b.arrivedAt && toPickup > 0.3}><Icon name="check" /> I've boarded the vehicle</button>
      )}
    </div>
  );
}

function DriverPanel({ ride, pos, onCall }) {
  const { state, markPicked, markNoShow } = useStore();
  const stops = ride.stops;
  const pax = state.bookings.filter((b) => b.rideId === ride.id && ['confirmed', 'picked', 'completed', 'noshow'].includes(b.status));
  const next = pax.filter((b) => b.status === 'confirmed').sort((a, b) => a.pickupIdx - b.pickupIdx)[0];
  const nextDrop = pax.filter((b) => b.status === 'picked').sort((a, b) => a.dropIdx - b.dropIdx)[0];
  const target = next ? { kind: 'Pick up', who: getUser(state, next.passengerId), idx: next.pickupIdx } : nextDrop ? { kind: 'Drop', who: getUser(state, nextDrop.passengerId), idx: nextDrop.dropIdx } : null;
  const gap = (target ? stops[target.idx].pos : ride.distanceKm) - pos;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 12 }}>
        {target ? (
          <><b style={{ fontSize: 17 }}>{target.kind} {first(target.who.name)} at {stops[target.idx].name}</b><small style={{ display: 'block' }}>{gap > 0.15 ? `${km(gap)} · ~${etaMin(gap, ride)} min` : 'You have arrived'}</small></>
        ) : (
          <><b style={{ fontSize: 17 }}>Heading to {stops.at(-1).name}</b><small style={{ display: 'block' }}>{gap > 0.15 ? `${km(gap)} · ~${etaMin(gap, ride)} min` : 'Destination reached'}</small></>
        )}
      </div>
      {pax.length === 0 && <p className="muted">No passengers on this trip.</p>}
      {pax.map((b) => {
        const u = getUser(state, b.passengerId);
        const near = b.status === 'confirmed' && (b.arrivedAt || stops[b.pickupIdx].pos - pos < 0.3);
        return (
          <div key={b.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <div className="hstack">
              <Avatar user={u} size={38} />
              <div className="grow">
                <b style={{ fontSize: 14.5 }}>{u.name}</b>
                <small style={{ display: 'block' }}>{stops[b.pickupIdx].name} → {stops[b.dropIdx].name}</small>
              </div>
              {b.status === 'confirmed' && <span className="badge gray">{near ? 'Waiting' : 'To pick up'}</span>}
              {b.status === 'picked' && <span className="badge blue">On board</span>}
              {b.status === 'completed' && <span className="badge green">Dropped</span>}
              {b.status === 'noshow' && <span className="badge red">No-show</span>}
              {['confirmed', 'picked'].includes(b.status) && <button className="icon-btn" onClick={() => onCall(u)} aria-label={`Call ${u.name}`}><Icon name="phone" size={17} /></button>}
            </div>
            {near && (
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn outline sm" onClick={() => markNoShow(b.id)}>No-show</button>
                <button className="btn sm" onClick={() => markPicked(b.id)}><Icon name="check" size={17} /> Picked up</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const QUICK = ["I'm at the pickup point", 'Where are you?', 'Running 5 min late', 'I have arrived', 'Can I bring a bag?', 'Thank you!'];

export function Chat({ rideId }) {
  const { state, sendChat, report } = useStore();
  const [text, setText] = useState('');
  const [rep, setRep] = useState(false);
  const end = useRef(null);
  const { ride } = useRide(rideId);
  const msgs = state.chats[rideId] || [];
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);
  if (!ride) return null;
  const mine = ride.driverId === 'me';
  const pax = state.bookings.filter((b) => b.rideId === rideId && ['confirmed', 'picked'].includes(b.status));
  const other = mine ? (pax[0] ? getUser(state, pax[0].passengerId) : null) : getUser(state, ride.driverId);
  const title = mine ? (pax.length > 1 ? `All passengers (${pax.length})` : other?.name || 'Passengers') : other.name;
  const send = (tx) => {
    const v = (tx ?? text).trim();
    if (!v) return;
    sendChat(rideId, v);
    setText('');
  };
  return (
    <div className="screen no-tab" style={{ paddingBottom: 0, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <Header title={title} sub={`${ride.stops[0].name} → ${ride.stops.at(-1).name} · ${fmtTime(ride.time)}`}
        right={other && <button className="icon-btn" onClick={() => setRep(true)} aria-label="Report conversation"><Icon name="flag" size={19} /></button>} />
      <div className="note green" style={{ fontSize: 12.5 }}><Icon name="lock" size={16} /> Chat is private to this ride. Phone numbers are never shared.</div>
      <div className="chat grow">
        {!msgs.length && <p className="muted center" style={{ marginTop: 30 }}>Say hello 👋 and confirm your pickup point.</p>}
        {msgs.map((m) => {
          const u = getUser(state, m.from);
          return (
            <div key={m.id} className={'msg' + (m.system ? ' sys' : m.from === 'me' ? ' me' : '')}>
              {!m.system && m.from !== 'me' && mine && <b style={{ fontSize: 12, display: 'block' }}>{first(u.name)}</b>}
              {m.text}
              {!m.system && <small>{fmtTime(m.at)}</small>}
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="composer">
        <div className="hscroll" style={{ marginBottom: 8 }}>
          {(mine ? ["I've started, on my way", 'Running 5 min late', "I'm at the pickup point", 'Please be ready in 5 min'] : QUICK).map((q) => <Chip key={q} onClick={() => send(q)}>{q}</Chip>)}
        </div>
        <form className="composer-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={other ? 'Type a message…' : 'No confirmed passengers yet'} disabled={!other} aria-label="Message" />
          <button className="send-btn" type="submit" disabled={!text.trim()} aria-label="Send"><Icon name="send" size={20} /></button>
        </form>
      </div>
      <ReportSheet open={rep} onClose={() => setRep(false)} name={first(other?.name)} onSubmit={(type, details) => report({ targetId: other.id, type, details, rideId })} />
    </div>
  );
}

/** Shown when a ride ends: payment for passengers, a summary for drivers. No ratings. */
export function RideDone({ bookingId, rideId }) {
  const { state, pay, toggleFavorite } = useStore();
  const nav = useNav();
  const b = bookingId ? state.bookings.find((x) => x.id === bookingId) : null;
  const ride = rideById(state, b ? b.rideId : rideId);
  if (!ride) return <div className="screen no-tab"><Header title="Ride completed" onBack={() => nav.tab('home')} /><Empty title="Loading…" /></div>;
  const mine = ride.driverId === 'me';
  const pax = state.bookings.filter((x) => x.rideId === ride.id && ['completed', 'noshow'].includes(x.status));
  const people = mine ? pax.map((x) => getUser(state, x.passengerId)) : [getUser(state, ride.driverId)];
  const receipt = b && state.payments.find((p) => p.bookingId === b.id && p.amount > 0);
  return (
    <div className="screen no-tab">
      <Header title="Ride completed 🎉" onBack={() => nav.tab('home')} />
      <div className="card center">
        <div style={{ fontSize: 46 }}>🏁</div>
        <h2 style={{ fontSize: 20 }}>{b ? `${ride.stops[b.pickupIdx].name} → ${ride.stops[b.dropIdx].name}` : `${ride.stops[0].name} → ${ride.stops.at(-1).name}`}</h2>
        <p className="muted">{mine ? `${pax.filter((x) => x.status === 'completed').length} passenger(s) dropped · ${rupee(pax.filter((x) => x.status === 'completed').reduce((a, x) => a + x.amount, 0))} in fares` : 'Thanks for riding with Saathi!'}</p>
      </div>

      {b && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="hstack" style={{ justifyContent: 'space-between' }}>
            <b>Fare</b>
            <span className={'badge ' + (b.paid ? 'green' : 'gray')}>{b.paid ? 'Paid' : 'Pending'}</span>
          </div>
          <div className="kv total"><span>{b.seats} seat{b.seats > 1 ? 's' : ''} from {b.origin === 'isnapur' ? 'Isnapur' : 'Sangareddy'}</span><span>{rupee(b.amount)}</span></div>
          {b.paid && receipt ? (
            <div className="note green" style={{ marginTop: 8 }}><Icon name="check" size={18} /><span>Receipt {receipt.ref} · {receipt.method} · {fmtTime(receipt.at)}</span></div>
          ) : (
            <>
              <button className="btn block" style={{ marginTop: 8 }} onClick={() => pay(b.id)}>Pay {rupee(b.amount)} via UPI</button>
              <small style={{ display: 'block', marginTop: 8 }}>Or pay the driver in cash. UPI runs in test mode until a payment gateway is connected.</small>
            </>
          )}
        </div>
      )}

      {people.length > 0 && (
        <div className="card menu" style={{ marginTop: 12 }}>
          {people.map((u) => {
            const fav = state.favorites.includes(u.id);
            return (
              <div key={u.id} className="row">
                <Avatar user={u} size={40} />
                <span className="row-txt"><b>{u.name}</b><small>{fav ? 'In your favourites' : 'Ride together again?'}</small></span>
                <button className="icon-btn" onClick={() => toggleFavorite(u.id)} aria-label={fav ? `Remove ${u.name} from favourites` : `Add ${u.name} to favourites`}>
                  <Icon name="heart" fill={fav ? 'var(--danger)' : 'none'} style={{ color: fav ? 'var(--danger)' : undefined }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="sticky-cta"><button className="btn block" onClick={() => nav.tab('home')}>Done</button></div>
    </div>
  );
}
