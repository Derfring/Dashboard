import * as db from '../store.js';
import { esc, iso, fmtDate, num } from '../util.js';
import { LEVELS, MAX_SCORE, examState, saveExam, label, summary } from '../cima.js';

let open = null; // code of the exam whose details are expanded

const STATUSES = [['not_started', 'Not started'], ['studying', 'Studying'], ['passed', 'Passed'], ['exempt', 'Exempt']];

function overview() {
  const s = summary();
  const pct = Math.round((s.done / s.total) * 100);
  return `<section class="card wide">
    <h2>Progress <span>${pct}% of the qualification</span></h2>
    <div class="stats three">
      <div class="stat"><b>${s.done}<small>of ${s.total}</small></b><span>exams complete</span></div>
      <div class="stat"><b>${s.next ? s.next.daysToExam : '–'}${s.next ? '<small>days</small>' : ''}</b><span>${s.next ? `until ${esc(s.next.code)}` : 'no exam booked'}</span></div>
      <div class="stat"><b>${s.average == null ? '–' : num(s.average, 0)}</b><span>average pass score</span></div>
    </div>
    <div class="bar"><span style="width:${pct}%"></span></div>
  </section>`;
}

function panel(s) {
  const attempts = s.attempts.map((a) => `<li class="item">
      <span class="grow">${esc(fmtDate(a.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
      <span class="score">${a.score}<small>/${MAX_SCORE}</small></span>
      <span class="chip ${a.score >= s.pass ? 'ok' : 'late'}">${a.score >= s.pass ? 'Pass' : 'Fail'}</span>
      <button class="icon-btn" data-action="delAttempt" data-id="${a.id}" aria-label="Delete this result" title="Delete">×</button>
    </li>`).join('');
  const passedByScore = s.best != null && s.best >= s.pass;
  return `<div class="exam-panel">
    <div class="setting"><span>Status</span>
      <select data-change="setStatus" data-code="${s.code}" aria-label="Status of ${s.code}" ${passedByScore ? 'disabled' : ''}>
        ${STATUSES.map(([v, l]) => `<option value="${v}" ${v === s.status ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>
    ${s.done ? '' : `<div class="setting"><span>Exam date</span>
      <input type="date" data-change="setDate" data-code="${s.code}" value="${s.examDate || ''}" aria-label="Exam date for ${s.code}" style="width:auto"></div>`}
    ${attempts ? `<ul>${attempts}</ul>` : ''}
    ${s.status === 'exempt' ? '' : `<form class="inline" data-submit="addAttempt" data-code="${s.code}">
      <input type="date" name="date" value="${iso()}" max="${iso()}" required aria-label="Date sat">
      <input class="narrow" type="number" name="score" min="0" max="${MAX_SCORE}" inputmode="numeric" placeholder="score / ${MAX_SCORE}" required aria-label="Scaled score out of ${MAX_SCORE}">
      <button class="btn ghost">Add result</button>
    </form>
    <p class="muted small" style="margin-top:8px">Pass mark ${s.pass} out of ${MAX_SCORE}.</p>`}
  </div>`;
}

function level(l) {
  const states = l.exams.map((e) => examState(e.code));
  const done = states.filter((s) => s.done).length;
  const rows = states.map((s) => `<div class="exam ${s.status} ${s.done ? 'is-done' : ''}">
      <button class="exam-head" data-action="toggle" data-code="${s.code}" aria-expanded="${open === s.code}">
        <span class="code">${s.code}</span>
        <span class="grow">${esc(s.name)}</span>
        ${s.best != null ? `<span class="score">${s.best}<small>/${MAX_SCORE}</small></span>` : ''}
        <span class="tag">${esc(label(s))}</span>
      </button>
      ${open === s.code ? panel(s) : ''}
    </div>`).join('');
  return `<section class="card">
    <h2>${l.name} level <span>${done} / ${l.exams.length}</span></h2>
    ${rows}
  </section>`;
}

export default {
  render() {
    return `<h1 class="page-title">CIMA</h1><div class="grid">${overview()}${LEVELS.map(level).join('')}</div>`;
  },
  actions: {
    toggle(el) {
      open = open === el.dataset.code ? null : el.dataset.code;
      db.notify();
    },
    setStatus(el) { saveExam(el.dataset.code, { status: el.value }); },
    setDate(el) {
      const s = examState(el.dataset.code);
      // Booking a date for an exam that wasn't started means you're studying for it.
      saveExam(el.dataset.code, { exam_date: el.value || null, ...(el.value && s.status === 'not_started' ? { status: 'studying' } : {}) });
    },
    addAttempt(form) {
      const score = Number(form.elements.score.value);
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return;
      db.add('exam_attempts', { code: form.dataset.code, date: form.elements.date.value, score: Math.round(score) });
    },
    delAttempt(el) { db.remove('exam_attempts', el.dataset.id); },
  },
};
