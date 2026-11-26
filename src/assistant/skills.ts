// What the assistant knows how to answer. Each answer is worked out on this computer from the reports already saved,
// using the same limits and colours as the report screens; nothing is asked of the server.
import { batteryPct, batteryTone, clockMinutes, monthsToExpiry, parseDay } from '../ui/rowTone';
import type { AssistantSettings } from '../api/types';
import {
  REPORT_LABEL, REPORT_PATH, findValue, iso, inPeriod, merge, money, num, partialNote, pct, rangeFor, sameName, shortDay,
  sourceLine, text, toneOf, PERIOD_WORDS, type Merged,
} from './data';
import { hasAll, hasAny } from './text';
import type { Action, Answer, Copy, Loader, Mods, Row, Table } from './types';
import type { Tone } from '../ui/rowTone';

export interface Env { q: string; toks: string[]; mods: Mods; s: AssistantSettings; today: Date; load: Loader }
export interface Skill { id: string; title: string; examples: string[]; score: (toks: string[]) => number; run: (env: Env) => Promise<Answer> }

const DAY_MS = 86_400_000;
const copyOf = (a: Omit<Answer, 'copy'>): Answer => {
  const rows = a.table ? a.table.rows.map((r) => a.table!.columns.map((c) => text(r[c.key])).join('\t')) : [];
  const head = a.table ? [a.table.columns.map((c) => c.title).join('\t')] : [];
  const bars = (a.bars ?? []).map((b) => `${b.label}: ${b.shown}`);
  const lines = (a.lines ?? []).map((l) => l.text);
  return { ...a, copy: [a.text, ...head, ...rows, ...bars, ...lines, a.source ? `(${a.source})` : ''].filter(Boolean).join('\n') };
};
const make = (a: Partial<Answer> & { text: string }): Answer => copyOf({ actions: [], notes: [], ...a });

function table(columns: Table['columns'], rows: Row[], tones: (Tone | undefined)[], limit = 8): Table {
  return { columns, rows: rows.slice(0, limit), tones: tones.slice(0, limit), more: Math.max(0, rows.length - limit), all: rows, allTones: tones };
}
const openAction = (report: string, label: string, extra: { search?: string; rep?: string; from?: string; to?: string } = {}): Action =>
  ({ kind: 'open', label, target: { path: REPORT_PATH[report], label: label.replace(/^Open /, ''), ...extra } });

/** Nothing saved for this report yet: say so, and offer the one server call that would fetch it. */
function missing(env: Env, report: string, why = ''): Answer {
  const label = REPORT_LABEL[report];
  const { from, to } = rangeFor(env.mods.period, env.today, report === 'attendance' ? 'week' : 'month');
  const fetchable = report === 'attendance' || report === 'target_vs_sales';
  return make({
    text: `${why || `There is no saved copy of ${label} on this computer yet.`} Open it once while online, or get it now with one call to the server.`,
    actions: [{ kind: 'fetch', label: `Get ${label} now (1 call)`, report, from: fetchable ? from : '', to: fetchable ? to : '' }, openAction(report, `Open ${label}`)],
    ctx: undefined,
  });
}

interface Data { m: Merged; rows: Row[]; mods: Mods }
/** The saved rows for a report, narrowed to the period, person or place the question named. Null when nothing is saved. */
async function dataFor(env: Env, report: string, opts: { period?: boolean; keys?: string[] } = {}): Promise<Data | null> {
  const copies: Copy[] = await env.load(report);
  if (!copies.length) return null;
  const m = merge(copies);
  const mods: Mods = { ...env.mods };
  let rows = m.rows;
  // the report lists every day of the range, so days still to come would look like absences
  if (report === 'attendance') rows = rows.filter((r) => { const d = parseDay(r.date); return !d || d.getTime() <= env.today.getTime(); });
  if (opts.keys?.length && (!mods.rep || !mods.area)) {
    const hit = findValue(env.q, rows, opts.keys);
    if (hit) { if (hit.key === 'rep' || hit.key === 'sm') mods.rep = hit.value; else mods.area = hit.value; }
  }
  if (mods.rep) rows = rows.filter((r) => sameName(r.rep, mods.rep!) || sameName(r.sm, mods.rep!));
  if (mods.area) rows = rows.filter((r) => ['hq', 'area', 'customer'].some((k) => sameName(r[k], mods.area!)));
  if (opts.period && mods.period) rows = inPeriod(rows, mods.period, env.today);
  return { m, rows, mods };
}
const scopeText = (mods: Mods) => [mods.rep && `for ${mods.rep}`, mods.area && `in ${mods.area}`, mods.period && PERIOD_WORDS[mods.period]].filter(Boolean).join(' ');
const finish = (_env: Env, id: string, data: Data, label: string, a: Partial<Answer> & { text: string }): Answer => {
  const notes = [partialNote(data.m), ...(a.notes ?? [])].filter(Boolean);
  return make({ ...a, notes, source: sourceLine(label, data.m), ctx: { skill: id, mods: data.mods } });
};
function emptyPeriod(env: Env, report: string, data: Data): Answer {
  const { from, to } = rangeFor(data.mods.period, env.today, 'week');
  return make({
    text: `Your saved copy of ${REPORT_LABEL[report]} has nothing ${data.mods.period ? PERIOD_WORDS[data.mods.period] : 'for that'}${data.mods.rep ? ` for ${data.mods.rep}` : ''}.`,
    source: sourceLine(REPORT_LABEL[report], data.m),
    actions: [{ kind: 'fetch', label: `Get ${PERIOD_WORDS[data.mods.period ?? 'week']} now (1 call)`, report, from, to }, openAction(report, `Open ${REPORT_LABEL[report]}`)],
    ctx: { skill: report, mods: data.mods },
  });
}

// ---- attendance ---------------------------------------------------------------------------------------------
const isAbsent = (r: Row) => text(r.ap).toUpperCase().startsWith('A');
/** approved leave (L) or half-day leave (HL): not absent, and not counted against the visit target */
const isLeave = (r: Row) => /^(L|HL)$/i.test(text(r.ap));
const worked = (r: Row) => !isAbsent(r) && !isLeave(r);

const visitTarget: Skill = {
  id: 'visit_target', title: 'Reps below their visit target', examples: ['Which reps are below 50% of visit target this week?'],
  score: (t) => (hasAll(t, ['below', 'under', 'behind', 'low', 'lowest', 'poor', 'weak', 'short', 'miss', 'missing', 'lagging', 'underperforming', 'worst'], ['target', 'visits', 'visit', 'calls', 'coverage', 'performance', 'performing'])
    && !hasAny(t, ['sales', 'sale', 'revenue', 'expiry', 'expiring', 'expire', 'customers', 'customer', 'ageing', 'aging', 'late']) ? 3 : 0),
  async run(env) {
    const d = await dataFor(env, 'attendance', { period: true, keys: ['rep'] });
    if (!d) return missing(env, 'attendance');
    if (!d.rows.length) return emptyPeriod(env, 'attendance', d);
    const limit = d.mods.pct ?? env.s.lo;
    const by = new Map<string, { rep: string; days: number; visits: number; target: number; absent: number }>();
    for (const r of d.rows) {
      const k = text(r.rep) || '(no name)';
      const e = by.get(k) ?? { rep: k, days: 0, visits: 0, target: 0, absent: 0 };
      if (isAbsent(r)) e.absent++; else if (isLeave(r)) continue; else { e.days++; e.visits += num(r.customer_visits) + num(r.doctor_visits); e.target += num(r.target); }
      by.set(k, e);
    }
    const reps = [...by.values()].filter((e) => e.target > 0).map((e) => ({ ...e, share: (e.visits / e.target) * 100 })).sort((a, b) => a.share - b.share);
    const low = reps.filter((e) => e.share < limit);
    const scope = scopeText(d.mods);
    const rows = low.map((e) => ({ rep: e.rep, days: e.days, visits: e.visits, target: e.target, share: pct(e.share) }));
    return finish(env, 'visit_target', d, 'Attendance', {
      text: low.length ? `${low.length} of ${reps.length} rep${reps.length === 1 ? ' is' : 's are'} below ${limit}% of their visit target${scope ? ` ${scope}` : ''}.`
        : `Nobody is below ${limit}% of their visit target${scope ? ` ${scope}` : ''}. ${reps.length} rep${reps.length === 1 ? '' : 's'} checked.`,
      table: low.length ? table([{ key: 'rep', title: 'Rep' }, { key: 'days', title: 'Days', right: true }, { key: 'visits', title: 'Visits', right: true }, { key: 'target', title: 'Target', right: true }, { key: 'share', title: '% of target', right: true }], rows, low.map((e) => toneOf(e.share, env.s))) : undefined,
      actions: [openAction('attendance', 'Open Attendance report', { rep: undefined, from: d.m.from, to: d.m.to })],
    });
  },
};

