import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Icon, Avatar } from '../ui';
import { LANGS } from '../i18n';

const SLIDES = [
  { art: '🚗', title: 'Share rides with IT colleagues going your way', text: 'Sangareddy & Isnapur to Financial District / HITEC City — ride with verified IT professionals on your route.' },
  { art: '🛡️', title: 'Only verified IT professionals', text: 'Everyone verifies their company and ID. Live trip tracking, SOS and in-app chat — your phone number stays private.' },
  { art: '💸', title: 'Save money on your daily commute', text: 'Transparent cost sharing. Set your office or college route once and get matches every day.' },
];

export function Brand() {
  return <div className="brand"><span className="brand-mark"><Icon name="car" size={19} /></span>Saathi</div>;
}

export function Splash() {
  return <div className="splash"><div className="center"><Brand /><div className="spinner" style={{ margin: '18px auto 0' }} /></div></div>;
}

export function Onboarding() {
  const { state, finishOnboarding, setLang } = useStore();
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  return (
    <div className="onb">
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <Brand />
        <select className="select" style={{ width: 'auto', height: 38, borderRadius: 12 }} value={state.lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      <div className="onb-art"><div className="circle" key={i} style={{ animation: 'fadein .3s' }}>{s.art}</div></div>
      <h1>{s.title}</h1>
      <p>{s.text}</p>
      <div className="dots">{SLIDES.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
      <div className="btn-row">
        {i < SLIDES.length - 1 && <button className="btn outline" onClick={finishOnboarding}>Skip</button>}
        <button className="btn" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : finishOnboarding())}>
          {i < SLIDES.length - 1 ? 'Next' : 'Get started'} <Icon name="right" />
        </button>
      </div>
    </div>
  );
}

