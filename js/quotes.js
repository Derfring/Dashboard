import { dayNumber } from './util.js';

let quotes = [];

export async function loadQuotes() {
  const res = await fetch('./data/quotes.json');
  quotes = await res.json();
}

// One quote per calendar day, the same on every device.
export function quoteOfDay() {
  return quotes.length ? quotes[dayNumber() % quotes.length] : null;
}