const lateStart: Skill = {
  id: 'late_start', title: 'Late starters', examples: ['Late starters today', 'Who started late this week?'],
  score: (t) => (hasAny(t, ['late', 'later', 'latest', 'delayed', 'lateness', 'lateness']) && !hasAny(t, ['order', 'delivery', 'payment', 'orders']) ? 3 : 0),
  async run(env) {
    const d = await dataFor(env, 'attendance', { period: true, keys: ['rep'] });
    if (!d) return missing(env, 'attendance');
    if (!d.rows.length) return emptyPeriod(env, 'attendance', d);
    const cut = clockMinutes(env.s.late) ?? 570;
    const late = d.rows.filter(worked).map((r) => ({ r, at: clockMinutes(r.start_day) })).filter((x) => x.at != null && x.at > cut);
    const rows = late.sort((a, b) => b.at! - a.at!).map((x) => ({ rep: text(x.r.rep), date: text(x.r.date), start: text(x.r.start_day).replace(/\(.*$/, '') }));
    const scope = scopeText(d.mods);
    return finish(env, 'late_start', d, 'Attendance', {
      text: late.length ? `${late.length} late start${late.length === 1 ? '' : 's'} after ${env.s.late}${scope ? ` ${scope}` : ''}.` : `No start of day later than ${env.s.late}${scope ? ` ${scope}` : ''}.`,
      table: late.length ? table([{ key: 'rep', title: 'Rep' }, { key: 'date', title: 'Date' }, { key: 'start', title: 'Started' }], rows, rows.map(() => 'bad' as const)) : undefined,
      actions: [openAction('attendance', 'Open Attendance report', { from: d.m.from, to: d.m.to })],
    });
  },
};

const battery: Skill = {
  id: 'battery', title: 'Phone battery at start of day', examples: ['Who started with low battery?', 'Battery at start of day'],
  score: (t) => (hasAny(t, ['battery', 'batteries', 'charge', 'charged', 'charging']) ? 4 : 0),
  async run(env) {
    const d = await dataFor(env, 'attendance', { period: true, keys: ['rep'] });
    if (!d) return missing(env, 'attendance');
    if (!d.rows.length) return emptyPeriod(env, 'attendance', d);
    const low = d.rows.filter(worked).map((r) => ({ r, pct: batteryPct(r.start_day) })).filter((x): x is { r: typeof x.r; pct: number } => x.pct != null && x.pct < 95);
    const rows = low.sort((a, b) => a.pct - b.pct).slice(0, 15).map((x) => ({ rep: text(x.r.rep), date: text(x.r.date), battery: `${x.pct}%` }));
    const scope = scopeText(d.mods);
    return finish(env, 'battery', d, 'Attendance', {
      text: low.length ? `${low.length} start${low.length === 1 ? '' : 's'} of day below 95% battery${scope ? ` ${scope}` : ''}. Green is 95% or more, amber 20 to 94%, red under 20%.` : `Every start of day was at 95% battery or more${scope ? ` ${scope}` : ''}.`,
      table: low.length ? table([{ key: 'rep', title: 'Rep' }, { key: 'date', title: 'Date' }, { key: 'battery', title: 'Battery at start', right: true }], rows, low.slice(0, 15).map((x) => batteryTone(x.pct))) : undefined,
      actions: [openAction('attendance', 'Open Attendance report', { from: d.m.from, to: d.m.to })],
    });
  },
};

const absent: Skill = {
  id: 'absent', title: 'Who was absent', examples: ['Who was absent yesterday?', 'Absent this week'],
  score: (t) => (hasAny(t, ['absent', 'absentee', 'absentees', 'absence', 'attendance']) ? 3 : 0),
  async run(env) {
    const d = await dataFor(env, 'attendance', { period: true, keys: ['rep'] });
    if (!d) return missing(env, 'attendance');
    if (!d.rows.length) return emptyPeriod(env, 'attendance', d);
    const gone = d.rows.filter(isAbsent);
    const by = new Map<string, string[]>();
    for (const r of gone) by.set(text(r.rep), [...(by.get(text(r.rep)) ?? []), text(r.date)]);
    const rows = [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([rep, days]) => ({ rep, days: days.length, dates: days.slice(0, 4).join(', ') + (days.length > 4 ? '…' : '') }));
    const present = d.rows.filter(worked).length;
    const scope = scopeText(d.mods);
    return finish(env, 'absent', d, 'Attendance', {
      text: gone.length ? `${gone.length} absence${gone.length === 1 ? '' : 's'} among ${by.size} rep${by.size === 1 ? '' : 's'}${scope ? ` ${scope}` : ''}; ${present} present.` : `No absences${scope ? ` ${scope}` : ''}; ${present} present.`,
      table: gone.length ? table([{ key: 'rep', title: 'Rep' }, { key: 'days', title: 'Days absent', right: true }, { key: 'dates', title: 'Dates' }], rows, rows.map((r) => (r.days >= 3 ? 'bad' : 'warn') as Tone)) : undefined,
      actions: [openAction('attendance', 'Open Attendance report', { from: d.m.from, to: d.m.to })],
    });
  },
};

// ---- customers, stock, money ---------------------------------------------------------------------------------
const notVisited: Skill = {
  id: 'not_visited', title: 'Customers not visited', examples: ['Customers in Kisumu not visited for 60 days', 'Customers never visited'],
  score: (t) => (hasAll(t, ['not', 'never', 'no', 'without', 'havent', 'unvisited', 'neglected', 'missed', 'inactive', 'dormant', 'stale', 'long'], ['visited', 'visit', 'visits', 'seen', 'contacted', 'touched', 'activity', 'unvisited', 'ordered']) || hasAny(t, ['unvisited', 'dormant', 'inactive']) ? 3 : 0),
  async run(env) {
    const d = await dataFor(env, 'last_activity', { keys: ['hq', 'area', 'rep'] });
    if (!d) return missing(env, 'last_activity');
    const days = d.mods.days ?? env.s.bad_days;
    const found = d.rows.map((r) => { const day = parseDay(r.last_visit); return { r, age: day ? Math.floor((env.today.getTime() - day.getTime()) / DAY_MS) : null }; })
      .filter((x) => x.age == null || x.age > days).sort((a, b) => (b.age ?? 1e9) - (a.age ?? 1e9));
    const rows = found.map((x) => ({ name: text(x.r.name), code: text(x.r.code), area: text(x.r.area || x.r.hq), last: text(x.r.last_visit) || 'Never', days: x.age ?? '', rep: text(x.r.rep) }));
    const tones = found.map((x) => (x.age == null || x.age > env.s.bad_days ? 'bad' : 'warn') as Tone);
    const scope = scopeText(d.mods);
    return finish(env, 'not_visited', d, 'Last Activity', {
      text: found.length ? `${found.length} customer${found.length === 1 ? '' : 's'} not visited for over ${days} days${scope ? ` ${scope}` : ''}.` : `Every customer${scope ? ` ${scope}` : ''} was visited within ${days} days.`,
      table: found.length ? table([{ key: 'name', title: 'Customer' }, { key: 'area', title: 'Area' }, { key: 'last', title: 'Last visit' }, { key: 'days', title: 'Days', right: true }, { key: 'rep', title: 'Last rep' }, { key: 'code', title: 'Code', wide: true }], rows, tones) : undefined,
      actions: [openAction('last_activity', 'Open Last Activity', { search: d.mods.area })],
    });
  },
};

const expiry: Skill = {
  id: 'expiry', title: 'Stock about to expire', examples: ['Products expiring in 3 months'],
  score: (t) => (hasAny(t, ['expiry', 'expire', 'expires', 'expiring', 'expired']) ? 3 : 0),
  async run(env) {
    const d = await dataFor(env, 'expiry', { keys: ['rep', 'customer'] });
    if (!d) return missing(env, 'expiry');
    const within = d.mods.months ?? env.s.expiry_months;
    const read = d.rows.map((r) => ({ r, left: monthsToExpiry(r.expiry, env.today) }));
    const unreadable = read.filter((x) => x.left == null).length;
    const found = read.filter((x) => x.left != null && x.left < within).sort((a, b) => a.left! - b.left!);
    const rows = found.map((x) => ({ product: text(x.r.product), customer: text(x.r.customer), expiry: text(x.r.expiry), qty: text(x.r.qty) }));
    const gone = found.filter((x) => x.left! < 0).length;
    return finish(env, 'expiry', d, 'Expiry', {
      text: found.length ? `${found.length} line${found.length === 1 ? '' : 's'} expire within ${within} month${within === 1 ? '' : 's'}${gone ? `, ${gone} already expired` : ''}${scopeText(d.mods) ? ` ${scopeText(d.mods)}` : ''}.` : `Nothing expires within ${within} month${within === 1 ? '' : 's'}.`,
      table: found.length ? table([{ key: 'product', title: 'Product' }, { key: 'customer', title: 'Customer' }, { key: 'expiry', title: 'Expiry' }, { key: 'qty', title: 'Qty', right: true }], rows, found.map((x) => (x.left! < 0 ? 'bad' : 'warn') as Tone)) : undefined,
      notes: unreadable ? [`${unreadable} line${unreadable === 1 ? ' has' : 's have'} an expiry date that could not be read, so ${unreadable === 1 ? 'it is' : 'they are'} not counted.`] : [],
      actions: [openAction('expiry', 'Open Expiry report')],
    });
  },
};

const ageing: Skill = {
  id: 'ageing', title: 'Overdue customers', examples: ['Overdue ageing over 60 days'],
  score: (t) => (hasAny(t, ['ageing', 'aging', 'overdue', 'outstanding', 'receivable', 'receivables', 'debtors', 'dues']) ? 3 : 0),
  async run(env) {
    const d = await dataFor(env, 'customer_ageing', { keys: ['hq', 'area', 'sm'] });
    if (!d) return missing(env, 'customer_ageing');
    const found = d.rows.map((r) => ({ r, over: num(r.d61), mid: num(r.d60) })).filter((x) => x.over > 0).sort((a, b) => b.over - a.over);
    const total = found.reduce((s, x) => s + x.over, 0);
    const rows = found.map((x) => ({ name: text(x.r.name), code: text(x.r.code), area: text(x.r.area || x.r.hq), sm: text(x.r.sm), mid: money(x.mid), over: money(x.over) }));
    return finish(env, 'ageing', d, 'Customer Ageing', {
      text: found.length ? `${found.length} customer${found.length === 1 ? ' has' : 's have'} amounts over 60 days, ${money(total)} in all${scopeText(d.mods) ? ` ${scopeText(d.mods)}` : ''}.` : 'No customer has amounts over 60 days.',
      table: found.length ? table([{ key: 'name', title: 'Customer' }, { key: 'area', title: 'Area' }, { key: 'sm', title: 'Sales person' }, { key: 'mid', title: '31-60 days', right: true }, { key: 'over', title: 'Over 60', right: true }, { key: 'code', title: 'Code', wide: true }], rows, found.map(() => 'bad' as const)) : undefined,
      actions: [openAction('customer_ageing', 'Open Customer Ageing')],
    });
  },
};

// ---- sales against target ------------------------------------------------------------------------------------
interface Rep { rep: string; target: number; sales: number; share: number }
const repsOf = (rows: Row[]): Rep[] => rows.map((r) => {
  const target = num(r.target_n ?? r.target), sales = num(r.sales_n ?? r.sales);
  return { rep: text(r.rep ?? r.name), target, sales, share: target > 0 ? (sales / target) * 100 : NaN };
}).filter((x) => x.rep);

const salesTarget: Skill = {
  id: 'sales_target', title: 'Sales against target', examples: ['Who is behind on sales target?'],
  score: (t) => (hasAll(t, ['sales', 'sale', 'revenue', 'achievement', 'achieved', 'achieve'], ['target', 'targets', 'behind', 'below', 'under', 'achievement', 'achieved', 'achieve']) ? 4 : 0),
  async run(env) {
    const d = await dataFor(env, 'target_vs_sales', { keys: ['rep'] });
    if (!d) return missing(env, 'target_vs_sales');
    const reps = repsOf(d.rows).filter((x) => x.target > 0);
    const limit = d.mods.pct ?? env.s.hi;
    const behind = reps.filter((x) => x.share < limit).sort((a, b) => a.share - b.share);
    const target = reps.reduce((s, x) => s + x.target, 0), sales = reps.reduce((s, x) => s + x.sales, 0);
    return finish(env, 'sales_target', d, 'Target vs Sales', {
      text: `${behind.length} of ${reps.length} reps are below ${limit}% of their sales target. Together: ${money(sales)} of ${money(target)} (${target ? pct((sales / target) * 100) : '-'}).`,
      table: behind.length ? table([{ key: 'rep', title: 'Rep' }, { key: 'target', title: 'Target', right: true }, { key: 'sales', title: 'Sales', right: true }, { key: 'share', title: '%', right: true }],
        behind.map((x) => ({ rep: x.rep, target: money(x.target), sales: money(x.sales), share: pct(x.share) })), behind.map((x) => toneOf(x.share, env.s))) : undefined,
      actions: [openAction('target_vs_sales', 'Open Target vs Sales')],
    });
  },
};

const topReps: Skill = {
  id: 'top_reps', title: 'Top reps', examples: ['Top 5 reps by sales', 'Best reps on visits'],
  score: (t) => (hasAll(t, ['top', 'best', 'highest', 'leading', 'leaders', 'ranking', 'rank', 'most'], ['sales', 'sale', 'revenue', 'reps', 'rep', 'performers', 'performer', 'salesmen', 'sellers', 'visits', 'visit', 'calls']) ? 3 : 0),
  async run(env) {
    const n = env.mods.top ?? 5;
    if (hasAny(env.toks, ['visits', 'visit', 'calls'])) {
      const d = await dataFor(env, 'attendance', { period: true });
      if (!d) return missing(env, 'attendance');
      if (!d.rows.length) return emptyPeriod(env, 'attendance', d);
      const by = new Map<string, number>();
      for (const r of d.rows) if (worked(r)) by.set(text(r.rep), (by.get(text(r.rep)) ?? 0) + num(r.customer_visits) + num(r.doctor_visits));
      const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
      return finish(env, 'top_reps', d, 'Attendance', {
        text: `Top ${top.length} reps by visits${scopeText(d.mods) ? ` ${scopeText(d.mods)}` : ''}.`,
        bars: top.map(([label, value]) => ({ label, value, shown: `${value} visits`, tone: 'good' as const })),
        actions: [openAction('attendance', 'Open Attendance report')],
      });
    }
    const d = await dataFor(env, 'target_vs_sales');
    if (!d) return missing(env, 'target_vs_sales');
    const top = repsOf(d.rows).sort((a, b) => b.sales - a.sales).slice(0, n);
    return finish(env, 'top_reps', d, 'Target vs Sales', {
      text: `Top ${top.length} reps by sales.`,
      bars: top.map((x) => ({ label: x.rep, value: x.sales, shown: `${money(x.sales)}${Number.isNaN(x.share) ? '' : ` (${pct(x.share)})`}`, tone: Number.isNaN(x.share) ? undefined : toneOf(x.share, env.s) })),
      actions: [openAction('target_vs_sales', 'Open Target vs Sales')],
    });
  },
};

const whyBehind: Skill = {
  id: 'why_behind', title: 'Why sales are behind', examples: ['Why are we behind on sales target?'],
  score: (t) => (hasAll(t, ['why', 'reason', 'reasons', 'explain', 'cause', 'causes', 'happened'], ['sales', 'target', 'drop', 'dropped', 'down', 'behind', 'low', 'decline', 'declined', 'fall', 'fell', 'revenue']) ? 5 : 0),
  async run(env) {
    const d = await dataFor(env, 'target_vs_sales', { keys: ['rep'] });
    if (!d) return missing(env, 'target_vs_sales');
    const reps = repsOf(d.rows).filter((x) => x.target > 0);
    const gap = reps.map((x) => ({ ...x, gap: x.target - x.sales })).filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap);
    const total = gap.reduce((s, x) => s + x.gap, 0);
    if (!total) return finish(env, 'why_behind', d, 'Target vs Sales', { text: 'Nobody is behind target in the saved copy, so there is no shortfall to explain.', actions: [openAction('target_vs_sales', 'Open Target vs Sales')] });
    const top = gap.slice(0, 3);
    const topShare = (top.reduce((s, x) => s + x.gap, 0) / total) * 100;
    const att = await dataFor({ ...env, mods: { ...env.mods, rep: undefined } }, 'attendance', {});
    const lines: NonNullable<Answer['lines']> = [];
    if (att) {
      const visits = new Map<string, { v: number; t: number }>();
      for (const r of att.rows) if (worked(r)) { const e = visits.get(text(r.rep)) ?? { v: 0, t: 0 }; e.v += num(r.customer_visits) + num(r.doctor_visits); e.t += num(r.target); visits.set(text(r.rep), e); }
      const lowVisits = top.filter((x) => { const e = visits.get(x.rep); return e && e.t > 0 && (e.v / e.t) * 100 < env.s.hi; });
      lines.push(lowVisits.length
        ? { text: `${lowVisits.map((x) => x.rep).join(', ')} also ${lowVisits.length === 1 ? 'made' : 'made'} fewer visits than target, so low activity is a likely cause.`, tone: 'warn', question: 'Which reps are below target on visits?' }
        : { text: 'The biggest shortfalls are not explained by low visits in the saved attendance, so look at order size and products next.', tone: undefined });
    } else lines.push({ text: 'Save the Attendance report too and I can check whether low visits are behind the shortfall.', question: 'Which reps are below target on visits?' });
    return finish(env, 'why_behind', d, 'Target vs Sales', {
      text: `Sales are ${money(total)} short of target across ${gap.length} rep${gap.length === 1 ? '' : 's'}. The top ${top.length} account for ${pct(topShare)} of that.`,
      bars: top.map((x) => ({ label: x.rep, value: x.gap, shown: `-${money(x.gap)} (${pct(x.share)} of target)`, tone: 'bad' as const })),
      lines, actions: [openAction('target_vs_sales', 'Open Target vs Sales')],
    });
  },
};

