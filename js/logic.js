import * as db from './store.js';
import { iso, addDays, weekStart, daysBetween, clamp } from './util.js';

// ---- habits ----
export function doneSet(habitId) {
  return new Set(db.all('habit_logs').filter((l) => l.habit_id === habitId).map((l) => l.date));
}
export function streak(habitId) {
  const done = doneSet(habitId);
  let d = iso();
  if (!done.has(d)) d = addDays(d, -1); // today not ticked yet doesn't break the streak
  let n = 0;
  while (done.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
export function toggleHabit(habitId, date = iso()) {
  const log = db.all('habit_logs').find((l) => l.habit_id === habitId && l.date === date);
  if (log) db.remove('habit_logs', log.id);
  else db.add('habit_logs', { habit_id: habitId, date });
}

// ---- reading ----
export const readingNow = () => db.all('books').filter((b) => b.status === 'reading')
  .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

export function setPage(book, page) {
  const p = clamp(Math.round(page), 0, book.total_pages || 1e6);
  const today = iso();
  const log = db.all('reading_logs').find((l) => l.book_id === book.id && l.date === today);
  if (log) db.update('reading_logs', log.id, { page: p });
  else db.add('reading_logs', { book_id: book.id, date: today, page: p });
  db.update('books', book.id, { current_page: p });
}

// Pages per day over the last 14 days (or since the book was started), and
// the finish date that pace implies.
export function readingPace(book) {
  // Measured from a logged page, so a book added part-way through doesn't
  // count the pages already read as one day's reading.
  const today = iso();
  const windowStart = addDays(today, -14);
  const logs = db.all('reading_logs').filter((l) => l.book_id === book.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const base = logs.filter((l) => l.date <= windowStart).pop() || logs[0];
  const days = base ? daysBetween(base.date, today) : 0;
  const perDay = days > 0 ? Math.max(0, (book.current_page || 0) - base.page) / days : 0;
  const left = Math.max(0, (book.total_pages || 0) - (book.current_page || 0));
  const finish = perDay > 0 && left > 0 ? addDays(today, Math.ceil(left / perDay)) : null;
  return { perDay, left, finish };
}

// ---- exercise ----
export function weekStats() {
  const ws = weekStart();
  const today = iso();
  const runs = db.all('runs').filter((r) => r.date >= ws && r.date <= today);
  const gym = db.all('workouts').filter((w) => w.date >= ws && w.date <= today);
  const metrics = db.all('body_metrics').sort((a, b) => a.date.localeCompare(b.date));
  const todayMetrics = metrics.find((m) => m.date === today);
  const lastWeight = metrics.filter((m) => m.weight_kg).pop();
  return {
    runKm: runs.reduce((s, r) => s + (r.distance_km || 0), 0),
    runCount: runs.length,
    gymCount: gym.length,
    stepsToday: todayMetrics?.steps ?? null,
    weightKg: lastWeight?.weight_kg ?? null,
  };
}
