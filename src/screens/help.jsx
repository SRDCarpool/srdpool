import { useState } from 'react';
import { useStore, rideById } from '../store';
import { Header, Icon, Avatar, Chip, Sheet, Empty, MapView, RouteLine, useNav } from '../ui';
import { first, timeAgo } from '../geo';

const REASONS = [['Flat tyre', '🛞'], ['Engine trouble', '🔧'], ['Accident', '🚧'], ['Out of fuel', '⛽'], ['Other', '❓']];

/** Open help requests this user could answer with one of their rides. */
export const openHelpForMe = (state) => (state.help || []).filter((h) => h.status === 'open' && h.driverId !== 'me' && h.myRideId && !h.declinedByMe && h.mySeatsLeft > 0 && h.seatsNeeded > 0);

/** Red cards on Home for nearby breakdowns. */
export function HelpAlertCards() {
  const { state } = useStore();
  const nav = useNav();
  return openHelpForMe(state).map((h) => (
    <button key={h.id} className="card help-card" style={{ marginTop: 16, textAlign: 'left' }} onClick={() => nav.go('help', { helpId: h.id })}>
      <div className="hstack">
        <span className="row-ic red"><Icon name="alert" size={20} /></span>
        <div className="grow">
          <b className="help-title">🆘 {first(h.driver?.name)} needs help</b>
          <small style={{ display: 'block' }}>{h.reason} near {h.placeName} · {h.seatsNeeded} seat{h.seatsNeeded > 1 ? 's' : ''} needed</small>
        </div>
        <Icon name="right" className="muted" />
      </div>
    </button>
  ));
}

/** Screen for a driver who received a help request. */
export function HelpScreen({ helpId }) {
  const { state, offerHelp, declineHelp } = useStore();
  const nav = useNav();
  const [busy, setBusy] = useState(false);
  const req = (state.help || []).find((h) => h.id === helpId);
  if (!req) return <div className="screen no-tab"><Header title="Help request" /><Empty icon="alert" title="Request not found" text="It may have been resolved already." /></div>;
  const myRide = req.myRideId ? rideById(state, req.myRideId) : null;
  const offerSeats = Math.min(req.seatsNeeded, req.mySeatsLeft);
  const offer = async () => {
    setBusy(true);
    const r = await offerHelp(req.id, req.myRideId);
    setBusy(false);
    if (r.ok) nav.replace(myRide?.status === 'started' ? 'track' : 'manage', { rideId: req.myRideId });
  };

  return (
    <div className="screen no-tab">
      <Header title="Ride needs help" sub={`${req.reason} · ${timeAgo(req.at)}`} />
      {myRide && <MapView ride={myRide} height={210} alert={{ lat: req.lat, lng: req.lng }} live={myRide.status === 'started' ? myRide.live : null} showLabels={false} />}

      <div className="card help-card" style={{ marginTop: 12 }}>
        <div className="hstack">
          <Avatar user={req.driver} size={48} />
          <div className="grow">
            <b className="help-title">{req.driver?.name}'s car: {req.reason}</b>
            <small style={{ display: 'block' }}>Stopped near <b>{req.placeName}</b> · going to {req.destination}</small>
          </div>
        </div>
        {req.note && <p className="muted" style={{ marginTop: 8 }}>“{req.note}”</p>}
        <div className="divider" />
        <div className="kv"><span>Passengers waiting</span><b>{req.passengersWaiting}</b></div>
        <div className="kv"><span>Seats needed</span><b>{req.seatsNeeded}</b></div>
        {req.vehicle && <div className="kv"><span>Their car</span><b>{req.vehicle.color} {req.vehicle.brand} {req.vehicle.model}</b></div>}
      </div>

      {myRide && (
        <div className="card" style={{ marginTop: 12 }}>
          <b>Your ride passes this spot</b>
          <div style={{ marginTop: 6 }}><RouteLine ride={myRide} /></div>
          <small style={{ display: 'block', marginTop: 6 }}>You have <b>{req.mySeatsLeft}</b> empty seat{req.mySeatsLeft !== 1 ? 's' : ''}. We'll add a 🆘 pickup stop at their car and drop each passenger at the stop on your route closest to where they were going. They pay you the same fare.</small>
        </div>
      )}

      {req.status !== 'open' ? (
        <div className="note green" style={{ marginTop: 12 }}><Icon name="check" size={18} /> {req.status === 'resolved' ? 'Everyone has been given a seat. Thank you!' : 'The driver fixed the problem — no help needed now.'}</div>
      ) : req.seatsNeeded === 0 ? (
        <div className="note green" style={{ marginTop: 12 }}><Icon name="check" size={18} /> All passengers have been placed.</div>
      ) : !myRide || req.mySeatsLeft < 1 ? (
        <div className="note" style={{ marginTop: 12 }}><Icon name="info" size={18} /> Your car is full, so you can't take passengers this time.</div>
      ) : (
        <div className="sticky-cta">
          <button className="btn danger block" disabled={busy} onClick={offer}><Icon name="users" /> {busy ? 'Adding…' : `Offer ${offerSeats} seat${offerSeats > 1 ? 's' : ''}`}</button>
          <button className="btn outline block" style={{ marginTop: 10 }} onClick={() => { declineHelp(req.id); nav.back(); }}>Can't help right now</button>
        </div>
      )}
    </div>
  );
}

