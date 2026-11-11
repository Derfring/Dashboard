import * as db from '../store.js';
import { esc, iso, fmtDate, num, units, pace, duration } from '../util.js';
import { weekStats } from '../logic.js';

const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at);

function runs() {
  const s = weekStats();
  const rows = db.all('runs').sort(byDateDesc).slice(0, 12).map((r) => `<tr>
      <td>${esc(fmtDate(r.date))}</td>
      <td>${num(units.distOut(r.distance_km), 2)} ${units.dist()}</td>
      <td>${r.duration_min ? esc(duration(r.duration_min)) : ''}</td>
      <td>${esc(pace(r.distance_km, r.duration_min))}
        <button class="icon-btn" data-action="delRun" data-id="${r.id}" aria-label="Delete run" title="Delete">×</button></td>
    </tr>`).join('');
  return `<section class="card">
    <h2>Runs <span>${num(units.distOut(s.runKm))} ${units.dist()} this week</span></h2>
    ${rows ? `<table class="table"><thead><tr><th>Date</th><th>Distance</th><th>Time</th><th>Pace</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">No runs logged yet. Once Strava is connected, your Garmin runs will appear here automatically.</p>'}
    <form class="inline" data-submit="addRun">
      <input type="date" name="date" value="${iso()}" max="${iso()}" required aria-label="Date">
      <input class="narrow" type="number" name="distance" step="0.01" min="0.01" inputmode="decimal" placeholder="${units.dist()}" required aria-label="Distance in ${units.dist()}">
      <input class="narrow" type="number" name="minutes" step="0.1" min="0" inputmode="decimal" placeholder="minutes" aria-label="Duration in minutes">
      <button class="btn">Log run</button>
    </form>
  </section>`;
}

function gym() {
  const sets = db.all('workout_sets');
  const names = [...new Set(sets.map((s) => s.exercise))].sort();
  const cards = db.all('workouts').sort(byDateDesc).slice(0, 6).map((w) => {
    const mine = sets.filter((s) => s.workout_id === w.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const grouped = new Map();
    for (const s of mine) grouped.set(s.exercise, [...(grouped.get(s.exercise) || []), s]);
    const lines = [...grouped].map(([name, list]) => `<p class="sets"><b>${esc(name)}</b> ${list.map((s) =>
      `${s.weight_kg ? `${num(units.weightOut(s.weight_kg))}${units.weight()} × ` : ''}${s.reps}`).join(', ')}</p>`).join('');
    const last = mine[mine.length - 1];
    return `<div class="workout">
      <div class="head">
        <h3 class="grow">${esc(w.title)}</h3>
        <span class="muted small">${esc(fmtDate(w.date))}</span>
        <button class="icon-btn" data-action="delWorkout" data-id="${w.id}" aria-label="Delete session" title="Delete">×</button>
      </div>
      ${lines || '<p class="sets">No sets yet.</p>'}
      <form class="inline" data-submit="addSet" data-id="${w.id}">
        <input class="grow" name="exercise" list="exercise-names" placeholder="Exercise" value="${esc(last?.exercise || '')}" autocomplete="off" required aria-label="Exercise">
        <input class="narrow" type="number" name="weight" step="0.5" min="0" inputmode="decimal" placeholder="${units.weight()}" value="${last?.weight_kg ? +units.weightOut(last.weight_kg).toFixed(1) : ''}" aria-label="Weight in ${units.weight()}">
        <input class="narrow" type="number" name="reps" min="1" inputmode="numeric" placeholder="reps" required aria-label="Reps">
        <button class="btn ghost">Add set</button>
      </form>
    </div>`;
  }).join('');
  return `<section class="card">
    <h2>Gym</h2>
    <datalist id="exercise-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    <form class="inline" data-submit="addWorkout" style="margin-top:0">
      <input type="date" name="date" value="${iso()}" max="${iso()}" required aria-label="Date">
      <input class="grow" name="title" placeholder="Session name, e.g. Push day" autocomplete="off" aria-label="Session name">
      <button class="btn">New session</button>
    </form>
    ${cards}
  </section>`;
}

function sparkline(values) {
  if (values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(28 - ((v - lo) / span) * 26).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Weight trend">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function body() {
  const all = db.all('body_metrics').sort((a, b) => a.date.localeCompare(b.date));
  const weights = all.filter((m) => m.weight_kg).slice(-30).map((m) => units.weightOut(m.weight_kg));
  const rows = all.slice(-7).reverse().map((m) => `<tr>
      <td>${esc(fmtDate(m.date))}</td>
      <td>${m.steps != null ? num(m.steps, 0) : ''}</td>
      <td>${m.weight_kg ? `${num(units.weightOut(m.weight_kg))} ${units.weight()}` : ''}</td>
    </tr>`).join('');
  return `<section class="card">
    <h2>Steps and weight</h2>
    <form class="inline" data-submit="saveBody" style="margin-top:0">
      <input type="date" name="date" value="${iso()}" max="${iso()}" required aria-label="Date">
      <input class="narrow" type="number" name="steps" min="0" inputmode="numeric" placeholder="steps" aria-label="Steps">
      <input class="narrow" type="number" name="weight" step="0.1" min="0" inputmode="decimal" placeholder="${units.weight()}" aria-label="Weight in ${units.weight()}">
      <button class="btn">Save</button>
    </form>
    ${sparkline(weights)}
    ${rows ? `<table class="table" style="margin-top:8px"><thead><tr><th>Date</th><th>Steps</th><th>Weight</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty" style="margin-top:10px">Enter today\'s steps or weight to start a trend.</p>'}
  </section>`;
}

export default {
  render() {
    return `<h1 class="page-title">Exercise</h1><div class="grid">${runs()}${body()}<div class="wide">${gym()}</div></div>`;
  },
  actions: {
    addRun(form) {
      const d = Number(form.distance.value);
      if (!(d > 0)) return;
      db.add('runs', {
        date: form.date.value, distance_km: units.distIn(d),
        duration_min: Number(form.minutes.value) || null, source: 'manual',
      });
    },
    delRun(el) { db.remove('runs', el.dataset.id); },
    addWorkout(form) {
      db.add('workouts', { date: form.date.value, title: form.elements.title.value.trim() || 'Gym session', type: 'gym' });
    },
    delWorkout(el) {
      if (!confirm('Delete this session and its sets?')) return;
      const id = el.dataset.id;
      db.all('workout_sets').filter((s) => s.workout_id === id).forEach((s) => db.remove('workout_sets', s.id));
      db.remove('workouts', id);
    },
    addSet(form) {
      const exercise = form.exercise.value.trim();
      const reps = Number(form.reps.value);
      if (!exercise || !(reps > 0)) return;
      const w = Number(form.weight.value);
      db.add('workout_sets', {
        workout_id: form.dataset.id, exercise, reps,
        weight_kg: w > 0 ? units.weightIn(w) : null,
      });
      return `form[data-submit="addSet"][data-id="${form.dataset.id}"] input[name="reps"]`;
    },
    saveBody(form) {
      const patch = {};
      if (form.steps.value !== '') patch.steps = Math.round(Number(form.steps.value));
      if (Number(form.weight.value) > 0) patch.weight_kg = units.weightIn(Number(form.weight.value));
      if (!Object.keys(patch).length) return;
      const existing = db.all('body_metrics').find((m) => m.date === form.date.value);
      if (existing) db.update('body_metrics', existing.id, patch);
      else db.add('body_metrics', { date: form.date.value, ...patch });
    },
  },
};
