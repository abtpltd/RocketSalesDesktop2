import { expect, it } from 'vitest';
import { QUOTES, quoteFor } from './dailyQuote';

it('every bundled quote has text and a named author, with no duplicates', () => {
  expect(QUOTES.length).toBeGreaterThanOrEqual(30);
  expect(QUOTES.every((q) => q.text.length > 10 && q.author.length > 3)).toBe(true);
  expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length);
});
it('the same day gives the same quote, and a full cycle shows each quote once', () => {
  const d = new Date(2026, 9, 28);
  expect(quoteFor(d)).toEqual(quoteFor(new Date(2026, 9, 28, 23, 59)));
  const seen = new Set<string>();
  for (let i = 0; i < QUOTES.length; i++) seen.add(quoteFor(new Date(2026, 0, 1 + i))!.text);
  expect(seen.size).toBe(QUOTES.length);
  expect(quoteFor(d, [])).toBeNull();
});

import { currentQuote, nextQuote, pickQuote, readQuoteMode, writeQuoteMode, type Store } from './dailyQuote';
const memory = (): Store => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }; };
it('a new random quote each time, every one shown once per round, never the same twice in a row', () => {
  const s = memory();
  const round1 = Array.from({ length: QUOTES.length }, () => nextQuote(QUOTES, s)!.text);
  expect(new Set(round1).size).toBe(QUOTES.length);
  const next = nextQuote(QUOTES, s)!.text;
  expect(next).not.toBe(round1[round1.length - 1]);
  expect(nextQuote([], s)).toBeNull();
});
it('the mode defaults to a new quote at every sign-in and can be set to once a day', () => {
  const s = memory();
  expect(readQuoteMode(s)).toBe('signin');
  writeQuoteMode('daily', s);
  expect(readQuoteMode(s)).toBe('daily');
  const d = new Date(2026, 9, 28);
  expect(pickQuote(d, s)).toEqual(quoteFor(d));
  expect(currentQuote(d, s)).toEqual(quoteFor(d));
});
it('the dashboard shows the quote picked at sign-in', () => {
  const s = memory();
  const q = pickQuote(new Date(), s);
  expect(currentQuote(new Date(), s)).toEqual(q);
  expect(pickQuote(new Date(), null)).not.toBeUndefined(); // no storage: still a quote
});
