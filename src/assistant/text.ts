// Reading a typed question on this computer: no service, no cost. Plain word matching that forgives small spelling slips.

export const normalise = (s: string): string => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9%.\s-]/g, ' ').replace(/\s+/g, ' ').trim();
export const tokens = (s: string): string[] => normalise(s).split(' ').filter(Boolean);

/** Number of single-letter changes between two words (stops early once it is clearly more than 1). */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** The typed word means the wanted word: same, a longer form of it (visit / visited), or one slip away (atendance). */
export function same(typed: string, want: string): boolean {
  if (typed === want) return true;
  if (want.length >= 4 && typed.startsWith(want) && typed.length - want.length <= 3) return true;
  return want.length >= 5 && typed.length >= 5 && distance(typed, want) <= 1;
}
export const hasAny = (toks: string[], words: string[]): boolean => words.some((w) => toks.some((t) => same(t, w)));
/** Every group needs at least one of its words. */
export const hasAll = (toks: string[], ...groups: string[][]): boolean => groups.every((g) => hasAny(toks, g));

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90 };
export const numberFrom = (s: string): number | null => {
  const n = Number(s);
  return Number.isFinite(n) ? n : WORD_NUMBERS[s] ?? null;
};
