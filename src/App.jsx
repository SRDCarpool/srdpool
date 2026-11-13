import { useEffect, useMemo, useState } from 'react';
import { useStore, rideRoute, rideById } from './store';
import { NavCtx, Icon, Sheet } from './ui';
import { useT } from './i18n';
import { Onboarding, Login, Setup, Splash } from './screens/auth';
import Home from './screens/home';
import { FindRide, RideDetail, DriverProfile } from './screens/find';
import PostRide from './screens/post';
import { MyRides, ManageRide } from './screens/rides';
import { Track, Chat, RideDone } from './screens/track';
import { Profile, ProfilePage } from './screens/profile';
import Notifications from './screens/notifications';
import Admin from './screens/admin';
import { HelpScreen } from './screens/help';

const SCREENS = {
  home: Home, find: FindRide, post: PostRide, rides: MyRides, profile: Profile,
  ride: RideDetail, driver: DriverProfile, manage: ManageRide, track: Track, chat: Chat, done: RideDone,
  page: ProfilePage, notifications: Notifications, admin: Admin, help: HelpScreen,
};
const TAKER_TABS = [['home', 'home', 'home'], ['find', 'search', 'find'], ['rides', 'calendar', 'myRides'], ['profile', 'user', 'profile']];
const GIVER_TABS = [['home', 'home', 'home'], ['post', 'plus', 'post'], ['rides', 'calendar', 'myRides'], ['profile', 'user', 'profile']];
const TABS = [...TAKER_TABS, ['post', 'plus', 'post']];

function TabBar({ current, go }) {
  const t = useT();
  const { state } = useStore();
  const pending = state.bookings.filter((b) => b.status === 'requested' && rideById(state, b.rideId)?.driverId === 'me').length;
  const tabs = state.me.role === 'giver' ? GIVER_TABS : TAKER_TABS;
  return (
    <nav className="tabbar" aria-label="Main" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
      {tabs.map(([name, icon, label]) => (
        <button key={name} className={'tab' + (current === name ? ' on' : '') + (name === 'post' ? ' post' : '')} onClick={() => go(name)} aria-current={current === name ? 'page' : undefined}>
          <span className="tab-ic pill">
            <Icon name={icon} size={name === 'post' ? 24 : 22} stroke={name === 'post' ? 2.6 : 2} />
            {name === 'rides' && pending > 0 && <span className="count">{pending}</span>}
          </span>
          {t(label)}
        </button>
      ))}
    </nav>
  );
}

function Toast({ onOpen }) {
  const { state } = useStore();
  const t = state.toast;
  if (!t) return null;
  const icon = { track: 'car', chat: 'chat', match: 'bell', done: 'check', reminder: 'clock', booking: 'calendar', fav: 'heart', help: 'alert' }[t.kind] || 'bell';
  return (
    <button className={'toast' + (t.kind === 'help' ? ' toast-help' : '')} key={t.id} onClick={() => (t.helpId ? onOpen(null, t.helpId) : t.rideId && onOpen(t.rideId))} role="status">
      <span className="t-ic"><Icon name={icon} size={18} /></span>
      <span><b>{t.title}</b>{t.body && <small>{t.body}</small>}</span>
    </button>
  );
}

export function SOSSheet({ open, onClose, rideId }) {
  const { state, sosAlert, toast } = useStore();
  const ride = rideId ? rideById(state, rideId) : null;
  const share = async () => {
    const where = ride?.live ? ` Live location: https://maps.google.com/?q=${ride.live.lat.toFixed(5)},${ride.live.lng.toFixed(5)}` : '';
    const veh = ride?.vehicle ? ` Vehicle: ${ride.vehicle.color} ${ride.vehicle.brand} ${ride.vehicle.model} ${ride.vehicle.reg}.` : '';
    const text = `I'm on a Saathi carpool ride.${veh}${where}`;
    try {
      if (navigator.share) await navigator.share({ title: 'My live trip', text });
      else { await navigator.clipboard.writeText(text); toast('Trip details copied', 'Paste them to a trusted contact'); }
    } catch { /* cancelled */ }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Emergency help">
      <div className="stack">
        <a className="sos-big" href="tel:112">
          <Icon name="phone" size={26} />
          <span>Call 112<small>National emergency number</small></span>
        </a>
        <button className="btn danger-ghost block" onClick={() => { sosAlert(rideId); onClose(); }}>
          <Icon name="alert" /> Alert my trusted contacts ({state.emergency.length})
        </button>
        <button className="btn outline block" onClick={share}><Icon name="share" /> Share live trip</button>
        <div className="note"><Icon name="info" size={18} /> Trusted contacts get an SMS with the Ride Giver's name, vehicle number and your last known location. Our safety team is alerted too.</div>
      </div>
    </Sheet>
  );
}

export default function App() {
  const { state } = useStore();
  const [stack, setStack] = useState([{ name: 'home', params: {} }]);
  const [sos, setSos] = useState(null);
  const [netOnline, setNetOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setNetOnline(true), off = () => setNetOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const nav = useMemo(() => ({
    go: (name, params = {}) => setStack((s) => [...s, { name, params }]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: 'home', params: {} }])),
    tab: (name, params = {}) => setStack([{ name, params }]),
    replace: (name, params = {}) => setStack((s) => [...s.slice(0, -1), { name, params }]),
    openSOS: (rideId) => setSos({ rideId }),
  }), []);

  const cur = stack[stack.length - 1];
  useEffect(() => { window.scrollTo(0, 0); }, [stack.length, cur.name, !!state.auth, !!state.me?.name, state.onboarded]);

  if (!state.onboarded) return <div className="app"><Onboarding /></div>;
  if (!state.auth) return <div className="app"><Login /></div>;
  if (state.loading && !state.me?.id) return <div className="app"><Splash /></div>;
  if (!state.me?.name) return <div className="app"><Setup /></div>;

  const Screen = SCREENS[cur.name] || Home;
  const isTab = stack.length === 1 && TABS.some(([n]) => n === cur.name);
  const openRide = (rideId, helpId) => (helpId ? nav.go('help', { helpId }) : nav.go(...rideRoute(state, rideId)));

  return (
    <NavCtx.Provider value={{ ...nav, openRide, depth: stack.length }}>
      <div className="app">
        {(!netOnline || !state.online) && <div className="offline"><Icon name="wifi" size={16} /> {netOnline ? 'Reconnecting to Saathi…' : "You're offline"} · showing saved booking details</div>}
        <Screen key={stack.length + cur.name} {...cur.params} />
        {isTab && <TabBar current={cur.name} go={nav.tab} />}
        <Toast onOpen={openRide} />
        <SOSSheet open={!!sos} rideId={sos?.rideId} onClose={() => setSos(null)} />
      </div>
    </NavCtx.Provider>
  );
}
