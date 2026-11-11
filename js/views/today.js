import * as db from '../store.js';
import { esc, iso, addDays, fmtDate, num, units, parse, dayNumber } from '../util.js';
import { doneSet, streak, toggleHabit, readingNow, setPage, readingPace, weekStats } from '../logic.js';
import { quoteOfDay } from '../quotes.js';
import { summary as cimaSummary, label as examLabel } from '../cima.js';
import { getWeather, locate } from '../weather.js';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function header() {
  const now = new Date();
  const year = now.getFullYear();
  const dayOfYear = dayNumber(now) - dayNumber(new Date(year, 0, 1)) + 1;
  const daysInYear = dayNumber(new Date(year + 1, 0, 1)) - dayNumber(new Date(year, 0, 1));
  const week = Math.min(52, Math.ceil(dayOfYear / 7));
  const ticks = [...Array(52)].map((_, i) => `<i class="${i + 1 < week ? 'past' : i + 1 === week ? 'now' : ''}"></i>`).join('');
  const weather = db.settings.get('weatherLoc')
    ? '<span class="weather" id="weather"></span>'
    : '<span class="weather"><button class="btn ghost small" data-action="addWeather">Add weather</button></span>';
  return `<header class="hero wide">
    <div class="kicker">
      <span class="day">${esc(now.toLocaleDateString(undefined, { weekday: 'long' }))}</span>
      <span>Week ${week}</span>
      ${weather}
    </div>
    <h1>${now.getDate()} <em>${esc(now.toLocaleDateString(undefined, { month: 'long' }))}</em></h1>
    <p class="greet">${greeting()}.</p>
    <div class="year" aria-hidden="true">${ticks}</div>
    <div class="year-cap"><span>Day ${dayOfYear} of ${daysInYear}</span><span>${daysInYear - dayOfYear} left in ${year}</span></div>
  </header>`;
}

function quote() {
  const q = quoteOfDay();
  if (!q) return '';
  return `<figure class="quote wide">
    <blockquote>${esc(q.q)}</blockquote>
    <figcaption>${esc(q.a)}${q.s ? `, <cite>${esc(q.s)}</cite>` : ''}</figcaption>
  </figure>`;
}

function todoRow(t, today) {
  const due = t.due && !t.done
    ? `<span class="chip ${t.due < today ? 'late' : ''}">${t.due === today ? 'Today' : esc(fmtDate(t.due, { day: 'numeric', month: 'short' }))}</span>`
    : '';
  return `<li class="item ${t.done ? 'done' : ''}">
    <button class="check ${t.done ? 'on' : ''}" data-action="toggleTodo" data-id="${t.id}" aria-label="${t.done ? 'Mark as not done' : 'Mark as done'}"></button>
    <span class="grow">${esc(t.text)}${due}</span>
    ${t.done ? '' : `<button class="icon-btn ${t.pinned ? 'on' : ''}" data-action="pinTodo" data-id="${t.id}" aria-label="${t.pinned ? 'Unpin' : 'Pin to top'}" title="${t.pinned ? 'Unpin' : 'Pin to top'}">${t.pinned ? '★' : '☆'}</button>`}
    <button class="icon-btn" data-action="delTodo" data-id="${t.id}" aria-label="Delete task" title="Delete">×</button>
  </li>`;
}

function todos() {
  const today = iso();
  const items = db.all('todos');
  const open = items.filter((t) => !t.done).sort((a, b) =>
    (!!b.pinned - !!a.pinned)
    || (a.due || '9999').localeCompare(b.due || '9999')
    || a.created_at.localeCompare(b.created_at));
  const done = items.filter((t) => t.done && t.done_at === today);
  const list = [...open, ...done].map((t) => todoRow(t, today)).join('');
  return `<section class="card">
    <h2>To do <span>${open.length ? `${open.length} left` : done.length ? 'All done' : ''}</span></h2>
    ${list ? `<ul>${list}</ul>` : '<p class="empty">Nothing on the list. Add your first task below.</p>'}
    <form class="inline" data-submit="addTodo">
      <input class="grow" name="text" placeholder="Add a task" autocomplete="off" required aria-label="New task">
      <input type="date" name="due" aria-label="Due date (optional)">
      <button class="btn">Add</button>
    </form>
  </section>`;
}

function habits() {
  const today = iso();
  const days = [...Array(7)].map((_, i) => addDays(today, i - 6));
  const rows = db.all('habits').sort((a, b) => a.created_at.localeCompare(b.created_at)).map((h) => {
    const done = doneSet(h.id);
    const dots = days.map((d) => `<button class="dot ${done.has(d) ? 'on' : ''} ${d === today ? 'today' : ''}"
      data-action="toggleHabit" data-id="${h.id}" data-date="${d}"
      aria-label="${esc(h.name)}, ${esc(fmtDate(d))}: ${done.has(d) ? 'done' : 'not done'}">
      ${esc(parse(d).toLocaleDateString(undefined, { weekday: 'narrow' }))}<i></i></button>`).join('');
    const s = streak(h.id);
    return `<div class="habit">
      <span class="name">${esc(h.name)}</span>
      <div class="dots">${dots}</div>
      <span class="streak"><b>${s}</b> day${s === 1 ? '' : 's'}</span>
    </div>`;
  }).join('');
  return `<section class="card">
    <h2>Habits <a href="#/habits">Manage</a></h2>
    ${rows || '<p class="empty">No habits yet. <a href="#/habits">Add one</a> to start a streak.</p>'}
  </section>`;
}