/** Driver's breakdown button + status, shown on the live ride screen. */
export function HelpPanel({ ride }) {
  const { state, requestHelp, cancelHelp } = useStore();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const req = (state.help || []).filter((h) => h.rideId === ride.id && h.driverId === 'me' && h.status !== 'cancelled').sort((a, b) => b.at - a.at)[0];
  const onBoard = state.bookings.filter((b) => b.rideId === ride.id && ['confirmed', 'picked'].includes(b.status)).length;

  if (req) {
    return (
      <div className="card help-card" style={{ marginTop: 12 }}>
        <b className="help-title">🆘 {req.reason} — {req.status === 'resolved' ? 'everyone has a seat' : 'help requested'}</b>
        <small style={{ display: 'block', marginTop: 2 }}>Near {req.placeName} · {timeAgo(req.at)}</small>
        <div className="divider" />
        {req.candidates.length === 0 && req.status === 'open' && <div className="note warn"><Icon name="info" size={18} /> No nearby rides with empty seats yet. Your request stays open; use SOS if anyone is unsafe.</div>}
        {req.candidates.length > 0 && <div className="kv"><span>Drivers alerted</span><b>{req.candidates.length}</b></div>}
        {req.offers.map((o, i) => <div key={i} className="kv"><span>🙏 {o.driverName}</span><b>took {o.seats} seat{o.seats > 1 ? 's' : ''}</b></div>)}
        <div className="kv"><span>Passengers still waiting</span><b>{req.passengersWaiting}</b></div>
        {req.status === 'resolved' && <div className="note green" style={{ marginTop: 8 }}><Icon name="check" size={18} /> All your passengers are in other cars. End your ride when you're ready.</div>}
        {req.status === 'open' && <button className="btn outline block" style={{ marginTop: 10 }} onClick={() => cancelHelp(req.id)}><Icon name="check" /> Problem fixed — continue ride</button>}
        <button className="btn danger-ghost block" style={{ marginTop: 8 }} onClick={() => nav.openSOS(ride.id)}><Icon name="phone" /> Emergency? Call 112</button>
      </div>
    );
  }

  const send = async () => {
    setBusy(true);
    const r = await requestHelp(ride.id, { reason, note });
    setBusy(false);
    if (r.ok) setOpen(false);
  };
  return (
    <>
      <button className="btn danger-ghost block" style={{ marginTop: 12 }} onClick={() => setOpen(true)}><Icon name="alert" /> Car trouble? Ask nearby drivers for help</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="What happened?">
        <p className="muted" style={{ marginBottom: 12 }}>We'll alert Saathi drivers coming this way with empty seats, so your {onBoard} passenger{onBoard !== 1 ? 's' : ''} can continue safely in their car.</p>
        <div className="opts" style={{ padding: 0 }}>
          {REASONS.map(([r, e]) => <Chip key={r} on={reason === r} onClick={() => setReason(r)}>{e} {r}</Chip>)}
        </div>
        <textarea className="input" style={{ marginTop: 12 }} placeholder="Anything helpers should know? (optional) e.g. parked on the left after the ORR exit" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <div className="note" style={{ marginTop: 12 }}><Icon name="info" size={18} /> Your car's live location is shared with drivers who can help. If anyone is hurt or unsafe, call 112 first.</div>
        <button className="btn danger block" style={{ marginTop: 14 }} disabled={!reason || busy} onClick={send}>{busy ? 'Sending…' : 'Ask for help'}</button>
      </Sheet>
    </>
  );
}

/** Passenger notices: car trouble, or moved to another ride. */
export function PassengerHelpBanner({ ride, booking }) {
  const { state } = useStore();
  const nav = useNav();
  if (booking?.status === 'transferred' && booking.transferredTo) {
    const nr = rideById(state, booking.transferredTo.rideId);
    const nb = state.bookings.find((b) => b.id === booking.transferredTo.bookingId);
    return (
      <div className="card" style={{ marginTop: 12, boxShadow: 'inset 0 0 0 2px var(--primary), var(--shadow)' }}>
        <b style={{ fontSize: 16 }}>🚗 You've been moved to another ride</b>
        {nr && nb && <small style={{ display: 'block', marginTop: 4 }}>{nr.vehicle?.color} {nr.vehicle?.brand} {nr.vehicle?.model} · <b>{nr.vehicle?.reg}</b> picks you up at {nr.stops[nb.pickupIdx]?.name}</small>}
        <button className="btn block" style={{ marginTop: 10 }} onClick={() => nav.replace(nr?.status === 'started' ? 'track' : 'ride', { rideId: booking.transferredTo.rideId })}><Icon name="nav" /> Go to your new ride</button>
      </div>
    );
  }
  if (ride.breakdown && booking && ['confirmed', 'picked'].includes(booking.status)) {
    return (
      <div className="note danger" style={{ marginTop: 12 }}>
        <Icon name="alert" size={18} />
        <span><b>Car trouble: {ride.breakdown.reason}.</b> We're finding you a seat in another Saathi ride coming this way. You'll get a notification with the new car's details.</span>
      </div>
    );
  }
  return null;
}
