import * as db from './store.js';
import { iso, daysBetween } from './util.js';

// CIMA Professional Qualification (2019 syllabus). Scores are scaled 0-150:
// objective tests pass at 100, case studies at 80.
const OT = 100, CASE = 80;
export const LEVELS = [
  { name: 'Certificate', exams: [
    { code: 'BA1', name: 'Fundamentals of Business Economics', pass: OT, initial: 'exempt' },
    { code: 'BA2', name: 'Fundamentals of Management Accounting', pass: OT, initial: 'exempt' },
    { code: 'BA3', name: 'Fundamentals of Financial Accounting', pass: OT, initial: 'exempt' },
    { code: 'BA4', name: 'Fundamentals of Ethics, Corporate Governance and Business Law', pass: OT, initial: 'exempt' },
  ] },
  { name: 'Operational', exams: [
    { code: 'E1', name: 'Managing Finance in a Digital World', pass: OT },
    { code: 'P1', name: 'Management Accounting', pass: OT },
    { code: 'F1', name: 'Financial Reporting', pass: OT, initial: 'studying' },
    { code: 'OCS', name: 'Operational Case Study', pass: CASE, caseStudy: true },
  ] },
  { name: 'Management', exams: [
    { code: 'E2', name: 'Managing Performance', pass: OT },
    { code: 'P2', name: 'Advanced Management Accounting', pass: OT },
    { code: 'F2', name: 'Advanced Financial Reporting', pass: OT },
    { code: 'MCS', name: 'Management Case Study', pass: CASE, caseStudy: true },
  ] },
  { name: 'Strategic', exams: [
    { code: 'E3', name: 'Strategic Management', pass: OT },
    { code: 'P3', name: 'Risk Management', pass: OT },
    { code: 'F3', name: 'Financial Strategy', pass: OT },
    { code: 'SCS', name: 'Strategic Case Study', pass: CASE, caseStudy: true },
  ] },
];
export const EXAMS = LEVELS.flatMap((l) => l.exams.map((e) => ({ ...e, level: l.name })));
export const MAX_SCORE = 150;

// If two devices each created a record for the same exam before syncing,
// the most recently edited one is used.
const row = (code) => db.all('exams').filter((r) => r.code === code)
  .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

export function saveExam(code, patch) {
  const r = row(code);
  if (r) db.update('exams', r.id, patch);
  else db.add('exams', { code, ...patch });
}

// The stored record merged with the syllabus entry. A passing score always
// counts as passed, whatever status was picked by hand.
export function examState(code) {
  const exam = EXAMS.find((e) => e.code === code);
  const r = row(code);
  const attempts = db.all('exam_attempts').filter((a) => a.code === code)
    .sort((a, b) => a.date.localeCompare(b.date));
  const best = attempts.length ? Math.max(...attempts.map((a) => a.score)) : null;
  const status = best != null && best >= exam.pass ? 'passed' : (r?.status ?? exam.initial ?? 'not_started');
  const examDate = status === 'passed' || status === 'exempt' ? null : (r?.exam_date || null);
  return {
    ...exam, status, attempts, best, examDate,
    done: status === 'passed' || status === 'exempt',
    daysToExam: examDate ? daysBetween(iso(), examDate) : null,
  };
}

export function label(s) {
  if (s.status === 'exempt') return 'Exempt';
  if (s.status === 'passed') return 'Passed';
  if (s.daysToExam != null && s.daysToExam >= 0) {
    return s.daysToExam === 0 ? 'Exam today' : `Exam in ${s.daysToExam} day${s.daysToExam === 1 ? '' : 's'}`;
  }
  if (s.status === 'studying') return s.attempts.length ? 'Resitting' : 'Studying';
  return s.attempts.length ? 'Resit needed' : 'To do';
}

export function summary() {
  const all = EXAMS.map((e) => examState(e.code));
  const scores = all.flatMap((s) => (s.status === 'passed' && s.best != null ? [s.best] : []));
  const upcoming = all.filter((s) => s.daysToExam != null && s.daysToExam >= 0)
    .sort((a, b) => a.daysToExam - b.daysToExam);
  return {
    all,
    done: all.filter((s) => s.done).length,
    total: all.length,
    current: all.filter((s) => !s.done && (s.status === 'studying' || s.examDate)),
    next: upcoming[0] || null,
    average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
  };
}
