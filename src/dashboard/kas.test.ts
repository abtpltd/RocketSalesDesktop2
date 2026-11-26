import { describe, expect, it } from 'vitest';
import { arrange, average, chartPairs, coverage, kasTables, missed, orderAvg, trend, type KasData } from './kas';

describe('KAS dashboard', () => {
  it('shows and orders cards like the page (sequence ids moved to the end)', () => {
    const ids = ['CV', 'DV', 'T10D', 'OTS'];
    expect(arrange(ids, ['OTS', 'CV'], [], true)).toEqual(['DV', 'T10D', 'OTS', 'CV']);
    expect(arrange(ids, ['OTS', 'CV'], ['CV', 'T10D'], false)).toEqual(['T10D', 'CV']);
  });
  it('builds the daily lines with empty days after today', () => {
    const d: KasData = { visitDta: '{"1": 5, "2": "7", "4": 1}', doctorVisitDta: '{"1": 2}', orderDta: '{"2": 300}', days_in_month: 5, end_day: 2 };
    const t = trend(d);
    expect(t.labels).toEqual(['1', '2', '3', '4', '5']);
    expect(t.customer).toEqual([5, 7, 0, null, null]);
    expect(t.doctor).toEqual([2, null, 0, null, null]);
    expect(t.order).toEqual([null, 300, 0, null, null]);
  });
  it('makes chart pairs like the web renderers', () => {
    const d: KasData = {
      top10Doctor: [['D1', 4], ['D9', 3]], doctorCodeName: { D1: 'Dr A' },
      top10Customer: [['C1', 12.7]], customerCodeName: { C1: 'Chemist' },
      top10Product: [['P1', 5.5], ['P2', 1]], productCodeName: { P1: 'Syrup' }, hqAmt: '{"NBI": "1200.9"}',
    };
    expect(chartPairs('T10D', d)).toEqual([['Dr A', 4]]);
    expect(chartPairs('T10C', d)).toEqual([['Chemist', 12]]);
    expect(chartPairs('T10P', d)).toEqual([['Syrup', 5.5], ['P2', 1]]);
    expect(chartPairs('HQO', d)).toEqual([['NBI', 1200]]);
  });
  it('works out the KPI table figures like the script', () => {
    expect(average(7, 3)).toBe('2.3'); expect(average(7, 0)).toBe('0.0'); expect(orderAvg(5, 2)).toBe('2.5');
    expect(coverage(3, 4, 'Ann', {})).toBe(75);
    expect(coverage(3, 0, 'Ann', { Ann: 2 })).toBe(100);
    expect(coverage(1, 0, 'Bob', {})).toBe(0);
    expect(coverage(1, 3, 'Ann', {})).toBe(33.33);
    expect(missed(3, 0, 'Ann', { Ann: 10 })).toBe(7);
    expect(missed(5, 4, 'Ann', {})).toBe(0);
    const t = kasTables({
      repDtaArray: [
        { c: 'R2', n: 'Zed', appCategory: 'SALES PHARMA', days: 2, doctorUniqueVisit: 4, hospitalUniqueVisit: 1, pharmacyUniqueVisit: 1, doctorUniquePlan: 0, orderCount: 3, orderAmt: 1000, orderItems: 7 },
        { c: 'R1', n: 'Ann', appCategory: 'SALES PHARMA', days: 0 },
        { c: 'R3', n: 'Eng', appCategory: 'ENGINEER', days: 4, hospitalUniqueVisit: 2, jobsCount: 6 },
      ],
      repCounts: { DOCTOR: { Zed: 8 } },
    });
    const sph = t.find((x) => x.id === 'SPH')!;
    expect(sph.rows.map((r) => r.mr)).toEqual(['Ann (R1)', 'Zed (R2)']);
    expect(sph.rows[1]).toMatchObject({ sr: 2, dAvg: '2.0', vAvg: '3.0', dCov: '50%', drop: 333.33, items: '2.3', dMiss: 4, oDay: '1.5' });
    expect(t.find((x) => x.id === 'ENGI')!.rows[0]).toMatchObject({ hAvg: '0.5', jobs: 6 });
  });
});
