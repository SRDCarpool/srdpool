import { useRef, useState } from 'react';
import { useStore, getUser, rideById } from '../store';
import { Header, Icon, Avatar, Badges, Segmented, Row, Toggle, Chip, Empty, Sheet, useNav } from '../ui';
import { LANGS, useT } from '../i18n';
import { VEHICLE_TYPES } from '../data';
import { fmtDay, rupee } from '../geo';
import { resizePhoto } from './auth';
import { WorkVerify } from './verify';

export function Profile() {
  const { state, setRole, logout, updateMe } = useStore();
  const nav = useNav();
  const t = useT();
  const me = getUser(state, 'me');
  const fileRef = useRef(null);
  const go = (page) => nav.go('page', { page });
  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    resizePhoto(f).then((photo) => updateMe({ photo }));
  };
  const reliability = me.completed + me.cancellations ? Math.round(100 * (1 - me.cancelRate)) : 100;

  return (
    <div className="screen">
      <Header title={t('profile')} back={false} right={<button className="icon-btn" onClick={() => nav.go('notifications')} aria-label="Notifications"><Icon name="bell" /></button>} />
      <div className="profile-head">
        <button className="photo-btn" onClick={() => fileRef.current.click()} aria-label="Change photo">
          <Avatar user={me} size={96} ring />
          <span className="cam"><Icon name="camera" size={14} /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
        <h2>{me.name}</h2>
        <div className="hstack" style={{ gap: 6 }}>
          <span className="badge green"><Icon name="mail" size={12} /> {state.auth.email}</span>
          <Badges user={me} />
        </div>
      </div>
      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat"><b>{me.completed}</b><small>rides done</small></div>
        <div className="stat"><b>{me.cancellations}</b><small>cancellations</small></div>
        <div className="stat"><b>{reliability}%</b><small>reliability</small></div>
      </div>

      <div className="section">
        <span className="label">I am currently a</span>
        <Segmented value={state.me.role} onChange={setRole} options={[['taker', ['rider', 'Ride Taker']], ['giver', ['wheel', 'Ride Giver']]]} />
      </div>

      <div className="card menu" style={{ marginTop: 16 }}>
        <Row icon="shield" title="Verification" sub={state.me.work?.company ? `${state.me.work.designation} · ${state.me.work.company}` : 'Company details & ID card'} onClick={() => go('verify')} right={<span className={'badge sm ' + ({ verified: 'green', pending: 'gold', rejected: 'red' }[state.me.work?.status] || 'gray')}>{{ verified: 'Verified', pending: 'Under review', rejected: 'Action needed' }[state.me.work?.status] || 'Not done'}</span>} />
        <Row icon="user" title="Edit profile" sub="Name, age, bio, contact" onClick={() => go('edit')} />
        <Row icon="car" title="Your vehicle" sub={state.me.vehicle ? `${state.me.vehicle.color} ${state.me.vehicle.brand} ${state.me.vehicle.model} · ${state.me.vehicle.reg}` : 'Needed to offer rides'} onClick={() => go('vehicle')} />
        <Row icon="heart" title="Favourite members" sub={`${state.favorites.length} favourites`} onClick={() => go('favorites')} />
        <Row icon="bell" title="Ride alerts" sub={`${state.alerts.length} active`} onClick={() => go('alerts')} />
      </div>

      <div className="list-label">Safety</div>
      <div className="card menu">
        <Row icon="phone" title="Emergency contacts" sub={state.emergency.length ? state.emergency.map((c) => c.name).join(', ') : 'Add trusted contacts for SOS'} onClick={() => go('emergency')} />
        <Row icon="lock" title="Privacy & location" onClick={() => go('privacy')} />
        <Row icon="shield" title="Community guidelines" onClick={() => go('guidelines')} />
      </div>

      <div className="list-label">Account</div>
      <div className="card menu">
        <Row icon="rupee" title="Payments & receipts" onClick={() => go('payments')} />
        <Row icon="bell" title="Notification settings" onClick={() => go('notifs')} />
        <Row icon="globe" title="Language" sub={LANGS.find((l) => l.id === state.lang).label} onClick={() => go('language')} />
        <Row icon="help" title="Help & support" onClick={() => go('help')} />
        {state.admin && <Row icon="grid" title="Admin dashboard" sub="Verifications, reports, users & rides" onClick={() => nav.go('admin')} />}
        <Row icon="logout" title="Log out" danger onClick={logout} right={null} />
      </div>
      <p className="center muted" style={{ fontSize: 12, marginTop: 18 }}>SRDPool v0.1 · demo build</p>
    </div>
  );
}

