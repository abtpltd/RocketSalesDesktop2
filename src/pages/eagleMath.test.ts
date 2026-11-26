import { describe, expect, it } from 'vitest';
import { sampleEagle } from '../api/mockEagle';
import { arrows, awayFromTag, bearing, dayBar, distanceText, dur, stopActivities, timeline } from './eagleMath';

const day = sampleEagle('U1', '2026-10-23');

describe('eagle eye', () => {
  it('formats durations and distances', () => {
    expect(dur(45)).toBe('45 min');
    expect(dur(125)).toBe('2h 5m');
    expect(dur(null)).toBe('');
    expect(distanceText(1200)).toBe('1.2 km');
    expect(distanceText(35)).toBe('35 m');
  });
  it('lists start, stops with quiet stretches before the stop they end at, and end', () => {
    const items = timeline(day, () => true);
    expect(items[0]).toMatchObject({ type: 'start', time: '08:12' });
    expect(items[items.length - 1]).toMatchObject({ type: 'end', time: '17:36' });
    const gapAt = items.findIndex((i) => i.type === 'gap');
    expect(items[gapAt + 1]).toMatchObject({ type: 'stop', stop: { n: 4 } });
    // a filter hides stops but keeps the day's shape
    const doctors = timeline(day, (s) => s.kind === 'doctor').filter((i) => i.type === 'stop');
    expect(doctors).toHaveLength(3);
  });
  it('flags a visit away from the tagged location only when the app says so', () => {
    const stops = day.stops!;
    expect(stops.filter(awayFromTag).map((s) => s.n)).toEqual([8]);
  });
  it('builds the stop card in the order things happened', () => {
    const acts = stopActivities(day.stops![6]);
    expect(acts.map((a) => a.title)).toEqual(['Checked in', 'Order', 'Feedback', 'Photo', 'Checked out']);
    expect(acts[1].detail).toBe('31,450');
    expect(acts[2].detail).toBe('Credit: Wants credit terms reviewed next visit');
    expect(stopActivities(day.stops![0]).map((a) => a.title)).toEqual(['Checked in', 'Detailing', 'Samples', 'Checked out']);
  });
  it('places the day bar pieces inside the working day', () => {
    const bar = dayBar(day);
    expect(bar.length).toBe(13);
    expect(bar.every((b) => b.left >= 0 && b.left <= 100)).toBe(true);
  });
  it('points the route arrows the way the rep drove', () => {
    expect(Math.round(bearing([0, 0], [1, 0]))).toBe(0);
    expect(Math.round(bearing([0, 0], [0, 1]))).toBe(90);
    expect(arrows([[0, 0], [0, 1], [0, 2]], 5).length).toBe(2);
  });
});

describe('dates and excel', () => {
  it('shows ISO dates as DD-MM-YYYY and leaves other text alone', async () => {
    const { showDate } = await import('../ui/dates');
    expect(showDate('2026-10-24')).toBe('24-10-2026');
    expect(showDate('2026-10-24T13:44:02')).toBe('24-10-2026 13:44');
    expect(showDate('2026/10/24')).toBe('24-10-2026');
    expect(showDate('24-10-2026')).toBe('24-10-2026');
    expect(showDate('Order 2026-10')).toBe('Order 2026-10');
    expect(showDate(12)).toBe(12);
  });
  it('writes a real xlsx (zip) with numbers kept as numbers', async () => {
    const { buildXlsx, toCell, fileName } = await import('../ui/excel');
    const { unzipSync, strFromU8 } = await import('fflate');
    const bytes = buildXlsx('Visits', [{ key: 'd', title: 'Date' }, { key: 'n', title: 'Amount' }], [{ d: '2026-10-01', n: 1200.5 }, { d: '', n: 'x<y' }]);
    const files = unzipSync(bytes);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('<v>1200.5</v>');
    expect(sheet).toContain('01-10-2026');
    expect(sheet).toContain('x&lt;y');
    expect(Object.keys(files)).toContain('xl/workbook.xml');
    expect(toCell(true)).toBe('Yes');
    expect(fileName('Visit Report', '2026-10-01', '2026-10-31')).toBe('Visit Report 01-10-2026 31-10-2026.xlsx');
  });
});
