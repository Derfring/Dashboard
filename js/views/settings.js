import * as db from '../store.js';
import { iso, esc } from '../util.js';
import { configured, user, status, sync, signIn, signUp, signOut } from '../sync.js';
import { locate } from '../weather.js';

let message = ''; // feedback under the sign-in form

function syncCard() {
  if (!configured) {
    return `<section class="card"><h2>Sync</h2>
      <p class="empty">Not set up yet. Everything is saved on this device only.</p></section>`;
  }
  const u = user();
  if (!u) {
    return `<section class="card"><h2>Sync <span>signed out</span></h2>
      <p class="muted small">Sign in on each device to keep them in step. Until then, data stays on this device.</p>
      <form class="inline" data-submit="signIn">
        <input class="grow" type="email" name="email" placeholder="Email" autocomplete="username" required aria-label="Email">
        <input class="grow" type="password" name="password" placeholder="Password" autocomplete="current-password" minlength="8" required aria-label="Password">
        <button class="btn">Sign in</button>
        <button class="btn ghost" type="button" data-action="signUp">Create account</button>
      </form>
      <p class="small" id="sync-msg" role="status" style="margin-top:10px">${esc(message)}</p>
    </section>`;
  }
  const state = status.state === 'syncing' ? 'Syncing…'
    : status.state === 'offline' ? 'Offline. Changes will upload when you reconnect'
    : status.state === 'error' ? `Sync problem: ${status.error}`
    : status.lastSynced ? `Synced at ${new Date(status.lastSynced).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : 'Waiting for first sync';
  return `<section class="card"><h2>Sync <span>on</span></h2>
    <div class="setting"><span>${esc(u.email)}<br><span class="muted small">${esc(state)}</span></span>
      <button class="btn ghost small" data-action="syncNow">Sync now</button></div>
    <div class="setting"><span>This device</span><button class="btn ghost small" data-action="signOut">Sign out</button></div>
  </section>`;
}

async function account(form, fn) {
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const say = (text) => { message = text; const el = document.getElementById('sync-msg'); if (el) el.textContent = text; };
  if (!form.reportValidity()) return;
  say('Working…');
  try {
    const result = await fn(email, password);
    message = '';
    if (result === 'confirm') say('Check your email for a confirmation link, then come back and sign in.');
  } catch (e) {
    say(e.message);
  }
}

const option = (value, label, selected) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;

export default {
  render() {
    const dist = db.settings.get('distUnit', 'km');
    const weight = db.settings.get('weightUnit', 'kg');
    const hasLoc = !!db.settings.get('weatherLoc');
    return `<h1 class="page-title">Settings</h1>
    <div class="grid">
      <section class="card">
        <h2>Preferences</h2>
        <div class="setting"><span>Distance</span>
          <select data-change="setUnit" data-key="distUnit" aria-label="Distance unit">${option('km', 'Kilometres', dist)}${option('mi', 'Miles', dist)}</select></div>
        <div class="setting"><span>Weight</span>
          <select data-change="setUnit" data-key="weightUnit" aria-label="Weight unit">${option('kg', 'Kilograms', weight)}${option('lb', 'Pounds', weight)}</select></div>
        <div class="setting"><span>Weather<br><span class="muted small">${hasLoc ? 'Using this device\'s location' : 'Off'}</span></span>
          ${hasLoc ? '<button class="btn ghost small" data-action="weatherOff">Turn off</button>'
            : '<button class="btn ghost small" data-action="weatherOn">Use my location</button>'}</div>
      </section>
      ${syncCard()}
      <section class="card">
        <h2>Backup</h2>
        <div class="setting"><span>Back up to a file</span><button class="btn ghost small" data-action="exportData">Export</button></div>
        <div class="setting"><span>Restore from a file</span>
          <label class="btn ghost small" style="display:inline-flex;align-items:center">Import
            <input type="file" accept="application/json,.json" data-change="importData" hidden></label></div>
      </section>
    </div>`;
  },
  actions: {
    signIn(form) { account(form, signIn); },
    signUp(el) { account(el.closest('form'), signUp); },
    syncNow() { sync(); },
    signOut() { if (confirm('Sign out on this device? Your data stays here but stops syncing.')) signOut(); },
    setUnit(el) { db.settings.set(el.dataset.key, el.value); },
    weatherOff() { db.settings.set('weatherLoc', null); },
    async weatherOn(el) {
      el.disabled = true;
      el.textContent = 'Locating…';
      try { await locate(); }
      catch { el.disabled = false; el.textContent = 'Blocked. Try again'; }
    },
    exportData() {
      const url = URL.createObjectURL(new Blob([db.exportData()], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `dashboard-backup-${iso()}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async importData(el) {
      const file = el.files[0];
      if (!file) return;
      if (!confirm('Replace everything on this device with the contents of this file?')) { el.value = ''; return; }
      try { db.importData(await file.text()); }
      catch (e) { alert(`Could not import: ${e.message}`); }
    },
  },
};
