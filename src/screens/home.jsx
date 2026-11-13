import { useStore, useAsync, getUser, myBooking, rideById } from '../store';
import { Icon, Avatar, RideCard, RouteLine, useNav } from '../ui';
import { useT } from '../i18n';
import { fmtTime, fmtDay, first, rupee } from '../geo';
import { useFares } from './find';

const ORIGIN_NAMES = { sangareddy: 'Sangareddy', isnapur: 'Isnapur' };
const lastOrigin = () => { try { return localStorage.getItem('saathi-origin') || 'sangareddy'; } catch { return 'sangareddy'; } };

export default function Home() {
  const { state, search } = useStore();
  const nav = useNav();
  const t = useT();
  const fares = useFares();
  const me = getUser(state, 'me');
  const giver = state.me.role === 'giver';
  const unread = state.notifications.filter((n) => !n.read).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const myRides = state.rides.filter((r) => r.driverId === 'me');
  const myBks = state.bookings.filter((b) => b.passengerId === 'me');
  const bookedRides = myBks.filter((b) => ['requested', 'confirmed', 'picked'].includes(b.status)).map((b) => rideById(state, b.rideId)).filter(Boolean);
  const live = [...myRides, ...bookedRides].find((r) => r.status === 'started');
  const upcoming = [...myRides, ...bookedRides].filter((r) => r.status === 'scheduled').sort((a, b) => a.time - b.time)[0];
  const unpaid = myBks.find((b) => b.status === 'completed' && !b.paid && rideById(state, b.rideId));
  const pendingReq = state.bookings.filter((b) => b.status === 'requested' && myRides.some((r) => r.id === b.rideId)).length;
  const origin = lastOrigin();
  const next = useAsync(() => (giver ? [] : search({ origin, via: 'any' })), [giver, origin]);
  const pickOrigin = (o) => { try { localStorage.setItem('saathi-origin', o); } catch { /* ignore */ } nav.tab('find'); };

  return (
    <div className="screen">
      <section className="hero">
        <div className="hero-top">
          <button onClick={() => nav.tab('profile')} aria-label="Profile"><Avatar user={me} size={44} /></button>
          <div className="grow">
            <div style={{ fontSize: 13, opacity: 0.85 }}>{greet},</div>
            <b style={{ fontSize: 17 }}>{first(me.name)} 👋</b>
          </div>
          <button className="icon-btn" onClick={() => nav.go('notifications')} aria-label="Notifications">
            <Icon name="bell" size={21} />
            {unread > 0 && <span className="dot-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
        </div>
        <h1>{giver ? 'Share your seats today' : 'Going to Financial District / HITEC City?'}</h1>
        <p style={{ marginTop: 6 }}><span className="role-pill">{giver ? '🚗 Ride Giver' : '🙋 Ride Taker'}</span></p>
      </section>

      {giver ? (
        <div className="actions">
          <button className="action" onClick={() => nav.tab('post')}>
            <span className="a-ic a-amber"><Icon name="plus" size={24} /></span>
            <b>{t('post')}</b><small>Type your route & pickup points</small>
          </button>
          <button className="action" onClick={() => nav.tab('rides')}>
            <span className="a-ic a-blue"><Icon name="calendar" size={22} /></span>
            <b>{t('myRides')}</b><small>{pendingReq ? `${pendingReq} request${pendingReq > 1 ? 's' : ''} waiting` : 'Passengers & trips'}</small>
          </button>
        </div>
      ) : (
        <div className="actions" style={{ gridTemplateColumns: '1fr' }}>
          {['sangareddy', 'isnapur'].map((o) => (
            <button key={o} className="action wide" onClick={() => pickOrigin(o)}>
              <span className="a-ic a-green"><Icon name="pin" size={22} /></span>
              <span className="grow"><b style={{ display: 'block' }}>From {ORIGIN_NAMES[o]}</b><small>{o === 'isnapur' ? 'Via ORR' : 'Via ORR or Shankarpally'} · to FD / HITEC City</small></span>
              <b style={{ fontSize: 20, color: 'var(--primary-d)' }}>{rupee(fares[o])}</b>
            </button>
          ))}
        </div>
      )}

      {live && (
        <button className="card live-card" style={{ marginTop: 16, textAlign: 'left' }} onClick={() => nav.go('track', { rideId: live.id })}>
          <div className="hstack">
            <span className="pulse" />
            <div className="grow">
              <b>Ride in progress</b>
              <small style={{ display: 'block' }}>{live.stops[0].name} → {live.stops.at(-1).name} · tap to track live</small>
            </div>
            <Icon name="right" />
          </div>
        </button>
      )}

      {upcoming && !live && <UpcomingCard ride={upcoming} />}

      {unpaid && (
        <button className="card" style={{ marginTop: 12, textAlign: 'left' }} onClick={() => nav.go('ride', { rideId: unpaid.rideId })}>
          <div className="hstack">
            <span className="row-ic amber"><Icon name="rupee" size={20} /></span>
            <div className="grow"><b>Pay {rupee(unpaid.amount)} for your last ride</b><small style={{ display: 'block' }}>with {first(getUser(state, rideById(state, unpaid.rideId).driverId).name)}</small></div>
            <Icon name="right" className="muted" />
          </div>
        </button>
      )}

      {!giver && (
        <div className="section">
          <div className="section-head"><h3>Next rides from {ORIGIN_NAMES[origin]}</h3><button className="link" onClick={() => nav.tab('find')}>See all</button></div>
          {next.loading && !next.data ? (
            <div className="card center"><span className="spinner" style={{ display: 'inline-block' }} /></div>
          ) : next.data?.length ? (
            <div className="stack">
              {next.data.filter((r) => !r.outside).slice(0, 3).map((r) => (
                <RideCard key={r.ride.id} ride={r.ride} fare={r.fare} pickupIdx={r.pickupIdx} fav={r.fav} onClick={() => nav.go('ride', { rideId: r.ride.id, origin, pickupIdx: r.pickupIdx })} />
              ))}
            </div>
          ) : (
            <div className="card"><p className="muted">No upcoming rides from {ORIGIN_NAMES[origin]} right now. Open Find Ride to turn on an alert.</p></div>
          )}
        </div>
      )}

      {giver && !upcoming && !live && (
        <div className="card" style={{ marginTop: 16 }}>
          <b>How posting works</b>
          <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>Type where you start, where you're going, the time and seats. Then add your pickup points in order — passengers see it like this:</p>
          <div className="route-line" style={{ marginTop: 8 }}>
            <b className="rl-time">9:00 AM</b>
            {['Malkapur Chintal', 'SRD X Road', 'ORR', 'ICICI', 'Wipro Circle'].map((s, i) => <span key={s} className="rl-stop">{i > 0 && <span className="rl-sep">›</span>}{s}</span>)}
          </div>
        </div>
      )}

      <button className="sos-fab" onClick={() => nav.openSOS()} aria-label="Emergency SOS">SOS</button>
    </div>
  );
}

function UpcomingCard({ ride }) {
  const { state } = useStore();
  const nav = useNav();
  const mine = ride.driverId === 'me';
  const b = myBooking(state, ride.id);
  const other = getUser(state, ride.driverId);
  const reqs = state.bookings.filter((x) => x.rideId === ride.id && x.status === 'requested').length;
  const label = mine ? 'You are driving' : b?.status === 'requested' ? 'Waiting for approval' : 'Seat confirmed';
  return (
    <button className="card" style={{ marginTop: 16, textAlign: 'left' }} onClick={() => nav.openRide(ride.id)}>
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <span className={'badge ' + (mine ? 'gold' : b?.status === 'requested' ? 'gray' : 'green')}>{label}</span>
        <small>{fmtDay(ride.time)}</small>
      </div>
      <div className="hstack" style={{ marginTop: 10, alignItems: 'flex-start' }}>
        <div className="grow"><RouteLine ride={ride} pickupIdx={mine ? undefined : b?.pickupIdx} dropIdx={mine ? undefined : b?.dropIdx} /></div>
        {!mine && <Avatar user={other} size={42} />}
      </div>
      {mine && reqs > 0 && <div className="note warn" style={{ marginTop: 10 }}><Icon name="users" size={18} /> {reqs} passenger request{reqs > 1 ? 's' : ''} to review</div>}
      {!mine && b && <small style={{ display: 'block', marginTop: 6 }}>Board at {ride.stops[b.pickupIdx].name} · ~{fmtTime(ride.time)}</small>}
    </button>
  );
}