export function ProfilePage({ page }) {
  const P = { verify: WorkVerify, edit: EditProfile, vehicle: Vehicle, favorites: Favorites, alerts: Alerts, emergency: Emergency, privacy: Privacy, guidelines: Guidelines, payments: Payments, notifs: Notifs, language: Language, help: Help }[page];
  return <div className="screen no-tab"><P /></div>;
}

function EditProfile() {
  const { state, updateMe, toast } = useStore();
  const nav = useNav();
  const [f, setF] = useState({ name: state.me.name, age: state.me.age, bio: state.me.bio || '', phone: (state.me.phone || '').replace(/\D/g, '').slice(-10), gender: state.me.gender || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <Header title="Edit profile" />
      <div className="field"><label className="label">Full name</label><input className="input" value={f.name} onChange={set('name')} /></div>
      <div className="field field-row">
        <div><label className="label">Age</label><input className="input" inputMode="numeric" value={f.age} onChange={set('age')} /></div>
        <div><label className="label">Gender</label><select className="input select" value={f.gender} onChange={set('gender')}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option></select></div>
      </div>
      <div className="field"><label className="label">About you</label><textarea className="input" placeholder="e.g. Software engineer, love music, always on time" value={f.bio} onChange={set('bio')} /></div>
      <div className="field"><label className="label" htmlFor="ep">Mobile number</label><div className="phone-input" style={{ height: 52 }}><span>🇮🇳 +91</span><input id="ep" inputMode="numeric" value={f.phone} maxLength={10} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} /></div><small>Only shared with co-riders when they tap Call on a confirmed ride</small></div>
      <div className="field"><label className="label">Email</label><input className="input" value={state.auth.email || ''} disabled /><small>Used to sign in · not shown to other members</small></div>
      <button className="btn block" style={{ marginTop: 20 }} disabled={f.name.trim().length < 2} onClick={async () => { const r = await updateMe({ ...f, name: f.name.trim() }); if (r) { toast('Profile updated'); nav.back(); } }}>Save</button>
    </>
  );
}

function Vehicle() {
  const { state, submitVehicle } = useStore();
  const nav = useNav();
  const v = state.me.vehicle || {};
  const [f, setF] = useState({ brand: v.brand || '', model: v.model || '', color: v.color || '', reg: v.reg || '', type: v.type || 'Sedan' });
  const set = (k) => (e) => setF({ ...f, [k]: k === 'reg' ? e.target.value.toUpperCase() : e.target.value });
  const ok = f.brand && f.model && f.color && /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{3,4}$/.test(f.reg.trim());
  return (
    <>
      <Header title="Your vehicle" sub="Helps Ride Takers find the right car" />
      <div className="field"><span className="label">Vehicle type</span><div className="opts" style={{ padding: 0 }}>{VEHICLE_TYPES.map((x) => <Chip key={x} on={f.type === x} onClick={() => setF({ ...f, type: x })}>{x}</Chip>)}</div></div>
      <div className="field field-row">
        <div><label className="label" htmlFor="vb">Brand</label><input id="vb" className="input" placeholder="Maruti" value={f.brand} onChange={set('brand')} /></div>
        <div><label className="label" htmlFor="vm">Model</label><input id="vm" className="input" placeholder="Swift" value={f.model} onChange={set('model')} /></div>
      </div>
      <div className="field field-row">
        <div><label className="label" htmlFor="vc">Colour</label><input id="vc" className="input" placeholder="White" value={f.color} onChange={set('color')} /></div>
        <div><label className="label" htmlFor="vr">Registration no.</label><input id="vr" className="input" placeholder="TS 09 AB 1234" value={f.reg} onChange={set('reg')} /></div>
      </div>
      <small style={{ display: 'block', marginTop: 10 }}><Icon name="lock" size={12} /> The full number plate is shown only to Ride Takers with a confirmed seat.</small>
      <button className="btn block" style={{ marginTop: 18 }} disabled={!ok} onClick={async () => { await submitVehicle({ ...f, reg: f.reg.trim() }); nav.back(); }}>Save vehicle</button>
    </>
  );
}