const compare: Skill = {
  id: 'compare', title: 'Compare two periods', examples: ['Compare sales this month vs last month'],
  score: (t) => (hasAll(t, ['compare', 'comparison', 'versus', 'vs', 'against', 'growth', 'change', 'changed'], ['sales', 'revenue', 'target', 'month']) ? 4 : 0),
  async run(env) {
    const copies = await env.load('target_vs_sales');
    const byFrom = new Map<string, Copy>();
    for (const c of copies) if (c.from && !byFrom.has(c.from)) byFrom.set(c.from, c);
    const two = [...byFrom.values()].sort((a, b) => b.from.localeCompare(a.from));
    if (two.length < 2) {
      const { from, to } = rangeFor('lastmonth', env.today);
      return make({
        text: `${copies.length ? 'Only one month of Target vs Sales is saved here.' : 'Target vs Sales is not saved here yet.'} To compare, I need last month as well.`,
        actions: [{ kind: 'fetch', label: 'Get last month now (1 call)', report: 'target_vs_sales', from, to }, openAction('target_vs_sales', 'Open Target vs Sales')],
      });
    }
    const [now, before] = two;
    const a = new Map(repsOf(now.rows).map((x) => [x.rep, x])), b = new Map(repsOf(before.rows).map((x) => [x.rep, x]));
    const totalNow = [...a.values()].reduce((s, x) => s + x.sales, 0), totalBefore = [...b.values()].reduce((s, x) => s + x.sales, 0);
    const change = totalBefore ? ((totalNow - totalBefore) / totalBefore) * 100 : 0;
    const moves = [...a.values()].map((x) => ({ rep: x.rep, delta: x.sales - (b.get(x.rep)?.sales ?? 0) })).sort((p, q) => p.delta - q.delta);
    const worst = moves.filter((m) => m.delta < 0).slice(0, 4);
    const shown = worst.length ? worst : moves.slice(-4).reverse();
    const m = merge([now, before]);
    return make({
      text: `Sales are ${change >= 0 ? 'up' : 'down'} ${pct(Math.abs(change))}: ${money(totalNow)} against ${money(totalBefore)} the earlier month.`,
      bars: shown.map((x) => ({ label: x.rep, value: Math.abs(x.delta), shown: `${x.delta >= 0 ? '+' : '-'}${money(Math.abs(x.delta))}`, tone: x.delta < 0 ? 'bad' as const : 'good' as const })),
      lines: [{ text: worst.length ? 'Biggest drops by rep. Ask "why are we behind on sales" for a likely cause.' : 'Biggest gains by rep.', question: worst.length ? 'Why are we behind on sales target?' : undefined }],
      source: sourceLine('Target vs Sales', m), notes: [partialNote(m)].filter(Boolean),
      actions: [openAction('target_vs_sales', 'Open Target vs Sales')], ctx: { skill: 'compare', mods: env.mods },
    });
  },
};

