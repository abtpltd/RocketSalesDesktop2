import { describe, expect, it } from 'vitest';
import { ask, readMods } from './engine';
import { facts } from './skills';
import { distance, same } from './text';
import type { AssistantSettings } from '../api/types';
import type { Copy, Loader, Row } from './types';

const S: AssistantSettings = { enabled: true, roles: [], pinned: [], lo: 50, hi: 80, late: '09:30', stale_days: 30, bad_days: 60, expiry_months: 3, morning_summary: true, voice: false, ai_mode: 'off' };
const TODAY = new Date(2026, 9, 28); // Wed 28 Oct 2026
const att = (date: string, rep: string, ap: string, start: string, c: number, d: number, target = 10): Row =>
  ({ key: `${date}${rep}`, date, rep, ap, half_day: '', start_day: start, customer_visits: c, doctor_visits: d, target });
const ATT: Row[] = [
  att('26-10-2026', 'Ann Wanjiru', 'P', '08:05AM(95%)', 8, 2), att('26-10-2026', 'Brian Otieno', 'P', '10:20AM(80%)', 2, 1),
  att('26-10-2026', 'Carol Mwangi', 'A', '', 0, 0), att('27-10-2026', 'Ann Wanjiru', 'P', '08:10AM(90%)', 7, 2),
  att('27-10-2026', 'Brian Otieno', 'P', '09:00AM(90%)', 3, 1), att('27-10-2026', 'Carol Mwangi', 'A', '', 0, 0),
  att('01-09-2026', 'Ann Wanjiru', 'P', '08:00AM(90%)', 1, 0),
];
const copy = (report: string, rows: Row[], from = '2026-10-01', to = '2026-10-26', total = rows.length): Copy => ({ report, rows, total, from, to, savedAt: 1_792_000_000 });
const loader = (data: Record<string, Copy[]>): Loader => async (r) => data[r] ?? [];
const FULL: Record<string, Copy[]> = {
  attendance: [copy('attendance', ATT)],
  last_activity: [copy('last_activity', [
    { code: 'C1', name: 'Lakeview Pharmacy', hq: 'Kisumu', area: 'Kisumu', rep: 'Ann Wanjiru', last_visit: '14 Jul, 2026' },
    { code: 'C2', name: 'Dala Chemist', hq: 'Kisumu', area: 'Kisumu', rep: 'Brian Otieno', last_visit: '20 Oct, 2026' },
    { code: 'C3', name: 'Mumias Stores', hq: 'Mumias', area: 'Mumias', rep: 'Ann Wanjiru', last_visit: '' },
  ], '', '')],
  expiry: [copy('expiry', [{ key: 'e1', date: '10-10-2026', rep: 'Ann Wanjiru', customer: 'Dala Chemist', product: 'Amoxil', expiry: '12-2026', qty: '4' }, { key: 'e2', date: '10-10-2026', rep: 'Ann Wanjiru', customer: 'Dala Chemist', product: 'Zinc', expiry: '09-2026', qty: '2' }, { key: 'e3', date: '10-10-2026', rep: 'x', customer: 'y', product: 'Far', expiry: '05-2028', qty: '1' }])],
  customer_ageing: [copy('customer_ageing', [{ code: 'C1', name: 'Lakeview', hq: 'Kisumu', area: 'Kisumu', sm: 'Ann', d60: '500', d61: '1,200' }, { code: 'C2', name: 'Dala', hq: 'x', area: 'x', sm: 'Ann', d60: '', d61: '' }])],
  target_vs_sales: [copy('target_vs_sales', [{ rep: 'Ann Wanjiru', target: '1,000', sales: '900' }, { rep: 'Brian Otieno', target: '1,000', sales: '300' }, { rep: 'Carol Mwangi', target: '1,000', sales: '100' }], '2026-10-01', '2026-10-31')],
};
const run = (question: string, data = FULL, ctx = null as never) => ask({ question, settings: S, load: loader(data), today: TODAY, ctx });

describe('reading the wording', () => {
  it('forgives small slips and longer word forms', () => {
    expect(distance('atendance', 'attendance')).toBe(1);
    expect(same('atendance', 'attendance')).toBe(true);
    expect(same('visited', 'visit')).toBe(true);
    expect(same('late', 'later')).toBe(false);
  });
  it('reads days, months, top N, percentages and periods', () => {
    expect(readMods('not visited for 60 days in Kisumu').days).toBe(60);
    expect(readMods('expiring in 6 months')).toMatchObject({ months: 6, days: 180 });
    expect(readMods('top five reps by sales').top).toBe(5);
    expect(readMods('below 40% this week')).toMatchObject({ pct: 40, period: 'week' });
    expect(readMods('compare with last month').period).toBe('lastmonth');
  });
});

