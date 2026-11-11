// Sync between devices through Supabase, using its REST API directly so the
// app has no library to download and keeps working offline.
//
// Each sync: pull rows changed on the server since last time, merge them
// (newest edit of a row wins), then upload rows changed on this device.

import * as db from './store.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SESSION_KEY = 'pd.session';
const base = SUPABASE_URL.trim().replace(/\/+$/, '');
export const configured = !!(base && SUPABASE_KEY.trim());

let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* signed out */ }

export const status = { state: 'idle', lastSynced: null, error: null }; // idle | syncing | offline | error
export const user = () => session?.user || null;

function setSession(s) {
  session = s;
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
function sessionFrom(j) {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user: { id: j.user.id, email: j.user.email },
  };
}

async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      apikey: SUPABASE_KEY.trim(), 'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(json?.msg || json?.error_description || json?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

let refreshing = null;
async function accessToken() {
  if (!session) throw new Error('Not signed in');
  if (session.expires_at * 1000 - Date.now() > 60e3) return session.access_token;
  refreshing ||= request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
    .then((j) => setSession(sessionFrom(j)))
    .catch((e) => {
      // The sign-in is no longer valid (not just offline): sign out on this device.
      if (e.status === 400 || e.status === 401) { setSession(null); db.notify('sync'); }
      throw e;
    })
    .finally(() => { refreshing = null; });
  await refreshing;
  return session.access_token;
}

// ---- account ----
export async function signIn(email, password) {
  const j = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  setSession(sessionFrom(j));
  db.resetSync();
  db.notify('sync');
  sync();
}
// Returns 'signed-in', or 'confirm' when Supabase has emailed a confirmation link.
export async function signUp(email, password) {
  const j = await request('/auth/v1/signup', { method: 'POST', body: { email, password } });
  if (!j?.access_token) return 'confirm';
  setSession(sessionFrom(j));
  db.resetSync();
  db.notify('sync');
  sync();
  return 'signed-in';
}
export async function signOut() {
  try { await request('/auth/v1/logout', { method: 'POST', token: session?.access_token }); } catch { /* sign out locally anyway */ }
  setSession(null);
  status.state = 'idle';
  db.notify('sync');
}

// ---- sync ----
const PAGE = 1000;
let running = false;
let queued = false;

export async function sync() {
  if (!configured || !session) return;
  if (running) { queued = true; return; }
  running = true;
  status.state = 'syncing';
  try {
    const token = await accessToken();

    // Pull everything changed on the server since the last sync.
    const since = db.syncCursor();
    let newest = since;
    for (let offset = 0; ; offset += PAGE) {
      const rows = await request('/rest/v1/rows?select=collection,data,synced_at&order=synced_at.asc,id.asc'
        + `&limit=${PAGE}&offset=${offset}` + (since ? `&synced_at=gt.${encodeURIComponent(since)}` : ''), { token });
      if (rows.length) {
        newest = rows[rows.length - 1].synced_at;
        db.mergeRemote(rows, null);
      }
      if (rows.length < PAGE) break;
    }
    db.mergeRemote([], newest);

    // Upload what changed here.
    const dirty = db.dirtyRows();
    for (let i = 0; i < dirty.length; i += 500) {
      const chunk = dirty.slice(i, i + 500);
      await request('/rest/v1/rows?on_conflict=id', {
        method: 'POST', token,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: chunk.map(({ collection, row }) => ({ id: row.id, collection, data: row })),
      });
      db.clearDirty(chunk);
    }
    status.state = 'idle';
    status.error = null;
    status.lastSynced = Date.now();
  } catch (e) {
    status.state = navigator.onLine ? 'error' : 'offline';
    status.error = e.message;
  } finally {
    running = false;
    window.dispatchEvent(new Event('syncstatus'));
    if (queued) { queued = false; sync(); }
  }
}

export function startSync() {
  if (!configured) return;
  let timer = null;
  db.subscribe((source) => {
    if (source === 'sync') return;
    clearTimeout(timer);
    timer = setTimeout(sync, 1500); // batch quick successive edits
  });
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60e3);
  sync();
}
