import { useState } from 'react';
import { useStore, useAsync } from '../store';
import { post, api } from '../api';
import { Header, Icon, Avatar, Segmented, Empty } from '../ui';
import { fmtDay, fmtTime, timeAgo, rupee } from '../geo';

export default function Admin() {
  const { toast, refresh } = useStore();
  const [tab, setTab] = useState('overview');
  const [tick, setTick] = useState(0);
  const { data: d, loading, error } = useAsync(() => api('/admin/overview'), [tick]);
  const act = async (path, body, msg) => {
    try { await post(path, body); if (msg) toast(msg); setTick((x) => x + 1); refresh(); } catch (e) { toast(e.message); }
  };

  if (!d) return <div className="screen no-tab"><Header title="Admin dashboard" />{loading ? <div className="center pad"><span className="spinner" style={{ display: 'inline-block' }} /></div> : <Empty icon="lock" title="Admins only" text={error?.message} />}</div>;
  const c = d.counts;
  const max = Math.max(1, ...d.week.map((w) => w.n));
  const openReports = d.reports.filter((r) => r.status === 'open').length;

  return (
    <div className="screen no-tab">
      <Header title="Admin dashboard" sub="Saathi operations" right={<button className="icon-btn" onClick={() => setTick((x) => x + 1)} aria-label="Refresh"><Icon name="repeat" size={19} /></button>} />
      <div className="hscroll" style={{ marginBottom: 12 }}>
        <Segmented value={tab} onChange={setTab} options={[['overview', 'Overview'], ['verify', `Verify (${d.queue.length + d.workQueue.length})`], ['reports', `Reports (${openReports})`], ['users', 'Users'], ['rides', 'Rides'], ['audit', 'Audit log']]} />
      </div>

      {tab === 'overview' && (
        <>
          <div className="stat-grid">
            <div className="stat"><b>{c.users}</b><small>members</small></div>
            <div className="stat"><b>{c.active}</b><small>active rides</small></div>
            <div className="stat"><b>{c.upcoming}</b><small>upcoming</small></div>
            <div className="stat"><b>{c.completed}</b><small>completed</small></div>
            <div className="stat"><b>{c.cancelled}</b><small>cancelled</small></div>
            <div className="stat"><b style={{ color: c.openReports ? 'var(--danger)' : undefined }}>{c.openReports}</b><small>open reports</small></div>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <b>Booking requests · last 7 days</b>
            <div className="bar-chart">
              {d.week.map((w, i) => <div key={i}><small style={{ fontWeight: 700, color: 'var(--ink)' }}>{w.n}</small><i style={{ height: `${(w.n / max) * 80}%`, opacity: i === 6 ? 1 : 0.55 }} /><small>{w.day}</small></div>)}
            </div>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <b>Ride health</b>
            <div className="kv"><span>Completion rate</span><b>{c.completed + c.cancelled ? Math.round((c.completed / (c.completed + c.cancelled)) * 100) : 0}%</b></div>
            <div className="kv"><span>Avg seats filled (upcoming)</span><b>{c.avgSeats}</b></div>
            <div className="kv"><span>Possible duplicate listings</span><b style={{ color: d.dups.length ? 'var(--danger)' : undefined }}>{d.dups.length}</b></div>
            <div className="kv"><span>Pending verifications</span><b>{c.pending}</b></div>
          </div>
          <div className="note" style={{ marginTop: 12 }}><Icon name="lock" size={18} /> Phone numbers and licence numbers are masked. Every admin action is written to the audit log.</div>
        </>
      )}

      {tab === 'verify' && d.workQueue.length > 0 && (
        <div className="stack" style={{ marginBottom: 12 }}>
          <b>Member verification</b>
          {d.workQueue.map((u) => (
            <div key={u.id} className="card">
              <div className="hstack"><Avatar user={u} size={44} /><div className="grow"><b>{u.name}</b><small style={{ display: 'block' }}>Submitted {u.work.submittedAt ? timeAgo(u.work.submittedAt) : 'earlier'}</small></div></div>
              <div className="divider" />
              <div className="kv"><span>Company</span><b>{u.work.company}</b></div>
              <div className="kv"><span>Place of work</span><b>{u.work.workplace}</b></div>
              <div className="kv"><span>Designation</span><b>{u.work.designation}</b></div>
              <div className="kv"><span>Joining as</span><b>{{ taker: 'Ride Taker', giver: 'Ride Giver', both: 'Giver & Taker' }[u.work.roles]}</b></div>
              {u.idImage ? <img src={u.idImage} alt={`ID card of ${u.name}`} style={{ width: '100%', borderRadius: 12, marginTop: 8, border: '1px solid var(--line)' }} /> : <p className="muted">No ID image</p>}
              <small style={{ display: 'block', marginTop: 6 }}><Icon name="lock" size={12} /> The ID card picture is deleted as soon as you approve or reject.</small>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn danger-ghost" onClick={() => act(`/admin/work/${u.id}`, { approve: false }, 'Rejected · ID card deleted')}>Reject</button>
                <button className="btn" onClick={() => act(`/admin/work/${u.id}`, { approve: true }, 'Verified · ID card deleted')}><Icon name="check" /> Approve</button>
              </div>
            </div>
          ))}
          {d.queue.length > 0 && <b style={{ marginTop: 8 }}>Ride Giver vehicle & licence</b>}
        </div>
      )}
      {tab === 'verify' && (d.queue.length ? (
        <div className="stack">
          {d.queue.map((u) => (
            <div key={u.id} className="card">
              <div className="hstack"><Avatar user={u} size={44} /><div className="grow"><b>{u.name}</b><small style={{ display: 'block' }}>Submitted {u.at ? timeAgo(u.at) : 'earlier'}</small></div></div>
              <div className="divider" />
              <div className="kv"><span>Vehicle</span><b>{u.vehicleFull?.color} {u.vehicleFull?.brand} {u.vehicleFull?.model}</b></div>
              <div className="kv"><span>Registration</span><b>{u.vehicleFull?.reg}</b></div>
              <div className="kv"><span>Licence no.</span><b>{u.licence || '—'}</b></div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn danger-ghost" onClick={() => act(`/admin/verify/${u.id}`, { approve: false }, 'Verification rejected')}>Reject</button>
                <button className="btn" onClick={() => act(`/admin/verify/${u.id}`, { approve: true }, 'Ride Giver verified ✅')}><Icon name="check" /> Approve</button>
              </div>
            </div>
          ))}
        </div>
      ) : !d.workQueue.length && <div className="card"><Empty icon="shield" title="No pending verifications" /></div>)}

      {tab === 'reports' && (
        <div className="stack">
          {d.reports.length ? d.reports.map((r) => (
            <div key={r.id} className="card">
              <div className="hstack" style={{ justifyContent: 'space-between' }}><span className="badge red">{r.type}</span><span className={'badge sm ' + (r.status === 'open' ? 'gold' : 'gray')}>{r.status}</span></div>
              <p style={{ marginTop: 8 }}><b>{r.byName}</b> reported <b>{r.targetName}</b></p>
              {r.details && <p className="muted" style={{ fontSize: 14 }}>“{r.details}”</p>}
              <small>{timeAgo(r.at)}</small>
              {r.status === 'open' && (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn outline sm" onClick={() => act(`/admin/reports/${r.id}`, { outcome: 'dismissed' })}>Dismiss</button>
                  <button className="btn ghost sm" onClick={() => act(`/admin/reports/${r.id}`, { outcome: 'warned' })}>Warn</button>
                  <button className="btn danger sm" onClick={async () => { await act(`/admin/reports/${r.id}`, { outcome: 'actioned' }); if (r.targetId !== 'me') act(`/admin/suspend/${r.targetId}`, {}, 'Account suspended'); }}>Suspend</button>
                </div>
              )}
            </div>
          )) : <div className="card"><Empty icon="flag" title="No reports" /></div>}
        </div>
      )}

      {tab === 'users' && (
        <div className="card" style={{ padding: 8 }}>
          <table className="tbl">
            <thead><tr><th>Member</th><th>Rides</th><th>Status</th><th /></tr></thead>
            <tbody>
              {d.users.map((u) => (
                <tr key={u.id}>
                  <td><div className="hstack" style={{ gap: 8 }}><Avatar user={u} size={30} /><span><b style={{ fontSize: 13.5 }}>{u.name}</b><small style={{ display: 'block' }}>{u.isDriver ? 'Ride Giver' : 'Ride Taker'}{u.verified ? ' · ✓' : ''} · {u.phone}</small></span></div></td>
                  <td>{u.completed || 0}</td>
                  <td>{u.suspended ? <span className="badge sm red">Suspended</span> : <span className="badge sm green">Active</span>}</td>
                  <td>{u.id !== 'me' && <button className="link" onClick={() => act(`/admin/suspend/${u.id}`, {}, u.suspended ? 'Account restored' : 'Account suspended')}>{u.suspended ? 'Restore' : 'Suspend'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rides' && (
        <div className="card" style={{ padding: 8 }}>
          <table className="tbl">
            <thead><tr><th>Route</th><th>When</th><th>Status</th><th /></tr></thead>
            <tbody>
              {d.rides.map((r) => (
                <tr key={r.id}>
                  <td><b style={{ fontSize: 13 }}>{r.from} → {r.to}</b><small style={{ display: 'block' }}>{r.driver} · {rupee(r.price)}</small>{d.dups.includes(r.id) && <span className="badge sm red">Duplicate?</span>}</td>
                  <td><small>{fmtDay(r.time)}<br />{fmtTime(r.time)}</small></td>
                  <td><span className={'badge sm ' + ({ scheduled: 'gold', started: 'blue', completed: 'green', cancelled: 'red' }[r.status] || 'gray')}>{r.status}</span></td>
                  <td>{r.status === 'scheduled' && <button className="link" style={{ color: 'var(--danger)' }} onClick={() => act(`/admin/rides/${r.id}/remove`, {}, 'Listing removed')}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'audit' && (d.audit.length ? (
        <div className="card menu">
          {d.audit.map((a) => (
            <div key={a.id} className="row"><span className="row-ic"><Icon name="lock" size={17} /></span><span className="row-txt"><b>{a.action}</b><small>{a.target} · by {a.adminName} · {timeAgo(a.at)}</small></span></div>
          ))}
        </div>
      ) : <div className="card"><Empty icon="lock" title="No admin actions yet" text="Every approval, suspension and removal is recorded here." /></div>)}
    </div>
  );
}