describe('answers from saved copies', () => {
  it('reps below visit target this week', async () => {
    const a = await run('Which reps are below 50% of visit target this week?');
    expect(a.text).toMatch(/1 of 2 reps are below 50%/);
    expect(a.table!.rows[0]).toMatchObject({ rep: 'Brian Otieno', visits: 7, target: 20, share: '35%' });
    expect(a.table!.tones[0]).toBe('bad');
    expect(a.source).toMatch(/^Attendance, saved/);
    expect(a.actions.some((x) => x.kind === 'open')).toBe(true);
  });
  it('late starters, absences', async () => {
    const late = await run('late starters this week');
    expect(late.text).toMatch(/^1 late start after 09:30/);
    expect(late.table!.rows[0]).toMatchObject({ rep: 'Brian Otieno', start: '10:20AM' });
    const gone = await run('Who was absent this week?');
    expect(gone.table!.rows[0]).toMatchObject({ rep: 'Carol Mwangi', days: 2 });
    expect((await run('absent yesterday?')).text).toMatch(/No absences|\d absence/);
  });
  it('battery at start of day', async () => {
    const a = await run('who started with low battery this week');
    expect(a.text).toMatch(/battery|95%/);
  });
  it('a person named in the question narrows the answer, and a bare name gives their summary', async () => {
    const a = await run('late starters for Brian this week');
    expect(a.text).toMatch(/for Brian Otieno/);
    expect(a.ctx!.mods.rep).toBe('Brian Otieno');
    const who = await run('how is Ann doing');
    expect(who.text).toMatch(/^Ann Wanjiru/);
    expect(who.lines!.some((l) => /Sales: 900 of 1,000/.test(l.text))).toBe(true);
  });
  it('customers not visited, by area and days; never visited counts', async () => {
    const a = await run('customers in Kisumu not visited for 60 days');
    expect(a.table!.rows.map((r) => r.name)).toEqual(['Lakeview Pharmacy']);
    expect(a.actions[0]).toMatchObject({ kind: 'open', target: { search: 'Kisumu' } });
    const all = await run('customers never visited');
    expect(all.table!.rows.map((r) => r.name)).toEqual(['Mumias Stores', 'Lakeview Pharmacy']);
    expect(all.table!.rows[0].last).toBe('Never');
  });
  it('expiry and ageing', async () => {
    const e = await run('products expiring in 3 months');
    expect(e.table!.rows.map((r) => r.product)).toEqual(['Zinc', 'Amoxil']);
    expect(e.text).toMatch(/1 already expired/);
    const g = await run('overdue ageing over 60 days');
    expect(g.text).toMatch(/1 customer has amounts over 60 days, 1,200 in all/);
  });
  it('sales against target, rankings, why behind, compare', async () => {
    const t = await run('Who is behind on sales target?');
    expect(t.text).toMatch(/2 of 3 reps are below 80%/);
    const top = await run('top 2 reps by sales');
    expect(top.bars!.map((b) => b.label)).toEqual(['Ann Wanjiru', 'Brian Otieno']);
    const topVisits = await run('best reps on visits this week');
    expect(topVisits.bars![0].label).toBe('Ann Wanjiru');
    const why = await run('Why are we behind on sales target?');
    expect(why.text).toMatch(/short of target across 3 reps/);
    expect(why.lines![0].text).toMatch(/Brian Otieno/);
    const cmp = await run('compare sales this month vs last month');
    expect(cmp.actions[0]).toMatchObject({ kind: 'fetch', report: 'target_vs_sales', from: '2026-09-01', to: '2026-09-30' });
    const two = { ...FULL, target_vs_sales: [...FULL.target_vs_sales, copy('target_vs_sales', [{ rep: 'Ann Wanjiru', target: '1,000', sales: '1,000' }, { rep: 'Brian Otieno', target: '1,000', sales: '900' }], '2026-09-01', '2026-09-30')] };
    const done = await run('compare sales this month vs last month', two);
    expect(done.text).toMatch(/down 32%/);
    expect(done.bars![0]).toMatchObject({ label: 'Brian Otieno', tone: 'bad' });
  });
});

describe('leave and days still to come', () => {
  it('leave is not an absence and does not count against the visit target; future days are ignored', async () => {
    const rows = [...ATT, att('27-10-2026', 'Dina Odhiambo', 'L', '', 0, 0), att('30-10-2026', 'Carol Mwangi', 'A', '', 0, 0), att('29-10-2026', 'Brian Otieno', 'A', '', 0, 0)];
    const data = { ...FULL, attendance: [copy('attendance', rows)] };
    const gone = await run('who was absent this month', data);
    expect(gone.table!.rows.map((r) => [r.rep, r.days])).toEqual([['Carol Mwangi', 2]]);
    const low = await run('reps below target this month', data);
    expect(low.table!.rows.map((r) => r.rep)).toEqual(['Brian Otieno']);
    expect((await run('how is Dina doing this month', data)).lines![0].text).toMatch(/0 days worked, 0 absent/);
  });
});

