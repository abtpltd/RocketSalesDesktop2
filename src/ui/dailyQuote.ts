import quotes from '../assets/quotes.json';

export interface Quote { text: string; author: string }
const ok = (q: unknown): q is Quote => !!q && typeof (q as Quote).text === 'string' && typeof (q as Quote).author === 'string' && !!(q as Quote).text;
export const QUOTES: Quote[] = (Array.isArray(quotes) ? quotes : []).filter(ok);

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/**
 * The quote for a day: the same for everyone on the same date, going through the whole list before any repeats,
 * in a scrambled order so neighbouring days are unrelated. Null if there are no quotes.
 */
export function quoteFor(day: Date, list: Quote[] = QUOTES): Quote | null {
  const n = list.length;
  if (!n) return null;
  const dayNo = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86_400_000);
  let step = 7;
  while (gcd(step, n) !== 1) step++;
  return list[(((dayNo * step) % n) + n) % n];
}

// ---- a new quote at every sign-in (the default), or one a day ----
export type QuoteMode = 'signin' | 'daily';
export interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }
const MODE = 'rs:quote:mode', BAG = 'rs:quote:bag', LAST = 'rs:quote:last';
const real = (): Store | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function readQuoteMode(store: Store | null = real()): QuoteMode {
  try { return store?.getItem(MODE) === 'daily' ? 'daily' : 'signin'; } catch { return 'signin'; }
}
export function writeQuoteMode(mode: QuoteMode, store: Store | null = real()): void {
  try { store?.setItem(MODE, mode); } catch { /* the choice is not kept */ }
}

/**
 * The next quote at random: every quote is shown once before any repeats, and the first of a new round is never the
 * one just shown. The unseen ones are kept on this computer, so closing the app does not restart the round.
 */
export function nextQuote(list: Quote[] = QUOTES, store: Store | null = real(), rand: () => number = Math.random): Quote | null {
  const n = list.length;
  if (!n) return null;
  let bag: number[] = [];
  let last = -1;
  try {
    const b = JSON.parse(store?.getItem(BAG) ?? '[]') as unknown;
    if (Array.isArray(b)) bag = b.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < n);
    const l = Number(store?.getItem(LAST));
    if (Number.isInteger(l) && l >= 0 && l < n) last = l;
  } catch { bag = []; }
  if (!bag.length) {
    bag = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    if (n > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  const pick = bag.pop() as number;
  try { store?.setItem(BAG, JSON.stringify(bag)); store?.setItem(LAST, String(pick)); } catch { /* shown anyway */ }
  return list[pick];
}

/** The quote the sign-in screen should show now (a new one in "every sign-in" mode, today's otherwise). */
export function pickQuote(now: Date = new Date(), store: Store | null = real()): Quote | null {
  return readQuoteMode(store) === 'daily' ? quoteFor(now) : nextQuote(QUOTES, store);
}
/** The quote shown at the last sign-in, so the dashboard line matches it; today's quote when none was picked. */
export function currentQuote(now: Date = new Date(), store: Store | null = real()): Quote | null {
  if (readQuoteMode(store) === 'daily') return quoteFor(now);
  const l = Number(store?.getItem(LAST));
  return Number.isInteger(l) && QUOTES[l] ? QUOTES[l] : quoteFor(now);
}
