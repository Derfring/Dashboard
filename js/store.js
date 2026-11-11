// Local data layer. Every row has id / created_at / updated_at and deletes are
// tombstones (deleted: true). Rows changed on this device are remembered as
// "dirty" until the sync engine (sync.js) has uploaded them.

const KEY = 'pd.v1';
export const COLLECTIONS = [
  'todos', 'habits', 'habit_logs', 'workouts', 'workout_sets', 'runs',
  'body_metrics', 'books', 'reading_logs', 'goals', 'weekly_reviews',
  'exams', 'exam_attempts',
];

const listeners = new Set();
let state = load();

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* start fresh */ }
  for (const c of COLLECTIONS) if (!Array.isArray(s[c])) s[c] = [];
  if (!s.settings || typeof s.settings !== 'object') s.settings = {};
  if (!s._dirty || typeof s._dirty !== 'object') s._dirty = {};
  if (typeof s._cursor !== 'string') s._cursor = null;
  return s;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.error('Could not save data', e); }
}
// source is 'sync' when the change came from another device.
export function notify(source) { listeners.forEach((f) => f(source)); }
function commit() { save(); notify(); }
const now = () => new Date().toISOString();
const mark = (c, id) => { state._dirty[`${c}:${id}`] = 1; };

export const all = (c) => state[c].filter((r) => !r.deleted);
export const get = (c, id) => state[c].find((r) => r.id === id && !r.deleted);

export function add(c, row) {
  const r = { id: crypto.randomUUID(), created_at: now(), updated_at: now(), ...row };
  state[c].push(r);
  mark(c, r.id);
  commit();
  return r;
}
export function update(c, id, patch) {
  const r = get(c, id);
  if (!r) return;
  Object.assign(r, patch, { updated_at: now() });
  mark(c, id);
  commit();
  return r;
}
export function remove(c, id) {
  const r = get(c, id);
  if (!r) return;
  r.deleted = true;
  r.updated_at = now();
  mark(c, id);
  commit();
}
export const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };

// Settings (units, weather location) stay on each device and are not synced.
export const settings = {
  get: (k, fallback) => state.settings[k] ?? fallback,
  set(k, v) { state.settings[k] = v; commit(); },
};

export function exportData() {
  const { _dirty, _cursor, ...data } = state;
  return JSON.stringify({ exported_at: now(), ...data }, null, 2);
}
export function importData(json) {
  const s = JSON.parse(json);
  if (!s || !COLLECTIONS.some((c) => Array.isArray(s[c]))) throw new Error('Not a dashboard export file');
  const next = { settings: s.settings && typeof s.settings === 'object' ? s.settings : {}, _dirty: {}, _cursor: null };
  for (const c of COLLECTIONS) next[c] = Array.isArray(s[c]) ? s[c] : [];
  state = next;
  resetSync();
  notify();
}

// ---- used by the sync engine ----

// Rows waiting to be uploaded. `stamp` lets clearDirty tell whether a row was
// edited again while the upload was in flight.
export function dirtyRows() {
  const out = [];
  for (const key of Object.keys(state._dirty)) {
    const i = key.indexOf(':');
    const collection = key.slice(0, i);
    const row = state[collection]?.find((r) => r.id === key.slice(i + 1));
    if (row) out.push({ collection, row, stamp: row.updated_at });
    else delete state._dirty[key];
  }
  return out;
}
export function clearDirty(items) {
  for (const { collection, row, stamp } of items) {
    if (row.updated_at === stamp) delete state._dirty[`${collection}:${row.id}`];
  }
  save();
}
export const syncCursor = () => state._cursor;

// Applies rows from the server. The newer copy of each row wins.
export function mergeRemote(rows, cursor) {
  let changed = false;
  for (const { collection, data } of rows) {
    if (!COLLECTIONS.includes(collection) || !data?.id || !data.updated_at) continue;
    const list = state[collection];
    const i = list.findIndex((r) => r.id === data.id);
    if (i === -1) list.push(data);
    else if (data.updated_at > list[i].updated_at) list[i] = data;
    else continue;
    delete state._dirty[`${collection}:${data.id}`];
    changed = true;
  }
  if (cursor) state._cursor = cursor;
  save();
  if (changed) notify('sync');
}

// Start over: fetch everything from the server and upload everything local.
export function resetSync() {
  state._cursor = null;
  state._dirty = {};
  for (const c of COLLECTIONS) for (const r of state[c]) mark(c, r.id);
  save();
}

// Keep several open tabs of the app in step with each other.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) { state = load(); notify('sync'); }
});
