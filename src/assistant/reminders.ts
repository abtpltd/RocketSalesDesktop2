// Reminders typed to the assistant ("remind me to chase Lakeview on Friday"), kept on this computer only.
export interface Reminder { id: number; text: string; due: string; done?: boolean }
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const okReminders = (v: unknown): boolean => Array.isArray(v) && v.every((r) => r && typeof r.text === 'string' && typeof r.due === 'string' && typeof r.id === 'number');

/** "remind me to X [today | tomorrow | on friday | in 3 days]". Null when the sentence is not a reminder. */
export function parseReminder(question: string, today: Date): { text: string; due: string } | null {
  const m = /^\s*(?:please\s+)?remind me(?:\s+to)?\s+(.+?)\s*$/i.exec(question);
  if (!m) return null;
  let body = m[1];
  let due = '';
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const take = (re: RegExp, f: (x: RegExpExecArray) => Date) => { const x = re.exec(body); if (x && !due) { due = isoDay(f(x)); body = body.replace(re, '').trim(); } };
  take(/\s*\b(?:on\s+)?tomorrow\b/i, () => new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
  take(/\s*\b(?:on\s+)?today\b/i, () => t);
  take(/\s*\bin\s+(\d{1,2})\s+days?\b/i, (x) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + +x[1]));
  take(new RegExp(`\\s*\\b(?:on\\s+|next\\s+)?(${DAYS.join('|')})\\b`, 'i'), (x) => {
    const want = DAYS.indexOf(x[1].toLowerCase());
    const add = ((want - t.getDay() + 7) % 7) || 7;
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() + add);
  });
  body = body.replace(/\s+/g, ' ').trim().slice(0, 140);
  return body ? { text: body, due } : null;
}
export const wantsReminders = (q: string): boolean => /\b(my|show|list|open)\b.*\breminders?\b|^\s*reminders?\s*$/i.test(q);

export function addReminder(list: Reminder[], text: string, due: string): Reminder[] {
  const id = Math.max(0, ...list.map((r) => r.id)) + 1;
  return [...list, { id, text, due }].slice(-50);
}
export const removeReminder = (list: Reminder[], id: number): Reminder[] => list.filter((r) => r.id !== id);
/** Not done, and due today or earlier (or with no date). */
export const dueReminders = (list: Reminder[], today: Date): Reminder[] => list.filter((r) => !r.done && (!r.due || r.due <= isoDay(today))).sort((a, b) => a.due.localeCompare(b.due));
export const sortedReminders = (list: Reminder[]): Reminder[] => [...list].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
