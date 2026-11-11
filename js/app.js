import * as db from './store.js';
import { loadQuotes } from './quotes.js';
import { startSync } from './sync.js';
import today from './views/today.js';
import exercise from './views/exercise.js';
import reading from './views/reading.js';
import habits from './views/habits.js';
import settings from './views/settings.js';
import cima from './views/cima.js';

const routes = { today, exercise, reading, habits, cima, settings };
const main = document.getElementById('main');

function current() {
  const key = location.hash.replace(/^#\/?/, '');
  return routes[key] ? key : 'today';
}

function render() {
  const key = current();
  main.innerHTML = routes[key].render();
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === key));
  routes[key].mount?.();
}

// Views declare handlers by name: data-action (click), data-submit (form),
// data-change (input). A handler may return a selector to focus afterwards.
function run(kind, el, event) {
  const handler = routes[current()].actions?.[el.dataset[kind]];
  if (!handler) return;
  const result = handler(el, event);
  if (typeof result === 'string') main.querySelector(result)?.focus();
}
main.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) run('action', el, e);
});
main.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-submit]');
  if (form) { e.preventDefault(); run('submit', form, e); }
});
main.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) run('change', el, e);
});

// Plays the entrance animation when arriving on a page, not on every update.
function enter() {
  main.classList.remove('enter');
  void main.offsetWidth;
  main.classList.add('enter');
  setTimeout(() => main.classList.remove('enter'), 1100);
}

// Updates arriving from sync must not wipe something you are typing, so they
// wait until you leave the field.
let waiting = false;
function renderWhenIdle() {
  const el = document.activeElement;
  if (!main.contains(el) || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return render();
  if (waiting) return;
  waiting = true;
  el.addEventListener('blur', () => { waiting = false; setTimeout(renderWhenIdle, 0); }, { once: true });
}

db.subscribe((source) => (source === 'sync' ? renderWhenIdle() : render()));
window.addEventListener('syncstatus', () => { if (current() === 'settings') renderWhenIdle(); });
window.addEventListener('hashchange', () => { render(); enter(); window.scrollTo(0, 0); });

// Coming back to the app on a new day should show the new day.
let renderedOn = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== renderedOn) {
    renderedOn = new Date().toDateString();
    render();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Offline support unavailable', e));
}

render();
enter();
startSync();
loadQuotes().then(render).catch((e) => console.warn('Quotes failed to load', e));