function exercise() {
  const s = weekStats();
  return `<section class="card">
    <h2>This week <a href="#/exercise">Log</a></h2>
    <div class="stats">
      <div class="stat"><b>${num(units.distOut(s.runKm))}<small>${units.dist()}</small></b><span>${s.runCount} run${s.runCount === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${s.gymCount}</b><span>gym session${s.gymCount === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${s.stepsToday == null ? '–' : num(s.stepsToday, 0)}</b><span>steps today</span></div>
      <div class="stat"><b>${s.weightKg == null ? '–' : `${num(units.weightOut(s.weightKg))}<small>${units.weight()}</small>`}</b><span>latest weight</span></div>
    </div>
  </section>`;
}

function book() {
  const b = readingNow()[0];
  if (!b) {
    return `<section class="card"><h2>Reading <a href="#/reading">Books</a></h2>
      <p class="empty">No book on the go. <a href="#/reading">Add the one you're reading</a>.</p></section>`;
  }
  const pct = b.total_pages ? Math.round(((b.current_page || 0) / b.total_pages) * 100) : 0;
  const p = readingPace(b);
  const paceLine = p.finish
    ? `${num(p.perDay)} pages a day · finish around ${esc(fmtDate(p.finish, { day: 'numeric', month: 'short' }))}`
    : p.left === 0 && b.total_pages ? 'Last page reached' : 'Update your page to see your pace';
  return `<section class="card">
    <h2>Reading <a href="#/reading">Books</a></h2>
    <div class="book">
      ${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : '<div class="cover"></div>'}
      <div class="body">
        ${b.total_pages ? `<span class="pct">${pct}%</span>` : ''}
        <h3>${esc(b.title)}</h3>
        <p class="muted">${esc(b.author || '')}</p>
        <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
        <p class="small">Page ${b.current_page || 0}${b.total_pages ? ` of ${b.total_pages}` : ''}</p>
        <p class="muted small">${paceLine}</p>
      </div>
    </div>
    <form class="inline" data-submit="setPage" data-id="${b.id}">
      <input type="number" name="page" inputmode="numeric" min="0" ${b.total_pages ? `max="${b.total_pages}"` : ''} placeholder="Page I'm on now" required aria-label="Current page">
      <button class="btn">Update</button>
    </form>
  </section>`;
}

function goals() {
  const rows = db.all('goals').sort((a, b) => a.created_at.localeCompare(b.created_at)).map((g) => {
    const pct = g.target ? Math.min(100, Math.round(((g.current || 0) / g.target) * 100)) : 0;
    return `<div class="goal">
      <div class="top">
        <span class="grow">${esc(g.name)}</span>
        <span class="muted small">${num(g.current || 0)} / ${num(g.target)} ${esc(g.unit || '')}</span>
        <button class="icon-btn" data-action="goalStep" data-id="${g.id}" data-step="-1" aria-label="Decrease ${esc(g.name)}">−</button>
        <button class="icon-btn" data-action="goalStep" data-id="${g.id}" data-step="1" aria-label="Increase ${esc(g.name)}">+</button>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    </div>`;
  }).join('');
  return `<section class="card">
    <h2>Goals <a href="#/habits">Manage</a></h2>
    ${rows || '<p class="empty">No goals yet. <a href="#/habits">Set one</a> to track it here.</p>'}
  </section>`;
}

function cima() {
  const s = cimaSummary();
  const pct = Math.round((s.done / s.total) * 100);
  const rows = s.current.map((e) => `<div class="study">
      <span class="code">${e.code}</span><span class="grow">${esc(e.name)}</span><span class="tag">${esc(examLabel(e))}</span>
    </div>`).join('');
  return `<section class="card">
    <h2>CIMA <a href="#/cima">Exams</a></h2>
    ${rows || '<p class="empty">No exam in progress. <a href="#/cima">Pick your next one</a>.</p>'}
    <div class="bar"><span style="width:${pct}%"></span></div>
    <p class="muted small">${s.done} of ${s.total} exams complete</p>
  </section>`;
}

export default {
  render() {
    return `<div class="grid">${header()}${quote()}${todos()}${habits()}${cima()}${book()}${exercise()}${goals()}</div>`;
  },

  async mount() {
    const el = document.getElementById('weather');
    if (!el) return;
    try {
      const w = await getWeather();
      const target = document.getElementById('weather'); // the view may have re-rendered meanwhile
      if (w && target) {
        target.innerHTML = `<strong>${w.temp}° ${esc(w.label)}</strong>${w.hi}° / ${w.lo}°${w.rain != null ? ` · ${w.rain}% rain` : ''}`;
      }
    } catch { /* offline: leave the weather blank */ }
  },

  actions: {
    addTodo(form) {
      const text = form.text.value.trim();
      if (!text) return;
      db.add('todos', { text, due: form.due.value || null, done: false, pinned: false });
      return 'form[data-submit="addTodo"] input[name="text"]';
    },
    toggleTodo(el) {
      const t = db.get('todos', el.dataset.id);
      if (t) db.update('todos', t.id, { done: !t.done, done_at: t.done ? null : iso() });
    },
    pinTodo(el) {
      const t = db.get('todos', el.dataset.id);
      if (t) db.update('todos', t.id, { pinned: !t.pinned });
    },
    delTodo(el) { db.remove('todos', el.dataset.id); },
    toggleHabit(el) { toggleHabit(el.dataset.id, el.dataset.date); },
    setPage(form) {
      const b = db.get('books', form.dataset.id);
      const page = Number(form.page.value);
      if (b && Number.isFinite(page)) setPage(b, page);
    },
    goalStep(el) {
      const g = db.get('goals', el.dataset.id);
      if (g) db.update('goals', g.id, { current: Math.max(0, (g.current || 0) + Number(el.dataset.step)) });
    },
    async addWeather(el) {
      el.disabled = true;
      el.textContent = 'Locating…';
      try { await locate(); }
      catch { el.disabled = false; el.textContent = 'Location blocked. Try again'; }
    },
  },
};
