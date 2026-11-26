import { describe, expect, it } from 'vitest';
import { combineVisits, isEmpty, isWide, splitTitle, visitsSpec } from './DashParts';
import { mix, palette } from './KasChart';
import { monthTitle } from '../pages/Dashboard';

describe('dashboard look', () => {
  it('moves a bracket into the subtitle without losing it', () => {
    expect(splitTitle('HQO', 'HQ Orders (value)')).toEqual({ title: 'HQ Orders', sub: 'Order value by HQ' });
    expect(splitTitle('OTS', 'Orders Trend (value)')).toEqual({ title: 'Orders Trend', sub: 'Order value, day by day' });
    expect(splitTitle('OTS', 'Orders Trend')).toEqual({ title: 'Orders Trend', sub: 'Order value, day by day' });
    expect(splitTitle('ZZ', 'Other (things)')).toEqual({ title: 'Other', sub: 'Things' });
    expect(splitTitle('CV', 'Customer Visits').title).toBe('Customer Visits');
  });
  it('gives daily charts two columns', () => {
    expect(isWide({ kind: 'column', title: '', labels: [], values: [] })).toBe(true);
    expect(isWide({ kind: 'doughnut', title: '', pairs: [['a', 1]] })).toBe(false);
  });
  it('puts customer and doctor visits in one chart where the first of them was', () => {
    expect(combineVisits(['T10D', 'DV', 'OTS', 'CV'])).toEqual(['T10D', 'CDV', 'OTS']);
    expect(combineVisits(['CV', 'OTS'])).toEqual(['CV', 'OTS']);
    expect(isEmpty(visitsSpec(['1'], [0], [null]))).toBe(true);
    expect(isEmpty(visitsSpec(['1'], [0], [3]))).toBe(false);
  });
  it('names the month in full', () => {
    expect(monthTitle('Oct-2026')).toBe('October 2026');
    expect(monthTitle('2026-10')).toBe('2026-10');
  });
  it('builds shades of the theme colour', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(palette('#1370b6', false)[0]).toBe('#1370b6');
  });
});
