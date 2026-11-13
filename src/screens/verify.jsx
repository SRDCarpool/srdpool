import { useRef, useState } from 'react';
import { useStore } from '../store';
import { Header, Icon, Segmented, useNav } from '../ui';
import { resizePhoto } from './auth';

export const isVerifiedOrPending = (state) => ['pending', 'verified'].includes(state.me?.work?.status);

/** Work & ID verification for Ride Givers and Ride Takers. */
export function WorkVerify() {
  const { state, submitWork } = useStore();
  const nav = useNav();
  const w = state.me.work || { status: 'none' };
  const [f, setF] = useState({
    name: state.me.name || '', company: w.company || '', workplace: w.workplace || '', designation: w.designation || '',
    roles: w.roles || (state.me.role === 'giver' ? 'giver' : 'taker'),
  });
  const [idImage, setIdImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim().length >= 2 && f.company.trim().length >= 2 && f.workplace.trim().length >= 2 && f.designation.trim().length >= 2 && idImage;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return setErr('Please choose a photo of your ID card');
    setErr('');
    setIdImage(await resizePhoto(file, 1400));
  };
  const submit = async () => {
    setBusy(true);
    setErr('');
    const r = await submitWork({ ...f, idImage });
    setBusy(false);
    if (r.ok) nav.back();
    else setErr(r.error);
  };

  if (w.status === 'pending' || w.status === 'verified') {
    return (
      <>
        <Header title="Your verification" />
        <div className={'note ' + (w.status === 'verified' ? 'green' : 'warn')}>
          <Icon name={w.status === 'verified' ? 'shield' : 'clock'} size={18} />
          <span>{w.status === 'verified' ? <><b>You are verified.</b> Your ID card photo has been deleted.</> : <><b>Under review.</b> Your ID card photo will be deleted as soon as it is checked.</>}</span>
        </div>
        <div className="card" style={{ marginTop: 12 }}>
          <div className="kv"><span>Name</span><b>{state.me.name}</b></div>
          <div className="kv"><span>Company</span><b>{w.company}</b></div>
          <div className="kv"><span>Place of work</span><b>{w.workplace}</b></div>
          <div className="kv"><span>Designation</span><b>{w.designation}</b></div>
          <div className="kv"><span>Joining as</span><b>{{ taker: 'Ride Taker', giver: 'Ride Giver', both: 'Ride Giver & Taker' }[w.roles]}</b></div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Verify yourself" sub="Required before booking or offering rides" />
      {w.status === 'rejected' && <div className="note danger" style={{ marginBottom: 12 }}><Icon name="alert" size={18} /><span>Your last submission wasn't approved. Please check your details and upload a clearer ID card photo.</span></div>}
      <div className="note" style={{ marginBottom: 4 }}><Icon name="shield" size={18} /><span>Saathi is only for IT professionals. Verifying your company keeps rides safe for everyone.</span></div>

      <div className="field"><label className="label" htmlFor="v-name">Name</label><input id="v-name" className="input" value={f.name} onChange={set('name')} placeholder="As on your ID card" maxLength={60} /></div>
      <div className="field"><label className="label" htmlFor="v-company">Company name</label><input id="v-company" className="input" value={f.company} onChange={set('company')} placeholder="e.g. Wipro" maxLength={60} /></div>
      <div className="field"><label className="label" htmlFor="v-place">Place of work</label><input id="v-place" className="input" value={f.workplace} onChange={set('workplace')} placeholder="e.g. Financial District, Gachibowli" maxLength={60} /></div>
      <div className="field"><label className="label" htmlFor="v-desig">Designation</label><input id="v-desig" className="input" value={f.designation} onChange={set('designation')} placeholder="e.g. Software Engineer" maxLength={60} /></div>
      <div className="field">
        <span className="label">I will be a</span>
        <Segmented value={f.roles} onChange={(roles) => setF({ ...f, roles })} options={[['taker', 'Ride Taker'], ['giver', 'Ride Giver'], ['both', 'Both']]} />
      </div>

      <div className="field">
        <span className="label">ID card picture</span>
        <button className={'check-item' + (idImage ? ' on' : '')} onClick={() => fileRef.current.click()} type="button">
          {idImage
            ? <img src={idImage} alt="ID card preview" style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 8 }} />
            : <span className="row-ic"><Icon name="camera" size={18} /></span>}
          <span className="grow">{idImage ? 'ID card added' : 'Take or upload a photo'}<small style={{ display: 'block', fontWeight: 500 }}>{idImage ? 'Tap to change' : 'Company ID card, front side'}</small></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <div className="note green" style={{ marginTop: 10 }}><Icon name="lock" size={18} /><span>Your ID card picture is only seen by our verification team and is <b>deleted right after verification</b>.</span></div>
      </div>

      {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
      <button className="btn block" style={{ marginTop: 18 }} disabled={!ok || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit for verification'}</button>
    </>
  );
}

/** Small banner shown where verification is needed. */
export function VerifyPrompt({ compact }) {
  const { state } = useStore();
  const nav = useNav();
  const st = state.me?.work?.status || 'none';
  if (st === 'verified') return null;
  if (st === 'pending') {
    return <div className="note warn" style={{ marginTop: compact ? 0 : 16 }}><Icon name="clock" size={18} /><span>Your verification is under review. You can already book and post rides.</span></div>;
  }
  return (
    <button className="card" style={{ marginTop: compact ? 0 : 16, textAlign: 'left', boxShadow: 'inset 0 0 0 2px var(--accent), var(--shadow)' }} onClick={() => nav.go('page', { page: 'verify' })}>
      <div className="hstack">
        <span className="row-ic amber"><Icon name="shield" size={20} /></span>
        <div className="grow"><b>{st === 'rejected' ? 'Verification needs attention' : 'Verify yourself to start riding'}</b><small style={{ display: 'block' }}>Name, company, place of work, designation & ID card</small></div>
        <Icon name="right" className="muted" />
      </div>
    </button>
  );
}
