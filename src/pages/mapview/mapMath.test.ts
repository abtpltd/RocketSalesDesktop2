import { describe, expect, it } from 'vitest';
import { metres, verdictText, coverage, groups, inTrail, nextLevel, pinTone, targetPct, toPoints, tone, totals, type MapPayload } from './mapMath';

const P: MapPayload = {
  report: 'map_view', title: 'Map View', kind: 'customers', fields: [], month: '2026-10-01', today: '2026-10-25', from: '2026-10-01', to: '2026-10-25',
  targets: { Ann: 1000, Ben: 500 }, rep_sales: { Ann: 1100, Ben: 300 },
  points: [
    ['C1', 'Afya', 'Nairobi', 'CBD', 'Ann', -1, 36, 600, 2, 3, '2026-10-20'],
    ['C2', 'Bora', 'Nairobi', 'CBD', 'Ann', -1.2, 36.2, 400, 1, 0, '2026-09-01'],
    ['C3', 'Cure', 'Nairobi', 'Westlands', 'Ann', null, null, 0, 0, 1, ''],
    ['C4', 'Duka', 'Mombasa', '', 'Ben', -4, 39.6, 300, 1, 1, '2026-10-10'],
  ],
};

describe('map view figures', () => {
  const pts = toPoints(P);
  it('reads rows, days since the last visit, and names missing HQ / area', () => {
    expect(pts[0].days).toBe(5);
    expect(pts[2].days).toBeNull();
    expect(pts[3].area).toBe('(not set)');
  });
  it('adds up per HQ with the centre of the located customers and rep targets counted once', () => {
    const g = groups(pts, 'hq', P.targets, P.rep_sales);
    const nb = g.find((x) => x.name === 'Nairobi')!;
    expect(nb).toMatchObject({ count: 3, located: 2, value: 1000, visits: 4, visited: 2, stale: 2, target: 1000, sales: 1100 });
    expect(nb.lat).toBeCloseTo(-1.1);
    expect(targetPct(nb)).toBeCloseTo(110);
    expect(coverage(nb)).toBeCloseTo(66.67, 1);
    expect(tone(nb, 'value')).toBe('ok');
    expect(tone(nb, 'visits')).toBe('mid');
    const mb = g.find((x) => x.name === 'Mombasa')!;
    expect(targetPct(mb)).toBe(60);
    expect(tone(mb, 'target')).toBe('low');
  });
  it('drills: next level and which customers are in the trail', () => {
    expect(nextLevel([])).toBe('hq');
    expect(nextLevel([{ level: 'hq', name: 'Nairobi' }, { level: 'area', name: 'CBD' }])).toBe('rep');
    expect(nextLevel([{ level: 'hq', name: 'N' }, { level: 'area', name: 'C' }, { level: 'rep', name: 'Ann' }])).toBeNull();
    expect(pts.filter((p) => inTrail(p, [{ level: 'area', name: 'CBD' }])).map((p) => p.code)).toEqual(['C1', 'C2']);
  });
  it('pins by days since the last visit; totals', () => {
    expect(pts.map(pinTone)).toEqual(['ok', 'low', 'low', 'mid']);
    expect(totals(pts, P.targets, P.rep_sales)).toMatchObject({ count: 4, located: 3, value: 1300, visited: 3, stale: 2 });
    expect(totals(pts, P.targets, P.rep_sales).targetPct).toBeCloseTo(93.33, 1);
  });
});

describe('tag check wording', () => {
  it('shows distances', () => { expect(metres(35.4)).toBe('35 m'); expect(metres(4200)).toBe('4.2 km'); expect(metres(null)).toBe('no location'); });
  it('judges from the verdict', () => {
    expect(verdictText({ verdict: 'far', far: 3, visits: [{ away_m: 900 }, { away_m: 800 }, { away_m: 700 }, { away_m: 5 }] as never }).tone).toBe('bad');
    expect(verdictText({ verdict: 'ok', far: 0, visits: [{ away_m: 5 }] as never }).text).toBe('The visit was made close to the tag.');
  });
});
