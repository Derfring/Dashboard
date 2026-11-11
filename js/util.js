import { settings } from './store.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Dates are handled as local 'YYYY-MM-DD' strings.
export function iso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function weekStart(s = iso()) {
  return addDays(s, -((parse(s).getDay() + 6) % 7)); // Monday
}
export function daysBetween(a, b) {
  const utc = (s) => { const d = parse(s); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  return Math.round((utc(b) - utc(a)) / 864e5);
}
export function dayNumber(d = new Date()) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
}
export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return parse(s).toLocaleDateString(undefined, opts);
}
export function num(n, dp = 1) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
}
export function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

// Stored values are always km and kg; these convert for display and input.
export const units = {
  dist: () => settings.get('distUnit', 'km'),
  weight: () => settings.get('weightUnit', 'kg'),
  distOut: (km) => (units.dist() === 'mi' ? km * 0.621371 : km),
  distIn: (v) => (units.dist() === 'mi' ? v / 0.621371 : v),
  weightOut: (kg) => (units.weight() === 'lb' ? kg * 2.20462 : kg),
  weightIn: (v) => (units.weight() === 'lb' ? v / 2.20462 : v),
};

export function pace(distanceKm, minutes) {
  const d = units.distOut(distanceKm);
  if (!d || !minutes) return '';
  let secs = Math.round((minutes / d) * 60);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} /${units.dist()}`;
}
export function duration(minutes) {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
}
