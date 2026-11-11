import * as db from '../store.js';
import { esc, iso, addDays, fmtDate, num } from '../util.js';
import { doneSet, streak, toggleHabit } from '../logic.js';

function habits() {
  const today = iso();
  const days = [...Array(28)].map((_, i) => addDays(today, i - 27));
  const rows = db.all('habits').sort((a, b) => a.created_at.localeCompare(b.created_at)).map((h) => {
    const done = doneSet(h.id);
    const hits = days.filter((d) => done.has(d)).length;
    const s = streak(h.id);
    const cells = days.map((d) => `<button class="${done.has(d) ? 'on' : ''} ${d === today ? 'today' : ''}"
      data-action="toggleHabit" data-id="${h.id}" data-date="${d}" title="${esc(fmtDate(d))}"
      aria-label="${esc(h.name)}, ${esc(fmtDate(d))}: ${done.has(d) ? 'done' : 'not done'}"></button>`).join('');
    return `<div class="workout">
      <div class="head">
        <h3 class="grow">${esc(h.name)}</h3>
        <span class="muted small">${s} day streak · ${hits}/28</span>
        <button class="icon-btn" data-action="delHabit" data-id="${h.id}" aria-label="Delete ${esc(h.name)}" title="Delete">×</button>
      </div>
      <div class="heat">${cells}</div>
    </div>`;
  }).join('');
  return `<section class="card">
    <h2>Habits <span>last 4 weeks</span></h2>
    ${rows || '<p class="empty">Add a habit you want to do every day, like "Read 20 minutes" or "Stretch".</p>'}
    <form class="inline" data-submit="addHabit">
      <input class="grow" name="name" placeholder="New habit" autocomplete="off" required aria-label="New habit">
      <button class="btn">Add</button>
    </form>
  </section>`;
}

function goals() {
  const rows = db.all('goals').sort((a, b) => a.created_at.localeCompare(b.created_at)).map((g) => {
    const pct = g.target ? Math.min(100, Math.round(((g.current || 0) / g.target) * 100)) : 0;
    return `<div class="workout">
      <div class="head">
        <h3 class="grow">${esc(g.name)}</h3>
        <span class="muted small">${pct}%</span>
        <button class="icon-btn" data-action="delGoal" data-id="${g.id}" aria-label="Delete ${esc(g.name)}" title="Delete">×</button>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <form class="inline" data-submit="setGoal" data-id="${g.id}" style="margin-top:6px">
        <input class="narrow" type="number" name="current" step="any" min="0" inputmode="decimal" value="${g.current || 0}" required aria-label="Progress so far">
        <span class="muted small" style="align-self:center">of ${num(g.target)} ${esc(g.unit || '')}</span>
        <button class="btn ghost">Update</button>
      </form>
    </div>`;
  }).join('');
  return `<section class="card">
    <h2>Goals</h2>
    ${rows || '<p class="empty">Set a longer-term target, like "Run 500 km" or "Read 20 books".</p>'}
    <form class="inline" data-submit="addGoal">
      <input class="grow" name="name" placeholder="New goal" autocomplete="off" required aria-label="Goal">
      <input class="narrow" type="number" name="target" step="any" min="0.01" inputmode="decimal" placeholder="target" required aria-label="Target number">
      <input class="narrow" name="unit" placeholder="unit" autocomplete="off" aria-label="Unit, e.g. km or books">
      <button class="btn">Add</button>
    </form>
  </section>`;
}

export default {
  render() {
    return `<h1 class="page-title">Habits and goals</h1><div class="grid">${habits()}${goals()}</div>`;
  },
  actions: {
    addHabit(form) {
      const name = form.elements.name.value.trim();
      if (!name) return;
      db.add('habits', { name });
      return 'form[data-submit="addHabit"] input[name="name"]';
    },
    toggleHabit(el) { toggleHabit(el.dataset.id, el.dataset.date); },
    delHabit(el) {
      const h = db.get('habits', el.dataset.id);
      if (!h || !confirm(`Delete "${h.name}" and its history?`)) return;
      db.all('habit_logs').filter((l) => l.habit_id === h.id).forEach((l) => db.remove('habit_logs', l.id));
      db.remove('habits', h.id);
    },
    addGoal(form) {
      const name = form.elements.name.value.trim();
      const target = Number(form.elements.target.value);
      if (!name || !(target > 0)) return;
      db.add('goals', { name, target, unit: form.unit.value.trim(), current: 0 });
    },
    setGoal(form) {
      const v = Number(form.current.value);
      if (Number.isFinite(v) && v >= 0) db.update('goals', form.dataset.id, { current: v });
    },
    delGoal(el) {
      const g = db.get('goals', el.dataset.id);
      if (g && confirm(`Delete "${g.name}"?`)) db.remove('goals', g.id);
    },
  },
};
