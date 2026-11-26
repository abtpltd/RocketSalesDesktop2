import { describe, expect, it } from 'vitest';
import { chartSpec, countValue, toPairs, visibleItems } from './kpi';
import { sampleDashboard } from '../api/mock';

describe('toPairs', () => {
  it('reads JSON text and objects', () => {
    expect(toPairs('{"1":5,"2":"7"}')).toEqual([['1', 5], ['2', 7]]);
    expect(toPairs({ a: 1 })).toEqual([['a', 1]]);
  });
  it('sums nested objects and ignores junk', () => {
    expect(toPairs({ HQ: { a: 1, b: 2 }, X: 'abc', Y: null })).toEqual([['HQ', 3]]);
    expect(toPairs('not json')).toEqual([]);
    expect(toPairs('[1,2]')).toEqual([]);
    expect(toPairs(undefined)).toEqual([]);
  });
});

describe('chartSpec', () => {
  const d = sampleDashboard(true).data;
  it('orders days numerically, not as text', () => {
    const spec = chartSpec('CV', { visitDta: '{"10":1,"2":2,"1":3}' });
    expect(spec.pairs.map((p) => p[0])).toEqual(['1', '2', '10']);
  });
  it('shows names instead of codes when the server sent them', () => {
    expect(chartSpec('T10C', d).pairs[0][0]).toBe('Customer 1');
    expect(chartSpec('T10C', { top10Customer: [['Z9', 5]] }).pairs[0][0]).toBe('Z9');
  });
  it('gives an empty chart for missing data instead of failing', () => {
    expect(chartSpec('OTS', {}).pairs).toEqual([]);
    expect(chartSpec('NOPE', {}).pairs).toEqual([]);
  });
});

describe('visibleItems', () => {
  const p = sampleDashboard(true);
  it('admin: both lists come from the company list', () => {
    const v = visibleItems(p, true);
    expect(v.counts).toContain('AC');
    expect(v.charts).toContain('T10C');
  });
  it('non-admin: count cards come from the role card list only', () => {
    const q = { ...p, layout: { ...p.layout, active_kpis: ['CV', 'AC'], count_cards: ['AO'] } };
    const v = visibleItems(q, false);
    expect(v.counts).toEqual(['AO']);
    expect(v.charts).toEqual(['CV']);
  });
  it('nothing configured shows nothing', () => {
    const q = { ...p, layout: { active_kpis: [], count_cards: [], chart_cards: [] } };
    expect(visibleItems(q, false)).toEqual({ counts: [], charts: [] });
  });
});

describe('countValue', () => {
  it('shows a dash for missing values and keeps zero', () => {
    expect(countValue({ AC: 0 }, 'AC')).toBe('0');
    expect(countValue({}, 'AC')).toBe('-');
  });
});
