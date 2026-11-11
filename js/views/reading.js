import * as db from '../store.js';
import { esc, iso, fmtDate, num } from '../util.js';
import { readingNow, setPage, readingPace } from '../logic.js';

let results = [];   // book lookup results from Open Library
let lookupNote = '';

function resultsHTML() {
  if (lookupNote) return `<p class="empty">${esc(lookupNote)}</p>`;
  return results.map((r, i) => `<div class="result">
      ${r.cover_url ? `<img src="${esc(r.cover_url)}" alt="">` : '<div class="cover"></div>'}
      <div class="grow"><div>${esc(r.title)}</div>
        <div class="muted small">${esc(r.author)}${r.total_pages ? ` · ${r.total_pages} pages` : ''}</div></div>
      <button class="btn small" data-action="useResult" data-i="${i}">Add</button>
    </div>`).join('');
}

function addForm() {
  return `<section class="card">
    <h2>Add a book</h2>
    <form class="inline" data-submit="addBook" style="margin-top:0">
      <input class="grow" name="title" placeholder="Title" autocomplete="off" required aria-label="Title">
      <input name="author" placeholder="Author" autocomplete="off" aria-label="Author">
      <input class="narrow" type="number" name="pages" min="1" inputmode="numeric" placeholder="pages" aria-label="Total pages">
      <button class="btn ghost" type="button" data-action="lookup">Look up</button>
      <button class="btn">Add</button>
    </form>
    <div id="lookup">${resultsHTML()}</div>
  </section>`;
}

function current() {
  const cards = readingNow().map((b) => {
    const pct = b.total_pages ? Math.round(((b.current_page || 0) / b.total_pages) * 100) : 0;
    const p = readingPace(b);
    return `<section class="card">
      <div class="book">
        ${b.cover_url ? `<img src="${esc(b.cover_url)}" alt="">` : '<div class="cover"></div>'}
        <div class="body">
          <h3>${esc(b.title)}</h3>
          <p class="muted small">${esc(b.author || '')}</p>
          <div class="bar"><span style="width:${pct}%"></span></div>
          <p class="small">Page ${b.current_page || 0}${b.total_pages ? ` of ${b.total_pages} · ${pct}%` : ''}</p>
          <p class="muted small">Started ${esc(fmtDate(b.started_on, { day: 'numeric', month: 'short' }))}${p.finish ? ` · ${num(p.perDay)} pages a day · finish around ${esc(fmtDate(p.finish, { day: 'numeric', month: 'short' }))}` : ''}</p>
        </div>
      </div>
      <form class="inline" data-submit="setPage" data-id="${b.id}">
        <input type="number" name="page" inputmode="numeric" min="0" ${b.total_pages ? `max="${b.total_pages}"` : ''} placeholder="Page I'm on now" required aria-label="Current page">
        <button class="btn">Update</button>
        <button class="btn ghost" type="button" data-action="finish" data-id="${b.id}">Finished</button>
        <button class="btn danger" type="button" data-action="delBook" data-id="${b.id}">Remove</button>
      </form>
    </section>`;
  }).join('');
  return cards || '<section class="card"><p class="empty">Nothing in progress. Add the book you\'re reading.</p></section>';
}

function finished() {
  const year = String(new Date().getFullYear());
  const done = db.all('books').filter((b) => b.status === 'finished')
    .sort((a, b) => (b.finished_on || '').localeCompare(a.finished_on || ''));
  const thisYear = done.filter((b) => (b.finished_on || '').startsWith(year)).length;
  const rows = done.map((b) => `<li class="item">
      <span class="grow">${esc(b.title)} <span class="muted small">${esc(b.author || '')}</span></span>
      <span class="muted small">${b.finished_on ? esc(fmtDate(b.finished_on, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</span>
      <button class="icon-btn" data-action="delBook" data-id="${b.id}" aria-label="Remove ${esc(b.title)}" title="Remove">×</button>
    </li>`).join('');
  return `<section class="card">
    <h2>Finished <span>${thisYear} in ${year}</span></h2>
    ${rows ? `<ul>${rows}</ul>` : '<p class="empty">Books you finish will be listed here.</p>'}
  </section>`;
}

function newBook(fields) {
  results = [];
  lookupNote = '';
  db.add('books', { status: 'reading', started_on: iso(), current_page: 0, ...fields });
}

export default {
  render() {
    return `<h1 class="page-title">Reading</h1><div class="grid"><div class="stack">${current()}</div><div class="stack">${addForm()}${finished()}</div></div>`;
  },
  actions: {
    addBook(form) {
      const f = form.elements;
      const title = f.title.value.trim();
      if (!title) return;
      newBook({ title, author: f.author.value.trim(), total_pages: Number(f.pages.value) || null, cover_url: null });
    },
    async lookup(el) {
      const form = el.closest('form');
      const q = [form.elements.title.value, form.elements.author.value].join(' ').trim();
      const box = document.getElementById('lookup');
      if (!q) { form.elements.title.focus(); return; }
      box.innerHTML = '<p class="empty">Searching…</p>';
      try {
        const url = `https://openlibrary.org/search.json?limit=5&fields=title,author_name,number_of_pages_median,cover_i&q=${encodeURIComponent(q)}`;
        const j = await (await fetch(url)).json();
        results = (j.docs || []).map((d) => ({
          title: d.title,
          author: (d.author_name || []).join(', '),
          total_pages: d.number_of_pages_median || null,
          cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        }));
        lookupNote = results.length ? '' : 'No matches. You can still add it by hand.';
      } catch {
        results = [];
        lookupNote = 'Lookup needs an internet connection. You can still add it by hand.';
      }
      const target = document.getElementById('lookup');
      if (target) target.innerHTML = resultsHTML();
    },
    useResult(el) {
      const r = results[Number(el.dataset.i)];
      if (r) newBook(r);
    },
    setPage(form) {
      const b = db.get('books', form.dataset.id);
      const page = Number(form.page.value);
      if (b && Number.isFinite(page)) setPage(b, page);
    },
    finish(el) {
      const b = db.get('books', el.dataset.id);
      if (!b) return;
      if (b.total_pages) setPage(b, b.total_pages);
      db.update('books', b.id, { status: 'finished', finished_on: iso() });
    },
    delBook(el) {
      const b = db.get('books', el.dataset.id);
      if (!b || !confirm(`Remove "${b.title}"?`)) return;
      db.all('reading_logs').filter((l) => l.book_id === b.id).forEach((l) => db.remove('reading_logs', l.id));
      db.remove('books', b.id);
    },
  },
};