// ---- one person, the day's overview, help --------------------------------------------------------------------
export async function repDetail(env: Env, rep: string): Promise<Answer> {
  const mods: Mods = { ...env.mods, rep };
  const att = await dataFor({ ...env, mods }, 'attendance', { period: true });
  const tvs = await dataFor({ ...env, mods }, 'target_vs_sales');
  if (!att && !tvs) return missing(env, 'attendance');
  const lines: NonNullable<Answer['lines']> = [];
  const cut = clockMinutes(env.s.late) ?? 570;
  if (att?.rows.length) {
    const present = att.rows.filter(worked);
    const visits = present.reduce((s, r) => s + num(r.customer_visits) + num(r.doctor_visits), 0), target = present.reduce((s, r) => s + num(r.target), 0);
    const lateDays = present.filter((r) => { const c = clockMinutes(r.start_day); return c != null && c > cut; }).length;
    const share = target ? (visits / target) * 100 : NaN;
    lines.push({ text: `${present.length} day${present.length === 1 ? '' : 's'} worked, ${att.rows.filter(isAbsent).length} absent, ${lateDays} late start${lateDays === 1 ? '' : 's'}.` });
    if (!Number.isNaN(share)) lines.push({ text: `Visits: ${visits} of ${target} target (${pct(share)}).`, tone: toneOf(share, env.s) });
  }
  const mine = tvs ? repsOf(tvs.rows)[0] : undefined;
  if (mine && mine.target > 0) lines.push({ text: `Sales: ${money(mine.sales)} of ${money(mine.target)} target (${pct(mine.share)}).`, tone: toneOf(mine.share, env.s) });
  try {
    const allCopies = await env.load('target_vs_sales');
    if (mine && mine.target > 0 && allCopies.length) {
      const latest = [...allCopies].sort((a, b) => b.from.localeCompare(a.from))[0];
      const board = repsOf(latest.rows).filter((x) => x.target > 0).sort((a, b) => b.share - a.share);
      const at = board.findIndex((x) => x.rep.toLowerCase() === rep.toLowerCase());
      if (at >= 0 && board.length > 1) lines.push({ text: `Ranks ${at + 1} of ${board.length} reps on sales against target.` });
      const earlier = [...allCopies].filter((c) => c.from && c.from < latest.from).sort((a, b) => b.from.localeCompare(a.from))[0];
      const prev = earlier ? repsOf(earlier.rows).find((x) => x.rep.toLowerCase() === rep.toLowerCase()) : undefined;
      if (prev && prev.sales > 0) { const ch = ((mine.sales - prev.sales) / prev.sales) * 100; lines.push({ text: `Sales ${ch >= 0 ? 'up' : 'down'} ${pct(Math.abs(ch))} on the earlier month.`, tone: ch >= 0 ? 'good' : 'warn' }); }
    }
  } catch { /* the extra lines are optional */ }
  const vShare = (() => { const l = lines.find((x) => x.text.startsWith('Visits:')); const m = l && /\((\d+)%\)/.exec(l.text); return m ? +m[1] : NaN; })();
  const sShare = mine && mine.target > 0 ? mine.share : NaN;
  if (!Number.isNaN(vShare) && !Number.isNaN(sShare)) {
    const vOk = vShare >= env.s.hi, sOk = sShare >= env.s.hi;
    lines.push({ text: vOk && sOk ? 'On track on both visits and sales.' : vOk ? 'Visits are on track but sales are behind: look at order conversion and stock availability in the visited customers.' : sOk ? 'Sales are on track with fewer visits than planned: check the customers not visited.' : 'Behind on both: start with the customers not visited and overdue payments.', tone: vOk && sOk ? 'good' : 'warn' });
  }
  const base = att ?? tvs!;
  return make({
    text: `${rep}${mods.period ? ` ${PERIOD_WORDS[mods.period]}` : ''}`, lines, actions: [openAction('attendance', 'Open Attendance report', { search: rep })],
    source: [att && sourceLine('Attendance', att.m), tvs && sourceLine('Target vs Sales', tvs.m)].filter(Boolean).join('; '),
    notes: [partialNote(base.m)].filter(Boolean), ctx: { skill: 'rep_detail', mods },
  });
}