export function Login() {
  const { requestOtp, verifyOtp } = useStore();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState('phone');
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState(null);
  const [timer, setTimer] = useState(30);
  const otpRef = useRef(null);
  const valid = /^[6-9]\d{9}$/.test(phone);

  useEffect(() => {
    if (step !== 'otp' || timer <= 0) return;
    const t = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(t);
  }, [step, timer]);

  const send = async () => {
    if (!valid) return setErr('Enter a valid 10-digit Indian mobile number');
    setErr('');
    setBusy(true);
    try {
      const r = await requestOtp(phone);
      setDevCode(r.devCode || null);
      setStep('otp');
      setTimer(30);
      setOtp('');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const verify = async (code) => {
    setBusy(true);
    try { await verifyOtp(phone, code); } catch (e) {
      setErr(e.message);
      setOtp('');
      setBusy(false);
      setTimeout(() => otpRef.current?.focus(), 50);
    }
  };
  const onOtp = (v) => {
    const code = v.replace(/\D/g, '').slice(0, 6);
    setOtp(code);
    setErr('');
    if (code.length === 6) verify(code);
  };

  return (
    <div className="onb" style={{ justifyContent: 'flex-start' }}>
      {step === 'otp' && <button className="icon-btn" onClick={() => setStep('phone')} aria-label="Back"><Icon name="back" size={22} /></button>}
      {step === 'phone' && <Brand />}
      <div style={{ marginTop: 40 }}>
        {step === 'phone' ? (
          <>
            <h1>Enter your mobile number</h1>
            <p>We'll send a one-time code to verify it. Your number is never shown to other members.</p>
            <div className="phone-input" style={{ marginTop: 28 }}>
              <span>🇮🇳 +91</span>
              <input inputMode="numeric" autoFocus placeholder="98765 43210" value={phone} maxLength={10}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setErr(''); }}
                onKeyDown={(e) => e.key === 'Enter' && send()} aria-label="Mobile number" />
            </div>
            {err && <div className="err">{err}</div>}
            <button className="btn block" style={{ marginTop: 20 }} onClick={send} disabled={phone.length < 10 || busy}>{busy ? 'Sending…' : 'Send OTP'}</button>
            <p className="center" style={{ fontSize: 12.5, marginTop: 18 }}>By continuing you agree to our Terms & Community Guidelines.</p>
          </>
        ) : (
          <>
            <h1>Verify your number</h1>
            <p>Enter the 6-digit code sent to <b style={{ color: 'var(--ink)' }}>+91 {phone}</b></p>
            <div className="otp" style={{ marginTop: 28, position: 'relative', gap: 8 }} onClick={() => otpRef.current?.focus()}>
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <div key={k} className={'otp-box' + (k === Math.min(otp.length, 5) ? ' active' : '')} style={{ width: 46 }}>{otp[k] || ''}</div>
              ))}
              <input ref={otpRef} className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp}
                onChange={(e) => onOtp(e.target.value)} aria-label="6-digit verification code" disabled={busy} />
            </div>
            {err && <div className="err center">{err}</div>}
            {devCode && (
              <div className="note green" style={{ marginTop: 22 }}>
                <Icon name="info" size={18} />
                <span>Development mode — no SMS provider is configured. Your code is <b>{devCode}</b> (also printed in the server console).</span>
              </div>
            )}
            <p className="center" style={{ marginTop: 18, fontSize: 14 }}>
              {timer > 0 ? <>Resend code in <b>0:{String(timer).padStart(2, '0')}</b></> : <button className="link" onClick={send}>Resend code</button>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function Setup() {
  const { updateMe } = useStore();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [photo, setPhoto] = useState(null);
  const [role, setRole] = useState('taker');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const ok = name.trim().length >= 2 && Number(age) >= 18 && Number(age) < 100;
  const pick = (e) => {
    const f = e.target.files?.[0];
    if (f) resizePhoto(f).then(setPhoto);
  };
  return (
    <div className="onb" style={{ justifyContent: 'flex-start', paddingBottom: 28 }}>
      <h1 style={{ marginTop: 18 }}>Set up your profile</h1>
      <p>This helps members recognise and trust you.</p>
      <div className="profile-head" style={{ marginTop: 18 }}>
        <button className="photo-btn" onClick={() => fileRef.current.click()} aria-label="Add profile photo">
          <Avatar user={{ name: name || '?', photo, color: '#0B8A6B' }} size={92} />
          <span className="cam"><Icon name="camera" size={14} /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
        <small>Add a clear face photo</small>
      </div>
      <div className="field"><label className="label" htmlFor="nm">Full name</label><input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ananya Rao" /></div>
      <div className="field field-row">
        <div><label className="label" htmlFor="ag">Age</label><input id="ag" className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="18+" /></div>
        <div><label className="label" htmlFor="gd">Gender (optional)</label>
          <select id="gd" className="input select" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Other</option>
          </select>
        </div>
      </div>
      {age && Number(age) < 18 && <div className="err">You must be 18 or older to use Saathi.</div>}
      <div className="field">
        <span className="label">How will you mostly use Saathi?</span>
        <div className="stack">
          <button className={'role-card' + (role === 'taker' ? ' on' : '')} onClick={() => setRole('taker')}>
            <span className="emoji">🙋</span><span><b>Ride Taker</b><small>I need a seat in someone's car</small></span>
          </button>
          <button className={'role-card' + (role === 'giver' ? ' on' : '')} onClick={() => setRole('giver')}>
            <span className="emoji">🚗</span><span><b>Ride Giver</b><small>I drive and have empty seats to share</small></span>
          </button>
        </div>
        <small style={{ display: 'block', marginTop: 8 }}>You can switch anytime from your profile.</small>
      </div>
      <button className="btn block" style={{ marginTop: 24 }} disabled={!ok || saving}
        onClick={async () => { setSaving(true); await updateMe({ name: name.trim(), age: Number(age), gender, photo, role }); setSaving(false); }}>
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}

/** Downscale a photo to a small JPEG data URL before uploading. */
export function resizePhoto(file, size = 320) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(1, size / Math.max(img.width, img.height));
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}
