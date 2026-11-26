// The KAS dashboard (kas company), worked out the way the web page does it (html/kas/dashboard.html with
// js/dashboard_kas_2Sep.js). The server sends the web payload, except that it replaces the full customer and doctor
// master lists (clientSplit / doctorSplit) with the per-rep counts the script derives from them (repCounts).
import type { MapLike } from '../api/types';

export interface KasRep {
  c: string; n: string; appCategory?: string | null; days?: number;
  doctorUniqueVisit?: number; hospitalUniqueVisit?: number; pharmacyUniqueVisit?: number;
  doctorUniquePlan?: number; hospitalUniquePlan?: number; pharmacyUniquePlan?: number;
  orderCount?: number; orderAmt?: number; orderItems?: number; prospectCount?: number; kolCount?: number; jobsCount?: number;
  [k: string]: unknown;
}

export interface KasData {
  doctorCount?: number; customerCount?: number; productCount?: number; attendanceCount?: number; visitCount?: number; orderCount?: number;
  visitDta?: MapLike; doctorVisitDta?: MapLike; orderDta?: MapLike; specialityDta?: MapLike; hqAmt?: MapLike; hqVisits?: MapLike;
  regionOrderDta?: MapLike; customerCatOrderDta?: MapLike;
  top10Doctor?: [string, number][]; top10Customer?: [string, number][]; top10Product?: [string, number][];
  top10RepAmt?: [string, number][]; top10RepVisit?: [string, number][];
  doctorCodeName?: Record<string, string>; customerCodeName?: Record<string, string>; productCodeName?: Record<string, string>;
  repDtaArray?: KasRep[]; end_day?: number; days_in_month?: number;
  repCounts?: { PHARMACY?: Record<string, number>; HOSPITAL?: Record<string, number>; DOCTOR?: Record<string, number> };
  [k: string]: unknown;
}

/** Count cards (ids in the web page) and their order on the page. */
export const KAS_CARDS: [string, string, keyof KasData][] = [
  ['DCOUNT', 'Doctors', 'doctorCount'], ['CCOUNT', 'Customers', 'customerCount'], ['PCOUNT', 'Products', 'productCount'],
  ['ACOUNT', 'Attendance', 'attendanceCount'], ['VCOUNT', 'Visits', 'visitCount'], ['OCOUNT', 'Orders', 'orderCount'],
];
/** Chart cards (ids, web titles) in the page's own order. */
export const KAS_CHARTS: [string, string][] = [
  ['CV', 'Customer Visits'], ['DV', 'Doctor Visits'], ['T10D', 'Top 10 Doctors (visits)'], ['OTS', 'Orders Trend (value)'],
  ['T10C', 'Top 10 Customers (order value)'], ['T10SR', 'Top 10 Sales Rep (order value)'], ['T10P', 'Top 10 Products (order value)'],
  ['HQO', 'HQ Orders (value)'], ['CRWO', 'Customer Region Wise Orders (value)'], ['CCWO', 'Customer Category Wise Order (value)'],
  ['T10RCV', 'Top 10 Reps Customer Visits'], ['SWV', 'Specialty Wise Visits'], ['HQV', 'HQ Visited'],
];
export const KAS_TABLES = ['SPH', 'SLAB', 'ENGI'] as const;

/**
 * Which items show and in what order: non-admins see only the ids in their role's list; then the page moves the ids
 * of the sequence list to the end, in that order (jQuery append), so ids not in the sequence stay first.
 */
export function arrange(ids: string[], sequence: string[], active: string[], isAdmin: boolean): string[] {
  const shown = isAdmin ? ids : ids.filter((id) => active.includes(id));
  const listed = sequence.filter((id, i) => shown.includes(id) && sequence.indexOf(id) === i);
  return [...shown.filter((id) => !listed.includes(id)), ...listed];
}

