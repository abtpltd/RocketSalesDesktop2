// Questions the assistant could not answer, kept on this computer only (nothing is sent anywhere), so the
// administrator can see which answer types to add next.
import { normalise } from './text';

export interface Missed { q: string; key: string; count: number; last: number }
export const MAX_MISSED = 200;
const MAX_LEN = 160;

export const missedKey = (company: string) => `rs:ask-missed:${company}`;

export const okMissed = (v: unknown): boolean =>
  Array.isArray(v) && v.every((x) => x && typeof x.q === 'string' && typeof x.key === 'string' && typeof x.count === 'number' && typeof x.last === 'number');

/** Adds one unanswered question: the same question asked again just counts up. The oldest, least-asked ones go first when full. */
export function addMissed(list: Missed[], question: string, now: number): Missed[] {
  const q = question.trim().replace(/\s+/g, ' ').slice(0, MAX_LEN);
  const key = normalise(q);
  if (!key) return list;
  const found = list.find((m) => m.key === key);
  const next = found ? list.map((m) => (m === found ? { ...m, count: m.count + 1, last: now, q } : m)) : [...list, { q, key, count: 1, last: now }];
  if (next.length <= MAX_MISSED) return next;
  const drop = [...next].sort((a, b) => a.count - b.count || a.last - b.last)[0];
  return next.filter((m) => m !== drop);
}
export const removeMissed = (list: Missed[], key: string): Missed[] => list.filter((m) => m.key !== key);
/** Most asked first, then most recent. */
export const sortMissed = (list: Missed[]): Missed[] => [...list].sort((a, b) => b.count - a.count || b.last - a.last);
export const missedText = (list: Missed[]): string =>
  sortMissed(list).map((m) => `${m.count}x  ${m.q}`).join('\n');