function Favorites() {
  const { state, toggleFavorite } = useStore();
  const nav = useNav();
  return (
    <>
      <Header title="Favourite members" sub="Their rides are shown first" />
      {state.favorites.length ? (
        <div className="stack">
          {state.favorites.map((id) => {
            const u = getUser(state, id);
            const n = state.bookings.filter((b) => b.passengerId === 'me' && b.status === 'completed' && rideById(state, b.rideId)?.driverId === id).length;
            return (
              <div key={id} className="card hstack">
                <button onClick={() => nav.go('driver', { userId: id })}><Avatar user={u} size={48} /></button>
                <div className="grow"><b>{u.name}</b><small style={{ display: 'block' }}>{n} ride{n !== 1 ? 's' : ''} together</small></div>
                <button className="btn outline sm" onClick={() => toggleFavorite(id)}>Remove</button>
              </div>
            );
          })}
        </div>
      ) : <div className="card"><Empty icon="heart" title="No favourites yet" text="After a ride, tap the heart to add a Ride Giver or Ride Taker you liked travelling with." /></div>}
      <div className="note" style={{ marginTop: 14 }}><Icon name="bell" size={18} /> You'll be notified when a favourite posts a ride on your routes.</div>
    </>
  );
}

function Alerts() {
  const { state, removeAlert, setHoliday } = useStore();
  return (
    <>
      <Header title="Ride alerts" />
      <div className="card hstack" style={{ marginBottom: 12 }}>
        <div className="grow"><b>Pause all alerts</b><small style={{ display: 'block' }}>Useful during holidays or leave</small></div>
        <Toggle checked={state.holidayMode} onChange={setHoliday} label="Pause alerts" />
      </div>
      {state.alerts.length ? (
        <div className="card menu">{state.alerts.map((a) => <Row key={a.id} icon="bell" title={a.direction === 'home' ? `Rides home to ${a.origin === 'isnapur' ? 'Isnapur' : 'Sangareddy'}` : `Rides from ${a.origin === 'isnapur' ? 'Isnapur' : 'Sangareddy'} to office`} sub={`${a.via === 'shankarpally' ? 'Via Shankarpally' : a.via === 'orr' ? 'Via ORR' : 'Any route'} · since ${fmtDay(a.at)}`} right={<button className="icon-btn" onClick={() => removeAlert(a.id)} aria-label="Delete alert"><Icon name="trash" size={18} /></button>} />)}</div>
      ) : <div className="card"><Empty icon="bell" title="No ride alerts" text="In Find Ride, tap “Notify me” to get an alert when a Ride Giver posts a ride from Sangareddy or Isnapur." /></div>}
    </>
  );
}

function Emergency() {
  const { state, addEmergency, removeEmergency } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rel, setRel] = useState('Family');
  return (
    <>
      <Header title="Emergency contacts" sub="Alerted when you press SOS" />
      {state.emergency.length > 0 && (
        <div className="card menu" style={{ marginBottom: 12 }}>
          {state.emergency.map((c) => <Row key={c.id} icon="user" title={c.name} sub={`${c.rel} · +91 ${c.phone}`} right={<button className="icon-btn" onClick={() => removeEmergency(c.id)} aria-label="Remove"><Icon name="trash" size={18} /></button>} />)}
        </div>
      )}
      {state.emergency.length < 5 && (
        <div className="card">
          <b>Add a trusted contact</b>
          <div className="field"><input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><div className="phone-input" style={{ height: 50 }}><span>+91</span><input inputMode="numeric" placeholder="Mobile number" value={phone} maxLength={10} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} /></div></div>
          <div className="opts" style={{ padding: '12px 0 0' }}>{['Family', 'Friend', 'Colleague'].map((r) => <Chip key={r} on={rel === r} onClick={() => setRel(r)}>{r}</Chip>)}</div>
          <button className="btn block" style={{ marginTop: 14 }} disabled={name.length < 2 || phone.length !== 10} onClick={() => { addEmergency({ name, phone, rel }); setName(''); setPhone(''); }}>Add contact</button>
        </div>
      )}
    </>
  );
}

