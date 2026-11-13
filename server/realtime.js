// WebSocket push: per-user channels. Clients refetch state on "sync" and patch
// live driver location on "live" without a full refetch.
import { WebSocketServer } from 'ws';

const sockets = new Map(); // userId -> Set<ws>
let handler = () => {};

export function attachRealtime(server, authenticate, onMessage) {
  handler = onMessage;
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const token = new URL(req.url, 'http://x').searchParams.get('token');
    const user = authenticate(token);
    if (!user) return ws.close(4001, 'unauthorised');
    ws.userId = user.id;
    if (!sockets.has(user.id)) sockets.set(user.id, new Set());
    sockets.get(user.id).add(ws);
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (raw) => {
      try { handler(ws.userId, JSON.parse(raw)); } catch { /* ignore bad frames */ }
    });
    ws.on('close', () => sockets.get(user.id)?.delete(ws));
  });
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000).unref();
}

export function send(userId, msg) {
  const set = sockets.get(userId);
  if (!set) return;
  const data = JSON.stringify(msg);
  set.forEach((ws) => ws.readyState === 1 && ws.send(data));
}

const pending = new Set();
let timer = null;
/** Tell users their state changed (coalesced). */
export function sync(...userIds) {
  userIds.flat().filter(Boolean).forEach((u) => pending.add(u));
  if (timer) return;
  timer = setTimeout(() => {
    pending.forEach((u) => send(u, { type: 'sync' }));
    pending.clear();
    timer = null;
  }, 60);
}

export const isOnline = (userId) => !!sockets.get(userId)?.size;