describe('real-world report quirks', () => {
  it('a customer with several sales people matches any of them; unreadable expiry dates are reported, not hidden', async () => {
    const data = { ...FULL, last_activity: [copy('last_activity', [
      { code: 'C1', name: 'Bulyanhulu', hq: 'DAR', area: 'DAR', rep: 'DOMINIC MBITHI,GLORIA NKONDO', last_visit: '03 Jul, 2026' },
      { code: 'C2', name: 'Other', hq: 'DAR', area: 'DAR', rep: 'ANOLD MUSHI', last_visit: '03 Jul, 2026' }], '', '')],
    expiry: [copy('expiry', [{ key: 'e1', date: '', rep: 'a', customer: 'b', product: 'X', expiry: '12/2026', qty: '1' }, { key: 'e2', date: '', rep: 'a', customer: 'b', product: 'Y', expiry: 'soon', qty: '1' }, { key: 'e3', date: '', rep: 'a', customer: 'b', product: 'Z', expiry: '2026-11-30', qty: '1' }])] };
    const a = await run('customers not visited for 60 days gloria', data);
    expect(a.table!.rows.map((r) => r.name)).toEqual(['Bulyanhulu']);
    const e = await run('products expiring', data);
    expect(e.table!.rows.map((r) => r.product)).toEqual(['Z', 'X']);
    expect(e.notes.join(' ')).toMatch(/1 line has an expiry date that could not be read/);
  });
});

describe('what is saved and what is not', () => {
  it('says so, and offers one call, when nothing is saved', async () => {
    const a = await run('late starters this week', {});
    expect(a.text).toMatch(/no saved copy of Attendance/i);
    expect(a.actions[0]).toMatchObject({ kind: 'fetch', report: 'attendance', from: '2026-10-26', to: '2026-10-28' });
  });
  it('offers the range asked for when the saved copy has nothing in it', async () => {
    const old = { attendance: [copy('attendance', [att('01-09-2026', 'Ann Wanjiru', 'P', '08:00AM', 5, 0)], '2026-09-01', '2026-09-01')] };
    const a = await run('who was absent last week', old);
    expect(a.text).toMatch(/nothing last week/);
    expect(a.actions[0]).toMatchObject({ kind: 'fetch', from: '2026-10-19', to: '2026-10-25' });
  });
  it('warns when only part of a long report was saved', async () => {
    const a = await run('late starters', { attendance: [copy('attendance', ATT, '2026-10-01', '2026-10-26', 500)] });
    expect(a.notes.join(' ')).toMatch(/first rows/);
  });
  it('merges two saved ranges without counting a row twice', async () => {
    const a = await run('who was absent', { attendance: [copy('attendance', ATT.slice(0, 4)), copy('attendance', ATT.slice(2))] });
    expect(a.text).toMatch(/2 absences/);
  });
});

describe('follow-ups, unknown questions, the overview', () => {
  it('keeps the last question and changes only what is new', async () => {
    const first = await run('customers not visited for 60 days');
    expect(first.table!.rows).toHaveLength(2);
    const next = await run('only Kisumu', FULL, first.ctx as never);
    expect(next.table!.rows.map((r) => r.name)).toEqual(['Lakeview Pharmacy']);
    const days = await run('and 10 days?', FULL, next.ctx as never);
    expect(days.table!.rows.map((r) => r.name)).toEqual(['Lakeview Pharmacy']);
  });
  it('an unclear question gets examples, not a guess', async () => {
    const a = await run('banana smoothie recipe');
    expect(a.text).toMatch(/did not understand/);
    expect(a.lines!.length).toBeGreaterThan(5);
  });
  it('what needs attention, with the question behind each line', async () => {
    const a = await run('what needs attention today?');
    expect(a.lines!.map((l) => l.text)).toEqual(expect.arrayContaining([expect.stringMatching(/not visited for over 60 days/), expect.stringMatching(/below 50% of sales target/)]));
    const f = await facts({ q: '', toks: [], mods: {}, s: S, today: TODAY, load: loader(FULL) });
    expect(f.every((x) => x.question.length > 0)).toBe(true);
    expect((await run('what needs attention', {})).text).toMatch(/No reports are saved/);
  });
  it('settings change the answers', async () => {
    const strict = await ask({ question: 'late starters', settings: { ...S, late: '08:00' }, load: loader(FULL), today: TODAY });
    expect(strict.text).toMatch(/^[3-9] late starts after 08:00/);
  });
  it('the answer can be pasted as text', async () => {
    const a = await run('late starters this week');
    expect(a.copy).toMatch(/Brian Otieno\t26-10-2026\t10:20AM/);
  });
});

