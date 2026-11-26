// The web home page for companies other than kas (html/UI5.3/Dashboard.html with js/api/dashboardChartApi.js):
// six count cards and thirteen charts for the current month, the same for every role.
import type { KasData } from './kas';
import { parseMap } from './kas';

/** Cards in the page's order: [label, active field, inactive field or null]. Active - inactive, as the web prints it. */
export const HOME_CARDS: [string, keyof KasData, keyof KasData | null][] = [
  ['Doctors', 'doctorCount', 'doctorInactive'], ['Customers', 'customerCount', 'customerInactive'],
  ['Products', 'productCount', 'productInactive'], ['Attendance', 'attendanceCount', null],
  ['Visits', 'visitCount', null], ['Orders', 'orderCount', null],
];

/** Charts in the page's order with the web's chart types (Chart.js type -> our kind). */
export const HOME_CHARTS: [string, string, 'line' | 'bar' | 'pie' | 'doughnut'][] = [
  ['CV', 'Customer Visits', 'line'], ['DV', 'Doctor Visits', 'line'], ['T10D', 'Top 10 Doctors', 'bar'],
  ['OTS', 'Orders Trend', 'line'], ['T10C', 'Top 10 Customers', 'doughnut'], ['T10SR', 'Top 10 Sales Rep', 'doughnut'],
  ['T10P', 'Top 10 Products', 'doughnut'], ['HQO', 'HQ Orders', 'bar'], ['CRWO', 'Customer Region Wise Orders', 'bar'],
  ['CCWO', 'Customer Category Wise Order', 'pie'], ['T10RCV', 'Top 10 Reps Customer Visits', 'doughnut'],
  ['SWV', 'Specialty Wise Visits', 'doughnut'], ['HQV', 'HQ Visited', 'bar'],
];

export const cardValue = (d: KasData, active: keyof KasData, inactive: keyof KasData | null): string => {
  const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString() : '-');
  return inactive ? `${n(d[active])} - ${n(d[inactive])}` : n(d[active]);
};

/**
 * Daily lines for the month of `today`: the web plots day 0 to the last day of the month, with 0 for days not in the
 * data. Day 0 never has data, so we start at day 1.
 */
export function homeTrend(d: KasData, today: string) {
  const [y, m] = today.split('-').map(Number);
  const days = y && m ? new Date(y, m, 0).getDate() : 31;
  const visits = parseMap(d.visitDta); const doctors = parseMap(d.doctorVisitDta); const orders = parseMap(d.orderDta);
  const labels: string[] = []; const customer: number[] = []; const doctor: number[] = []; const order: number[] = [];
  for (let i = 1; i <= days; i++) {
    const k = String(i);
    labels.push(k);
    const known = Object.prototype.hasOwnProperty.call(visits, k);
    customer.push(known ? Number(visits[k]) || 0 : 0);
    doctor.push(known ? Number(doctors[k]) || 0 : 0);
    order.push(known ? Number(orders[k]) || 0 : 0);
  }
  return { labels, customer, doctor, order };
}
