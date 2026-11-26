import { describe, expect, it } from 'vitest';
import { compareMonths, daysSoFar } from './compare';

describe('vs last month', () => {
  it('compares the same days and stays quiet when last month is unknown', () => {
    const cur = { visitDta: '{"1": 10, "2": 10, "3": 99}', doctorVisitDta: { 1: 5 }, orderDta: '{"1": 1100, "2": 0}' };
    const prev = { month: 'Sep-2026', visitDta: '{"1": 8, "2": 8, "3": 8}', doctorVisitDta: '{}', orderDta: '{"1": 1000, "2": 1000}' };
    const c = compareMonths(cur, prev, 'Oct-2026', '2026-10-02')!;
    expect(c.days).toBe(2);
    expect(c.visits).toEqual({ now: 20, before: 16, pct: 25 });
    expect(c.orders).toEqual({ now: 1100, before: 2000, pct: -45 });
    expect(c.doctors.pct).toBeNull();
    expect(compareMonths(cur, undefined, 'Oct-2026', '2026-10-02')).toBeNull();
    expect(compareMonths(cur, { month: 'Sep-2026' }, 'Oct-2026', '2026-10-02')).toBeNull();
    expect(compareMonths(cur, { ...prev, visitDta: 'not json' }, 'Oct-2026', '2026-10-02')?.visits.before ?? 0).toBe(0);
  });
  it('runs to today in this month and the whole month before', () => {
    expect(daysSoFar('Oct-2026', '2026-10-25')).toBe(25);
    expect(daysSoFar('Feb-2026', '2026-10-25')).toBe(28);
  });
});