export function parseMap(map: MapLike): Record<string, unknown> {
  let v: unknown = map;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return {}; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const num = (v: unknown): number | null => (v === undefined || v === null || v === '' ? null : Number(v));

/** Daily lines: one point per day of the month; days after end_day + 1 are left empty, as on the web. */
export function trend(d: KasData) {
  const visits = parseMap(d.visitDta); const doctors = parseMap(d.doctorVisitDta); const orders = parseMap(d.orderDta);
  const days = Number(d.days_in_month) || 0; const end = Number(d.end_day) || 0;
  const labels: string[] = []; const customer: (number | null)[] = []; const doctor: (number | null)[] = []; const order: (number | null)[] = [];
  for (let i = 0; i < days; i++) {
    const day = String(i + 1);
    labels.push(day);
    const known = has(visits, day);
    const cut = (v: number | null) => (i > end ? null : v);
    customer.push(cut(known ? num(visits[day]) : 0));
    doctor.push(cut(known ? num(doctors[day]) : 0));
    order.push(cut(known ? num(orders[day]) : 0));
  }
  return { labels, customer, doctor, order };
}

/** [label, value] pairs for each chart, built like the web renderers (including which entries they skip). */
export function chartPairs(code: string, d: KasData): [string, number][] {
  const map = (m: MapLike, int = true): [string, number][] =>
    Object.entries(parseMap(m)).map(([k, v]) => [k, int ? Math.trunc(Number(v)) || 0 : Number(v) || 0]);
  const named = (list: [string, number][] | undefined, names: Record<string, string> | undefined, int: boolean, skip: boolean) =>
    (list ?? []).filter(([c]) => !skip || (names && has(names, c)))
      .map(([c, v]): [string, number] => [names ? (names[c] ?? c) : c, int ? Math.trunc(Number(v)) || 0 : Number(v) || 0]);
  switch (code) {
    case 'T10D': return named(d.top10Doctor, d.doctorCodeName, false, true);
    case 'T10C': return named(d.top10Customer, d.customerCodeName, true, true);
    case 'T10P': return named(d.top10Product, d.productCodeName, false, false);
    case 'T10SR': return named(d.top10RepAmt, undefined, true, false);
    case 'T10RCV': return named(d.top10RepVisit, undefined, false, false);
    case 'SWV': return map(d.specialityDta, false);
    case 'HQO': return map(d.hqAmt);
    case 'CCWO': return map(d.customerCatOrderDta);
    case 'CRWO': return map(d.regionOrderDta);
    case 'HQV': return map(d.hqVisits, false);
    default: return [];
  }
}

// ---- the three KPI tables ----
export const average = (count: unknown, days: unknown) => (Number(days) == 0 ? 0 : Number(count) / Number(days)).toFixed(1);
export const orderAvg = (count: unknown, total: unknown) => (Number(total) == 0 ? 0 : Number(count) / Number(total)).toFixed(1);

type Dict = Record<string, number> | undefined;
/** getCoverage: visits / plan (plan 0 or missing -> the rep's assigned masters), at most 100, 2 decimals. */
export function coverage(visits: unknown, plan: unknown, rep: string, dict: Dict): number {
  const count = plan === 0 || plan === null || plan === undefined ? (dict && has(dict, rep) ? Number(dict[rep]) : 0) : Number(plan);
  const pct = count === 0 ? 0 : Math.min(100, (Number(visits) / count) * 100);
  return Number(pct.toFixed(2));
}
/** getMissed: plan (or the rep's assigned masters when the plan is 0) minus visits, never below 0. */
export function missed(visits: unknown, plan: unknown, rep: string, dict: Dict): number {
  const c = Number(visits) || 0;
  let t = Number(plan);
  if (!t) t = dict && has(dict, rep) ? Number(dict[rep]) || 0 : 0;
  return t - c > 0 ? t - c : 0;
}

export interface KasTable { id: string; title: string; columns: { key: string; title: string; hint?: string }[]; rows: Record<string, string | number>[] }

export function kasTables(d: KasData): KasTable[] {
  const reps = [...(d.repDtaArray ?? [])].sort((a, b) => String(a.n).localeCompare(String(b.n)));
  const dicts = d.repCounts ?? {};
  const base = (r: KasRep, i: number) => ({ key: `${r.c}-${i}`, sr: i + 1, mr: `${r.n} (${r.c})`, days: Number(r.days) || 0 });
  const of = (cat: string) => reps.filter((r) => r.appCategory == cat);
  const head = [{ key: 'sr', title: 'SR#' }, { key: 'mr', title: 'MR' }, { key: 'days', title: 'Present Days', hint: 'Attendance Days' }];
  return [
    {
      id: 'SPH', title: 'SALES PHARMA KPI',
      columns: [...head,
        { key: 'dAvg', title: 'Doctor Call AVG', hint: 'Doctors Visited / Present Days' }, { key: 'hAvg', title: 'Hospital Call AVG' },
        { key: 'pAvg', title: 'Pharmacy Call AVG' }, { key: 'vAvg', title: 'Visit Call AVG', hint: 'Visit Call Logs / Present Days' },
        { key: 'dCov', title: 'Doctors Call Coverage', hint: 'Doctors Call Visits / Present Days' },
        { key: 'hCov', title: 'Hospital Call Coverage', hint: 'Hospital Call Visits / Present Days' },
        { key: 'pCov', title: 'Pharmacy Call Coverage', hint: 'Pharmacy Call Visits / Present Days' },
        { key: 'oDay', title: 'AVG Order/Day', hint: 'Month Orders / Present Days' },
        { key: 'drop', title: 'AVG Drop Size', hint: 'Month Orders Amount / Month Orders' },
        { key: 'items', title: 'Avg Items', hint: 'Month Orders Items - Month Orders' },
        { key: 'dMiss', title: 'Doctors Missed Visits', hint: 'Planned Doctors Visits - Actual Visits' },
        { key: 'hMiss', title: 'Hospital Missed Visits', hint: 'Planned Visits - Hospital Visits' },
        { key: 'pMiss', title: 'Pharmacy Missed Visits', hint: 'Planned Visits - Pharmacy Visits' },
        { key: 'prospect', title: 'Prospect' }],
      rows: of('SALES PHARMA').map((r, i) => {
        const dv = Number(r.doctorUniqueVisit) || 0; const hv = Number(r.hospitalUniqueVisit) || 0; const pv = Number(r.pharmacyUniqueVisit) || 0;
        const oc = Number(r.orderCount) || 0;
        return {
          ...base(r, i), dAvg: average(r.doctorUniqueVisit, r.days), hAvg: average(r.hospitalUniqueVisit, r.days),
          pAvg: average(r.pharmacyUniqueVisit, r.days), vAvg: average(dv + hv + pv, r.days),
          dCov: `${coverage(r.doctorUniqueVisit, r.doctorUniquePlan, r.n, dicts.DOCTOR)}%`,
          hCov: `${coverage(r.hospitalUniqueVisit, r.hospitalUniquePlan, r.n, dicts.HOSPITAL)}%`,
          pCov: `${coverage(r.pharmacyUniqueVisit, r.pharmacyUniquePlan, r.n, dicts.PHARMACY)}%`,
          oDay: average(r.orderCount, r.days),
          // the web prints the raw division (many decimals); shown here rounded to 2
          drop: oc == 0 ? 0 : Math.round((Number(r.orderAmt) / oc) * 100) / 100,
          items: orderAvg(r.orderItems, r.orderCount),
          dMiss: missed(r.doctorUniqueVisit, r.doctorUniquePlan, r.n, dicts.DOCTOR),
          hMiss: missed(r.hospitalUniqueVisit, r.hospitalUniquePlan, r.n, dicts.HOSPITAL),
          pMiss: missed(r.pharmacyUniqueVisit, r.pharmacyUniquePlan, r.n, dicts.PHARMACY),
          prospect: Number(r.prospectCount) || 0,
        };
      }),
    },
    {
      id: 'SLAB', title: 'SALES LAB KPI',
      columns: [...head, { key: 'hAvg', title: 'Hospital Visited AVG', hint: 'Hospital Visited / Present Days' },
        { key: 'kol', title: 'KOL Met AVG', hint: 'KOL met / Present Days' }],
      rows: of('SALES LAB').map((r, i) => ({ ...base(r, i), hAvg: average(r.hospitalUniqueVisit, r.days), kol: average(r.kolCount, r.days) })),
    },
    {
      id: 'ENGI', title: 'ENGINEER KPI',
      columns: [...head, { key: 'hAvg', title: 'Hospital Visited AVG', hint: 'Hospital Visited / Present Days' },
        { key: 'jobs', title: 'Services Counts', hint: 'Service call job-card fills' }],
      rows: of('ENGINEER').map((r, i) => ({ ...base(r, i), hAvg: average(r.hospitalUniqueVisit, r.days), jobs: Number(r.jobsCount) || 0 })),
    },
  ];
}