describe('briefings and visit plan', () => {
  it('morning briefing summarises yesterday and what needs attention; evening uses today', async () => {
    const a = await run('Morning briefing');
    expect(a.text).toBe('Morning briefing');
    expect(a.lines?.[0].text).toContain('Yesterday');
    const e = await run('End of day summary');
    expect(e.text).toBe('End-of-day summary');
    expect(e.lines?.[0].text).toContain('Today');
  });
  it('visit plan puts never-visited and long-overdue customers first, and a fault never escapes', async () => {
    const a = await run('Plan my day in Kisumu');
    expect(a.table?.rows[0].name).toBe('Lakeview Pharmacy');
    expect(a.table?.rows.some((r) => r.name === 'Mumias Stores')).toBe(false);
    const b = await run('What should we focus on?');
    expect(b.table?.rows.map((r) => r.name)).toEqual(['Lakeview Pharmacy', 'Mumias Stores']);
    const broken: Loader = async () => { throw new Error('boom'); };
    const c = await ask({ question: 'Morning briefing', settings: S, load: broken, today: TODAY, ctx: null });
    expect(c.text).toContain('could not work that one out');
  });
  it('still routes older questions the same way', async () => {
    expect((await run('Products expiring next month')).text).toMatch(/expire/);
    expect((await run('What needs attention today?')).text).toMatch(/need/);
  });
});

describe('customer, review, freshness, scorecard', () => {
  it('a customer name gives what the saved reports say', async () => {
    const a = await run('Tell me about Lakeview Pharmacy');
    expect(a.text).toBe('Lakeview Pharmacy');
    expect(a.lines?.map((l) => l.text).join(' ')).toMatch(/Last visit|days ago/);
    const b = await run('Dala Chemist');
    expect(b.lines?.some((l) => /expire/.test(l.text))).toBe(true);
  });
  it('weekly review compares with last week', async () => {
    const a = await run('Weekly review');
    expect(a.text).toBe('Weekly review');
    expect(a.lines?.[0].text).toMatch(/Visits/);
  });
  it('freshness lists every saved report and says what is missing', async () => {
    const a = await run('How fresh is my data?');
    expect(a.lines?.length).toBeGreaterThan(2);
    expect((await run('How fresh is my data?', {})).text).toMatch(/No reports are saved/);
  });
  it('a rep summary ranks them and says what to do', async () => {
    const a = await run('How is Brian Otieno doing?');
    const t = a.lines?.map((l) => l.text).join(' ') ?? '';
    expect(t).toMatch(/Ranks \d of 3/);
    expect(t).toMatch(/Behind on both|Visits are on track|Sales are on track|On track/);
  });
});

describe('forecasts', () => {
  it('counts working days Monday to Saturday', async () => {
    const { workingDays } = await import('./skills');
    expect(workingDays(new Date(2026, 9, 1), new Date(2026, 9, 28))).toBe(24);
    expect(workingDays(new Date(2026, 9, 1), new Date(2026, 9, 31))).toBe(27);
  });
  it('projects sales to month end and lists the reps likely to miss', async () => {
    const a = await run('Who will miss target this month?');
    expect(a.table?.rows.map((r) => r.rep)).toEqual(['Carol Mwangi', 'Brian Otieno']);
    expect(a.table?.rows[1].proj).toBe('338');
    expect(a.notes.join(' ')).toMatch(/estimate/i);
    expect((await run('Forecast sales for this month')).table?.rows.length).toBe(3);
  });
  it('asks for this month when the saved copy is for another', async () => {
    const old = { ...FULL, target_vs_sales: [copy('target_vs_sales', [{ rep: 'A', target: '10', sales: '5' }], '2026-09-01', '2026-09-30')] };
    const a = await run('Who will miss target this month?', old);
    expect(a.actions[0].kind).toBe('fetch');
  });
  it('finds customers overdue against their own rhythm, and asks for the Visit Report if missing', async () => {
    const v = (date: string, code: string, customer: string): Row => ({ key: date + code, date, code, customer, rep: 'Ann' });
    const rows = [v('01-09-2026', 'C1', 'Lakeview'), v('11-09-2026', 'C1', 'Lakeview'), v('21-09-2026', 'C1', 'Lakeview'),
      v('01-10-2026', 'C2', 'Dala'), v('11-10-2026', 'C2', 'Dala'), v('21-10-2026', 'C2', 'Dala'), v('05-10-2026', 'C3', 'Once')];
    const a = await run('Which customers are about to go cold?', { ...FULL, visits: [copy('visits', rows, '2026-09-01', '2026-10-27')] });
    expect(a.table?.rows.map((r) => r.name)).toEqual(['Lakeview']);
    expect((await run('Which customers are about to go cold?')).actions[0].kind).toBe('open');
  });
});