function Privacy() {
  const { state, setPref, unblock } = useStore();
  return (
    <>
      <Header title="Privacy & location" />
      <div className="card stack">
        <div className="hstack"><div className="grow"><b>Share live location during rides</b><small style={{ display: 'block' }}>Only with confirmed co-riders, only while a ride is active</small></div><Toggle checked={state.prefs.shareLocation} onChange={(v) => setPref('shareLocation', v)} label="Share location" /></div>
        <div className="divider" style={{ margin: 0 }} />
        <div className="hstack"><div className="grow"><b>Let co-riders call me</b><small style={{ display: 'block' }}>Your number is shared only with people on your confirmed ride, when they tap Call. Off = chat only.</small></div><Toggle checked={state.prefs.allowCalls !== false} onChange={(v) => setPref('allowCalls', v)} label="Let co-riders call me" /></div>
      </div>
      <div className="list-label">Blocked members</div>
      {state.blocked.length ? (
        <div className="card menu">{state.blocked.map((id) => { const u = getUser(state, id); return <Row key={id} icon="ban" title={u.name} right={<button className="btn outline sm" onClick={() => unblock(id)}>Unblock</button>} />; })}</div>
      ) : <div className="card"><p className="muted">You haven't blocked anyone.</p></div>}
    </>
  );
}

function Guidelines() {
  const items = [
    ['🤝', 'Be respectful', 'Treat every co-rider with courtesy. Harassment or discrimination leads to removal.'],
    ['⏰', 'Be on time', 'Reach the pickup point a few minutes early. Cancel early if plans change.'],
    ['🛡️', 'Stay safe', 'Check the number plate before boarding. Share your trip and use SOS if you ever feel unsafe.'],
    ['💸', 'Share costs, not profit', 'Contributions cover fuel and tolls only. Commercial ride-hailing is not allowed.'],
    ['🚭', 'Respect preferences', 'Follow the ride preferences — smoking, music, luggage and pets.'],
    ['⚖️', 'Fair reviews', 'Reports are reviewed by our team. Both sides are heard before any action.'],
  ];
  return (
    <>
      <Header title="Community guidelines" />
      <div className="stack">{items.map(([e, t, d]) => <div key={t} className="card hstack" style={{ alignItems: 'flex-start' }}><span style={{ fontSize: 26 }}>{e}</span><div><b>{t}</b><p className="muted" style={{ fontSize: 14, marginTop: 2 }}>{d}</p></div></div>)}</div>
    </>
  );
}

function Payments() {
  const { state, report } = useStore();
  const [issue, setIssue] = useState(false);
  const pending = state.bookings.filter((b) => b.passengerId === 'me' && b.status === 'completed' && !b.paid);
  return (
    <>
      <Header title="Payments & receipts" />
      {pending.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>Pending</b>
          {pending.map((b) => { const r = rideById(state, b.rideId); return <div key={b.id} className="kv"><span>{r.stops[b.pickupIdx].name} → {r.stops[b.dropIdx].name} · {fmtDay(r.time)}</span><b>{rupee(b.amount)}</b></div>; })}
        </div>
      )}
      <div className="list-label">History</div>
      {state.payments.length ? (
        <div className="card menu">
          {state.payments.map((p) => (
            <div key={p.id} className="row">
              <span className={'row-ic ' + (p.amount < 0 ? 'amber' : 'green')}><Icon name={p.amount < 0 ? 'repeat' : 'check'} size={18} /></span>
              <span className="row-txt"><b>{p.amount < 0 ? 'Refund' : 'Ride contribution'}</b><small>{p.method} · {p.ref} · {fmtDay(p.at)}</small></span>
              <b style={{ color: p.amount < 0 ? '#a35f00' : 'var(--ink)' }}>{p.amount < 0 ? '+' : ''}{rupee(Math.abs(p.amount))}</b>
            </div>
          ))}
        </div>
      ) : <div className="card"><p className="muted">No payments yet.</p></div>}
      <button className="btn outline block" style={{ marginTop: 14 }} onClick={() => setIssue(true)}><Icon name="flag" /> Report a payment issue</button>
      <div className="note" style={{ marginTop: 12 }}><Icon name="info" size={18} /> SRDPool only facilitates cost sharing between co-riders. UPI payments are processed by your bank app.</div>
      <Sheet open={issue} onClose={() => setIssue(false)} title="Payment issue">
        <textarea className="input" placeholder="Describe the issue — which ride, amount, UPI reference…" id="pi" />
        <button className="btn block" style={{ marginTop: 12 }} onClick={() => { report({ targetId: 'me', type: 'Payment issue', details: document.getElementById('pi').value }); setIssue(false); }}>Submit</button>
      </Sheet>
    </>
  );
}

