import type { ProdLever, ProdLeverKey, ProdMissingRow, ProdRow, ProductivityPayload } from './types';

// Sample Rep Productivity data for `npm run dev:mock`.
const REPS = [
  { name: 'Ann Wanjiru', code: 'R01', calls: 780, productive: 546, lines: 2730, sales: 109200 },
  { name: 'Brian Otieno', code: 'R02', calls: 650, productive: 520, lines: 3640, sales: 145600 },
  { name: 'Cate Mwangi', code: 'R03', calls: 420, productive: 210, lines: 640, sales: 21000 },
  { name: 'Dan Kiprop', code: 'R04', calls: 300, productive: 285, lines: 570, sales: 11400 },
];

const figures = (calls: number, productive: number, lines: number, sales: number) => ({
  calls, doctor_calls: 0, productive, orders: productive, order_days: productive, lines, sales,
  strike: Math.round((productive * 1000) / calls) / 10, lpc: Math.round((lines * 10) / productive) / 10, vpl: Math.round((sales * 10) / lines) / 10,
  aov: Math.round((sales * 10) / productive) / 10,
});

export function sampleProductivity(month: string): ProductivityPayload {
  const total = figures(2150, 1561, 7580, 287200);
  const avg = { calls: total.calls / REPS.length, strike: total.strike, lpc: total.lpc, vpl: total.vpl };
  const label: Record<ProdLeverKey, string> = { calls: 'Calls', strike: 'Strike rate', lpc: 'Lines per call', vpl: 'Value per line' };
  const rows: ProdRow[] = REPS.map((r) => {
    const f = figures(r.calls, r.productive, r.lines, r.sales);
    const levers: ProdLever[] = (['calls', 'strike', 'lpc', 'vpl'] as const).map((k) => {
      const value = f[k] as number, team = avg[k] as number, ratio = Math.round((value / team) * 1000) / 1000;
      return { key: k, label: label[k], value, team: Math.round(team * 100) / 100, ratio, gain: ratio < 1 ? Math.round(f.sales * (1 / ratio - 1)) : 0 };
    });
    const best = [...levers].sort((a, b) => b.gain - a.gain)[0];
    return { ...f, key: r.code, rep: r.name, code: r.code, levers, weakest: best.gain > 0 ? best.key : '',
      change: { sales: 8.2, calls: -2, lpc: 3.1, vpl: 0.5, aov: 1, strike: 1.5 } };
  });
  return {
    report: 'rep_productivity', title: 'Rep Productivity', path: '/Report/RepProductivity', kind: 'reps', month, from: `${month}-01`, to: `${month}-01`,
    page: 1, size: rows.length, total: rows.length, rows, totals: total, previous: total, reps_with_calls: rows.length,
    change: { sales: 6.4, calls: 1.2, lpc: 2.5, vpl: 0.8, aov: 1, strike: 1.1 },
    what_if: [{ key: 'strike', label: 'Strike rate +5 points', gain: 18400 }, { key: 'lpc', label: 'One more line per call', gain: 37900 }],
    traps: [
      { rep: 'Dan Kiprop', code: 'R04', trap: 'easy_outlets', title: 'High strike rate with few calls: the easy outlets may be the only ones visited.', detail: 'Strike rate 95% on 300 calls (team 73% on 538 calls each).' },
      { rep: 'Dan Kiprop', code: 'R04', trap: 'thin_baskets', title: 'Lines per call is good but value per line is low: lines may be small or slow-moving products.', detail: 'LPC 2.0 (team 4.9) but value per line 20 (team 38).' },
      { rep: 'Cate Mwangi', code: 'R03', trap: 'key_outlets', title: 'Best outlets not visited this month.', detail: '3 of 8 best outlets not visited: Aga Khan, Karen Chemist, Mater.' },
    ],
  };
}

export function sampleMissing(): ProductivityPayload<ProdMissingRow> {
  const rows: ProdMissingRow[] = [
    { key: 'C001', customer: 'Alpha Chemist', code: 'C001', rep: 'Ann Wanjiru', last_order: '2026-10-20', usual_missing: 2, must_missing: 1,
      items: [{ code: 'P0003', name: 'Sample product C', kind: 'must_sell' }, { code: 'P0001', name: 'Sample product A', kind: 'usual' }, { code: 'P0002', name: 'Sample product B', kind: 'usual' }],
      summary: 'Sample product C, Sample product A, Sample product B' },
    { key: 'C002', customer: 'Beta Pharmacy', code: 'C002', rep: 'Brian Otieno', last_order: '2026-10-12', usual_missing: 1, must_missing: 0,
      items: [{ code: 'P0002', name: 'Sample product B', kind: 'usual' }], summary: 'Sample product B' },
  ];
  return { report: 'rep_productivity', title: 'Rep Productivity', path: '/Report/RepProductivity', kind: 'missing', month: '', from: '', to: '', page: 1, size: 2, total: 2, rows,
    must_sell_count: 1, recent_days: 30, usual_days: 60, window_to: '2026-10-29' };
}