// ---- one customer, reviews, how fresh the saved copies are ----------------------------------------------------------
/** Everything the saved reports say about one customer. */
export async function customerDetail(env: Env, name: string): Promise<Answer> {
  const eq = (v: unknown) => text(v).toLowerCase() === name.toLowerCase();
  const la = (await dataFor({ ...env, mods: {} }, 'last_activity'))?.rows.find((r) => eq(r.name));
  const lm = await dataFor({ ...env, mods: {} }, 'last_activity');
  const ag = (await dataFor({ ...env, mods: {} }, 'customer_ageing'))?.rows.find((r) => eq(r.name));
  const ex = (await dataFor({ ...env, mods: {} }, 'expiry'))?.rows.filter((r) => eq(r.customer)) ?? [];
  const lines: NonNullable<Answer['lines']> = [];
  if (la) {
    const day = parseDay(la.last_visit);
    const age = day ? Math.floor((env.today.getTime() - day.getTime()) / DAY_MS) : null;
    lines.push({ text: age == null ? 'Never visited.' : `Last visit ${text(la.last_visit)} (${age} days ago)${text(la.rep) ? ` by ${text(la.rep)}` : ''}.`, tone: age == null || age > env.s.bad_days ? 'bad' : age > env.s.stale_days ? 'warn' : 'good' });
    if (text(la.area || la.hq)) lines.push({ text: `Area: ${text(la.area || la.hq)}.` });
  }
  if (ag) {
    const over = num(ag.d61), mid = num(ag.d60);
    lines.push(over > 0 ? { text: `Owes ${money(over)} over 60 days${mid > 0 ? ` and ${money(mid)} for 31 to 60 days` : ''}.`, tone: 'bad' } : mid > 0 ? { text: `Owes ${money(mid)} for 31 to 60 days.`, tone: 'warn' } : { text: 'No overdue amount.', tone: 'good' });
  }
  const soon = ex.map((r) => ({ r, left: monthsToExpiry(r.expiry, env.today) })).filter((x) => x.left != null && x.left < env.s.expiry_months);
  if (soon.length) lines.push({ text: `${soon.length} stock line${soon.length === 1 ? '' : 's'} here expire within ${env.s.expiry_months} months: ${soon.slice(0, 3).map((x) => text(x.r.product)).join(', ')}.`, tone: 'warn' });
  if (!lines.length) return make({ text: `Nothing is saved about ${name} yet.`, actions: [openAction('last_activity', 'Open Last Activity', { search: name })] });
  const tip = la && (parseDay(la.last_visit) == null || (env.today.getTime() - (parseDay(la.last_visit) as Date).getTime()) / DAY_MS > env.s.bad_days)
    ? 'Suggested: visit soon' + (ag && num(ag.d61) > 0 ? ' and collect the overdue amount.' : '.') : ag && num(ag.d61) > 0 ? 'Suggested: collect the overdue amount at the next visit.' : '';
  if (tip) lines.push({ text: tip });
  return make({
    text: name, lines, actions: [openAction('last_activity', 'Open Last Activity', { search: name }), ...(ag ? [openAction('customer_ageing', 'Open Customer Ageing')] : [])],
    source: [la && lm && sourceLine('Last Activity', lm.m)].filter(Boolean).join('; '), ctx: undefined,
  });
}

