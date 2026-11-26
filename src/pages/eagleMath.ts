import type { EaglePayload, EagleStop } from '../api/types';

/** 125 -> "2h 5m", 45 -> "45 min". */
export function dur(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const m = Math.max(0, Math.round(minutes));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

/** Visited away from the customer's tagged location (the app's own geofence check). */
export const awayFromTag = (s: EagleStop) => !s.within_geofence && (s.distance_m ?? 0) > 0;

export function distanceText(m: number | null | undefined): string {
  if (m == null) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export type TimelineItem =
  | { type: 'start'; time: string; text: string }
  | { type: 'end'; time: string; text: string }
  | { type: 'gap'; from: string; to: string; minutes: number }
  | { type: 'stop'; stop: EagleStop };

/** Start of day, stops (with quiet stretches before the stop they end at), end of day. Filters hide stops only. */
export function timeline(p: EaglePayload, show: (s: EagleStop) => boolean): TimelineItem[] {
  const out: TimelineItem[] = [];
  const day = p.day;
  if (day?.start) out.push({ type: 'start', time: day.start, text: day.start_battery ? `Battery ${day.start_battery}` : 'Day started' });
  const gaps = new Map((p.gaps ?? []).map((g) => [g.before, g]));
  for (const s of p.stops ?? []) {
    const g = gaps.get(s.n);
    if (g) out.push({ type: 'gap', from: g.from, to: g.to, minutes: g.minutes });
    if (show(s)) out.push({ type: 'stop', stop: s });
  }
  if (day?.end) out.push({ type: 'end', time: day.end, text: day.end_battery ? `Battery ${day.end_battery}` : 'Day ended' });
  return out;
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };

/** Pieces of the working-day bar: each stop as a share of the day, quiet stretches in their own colour. */
export function dayBar(p: EaglePayload): { left: number; width: number; kind: string }[] {
  const s = p.day?.start ? toMin(p.day.start) : null;
  const stops = p.stops ?? [];
  const first = s ?? (stops[0]?.time_in ? toMin(stops[0].time_in) : null);
  const lastStop = stops[stops.length - 1];
  const e = p.day?.end ? toMin(p.day.end) : (lastStop?.time_out ? toMin(lastStop.time_out) : null);
  if (first == null || e == null || e <= first) return [];
  const span = e - first;
  const piece = (from: number, minutes: number, kind: string) => ({
    left: Math.max(0, ((from - first) / span) * 100), width: Math.max(0.6, (minutes / span) * 100), kind });
  const out = (p.gaps ?? []).map((g) => piece(toMin(g.from) ?? first, g.minutes, 'gap'));
  for (const st of stops) {
    const t = st.time_in ? toMin(st.time_in) : null;
    if (t != null) out.push(piece(t, st.minutes ?? 1, st.kind));
  }
  return out;
}

/** Compass bearing in degrees from a to b, for the direction arrows on the route. */
export function bearing(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** Up to `count` evenly spread segment midpoints with their direction. */
export function arrows(points: [number, number][], count = 12): { at: [number, number]; deg: number }[] {
  if (points.length < 2) return [];
  const step = Math.max(1, Math.floor((points.length - 1) / count));
  const out: { at: [number, number]; deg: number }[] = [];
  for (let i = Math.floor(step / 2); i < points.length - 1; i += step) {
    const a = points[i]; const b = points[i + 1];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    out.push({ at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], deg: bearing(a, b) });
  }
  return out;
}

/** What the rep did at a stop, in order, for the stop card. */
export function stopActivities(s: EagleStop): { icon: string; title: string; detail: string; time: string }[] {
  const out: { icon: string; title: string; detail: string; time: string }[] = [];
  out.push({ icon: 'in', title: 'Checked in', time: s.time_in,
    detail: s.distance_m == null ? '' : awayFromTag(s) ? `${distanceText(s.distance_m)} from the tagged location` : `Within ${distanceText(s.distance_m)} of the tagged location` });
  if (s.detailing) out.push({ icon: 'detail', title: 'Detailing', detail: `${s.detailing} product${s.detailing === 1 ? '' : 's'}`, time: '' });
  if (s.samples) out.push({ icon: 'sample', title: 'Samples', detail: `${s.samples} item${s.samples === 1 ? '' : 's'}`, time: '' });
  if (s.gifts) out.push({ icon: 'gift', title: 'Gifts', detail: `${s.gifts} item${s.gifts === 1 ? '' : 's'}`, time: '' });
  for (const a of s.activities) {
    if (a.kind === 'Feedback') {
      out.push({ icon: 'feedback', title: 'Feedback', detail: [s.feedback, s.remarks].filter(Boolean).join(': '), time: a.time });
    } else {
      const amount = typeof a.amount === 'number' ? a.amount.toLocaleString() : String(a.amount ?? '');
      out.push({ icon: a.kind === 'Order' ? 'order' : a.kind === 'Sales' ? 'sales' : 'return', title: a.kind, detail: amount, time: a.time });
    }
  }
  if (!s.activities.some((a) => a.kind === 'Feedback') && (s.remarks || s.feedback)) {
    out.push({ icon: 'feedback', title: 'Note', detail: [s.feedback, s.remarks].filter(Boolean).join(': '), time: '' });
  }
  if (s.photo) out.push({ icon: 'photo', title: 'Photo', detail: 'Photo attached', time: '' });
  if (s.visited_with) out.push({ icon: 'with', title: 'Visited with', detail: s.visited_with, time: '' });
  if (s.time_out) out.push({ icon: 'out', title: 'Checked out', detail: s.minutes != null ? `${dur(s.minutes)} at this stop` : '', time: s.time_out });
  return out;
}
