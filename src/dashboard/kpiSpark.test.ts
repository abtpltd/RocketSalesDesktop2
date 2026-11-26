import { describe, expect, it } from 'vitest';
import { dayName, noData, sparkStats } from './kpiSpark';

describe('kpi line', () => {
  it('finds best and lowest day, ignoring days without a figure', () => {
    expect(sparkStats([5, 2, 9, null, null])).toEqual({ best: 2, low: 1, first: 0, last: 2 });
    expect(sparkStats([4, null, null])).toBeNull();
  });
  it('names days', () => {
    expect(dayName(24, '2026-10-25')).toBe('25 Oct');
    expect(dayName(0)).toBe('Day 1');
  });
  it('treats a dash as no data but 0 as a real zero', () => {
    expect(noData('-')).toBe(true);
    expect(noData('0')).toBe(false);
  });
});