const review: Skill = {
  id: 'review', title: 'Weekly or monthly review', examples: ['Weekly review', 'Monthly review'],
  score: (t) => (hasAny(t, ['review', 'scorecard']) ? 4 : 0),
  async run(env) {
    const monthly = hasAny(env.toks, ['month', 'monthly']) && !hasAny(env.toks, ['week', 'weekly']);
    const now = monthly ? 'month' as const : 'week' as const, before = monthly ? 'lastmonth' as const : 'lastweek' as const;
    const att = await dataFor({ ...env, mods: {} }, 'attendance');
    if (!att) return missing(env, 'attendance');
    const total = (rows: Row[]) => {
      const on = rows.filter(worked);
      return { visits: on.reduce((a, r) => a + num(r.customer_visits) + num(r.doctor_visits), 0), target: on.reduce((a, r) => a + num(r.target), 0), absent: rows.filter(isAbsent).length, days: on.length };
    };
    const a = total(inPeriod(att.rows, now, env.today)), b = total(inPeriod(att.rows, before, env.today));
    const lines: NonNullable<Answer['lines']> = [];
    const delta = (x: number, y: number) => (y ? `${x >= y ? 'up' : 'down'} ${pct(Math.abs(((x - y) / y) * 100))} on ${PERIOD_WORDS[before]}` : `no ${PERIOD_WORDS[before]} to compare`);
    const share = a.target ? (a.visits / a.target) * 100 : NaN;
    lines.push({ text: `Visits ${PERIOD_WORDS[now]}: ${a.visits}${a.target ? ` of ${a.target} target (${pct(share)})` : ''}, ${delta(a.visits, b.visits)}.`, tone: Number.isNaN(share) ? undefined : toneOf(share, env.s) });
    lines.push({ text: `Absences: ${a.absent} (${b.absent} ${PERIOD_WORDS[before]}).`, tone: a.absent > b.absent ? 'warn' : undefined });
    const tv = await dataFor({ ...env, mods: {} }, 'target_vs_sales');
    if (tv) { const r = repsOf(tv.rows); const t = r.reduce((x, y) => x + y.target, 0), s = r.reduce((x, y) => x + y.sales, 0); if (t > 0) lines.push({ text: `Sales: ${money(s)} of ${money(t)} target (${pct((s / t) * 100)}).`, tone: toneOf((s / t) * 100, env.s), question: 'Who is behind on sales target?' }); }
    for (const f of await facts(env)) lines.push({ text: f.label, tone: f.tone, question: f.question });
    return make({ text: `${monthly ? 'Monthly' : 'Weekly'} review`, lines, source: sourceLine('Attendance', att.m), actions: [openAction('attendance', 'Open Attendance report')], notes: [partialNote(att.m)].filter(Boolean) });
  },
};

export const REPORTS_KEPT = ['attendance', 'last_activity', 'expiry', 'customer_ageing', 'target_vs_sales', 'visits'];
export interface Fresh { report: string; label: string; savedAt: number; days: number }
/** How old the newest saved copy of each report is. */
export async function freshness(load: Loader, today: Date): Promise<{ saved: Fresh[]; missing: string[] }> {
  const saved: Fresh[] = [], gone: string[] = [];
  for (const r of REPORTS_KEPT) {
    let copies: Copy[] = [];
    try { copies = await load(r); } catch { /* treated as nothing saved */ }
    if (!copies.length) { gone.push(REPORT_LABEL[r] ?? r); continue; }
    const at = Math.max(...copies.map((c) => c.savedAt));
    saved.push({ report: r, label: REPORT_LABEL[r] ?? r, savedAt: at, days: Math.max(0, Math.floor((today.getTime() - at * 1000) / DAY_MS)) });
  }
  return { saved, missing: gone };
}
const fresh: Skill = {
  id: 'freshness', title: 'How fresh is the saved data', examples: ['How fresh is my data?'],
  score: (t) => (hasAny(t, ['fresh', 'stale', 'outdated', 'uptodate']) || hasAll(t, ['data', 'reports', 'copies'], ['old', 'saved', 'updated', 'refreshed', 'date']) ? 4 : 0),
  async run(env) {
    const { saved, missing: gone } = await freshness(env.load, env.today);
    if (!saved.length) return make({ text: 'No reports are saved on this computer yet. Open Attendance, Last Activity, Expiry, Customer Ageing or Target vs Sales once while online.' });
    return make({
      text: 'Saved reports on this computer:',
      lines: [...saved.map((f) => ({ text: `${f.label}: saved ${shortDay(new Date(f.savedAt * 1000))} (${f.days === 0 ? 'today' : `${f.days} day${f.days === 1 ? '' : 's'} ago`})`, tone: (f.days > 7 ? 'bad' : f.days > 2 ? 'warn' : 'good') as Tone })),
        ...(gone.length ? [{ text: `Not saved yet: ${gone.join(', ')}.` }] : [])],
      notes: ['Open a report while online to refresh its saved copy.'],
    });
  },
};

// ---- forecasts (plain trend arithmetic on the saved reports; estimates, not promises) -------------------------------
/** Days Monday to Saturday between two dates, both included (Sunday is taken as the rest day). */
export function workingDays(a: Date, b: Date): number {
  let n = 0;
  for (let d = new Date(a.getFullYear(), a.getMonth(), a.getDate()); d.getTime() <= b.getTime(); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n++;
  return n;
}
export interface Projection { rep: string; sales: number; target: number; projected: number; share: number; need: number }
/** Where each rep is heading by month end at the pace so far. Null when the saved copy is not for this month. */
export function project(rows: Row[], today: Date): { items: Projection[]; elapsed: number; total: number } | null {
  const first = new Date(today.getFullYear(), today.getMonth(), 1), last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const total = workingDays(first, last), elapsed = Math.max(1, workingDays(first, today)), left = Math.max(0, total - elapsed);
  const items = repsOf(rows).filter((r) => r.target > 0).map((r) => {
    const projected = (r.sales / elapsed) * total;
    return { rep: r.rep, sales: r.sales, target: r.target, projected, share: (projected / r.target) * 100, need: left ? Math.max(0, (r.target - r.sales) / left) : 0 };
  });
  return { items, elapsed, total };
}
const forecast: Skill = {
  id: 'forecast', title: 'Sales forecast and targets at risk', examples: ['Who will miss target this month?', 'Forecast sales for this month'],
  score: (t) => (hasAny(t, ['forecast', 'predict', 'prediction', 'projected', 'projection', 'likely', 'expected', 'estimate']) || hasAll(t, ['will', 'going'], ['miss', 'short', 'fall', 'reach', 'hit', 'achieve', 'meet']) || hasAll(t, ['risk', 'danger', 'track'], ['target', 'sales']) ? 4 : 0),
  async run(env) {
    const copies = await env.load('target_vs_sales');
    const thisMonth = `${env.today.getFullYear()}-${String(env.today.getMonth() + 1).padStart(2, '0')}`;
    const copy = copies.filter((c) => String(c.from).slice(0, 7) === thisMonth).sort((a, b) => b.savedAt - a.savedAt)[0];
    if (!copy) {
      const { from, to } = rangeFor('month', env.today);
      return make({ text: `${copies.length ? 'The saved Target vs Sales is for another month.' : 'Target vs Sales is not saved here yet.'} A forecast needs this month so far.`,
        actions: [{ kind: 'fetch', label: 'Get this month now (1 call)', report: 'target_vs_sales', from, to }, openAction('target_vs_sales', 'Open Target vs Sales')] });
    }
    const m = merge([copy]);
    const pr = project(m.rows, env.today);
    if (!pr || !pr.items.length) return make({ text: 'There are no targets in the saved copy to forecast against.', source: sourceLine('Target vs Sales', m) });
    const rows = pr.items.sort((a, b) => a.share - b.share);
    const risk = rows.filter((r) => r.share < env.s.hi);
    const onlyRisk = hasAny(env.toks, ['miss', 'short', 'fall', 'risk', 'danger']);
    const shown = onlyRisk ? risk : rows;
    const tones = shown.map((r) => toneOf(r.share, env.s));
    const sumP = rows.reduce((a, r) => a + r.projected, 0), sumT = rows.reduce((a, r) => a + r.target, 0);
    return finish(env, 'forecast', { m, rows: m.rows, mods: env.mods }, 'Target vs Sales', {
      text: risk.length ? `${risk.length} of ${rows.length} rep${rows.length === 1 ? '' : 's'} look likely to finish below ${env.s.hi}% of target. Overall the pace points to ${pct((sumP / sumT) * 100)} of target (${money(sumP)} of ${money(sumT)}).`
        : `Everyone is on pace for ${env.s.hi}% or more. Overall the pace points to ${pct((sumP / sumT) * 100)} of target.`,
      table: shown.length ? table([{ key: 'rep', title: 'Rep' }, { key: 'now', title: 'So far', right: true }, { key: 'proj', title: 'Likely month end', right: true }, { key: 'pct', title: '% of target', right: true }, { key: 'need', title: 'Needed per day to reach target', right: true, wide: true }],
        shown.map((r) => ({ rep: r.rep, now: money(r.sales), proj: money(r.projected), pct: pct(r.share), need: money(r.need) })), tones) : undefined,
      notes: [`An estimate: sales so far over ${pr.elapsed} of ${pr.total} working days (Monday to Saturday), carried to month end. It cannot see a large order on the way.`, ...(pr.elapsed < 5 ? ['Early in the month, so treat this loosely.'] : [])],
      actions: [openAction('target_vs_sales', 'Open Target vs Sales')],
    });
  },
};

/** For each customer the usual days between visits (middle value), from the saved Visit Report. */
export function usualGaps(rows: Row[]): Map<string, { name: string; last: Date; gap: number; n: number; rep: string }> {
  const by = new Map<string, { name: string; days: number[]; rep: string }>();
  for (const r of rows) {
    const d = parseDay(r.date), k = text(r.code) || text(r.customer);
    if (!d || !k) continue;
    const e = by.get(k) ?? { name: text(r.customer) || k, days: [], rep: text(r.rep) };
    e.days.push(Math.floor(d.getTime() / DAY_MS)); if (text(r.rep)) e.rep = text(r.rep);
    by.set(k, e);
  }
  const out = new Map<string, { name: string; last: Date; gap: number; n: number; rep: string }>();
  for (const [k, e] of by) {
    const days = [...new Set(e.days)].sort((a, b) => a - b);
    if (days.length < 3) continue; // two gaps at least, or there is no "usual"
    const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b);
    out.set(k, { name: e.name, last: new Date(days[days.length - 1] * DAY_MS), gap: gaps[Math.floor(gaps.length / 2)], n: days.length, rep: e.rep });
  }
  return out;
}
const lapsing: Skill = {
  id: 'lapsing', title: 'Customers about to go cold', examples: ['Which customers are about to go cold?'],
  score: (t) => (hasAny(t, ['lapse', 'lapsing', 'cold', 'churn', 'slipping', 'drifting', 'fading']) || hasAll(t, ['about', 'likely', 'risk'], ['lose', 'lost', 'stop', 'cold']) ? 4 : 0),
  async run(env) {
    const copies = await env.load('visits');
    if (!copies.length) return make({ text: 'This needs the Visit Report saved for a few weeks, so I can see how often each customer is usually visited. Open the Visit Report over the last month or two while online.', actions: [openAction('visits', 'Open Visit Report')] });
    const m = merge(copies);
    const gaps = usualGaps(m.rows);
    const now = Math.floor(env.today.getTime() / DAY_MS);
    const found = [...gaps.values()].map((g) => ({ g, since: now - Math.floor(g.last.getTime() / DAY_MS) }))
      .filter((x) => x.since > Math.max(14, x.g.gap * 1.5)).sort((a, b) => b.since / b.g.gap - a.since / a.g.gap);
    const rows = found.map((x) => ({ name: x.g.name, rep: x.g.rep, usual: `${x.g.gap} days`, since: x.since, last: shortDay(x.g.last) }));
    return finish(env, 'lapsing', { m, rows: m.rows, mods: env.mods }, 'Visit Report', {
      text: found.length ? `${found.length} customer${found.length === 1 ? ' is' : 's are'} overdue against their own visiting rhythm, worst first.` : `No customer is overdue against their usual rhythm (${gaps.size} customers had enough visits to judge).`,
      table: found.length ? table([{ key: 'name', title: 'Customer' }, { key: 'usual', title: 'Usually every', right: true }, { key: 'since', title: 'Days since', right: true }, { key: 'last', title: 'Last visit' }, { key: 'rep', title: 'Rep' }], rows, found.map((x) => (x.since > x.g.gap * 3 ? 'bad' : 'warn') as Tone)) : undefined,
      notes: ['An estimate from the dates in the saved Visit Report. Customers with fewer than three visits there are left out.'],
      actions: [openAction('visits', 'Open Visit Report')],
    });
  },
};

