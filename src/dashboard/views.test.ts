import { describe, expect, it } from 'vitest';
import { byWeek, running, shape, shapePairs, startView, tableOf, tsv, filterSpec, NO_FILTER } from './views';

describe('dashboard views', () => {
  const pairs: [string, number][] = [['B', 5], ['A', 9], ['C', 1], ['D', 2]];
  it('top N with the rest added up, sorted by value or name', () => {
    const v = { ...startView({ kind: 'hbar', title: 't', pairs }), top: 2 };
    expect(shapePairs(pairs, v)).toEqual([['A', 9], ['B', 5], ['Others (2)', 3]]);
    expect(shapePairs(pairs, { ...v, top: 0, sort: 'name' }).map((p) => p[0])).toEqual(['A', 'B', 'C', 'D']);
    // picked items only, in the sort order, no Others; top is not used
    expect(shapePairs(pairs, { ...v, pick: ['D', 'A', 'gone'] })).toEqual([['A', 9], ['D', 2]]);
  });
  it('weeks, running totals and series on and off', () => {
    const labels = Array.from({ length: 10 }, (_, i) => String(i + 1));
    expect(byWeek(labels, [1, 1, 1, 1, 1, 1, 1, 2, null, null])).toEqual({ labels: ['1-7', '8-10'], values: [7, 2] });
    expect(running([1, null, 2, 3])).toEqual([1, null, 3, 6]);
    const multi = { kind: 'multi' as const, title: 'Visits', labels: ['1', '2'], series: [{ name: 'Customers', values: [1, 2] }, { name: 'Doctors', values: [3, 4] }] };
    const one = shape(multi, { ...startView(multi), hidden: ['Doctors'], running: true });
    expect(one).toEqual({ kind: 'column', title: 'Visits', labels: ['1', '2'], values: [1, 3] });
    expect(shape(multi, { ...startView(multi), view: 'table' })).toBeNull();
    expect(tsv(tableOf(multi, startView(multi)))).toBe('\tCustomers\tDoctors\n1\t1\t3\n2\t2\t4');
  });
});

describe('dashboard filter', () => {
  const days = { kind: 'multi' as const, title: 'V', labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], series: [{ name: 'C', values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }] };
  const top = { kind: 'hbar' as const, title: 'T', pairs: [['City Lab', 5], ['Goodlife', 3]] as [string, number][] };
  it('keeps the chosen days and the matching names', () => {
    expect((filterSpec(days, { days: 'last7', find: '' }, 9) as typeof days).labels).toEqual(['3', '4', '5', '6', '7', '8', '9']);
    expect((filterSpec(days, { days: 'custom', from: 2, to: 3, find: '' }, 9) as typeof days).series[0].values).toEqual([2, 3]);
    expect(filterSpec(days, { days: 'custom', from: 5, to: 2, find: '' }, 9)).toBe(days);
    expect((filterSpec(top, { days: 'month', find: 'city' }, 9) as typeof top).pairs).toEqual([['City Lab', 5]]);
    expect(filterSpec(top, NO_FILTER, 9)).toBe(top);
  });
});

describe('long rankings', () => {
  it('open on the top 15', () => {
    const many: [string, number][] = Array.from({ length: 30 }, (_, i) => [`S${i}`, 30 - i]);
    expect(startView({ kind: 'hbar', title: 't', pairs: many }).top).toBe(15);
    expect(startView({ kind: 'hbar', title: 't', pairs: many.slice(0, 20) }).top).toBe(0);
  });
});
