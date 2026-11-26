import { describe, expect, it } from 'vitest';
import type { TimelinePayload } from '../../api/types';
import {
  copyLastMonth, copyLastQty, dayReached, groupSplit, heatKpis, neededPerDay, raiseBy, rankRows, short, targetKpis, timelineKpis, toHeat, tone,
  type AchieveRow,
} from './targetsMath';

const row = (rep: string, pct: number | null, sales: number): AchieveRow => ({ rep, target_n: 100, sales_n: sales, pct, gap: 0, projected: 0, projected_pct: null, status: 'behind', daily: [] });

describe('targets helpers', () => {
  it('ranks, colours and shortens', () => {
    expect(rankRows([row('B', 80, 1), row('A', null, 9), row('C', 120, 5)]).map((r) => r.rep)).toEqual(['C', 'B', 'A']);
    expect([tone(101), tone(85), tone(10), tone(null)]).toEqual(['ok', 'w', 'b', 'b']);
    expect([short(1234567), short(98000), short(12)]).toEqual(['1.23M', '98K', '12']);
    expect(neededPerDay(1000, 400, 30, 20)).toBe(60);
    expect(neededPerDay(1000, 1200, 30, 20)).toBe(0);
    expect(dayReached([100, 500, 1200], 1000)).toBe(3);
    expect(dayReached([100], 1000)).toBeNull();
  });

  it('target entry figures and quick fills only change rows that differ', () => {
    const rows = [{ id: 'A', amount: 1000, sales: 600, last_amount: 900 }, { id: 'B', amount: 0, sales: 50, last_amount: 0 }, { id: 'C', amount: 500, sales: 0, last_amount: 500 }];
    const k = targetKpis(rows, {}, '2026-10', '2026-10-21');
    expect(k).toMatchObject({ team: 1500, achieved: 650, pct: 43, daysLeft: 10, without: ['B'] });
    expect(k.perDay).toBeCloseTo(85);
    expect(targetKpis(rows, {}, '2026-11', '2026-10-21').daysLeft).toBe(30);
    expect(copyLastMonth(rows, { C: { amount: 7 } })).toEqual({ A: { amount: 900 } });
    expect(raiseBy(rows, {}, 10)).toEqual({ A: { amount: 1100 }, C: { amount: 550 } });
  });

  it('itemized group split and last month copy', () => {
    const items = [{ id: 'P1', group: 'Anti', price: 10, qty: 5 }, { id: 'P2', group: 'Anti', price: 2, qty: 5, last_qty: 3 }, { id: 'P3', group: 'Pain', price: 1, qty: 0, last_qty: 4 }];
    expect(groupSplit(items, { P3: { qty: 10 } })).toEqual([{ group: 'Anti', value: 60 }, { group: 'Pain', value: 10 }]);
    expect(copyLastQty(items, {})).toEqual({ P1: { qty: 0 }, P2: { qty: 3 }, P3: { qty: 4 } });
  });

  it('performance heat map from the server rows (days down, reps across) turned around', () => {
    const h = toHeat([{ key: 'date', title: 'Date' }, { key: 'r0', title: 'Ann' }, { key: 'r1', title: 'Bo' }],
      [{ date: '20-10-2026', r0: 10, r1: 0 }, { date: '21-10-2026', r0: 5, r1: 30 }]);
    expect(h.reps).toEqual(['Ann', 'Bo']);
    expect(h.cells).toEqual([[10, 5], [0, 30]]);
    expect(h.dayTotals).toEqual([10, 35]);
    expect(heatKpis(h)).toEqual({ total: 45, bestDay: 1, top: 1, everyDay: ['Ann'], zero: 1 });
  });

  it('visit timeline figures', () => {
    const v = (s: number, e: number) => ({ client: 'x', start: '', end: '', s, e, minutes: e - s, kind: 'customer', amount: 0, history: [] });
    const p = { timeline: { days: [{ date: '2026-10-20', reps: [{ name: 'A', code: 'A', start: '', last_visit: '', day_end: '', start_m: 480, last_m: 0, end_m: 0,
      visits: [v(500, 520), v(530, 560), v(700, 710)], count: 3, percent: 50, orders: 0 }] }] } } as unknown as TimelinePayload;
    expect(timelineKpis(p)).toEqual({ visits: 3, minutes: 60, avgVisit: 20, workPct: 50, firstVisit: '08:00', gaps: 1, repDays: 1 });
  });
});