export interface Fact { id: string; label: string; count: number; tone: Tone; question: string }
/** The day's overview from whatever is saved: what needs attention, with the question that opens each item. */
export async function facts(env: Env): Promise<Fact[]> {
  const out: Fact[] = [];
  const att = await dataFor({ ...env, mods: {} }, 'attendance', {});
  if (att?.rows.length) {
    const cut = clockMinutes(env.s.late) ?? 570;
    const by = new Map<string, { v: number; t: number }>();
    let late = 0, gone = 0;
    for (const r of att.rows) {
      if (isAbsent(r)) { gone++; continue; }
      if (isLeave(r)) continue;
      const e = by.get(text(r.rep)) ?? { v: 0, t: 0 };
      e.v += num(r.customer_visits) + num(r.doctor_visits); e.t += num(r.target); by.set(text(r.rep), e);
      const c = clockMinutes(r.start_day); if (c != null && c > cut) late++;
    }
    const low = [...by.values()].filter((e) => e.t > 0 && (e.v / e.t) * 100 < env.s.lo).length;
    if (low) out.push({ id: 'low_visits', label: `${low} rep${low === 1 ? '' : 's'} below ${env.s.lo}% of visit target`, count: low, tone: 'bad', question: 'Which reps are below target on visits?' });
    if (gone) out.push({ id: 'absent', label: `${gone} absence${gone === 1 ? '' : 's'}`, count: gone, tone: 'warn', question: 'Who was absent?' });
    if (late) out.push({ id: 'late', label: `${late} late start${late === 1 ? '' : 's'}`, count: late, tone: 'warn', question: 'Late starters' });
  }
  const la = await dataFor({ ...env, mods: {} }, 'last_activity', {});
  if (la) {
    const n = la.rows.filter((r) => { const d = parseDay(r.last_visit); return !d || (env.today.getTime() - d.getTime()) / DAY_MS > env.s.bad_days; }).length;
    if (n) out.push({ id: 'unvisited', label: `${n} customer${n === 1 ? '' : 's'} not visited for over ${env.s.bad_days} days`, count: n, tone: 'bad', question: `Customers not visited for ${env.s.bad_days} days` });
  }
  const ex = await dataFor({ ...env, mods: {} }, 'expiry', {});
  if (ex) {
    const n = ex.rows.filter((r) => { const left = monthsToExpiry(r.expiry, env.today); return left != null && left < env.s.expiry_months; }).length;
    if (n) out.push({ id: 'expiring', label: `${n} stock line${n === 1 ? '' : 's'} expire within ${env.s.expiry_months} months`, count: n, tone: 'warn', question: 'Products expiring soon' });
  }
  const ag = await dataFor({ ...env, mods: {} }, 'customer_ageing', {});
  if (ag) {
    const n = ag.rows.filter((r) => num(r.d61) > 0).length;
    if (n) out.push({ id: 'ageing', label: `${n} customer${n === 1 ? '' : 's'} with amounts over 60 days`, count: n, tone: 'bad', question: 'Overdue ageing over 60 days' });
  }
  const tv = await dataFor({ ...env, mods: {} }, 'target_vs_sales', {});
  if (tv) {
    const n = repsOf(tv.rows).filter((x) => x.target > 0 && x.share < env.s.lo).length;
    if (n) out.push({ id: 'sales', label: `${n} rep${n === 1 ? '' : 's'} below ${env.s.lo}% of sales target`, count: n, tone: 'bad', question: 'Who is behind on sales target?' });
  }
  return out;
}

