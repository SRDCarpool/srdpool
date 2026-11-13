// SQLite storage using Node's built-in driver (no native deps).
// Each table keeps the full record as JSON in `doc` plus a few indexed columns
// used for queries. Swap for PostgreSQL/PostGIS in production (see README).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(process.env.DB_PATH || path.join(dir, 'saathi.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');

export const uid = (prefix = '') => prefix + crypto.randomBytes(6).toString('base64url');
export const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function table(name, cols = []) {
  const colDefs = cols.map((c) => `"${c}"`).join(', ');
  db.exec(`CREATE TABLE IF NOT EXISTS ${name} (id TEXT PRIMARY KEY${cols.length ? ', ' + colDefs : ''}, doc TEXT NOT NULL)`);
  cols.forEach((c) => db.exec(`CREATE INDEX IF NOT EXISTS ${name}_${c} ON ${name}("${c}")`));
  const vals = (o) => cols.map((c) => (o[c] === undefined || o[c] === null ? null : typeof o[c] === 'boolean' ? Number(o[c]) : o[c]));
  const ins = db.prepare(`INSERT INTO ${name} (id${cols.length ? ', ' + colDefs : ''}, doc) VALUES (?${', ?'.repeat(cols.length)}, ?)`);
  const upd = db.prepare(`UPDATE ${name} SET ${cols.map((c) => `"${c}" = ?`).concat('doc = ?').join(', ')} WHERE id = ?`);
  const one = db.prepare(`SELECT doc FROM ${name} WHERE id = ?`);
  const del = db.prepare(`DELETE FROM ${name} WHERE id = ?`);
  const parse = (r) => (r ? JSON.parse(r.doc) : null);
  return {
    get: (id) => parse(one.get(id)),
    where: (clause = '1=1', ...params) => db.prepare(`SELECT doc FROM ${name} WHERE ${clause}`).all(...params).map(parse),
    count: (clause = '1=1', ...params) => db.prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE ${clause}`).get(...params).n,
    insert: (o) => { ins.run(o.id, ...vals(o), JSON.stringify(o)); return o; },
    save: (o) => {
      const r = upd.run(...vals(o), JSON.stringify(o), o.id);
      if (!r.changes) ins.run(o.id, ...vals(o), JSON.stringify(o));
      return o;
    },
    remove: (id) => del.run(id),
  };
}

export const Users = table('users', ['phone', 'isBot']);
export const Sessions = table('sessions', ['userId']);
export const Otps = table('otps');
export const Rides = table('rides', ['driverId', 'status', 'time']);
export const Bookings = table('bookings', ['rideId', 'passengerId', 'status']);
export const Messages = table('messages', ['rideId', 'at']);
export const Notifications = table('notifications', ['userId', 'at']);
export const Ratings = table('ratings', ['toId', 'fromId']);
export const Reports = table('reports', ['byId', 'status', 'at']);
export const Payments = table('payments', ['userId']);
export const Alerts = table('alerts', ['userId']);
export const Audit = table('audit', ['at']);
export const GeoCache = table('geocache');
// ID card images live apart from user records and are deleted once reviewed.
export const IdCards = table('idcards', ['userId']);
export const HelpRequests = table('help_requests', ['rideId', 'status', 'at']);
