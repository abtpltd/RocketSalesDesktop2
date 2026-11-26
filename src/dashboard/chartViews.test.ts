import { describe, expect, it } from 'vitest';
import { kasOption, type KasSpec } from './KasChart';
import { PAIR_VIEWS, SERIES_VIEWS, shape, startView, tableOf, filterSpec, NO_FILTER } from './views';
import { parseView } from './savedView';
import { priorLines } from './compare';

const days: KasSpec = { kind: 'multi', title: 'Visits', labels: ['1', '2', '3', '4'],
  series: [{ name: 'Customers', values: [10, 0, 5, null], prior: [8, 8, 8, 8] }, { name: 'Doctors', values: [30, 10, 5, null], prior: [4, 4, 4, 4] }] };
const one: KasSpec = { kind: 'column', title: 'Orders', labels: ['1', '2', '3'], values: [1, 2, 3], prior: [3, 2, 1] };
const rank: KasSpec = { kind: 'hbar', title: 'Top', pairs: [['A', 50], ['B', 30], ['C', 15], ['D', 5]] };

describe('every chart type builds', () => {
  for (const s of [days, one]) {
    for (const o of SERIES_VIEWS) {
      it(`${s.kind} as ${o.value} (all extras on)`, () => {
        const v = { ...startView(s), view: o.value, values: true, avg: true, prior: true, colors: 'ocean' };
        const shaped = shape(s, v);
        if (o.value === 'table') { expect(shaped).toBeNull(); return; }
        const opt = kasOption(shaped!, '#1370b6', false) as { series: unknown[] };
        expect(opt.series.length).toBeGreaterThan(0);
      });
    }
  }
  for (const o of PAIR_VIEWS) {
    it(`ranking as ${o.value}`, () => {
      const v = { ...startView(rank), view: o.value, values: true, avg: true, colors: 'sunset' };
      const shaped = shape(rank, v);
      if (o.value === 'table') { expect(shaped).toBeNull(); return; }
      expect(kasOption(shaped!, '#1370b6', true)).toBeTruthy();
    });
  }
});

describe('day chart views', () => {
  const v = (view: string, extra = {}) => ({ ...startView(days), view, ...extra });
  it('100% stacked shows each day as shares', () => {
    const s = shape(days, v('percent')) as Extract<KasSpec, { kind: 'multi' }>;
    expect(s.mode).toBe('percent');
    expect(s.series[0].values).toEqual([25, 0, 50, null]);
    expect(s.series[1].values).toEqual([75, 100, 50, null]);
  });
  it('last month is drawn dotted behind, only when asked, and only on views where it reads clearly', () => {
    expect((shape(days, v('column')) as { series: unknown[] }).series).toHaveLength(2);
    const on = shape(days, v('column', { prior: true })) as Extract<KasSpec, { kind: 'multi' }>;
    expect(on.series.map((x) => x.name)).toEqual(['Customers', 'Doctors', 'Customers (last month)', 'Doctors (last month)']);
    expect(on.series[2].dashed).toBe(true);
    const pctOn = shape(days, v('percent', { prior: true })) as Extract<KasSpec, { kind: 'multi' }>;
    expect(pctOn.series).toHaveLength(2);
  });
  it('a single series with last month becomes a two-line chart', () => {
    const s = shape(one, { ...startView(one), view: 'column', prior: true }) as Extract<KasSpec, { kind: 'multi' }>;
    expect(s.kind).toBe('multi');
    expect(s.series[1].values).toEqual([3, 2, 1]);
  });
  it('the table never includes last month', () => {
    expect(tableOf(days, { ...v('table'), prior: true }).columns).toEqual(['', 'Customers', 'Doctors']);
  });
  it('picking days keeps last month lined up', () => {
    const out = filterSpec(days, { ...NO_FILTER, days: 'custom', from: 2, to: 3 }, 4) as Extract<KasSpec, { kind: 'multi' }>;
    expect(out.series[0].prior).toEqual([8, 8]);
  });
});

describe('saved views and last month data', () => {
  it('new view fields survive, damaged ones are dropped', () => {
    const good = { view: 'heat', top: 0, sort: 'value', byWeek: false, running: false, hidden: [], values: true, avg: false, colors: 'forest' };
    expect(parseView({ v: 1, views: { CDV: good, X: { ...good, values: 'yes' } } }).views).toEqual({ CDV: good });
  });
  it('last month lines up day by day', () => {
    const p = { month: 'Sep-2026', visitDta: { '1': 4, '30': 9 }, doctorVisitDta: {}, orderDta: {} } as never;
    const out = priorLines(p, ['1', '2', '30', '31'])!;
    expect(out.customer).toEqual([4, 0, 9, null]); // September has no day 31
    expect(priorLines(undefined, ['1'])).toBeNull();
  });
});
