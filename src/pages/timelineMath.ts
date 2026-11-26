import type { TimelineKind } from '../api/types';

/** Where a time sits on the day axis, as a percentage (the web script's (time - start) / width * 100). */
export function place(minute: number, axisStart: number, axisEnd: number): number {
  const width = axisEnd - axisStart;
  return width > 0 ? ((minute - axisStart) / width) * 100 : 0;
}

/** Left edge and width of a visit bar, or null if its start could not be read. A visit with no end is drawn as a dot. */
export function barBox(s: number | null, e: number | null, axisStart: number, axisEnd: number): { left: number; width: number; dot: boolean } | null {
  if (s === null) return null;
  const left = place(s, axisStart, axisEnd);
  if (e === null || e <= s) return { left, width: 0, dot: true };
  return { left, width: place(e, axisStart, axisEnd) - left, dot: false };
}

/** Hour lines for the axis; labels are thinned out so that about `maxLabels` or fewer are shown. */
export function hourTicks(axisStart: number, axisEnd: number, maxLabels = 14): { minute: number; label: string | null }[] {
  const hours = Math.max(1, Math.round((axisEnd - axisStart) / 60));
  const step = Math.max(1, Math.ceil(hours / maxLabels));
  const out: { minute: number; label: string | null }[] = [];
  for (let i = 0, m = axisStart; m < axisEnd; i += 1, m += 60) {
    out.push({ minute: m, label: i % step === 0 ? `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00` : null });
  }
  return out;
}

export const KIND_LABEL: Record<TimelineKind, string> = {
  order: 'Visit with order', order_offline: 'Visit with order (outside the geofence)',
  visit: 'Visit', visit_offline: 'Visit (outside the geofence)',
};
export const KIND_COLOR: Record<TimelineKind, string> = {
  order: '#1e9e57', order_offline: '#daaa1b', visit: '#5fd49a', visit_offline: '#f2c874',
};

/** "1 h 05 m" / "20 m" for a length in minutes. */
export function lengthText(minutes: number): string {
  if (minutes <= 0) return '0 m';
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${String(minutes % 60).padStart(2, '0')} m` : `${minutes} m`;
}

/** "Mon 05 Oct" from the server's dd-mm-yyyy. */
export function dayLabel(date: string): string {
  const [d, m, y] = date.split('-').map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
  return `${wd} ${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;  // DD-MM-YYYY like the rest of the app
}