function Notifs() {
  const { state, setPref } = useStore();
  const items = [['bookings', 'Bookings & ride updates', 'Requests, confirmations, cancellations, live trip'], ['chat', 'Messages', 'New chat messages'], ['matches', 'Ride alerts', 'New rides from Sangareddy / Isnapur'], ['favorites', 'Favourite members', 'When favourites post rides'], ['reminders', 'Ride reminders', '30 minutes before departure']];
  return (
    <>
      <Header title="Notification settings" />
      <div className="card stack">
        {items.map(([k, t, d], i) => (
          <div key={k}>
            {i > 0 && <div className="divider" style={{ margin: '0 0 12px' }} />}
            <div className="hstack"><div className="grow"><b>{t}</b><small style={{ display: 'block' }}>{d}</small></div><Toggle checked={state.prefs.notif[k]} onChange={(v) => setPref('notif.' + k, v)} label={t} /></div>
          </div>
        ))}
      </div>
    </>
  );
}

function Language() {
  const { state, setLang } = useStore();
  return (
    <>
      <Header title="Language" />
      <div className="check-list">
        {LANGS.map((l) => (
          <button key={l.id} className={'check-item' + (state.lang === l.id ? ' on' : '')} onClick={() => setLang(l.id)}>
            <span className="box">{state.lang === l.id && <Icon name="check" size={14} stroke={3} />}</span>{l.label}
          </button>
        ))}
      </div>
      <small style={{ display: 'block', marginTop: 12 }}>Main menus and buttons are translated in this demo. More languages coming soon.</small>
    </>
  );
}

function Help() {
  const { logout } = useStore();
  const faqs = [
    ['How do I book a ride?', 'Search your route, open a ride, and tap “Request to book”. The Ride Giver accepts and you get a notification.'],
    ['How is the fare decided?', 'Fares are fixed: ₹150 from Sangareddy and ₹120 from Isnapur, per seat. It is cost sharing between colleagues — no profit and no platform fee.'],
    ['What if the Ride Giver cancels?', 'You get a full refund and we suggest other rides on your route.'],
    ['Is my phone number shared?', 'Only with the Ride Giver or Ride Takers on your confirmed ride, when they tap Call. You can turn calls off in Profile → Privacy & location and use chat instead.'],
    ['Who can join SRDPool?', 'Only working IT professionals. Everyone verifies their company, designation and ID card before riding.'],
    ['How do I offer rides?', 'Switch to Ride Giver, add your vehicle in Profile → Your vehicle, then use Post Ride. Your company verification is all that is needed.'],
  ];
  return (
    <>
      <Header title="Help & support" />
      <div className="stack">
        {faqs.map(([q, a]) => <details key={q} className="card"><summary style={{ fontWeight: 700, cursor: 'pointer' }}>{q}</summary><p className="muted" style={{ marginTop: 8, fontSize: 14 }}>{a}</p></details>)}
      </div>
      <div className="btn-row" style={{ marginTop: 16 }}>
        <a className="btn outline" href="mailto:support@srdpool.example"><Icon name="chat" /> Contact us</a>
        <button className="btn danger-ghost" onClick={logout}>Log out</button>
      </div>
    </>
  );
}