// ---- briefings, visit plan, next best actions -------------------------------------------------------------------
const briefing: Skill = {
  id: 'briefing', title: 'Morning or end-of-day briefing', examples: ['Morning briefing', 'End of day summary'],
  score: (t) => (hasAny(t, ['briefing', 'brief', 'morning', 'evening', 'eod', 'wrapup', 'recap']) || hasAll(t, ['end'], ['day']) ? 4 : 0),
  async run(env) {
    const evening = hasAny(env.toks, ['evening', 'eod', 'wrapup', 'recap']) || hasAll(env.toks, ['end'], ['day']);
    const lines: NonNullable<Answer['lines']> = [];
    let source = '';
    const att = await dataFor({ ...env, mods: { ...env.mods, period: undefined } }, 'attendance', {});
    if (att) {
      const day = (r: Row) => { const d = parseDay(r.date); return d ? iso(d) : ''; };
      const target = iso(new Date(env.today.getFullYear(), env.today.getMonth(), env.today.getDate() - (evening ? 0 : 1)));
      const rows = att.rows.filter((r) => day(r) === target);
      const label = evening ? 'Today' : 'Yesterday';
      if (rows.length) {
        const on = rows.filter(worked);
        const visits = on.reduce((a, r) => a + num(r.customer_visits) + num(r.doctor_visits), 0), tgt = on.reduce((a, r) => a + num(r.target), 0);
        const share = tgt ? (visits / tgt) * 100 : NaN;
        lines.push({ text: `${label}: ${on.length} rep${on.length === 1 ? '' : 's'} worked, ${rows.filter(isAbsent).length} absent. Visits ${visits}${tgt ? ` of ${tgt} target (${pct(share)})` : ''}.`, tone: Number.isNaN(share) ? undefined : toneOf(share, env.s), question: evening ? 'Who was absent today?' : 'Who was absent yesterday?' });
        const none = on.filter((r) => num(r.customer_visits) + num(r.doctor_visits) === 0).map((r) => text(r.rep)).filter(Boolean);
        if (none.length) lines.push({ text: `No visits recorded: ${none.slice(0, 5).join(', ')}${none.length > 5 ? ` and ${none.length - 5} more` : ''}.`, tone: 'warn' });
      } else lines.push({ text: `${label}'s attendance is not in the saved copy.` });
      source = sourceLine('Attendance', att.m);
    }
    for (const f of await facts(env)) lines.push({ text: f.label, tone: f.tone, question: f.question });
    if (!lines.length) return missing(env, 'attendance');
    return make({ text: evening ? 'End-of-day summary' : 'Morning briefing', lines, source, actions: [openAction('attendance', 'Open Attendance report')], ctx: undefined, notes: ['Built from the reports saved on this computer, so it is as fresh as those copies.'] });
  },
};

const planWords = ['plan', 'beat', 'route', 'itinerary', 'schedule', 'prioritise', 'prioritize', 'priority', 'focus', 'recommend', 'suggest', 'upsell']
interface Pick { name: string; area: string; why: string; score: number; rep: string }
const planSkill: Skill = {
  id: 'visit_plan', title: 'Visit plan and next best actions', examples: ['Plan my day in Kisumu', 'What should we focus on next?'],
  score: (t) => (hasAny(t, planWords) && !hasAny(t, ['late', 'absent']) ? 2 : 0),
  async run(env) {
    const la = await dataFor(env, 'last_activity', { keys: ['hq', 'area', 'rep'] });
    if (!la) return missing(env, 'last_activity');
    const ag = await dataFor({ ...env, mods: {} }, 'customer_ageing', {});
    const owes = new Map<string, number>();
    for (const r of ag?.rows ?? []) { const v = num(r.d61); if (v > 0) owes.set(text(r.code) || text(r.name), v); }
    const picks: Pick[] = [];
    for (const r of la.rows) {
      const day = parseDay(r.last_visit);
      const age = day ? Math.floor((env.today.getTime() - day.getTime()) / DAY_MS) : null;
      const debt = owes.get(text(r.code)) ?? owes.get(text(r.name)) ?? 0;
      let score = 0; const why: string[] = [];
      if (age == null) { score += 60; why.push('never visited'); } else if (age > env.s.bad_days) { score += Math.min(age, 200) / 2; why.push(`${age} days since last visit`); }
      if (debt > 0) { score += 30; why.push(`${money(debt)} over 60 days`); }
      if (score > 0) picks.push({ name: text(r.name), area: text(r.area || r.hq), why: why.join(', '), score, rep: text(r.rep) });
    }
    picks.sort((a, b) => b.score - a.score);
    const top = picks.slice(0, env.mods.top ?? 10);
    const scope = scopeText(la.mods);
    if (!top.length) return finish(env, 'visit_plan', la, 'Last Activity', { text: `Nobody is overdue for a visit${scope ? ` ${scope}` : ''}. Keep the current rhythm.` });
    const rows = top.map((p, i) => ({ n: i + 1, name: p.name, area: p.area, why: p.why, rep: p.rep }));
    const lines: NonNullable<Answer['lines']> = [];
    const exp = await dataFor({ ...env, mods: {} }, 'expiry', {});
    const soon = exp ? exp.rows.filter((r) => { const m = monthsToExpiry(r.expiry, env.today); return m != null && m >= 0 && m < env.s.expiry_months; }).length : 0;
    if (soon) lines.push({ text: `${soon} stock line${soon === 1 ? '' : 's'} expire soon: offer these first.`, tone: 'warn', question: 'Products expiring soon' });
    return finish(env, 'visit_plan', la, 'Last Activity', {
      text: `Suggested visits${scope ? ` ${scope}` : ''}: most overdue first, with money owed counted in. Order by distance is not available offline yet.`,
      table: table([{ key: 'n', title: '#', right: true }, { key: 'name', title: 'Customer' }, { key: 'area', title: 'Area' }, { key: 'why', title: 'Why' }, { key: 'rep', title: 'Last rep' }], rows, top.map((p) => (p.score >= 60 ? 'bad' : 'warn') as Tone)),
      lines, actions: [openAction('last_activity', 'Open Last Activity', { search: la.mods.area })],
    });
  },
};

const attention: Skill = {
  id: 'attention', title: 'What needs attention', examples: ['What needs attention today?'],
  score: (t) => (hasAny(t, ['attention', 'summary', 'summarise', 'summarize', 'overview', 'briefing', 'highlights', 'problems', 'issues', 'alerts', 'urgent', 'morning']) ? 3 : 0),
  async run(env) {
    const f = await facts(env);
    if (!f.length) {
      const any = (await Promise.all(['attendance', 'last_activity', 'expiry', 'customer_ageing', 'target_vs_sales'].map((r) => env.load(r)))).some((c) => c.length);
      return make({ text: any ? 'Nothing stands out in the saved reports. All clear.' : 'No reports are saved on this computer yet, so there is nothing to check. Open Attendance, Last Activity, Expiry, Customer Ageing or Target vs Sales once while online.' });
    }
    return make({ text: `${f.length} thing${f.length === 1 ? '' : 's'} need${f.length === 1 ? 's' : ''} attention:`, lines: f.map((x) => ({ text: x.label, tone: x.tone, question: x.question })), ctx: undefined });
  },
};

const help: Skill = {
  id: 'help', title: 'What I can answer', examples: ['What can you do?'],
  score: (t) => (hasAny(t, ['help', 'examples']) || hasAll(t, ['what', 'how'], ['can', 'able', 'do']) ? 2 : 0),
  async run(env) {
    return make({ text: 'I answer from the reports saved on this computer, and I open the matching report with the filters set. Try:', lines: SKILLS.filter((s) => s.id !== 'help').map((s) => ({ text: s.examples[0], question: s.examples[0] })), notes: [`Red and amber use your company's limits (${env.s.lo}% and ${env.s.hi}% of target).`] });
  },
};

export const SKILLS: Skill[] = [forecast, lapsing, review, fresh, briefing, planSkill, whyBehind, compare, salesTarget, topReps, visitTarget, lateStart, battery, notVisited, expiry, ageing, absent, attention, help];
export { iso, shortDay };
