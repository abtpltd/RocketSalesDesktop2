// Dates are shown as DD-MM-YYYY everywhere in the app (what the person reads and types).
export const DATE_FMT = 'DD-MM-YYYY';
export const DATETIME_FMT = 'DD-MM-YYYY HH:mm';

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:([T ])(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s?(Z|UTC|[+-]\d{2}:?\d{2})?)?$/;
const YMD_SLASH = /^(\d{4})\/(\d{2})\/(\d{2})$/;

/** A cell value as shown: "2026-10-24" -> "24-10-2026", "2026-10-24T13:44:02" -> "24-10-2026 13:44"; anything else as is. */
export function showDate(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const s = value.trim();
  const m = ISO.exec(s);
  if (m) return m[4] ? `${m[3]}-${m[2]}-${m[1]} ${m[5]}:${m[6]}` : `${m[3]}-${m[2]}-${m[1]}`;
  const y = YMD_SLASH.exec(s);
  if (y) return `${y[3]}-${y[2]}-${y[1]}`;
  return value;
}
