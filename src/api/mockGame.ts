import type { GameBoardPayload, GameMonthPayload, GameRep, GameRulesPayload } from './types';

// Sample gamification data for `npm run dev:mock`.
const REPS: [string, string, string, string][] = [
  ['Germana Leiya', 'M16', 'Anubhav Singh', 'North'], ['Bakari Ally', 'M18', 'Arun Bose', 'Coast'], ['Amin Baraka', 'M29', 'Arun Bose', 'Coast'],
  ['Julius Limbu', 'M23', 'Anubhav Singh', 'Lake'], ['Mariam Hija', 'M30', 'Rahul Ghodke', 'North'], ['Claudian Deograthias', 'M05', 'Arun Bose', 'Lake'],
  ['John Massinga', 'M26', 'Anubhav Singh', 'Central'], ['Titos Tovele', 'M02', 'Arun Bose', 'Central'], ['Kas Medics Jennifer', 'M19', 'Anubhav Singh', 'North'],
  ['Raphael Wekesa', 'M41', 'Rahul Ghodke', 'Western'], ['Esther Atieno', 'M12', 'Rahul Ghodke', 'Western'], ['Peter Njoroge', 'M44', 'Rahul Ghodke', 'Central'],
];
const ACTS = ['Battery 95% or above', 'Customer', 'Geotag', 'Visit', 'DU Track', 'Availability', 'Feedback', 'Goods Return', 'Van Collection', 'Payment', 'StockTake', 'Survey', 'Expiry', 'Competitor Stock', 'Order', 'Sales'];
const val = (i: number, j: number, m: number) => Math.max(0, Math.round((((i * 37 + j * 91 + i * j * 13 + m * 7) % 60) + ([3, 14, 15].includes(j) ? 40 : 4)) * (1.25 - i * 0.07)));

export function sampleBoard(month: string): GameBoardPayload {
  const m = Number(month.slice(5, 7)) || 10;
  const rank = (mm: number) => REPS.map((r, i) => ({ r, i, acts: ACTS.map((t, j) => ({ title: t, points: i === 11 ? 0 : val(i, j, mm) })) }))
    .map((x) => ({ ...x, score: x.acts.reduce((a, b) => a + b.points, 0) })).sort((a, b) => b.score - a.score);
  const now = rank(m); const before = new Map(rank(m - 1).map((x, k) => [x.r[1], k + 1]));
  const rows: GameRep[] = now.map((x, k) => ({ key: x.r[1], code: x.r[1], name: x.r[0], manager: x.r[2], hq: x.r[3], score: x.score, rank: k + 1,
    position: `${k + 1}`, before: before.get(x.r[1]) ?? null, move: before.has(x.r[1]) ? before.get(x.r[1])! - (k + 1) : null, activities: x.acts }));
  const total = rows.reduce((a, r) => a + r.score, 0);
  return { report: 'gamification', title: 'Gamification', path: '/master/Gamification', kind: 'board', month, from: `${month}-01`, to: `${month}-01`,
    columns: [], rows: rows as never, total: rows.length, page: 1, size: rows.length,
    stats: { reps: rows.length, points: total, average: Math.round(total / rows.length), top: rows[0].score, leader: rows[0].name,
      best_activity: 'Visit', best_share: 34, has_before: true } } as unknown as GameBoardPayload;
}

const COLS: [string, string][] = [['battery', 'Battery 95%+'], ['customer', 'New customer'], ['geotag', 'Geotag'], ['visit', 'Visit'], ['sales', 'Sales'], ['order', 'Order'],
  ['du', 'Duty tracking'], ['avail', 'Availability'], ['feedback', 'Feedback'], ['gr', 'Goods return'], ['col', 'Sales collection'], ['pay', 'Payment'],
  ['stock', 'Stock take'], ['survey', 'Survey'], ['expiry', 'Expiry'], ['comp', 'Competitor stock'], ['start', 'Start day'], ['end', 'End day'],
  ['target', 'Target visits'], ['gift', 'Gift'], ['detailing', 'Detailing'], ['tagmail', 'Geotag verified by email'], ['otp', 'Customer OTP verify']];

export function sampleMonth(month: string): GameMonthPayload {
  const groups = ['PHARMACY', 'HOSPITAL'];
  const rows = REPS.slice(0, 11).map(([n, c, mg], i) => {
    const r: Record<string, string | number> = { key: c, rep: n, code: c, manager: mg };
    COLS.forEach(([k], j) => { r[k] = j > 18 ? (i + j) % 4 : val(i, j, 10) % 70; });
    groups.forEach((g, j) => { r[`g:${g}`] = (i * 3 + j * 5) % 20; });
    r.total = Object.entries(r).filter(([k]) => !['key', 'rep', 'code', 'manager'].includes(k)).reduce((a, [, v]) => a + Number(v), 0);
    return r;
  });
  return { report: 'gamification', title: 'Gamification', path: '/master/Gamification', kind: 'month', month, groups, from: `${month}-01`, to: `${month}-01`,
    columns: [{ key: 'rep', title: 'Rep' }, { key: 'code', title: 'Code' }, ...COLS.map(([key, title]) => ({ key, title })), ...groups.map((g) => ({ key: `g:${g}`, title: `Visit ${g}` })), { key: 'total', title: 'Total' }],
    rows: rows as never, total: rows.length, page: 1, size: rows.length } as unknown as GameMonthPayload;
}

export function sampleRules(): GameRulesPayload {
  const R: [string, string, string, boolean?][] = [['startDay', 'Start day', 'discipline'], ['endDay', 'End day', 'discipline'], ['fullBatteryAtnd', 'Battery 95% or more at attendance', 'discipline'],
    ['duTrack', 'Duty tracking', 'discipline'], ['visit', 'Visit', 'visits'], ['visitPicture', 'Visit picture', 'visits'], ['targetVisits', "Reaching the day's target visits", 'visits'],
    ['geotag', 'Geotag a customer', 'visits'], ['tagVerifyByEmail', 'Geotag verified by email', 'visits'], ['order', 'Order', 'selling'], ['sales', 'Sales', 'selling'],
    ['orderAmtPointDenomitor', 'Order amount per extra point', 'selling', true], ['salesAmtPointDenomitor', 'Sales amount per extra point', 'selling', true],
    ['feedback', 'Feedback', 'care'], ['avail', 'Availability', 'care'], ['stockTake', 'Stock take', 'care'], ['survey', 'Survey', 'care'], ['expiry', 'Expiry', 'care'],
    ['compStock', 'Competitor stock', 'care'], ['goodsReturn', 'Goods return', 'care'], ['salesCollection', 'Sales collection', 'collections'],
    ['paymentColc', 'Payment collection', 'collections'], ['addCustomer', 'New customer', 'growth'], ['addPreCustomer', 'Customer request', 'growth'],
    ['customerOtpVerify', 'Customer OTP verify (also gift and detailing)', 'growth']];
  const v = [2, 1, 2, 1, 5, 2, 10, 3, 3, 5, 5, 1000, 1000, 2, 2, 2, 4, 1, 2, 1, 3, 3, 10, 5, 2];
  return { name: 'gamification_rules', title: 'Points rules', base: 'g1', group_wise: true,
    values: Object.fromEntries(R.map(([f], i) => [f, v[i]])), groups: [{ name: 'PHARMACY', points: 5 }, { name: 'HOSPITAL', points: 8 }, { name: 'CLINIC', points: 6 }, { name: 'WHOLESALE', points: 0 }],
    rules: R.map(([field, label, group, amount]) => ({ field, label, group, amount: !!amount })) };
}
