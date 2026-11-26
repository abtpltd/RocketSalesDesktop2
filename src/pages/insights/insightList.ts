import type { InsightAvailability, InsightId, InsightPayload } from '../../api/types';

/** The insights, always listed (even when the server cannot build one), with what each one answers. */
export const INSIGHTS: { id: InsightId; title: string; group: 'Doctors' | 'Customers' | 'Products' | 'Field team' | 'Finance'; question: string }[] = [
  { id: 'doctor_coverage', title: 'Doctor coverage by tier', group: 'Doctors', question: 'Are our A, B and C doctors seen as often as planned, and who is missed?' },
  { id: 'detailing_impact', title: 'Detailing impact', group: 'Doctors', question: 'Which products do reps detail, and do the details turn into orders?' },
  { id: 'sample_gift_roi', title: 'Samples and gifts return', group: 'Doctors', question: 'What did the samples and gifts we gave lead to?' },
  { id: 'lapsed_outlets', title: 'Lapsed outlets', group: 'Customers', question: 'Which customers and doctors have gone quiet, and where?' },
  { id: 'churn_risk', title: 'Churn risk', group: 'Customers', question: 'Which customers are ordering later or less than their usual pattern?' },
  { id: 'portfolio_abc', title: 'Portfolio and movers', group: 'Products', question: 'Which products carry the sales, which are growing, and which are stuck?' },
  { id: 'expiry_risk', title: 'Expiry risk', group: 'Products', question: 'Which stock will expire before the customer can sell it?' },
  { id: 'field_day_quality', title: 'Field day quality', group: 'Field team', question: 'How well is each rep\'s day used: start, calls, time with the customer?' },
  { id: 'joint_work', title: 'Joint field work', group: 'Field team', question: 'Which reps were coached in the field, and what changed afterwards?' },
  { id: 'credit_health', title: 'Credit and collections', group: 'Finance', question: 'Who owes us, how old is it, and are we collecting as fast as we sell?' },
];

export const AVAILABILITY_WORDS: Record<InsightAvailability, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ready: { label: 'Ready', tone: 'ok' },
  partial: { label: 'Partly available', tone: 'warn' },
  needs_data: { label: 'Needs data', tone: 'bad' },
};

/** Rows whose chart label (or any text) contains the search words and, when a bar was clicked, whose pick column matches it. */
export function filterRows(rows: InsightPayload['rows'], search: string, pickColumn?: string, picked?: string): InsightPayload['rows'] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (picked && pickColumn && String(r[pickColumn] ?? '') !== picked) return false;
    if (!words.length) return true;
    const text = Object.values(r).join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** True when the payload can show charts and a table (not "needs data" with nothing to show). */
export function hasBody(p: InsightPayload): boolean {
  return p.availability !== 'needs_data' || p.kpis.length > 0 || p.rows.length > 0;
}
