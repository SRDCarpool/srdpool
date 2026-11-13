// HTTP + WebSocket client for the Saathi API.
const TOKEN_KEY = 'saathi-token';
let token = (() => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } })();

export const getToken = () => token;
export function setToken(t) {
  token = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || (status === 0 ? "Can't reach Saathi. Check your internet connection." : 'Something went wrong'));
    this.status = status;
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const post = (path, body = {}) => api(path, { method: 'POST', body });

/** Auto-reconnecting realtime connection. */
export function connectSocket(onMessage, onStatus) {
  let ws, closed = false, retry = 0, timer;
  const open = () => {
    if (!token) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => { retry = 0; onStatus?.(true); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onclose = (e) => {
      onStatus?.(false);
      if (closed || e.code === 4001) return;
      timer = setTimeout(open, Math.min(15000, 1000 * 2 ** retry++));
    };
  };
  open();
  return {
    send: (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg)),
    close: () => { closed = true; clearTimeout(timer); ws?.close(); },
  };
}
