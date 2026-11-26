import type { InsightId, InsightPayload } from './types';

// Sample data for the Insights screens (`npm run dev:mock`). The server returns the same shape from real data.
const REPS = ['Ann Wanjiru', 'Brian Otieno', 'Cate Mwangi', 'Dan Kiprop', 'Esther Njeri'];
const HQS = ['Nairobi West', 'Nairobi East', 'Mombasa', 'Kisumu', 'Nakuru'];
const DOCS = ['Dr. Kamau', 'Dr. Otieno', 'Dr. Shah', 'Dr. Achieng', 'Dr. Mwende', 'Dr. Patel', 'Dr. Wekesa', 'Dr. Njoroge', 'Dr. Hassan', 'Dr. Mutua'];
const PLACES = ['Aga Khan Hospital', 'Karen Hospital', 'Mater Hospital', 'MP Shah', 'Coast General', 'Kisumu Lab', 'Nakuru Level 5', 'Alpha Chemist', 'Beta Pharmacy', 'City Drugs'];
const PRODUCTS = ['Amoxicillin 500mg', 'Paracetamol 500mg', 'Metformin 850mg', 'Atorvastatin 20mg', 'Omeprazole 20mg', 'Cetirizine 10mg', 'Azithromycin 250mg', 'Losartan 50mg'];
const rnd = (seed: number) => { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const money = (v: number) => Math.round(v).toLocaleString();
const AS_OF = '2026-10-29';

const base = (insight: InsightId, title: string, question: string): Pick<InsightPayload, 'report' | 'insight' | 'title' | 'question' | 'as_of' | 'missing'> =>
  ({ report: 'insights', insight, title, question, as_of: AS_OF, missing: [] });

function doctorCoverage(): InsightPayload {
  const r = rnd(1);
  const tiers = ['A', 'B', 'C'];
  const planned = { A: 4, B: 2, C: 1 } as Record<string, number>;
  const rows = DOCS.map((d, i) => { const tier = tiers[i % 3]; const seen = Math.round(r() * (planned[tier] + 1)); return { key: d, doctor: d, tier, rep: REPS[i % 5], hq: HQS[i % 5], planned: planned[tier], seen, last: `${String(1 + (i * 3) % 28).padStart(2, '0')}-10-2026`, status: seen >= planned[tier] ? 'On plan' : seen === 0 ? 'Missed' : 'Behind' }; });
  const by = (t: string) => rows.filter((x) => x.tier === t);
  const pct = (t: string) => Math.round((by(t).filter((x) => x.status === 'On plan').length * 100) / by(t).length);
  return { ...base('doctor_coverage', 'Doctor coverage by tier', 'Are our A, B and C doctors seen as often as planned, and who is missed?'), availability: 'ready',
    findings: [`${by('A').filter((x) => x.status === 'Missed').length} A-tier doctors were not visited at all this month.`, `A-tier coverage is ${pct('A')}% against ${pct('C')}% for C-tier: the visits are going to the wrong doctors.`, 'Esther Njeri sees most of her C-tier doctors but few A-tier ones.'],
    kpis: [{ label: 'Doctors in plan', value: String(rows.length) }, { label: 'A-tier on plan', value: `${pct('A')}%`, tone: pct('A') < 60 ? 'bad' : 'ok' }, { label: 'B-tier on plan', value: `${pct('B')}%`, tone: 'warn' }, { label: 'Never visited', value: String(rows.filter((x) => x.status === 'Missed').length), tone: 'bad' }],
    charts: [{ title: 'Doctors by tier and status', spec: { kind: 'multi', title: 'Doctors by tier and status', labels: ['A', 'B', 'C'], stacked: true, series: ['On plan', 'Behind', 'Missed'].map((s) => ({ name: s, values: tiers.map((t) => by(t).filter((x) => x.status === s).length) })) } },
      { title: 'Coverage by rep (%)', spec: { kind: 'hbar', title: 'Coverage by rep (%)', pairs: REPS.map((n, i) => [n, 40 + ((i * 17) % 55)] as [string, number]) } }],
    columns: [{ key: 'doctor', title: 'Doctor' }, { key: 'tier', title: 'Tier' }, { key: 'rep', title: 'Rep' }, { key: 'hq', title: 'HQ' }, { key: 'planned', title: 'Planned visits', align: 'right' }, { key: 'seen', title: 'Seen', align: 'right' }, { key: 'last', title: 'Last visit' }, { key: 'status', title: 'Status' }],
    rows, pick: 'tier', actions: ['Ask reps to book the missed A-tier doctors in the next five working days.', 'Cut C-tier calls to once a month and use the time on A-tier.', 'Review tiers every quarter: a doctor who prescribes more should move up.'] };
}

function detailingImpact(): InsightPayload {
  const r = rnd(2);
  const rows = PRODUCTS.map((p, i) => { const details = 20 + Math.round(r() * 90); const orders = Math.round(details * (0.1 + r() * 0.4)); return { key: p, product: p, details, doctors: Math.round(details * 0.6), orders, conversion: `${Math.round((orders * 100) / details)}%`, value: money(orders * (900 + i * 130)) }; });
  return { ...base('detailing_impact', 'Detailing impact', 'Which products do reps detail, and do the details turn into orders?'), availability: 'partial',
    missing: [{ what: 'Which doctor belongs to which customer is not mapped for some reps', how: 'Complete the Doctor to Customer mapping so orders can be linked to the doctors who were detailed.' }],
    findings: ['Atorvastatin is detailed the most but turns into the fewest orders.', 'Omeprazole converts best: 4 in 10 details are followed by an order within 30 days.', 'Details with a call under 3 minutes convert half as often.'],
    kpis: [{ label: 'Details recorded', value: String(rows.reduce((a, x) => a + x.details, 0)) }, { label: 'Doctors reached', value: String(rows.reduce((a, x) => a + x.doctors, 0)) }, { label: 'Followed by an order', value: String(rows.reduce((a, x) => a + x.orders, 0)), tone: 'ok' }, { label: 'Average conversion', value: '27%', tone: 'warn' }],
    charts: [{ title: 'Details by product', spec: { kind: 'hbar', title: 'Details by product', pairs: rows.map((x) => [x.product, x.details] as [string, number]) } }, { title: 'Details that became orders (%)', spec: { kind: 'hbar', title: 'Details that became orders (%)', pairs: rows.map((x) => [x.product, Math.round((x.orders * 100) / x.details)] as [string, number]) } }],
    columns: [{ key: 'product', title: 'Product' }, { key: 'details', title: 'Details', align: 'right' }, { key: 'doctors', title: 'Doctors', align: 'right' }, { key: 'orders', title: 'Orders after', align: 'right' }, { key: 'conversion', title: 'Conversion', align: 'right' }, { key: 'value', title: 'Order value', align: 'right' }],
    rows, pick: 'product', actions: ['Coach reps on the products with many details and few orders: the message may not land.', 'Pair each detail with a clear ask (a trial prescription or a stock order).'] };
}

function sampleGiftRoi(): InsightPayload {
  const r = rnd(3);
  const rows = DOCS.map((d, i) => { const samples = Math.round(r() * 40); const gifts = Math.round(r() * 3000); const orders = Math.round(r() * 60000); return { key: d, doctor: d, rep: REPS[i % 5], samples, gifts: money(gifts), orders: money(orders), ratio: samples + gifts ? (orders / (samples * 50 + gifts + 1)).toFixed(1) : '-', verdict: orders > (samples * 50 + gifts) * 5 ? 'Paying off' : orders > samples * 50 + gifts ? 'Break-even' : 'No return yet' }; });
  return { ...base('sample_gift_roi', 'Samples and gifts return', 'What did the samples and gifts we gave lead to?'), availability: 'partial',
    missing: [{ what: 'Sample cost is not recorded', how: 'Add a cost price to each sample product so the return can be worked out in money.' }],
    findings: [`${rows.filter((x) => x.verdict === 'No return yet').length} doctors received samples or gifts with no order from their customers in 60 days.`, 'The top 3 doctors by return received 18% of all samples.'],
    kpis: [{ label: 'Samples given', value: String(rows.reduce((a, x) => a + x.samples, 0)) }, { label: 'Gift value', value: money(rows.reduce((a, x) => a + Number(x.gifts.replace(/,/g, '')), 0)) }, { label: 'No return yet', value: String(rows.filter((x) => x.verdict === 'No return yet').length), tone: 'bad' }, { label: 'Paying off', value: String(rows.filter((x) => x.verdict === 'Paying off').length), tone: 'ok' }],
    charts: [{ title: 'Doctors by verdict', spec: { kind: 'doughnut', title: 'Doctors by verdict', pairs: ['Paying off', 'Break-even', 'No return yet'].map((v) => [v, rows.filter((x) => x.verdict === v).length] as [string, number]) } }],
    columns: [{ key: 'doctor', title: 'Doctor' }, { key: 'rep', title: 'Rep' }, { key: 'samples', title: 'Samples', align: 'right' }, { key: 'gifts', title: 'Gift value', align: 'right' }, { key: 'orders', title: 'Orders in 60 days', align: 'right' }, { key: 'ratio', title: 'Return x', align: 'right' }, { key: 'verdict', title: 'Verdict' }],
    rows, pick: 'verdict', actions: ['Pause samples for doctors with no return after two rounds.', 'Move the budget to doctors who are paying off.'] };
}

function lapsedOutlets(): InsightPayload {
  const r = rnd(4);
  const rows = PLACES.map((p, i) => { const days = 20 + Math.round(r() * 140); return { key: p, outlet: p, hq: HQS[i % 5], rep: REPS[i % 5], last_visit: days, last_order: days + Math.round(r() * 30), bucket: days > 90 ? '90+ days' : days > 60 ? '61-90 days' : days > 30 ? '31-60 days' : 'Under 30 days' }; });
  return { ...base('lapsed_outlets', 'Lapsed outlets', 'Which customers and doctors have gone quiet, and where?'), availability: 'ready',
    findings: [`${rows.filter((x) => x.bucket === '90+ days').length} outlets have not been visited for over 90 days.`, 'Mombasa has the most lapsed outlets and no visit in the last two weeks.'],
    kpis: [{ label: 'Quiet over 30 days', value: String(rows.filter((x) => x.last_visit > 30).length), tone: 'warn' }, { label: 'Over 90 days', value: String(rows.filter((x) => x.last_visit > 90).length), tone: 'bad' }, { label: 'Worst HQ', value: 'Mombasa' }],
    charts: [{ title: 'Outlets by days since last visit', spec: { kind: 'column', title: 'Outlets by days since last visit', labels: ['Under 30 days', '31-60 days', '61-90 days', '90+ days'], values: ['Under 30 days', '31-60 days', '61-90 days', '90+ days'].map((b) => rows.filter((x) => x.bucket === b).length) } }, { title: 'Quiet outlets by HQ', spec: { kind: 'multi', title: 'Quiet outlets by HQ', mode: 'heat', labels: ['31-60', '61-90', '90+'], series: HQS.map((h) => ({ name: h, values: ['31-60 days', '61-90 days', '90+ days'].map((b) => rows.filter((x) => x.hq === h && x.bucket === b).length) })) } }],
    columns: [{ key: 'outlet', title: 'Outlet' }, { key: 'hq', title: 'HQ' }, { key: 'rep', title: 'Rep' }, { key: 'last_visit', title: 'Days since visit', align: 'right' }, { key: 'last_order', title: 'Days since order', align: 'right' }, { key: 'bucket', title: 'Bucket' }],
    rows, pick: 'bucket', actions: ['Send each rep their own lapsed list at the start of the week.', 'Ask for a reason in the visit notes when an outlet is skipped twice.'] };
}

function churnRisk(): InsightPayload {
  const r = rnd(5);
  const rows = PLACES.map((p, i) => { const usual = 14 + Math.round(r() * 20); const since = usual + Math.round(r() * 40) - 10; const drop = Math.round(r() * 60) - 10; const risk = since > usual * 1.5 || drop > 35 ? 'High' : since > usual * 1.2 || drop > 20 ? 'Watch' : 'Normal'; return { key: p, customer: p, rep: REPS[i % 5], usual_gap: usual, days_since: Math.max(since, 1), value_change: `${-drop}%`, risk }; });
  return { ...base('churn_risk', 'Churn risk', 'Which customers are ordering later or less than their usual pattern?'), availability: 'ready',
    findings: [`${rows.filter((x) => x.risk === 'High').length} customers are well overdue against their own ordering rhythm.`, 'Two customers still order on time but their order value fell by more than a third.'],
    kpis: [{ label: 'High risk', value: String(rows.filter((x) => x.risk === 'High').length), tone: 'bad' }, { label: 'On watch', value: String(rows.filter((x) => x.risk === 'Watch').length), tone: 'warn' }, { label: 'Normal', value: String(rows.filter((x) => x.risk === 'Normal').length), tone: 'ok' }],
    charts: [{ title: 'Customers by risk', spec: { kind: 'doughnut', title: 'Customers by risk', pairs: ['High', 'Watch', 'Normal'].map((v) => [v, rows.filter((x) => x.risk === v).length] as [string, number]) } }],
    columns: [{ key: 'customer', title: 'Customer' }, { key: 'rep', title: 'Rep' }, { key: 'usual_gap', title: 'Usual days between orders', align: 'right' }, { key: 'days_since', title: 'Days since last order', align: 'right' }, { key: 'value_change', title: 'Order value change', align: 'right' }, { key: 'risk', title: 'Risk' }],
    rows, pick: 'risk', actions: ['Visit high-risk customers this week and ask what changed.', 'Check stock and price complaints before the visit.'] };
}

function portfolioAbc(): InsightPayload {
  const r = rnd(6);
  const raw = PRODUCTS.map((p) => ({ p, v: 200000 / (1 + PRODUCTS.indexOf(p)) + r() * 20000, g: Math.round(r() * 60) - 25 }));
  const total = raw.reduce((a, x) => a + x.v, 0);
  let run = 0;
  const rows = raw.map((x) => { run += x.v; const cum = (run * 100) / total; return { key: x.p, product: x.p, sales: money(x.v), share: `${((x.v * 100) / total).toFixed(1)}%`, cumulative: `${cum.toFixed(0)}%`, abc: cum <= 70 ? 'A' : cum <= 90 ? 'B' : 'C', growth: `${x.g > 0 ? '+' : ''}${x.g}%`, mover: x.g > 15 ? 'Rising' : x.g < -15 ? 'Falling' : 'Steady' }; });
  return { ...base('portfolio_abc', 'Portfolio and movers', 'Which products carry the sales, which are growing, and which are stuck?'), availability: 'ready',
    findings: ['Three products make 70% of sales (class A).', `${rows.filter((x) => x.mover === 'Falling').length} products are falling more than 15% against the previous three months.`],
    kpis: [{ label: 'Class A products', value: String(rows.filter((x) => x.abc === 'A').length) }, { label: 'Rising', value: String(rows.filter((x) => x.mover === 'Rising').length), tone: 'ok' }, { label: 'Falling', value: String(rows.filter((x) => x.mover === 'Falling').length), tone: 'bad' }],
    charts: [{ title: 'Sales by product', spec: { kind: 'hbar', title: 'Sales by product', pairs: raw.map((x) => [x.p, Math.round(x.v)] as [string, number]) } }, { title: 'Growth vs previous 3 months (%)', spec: { kind: 'hbar', title: 'Growth vs previous 3 months (%)', pairs: raw.map((x) => [x.p, x.g] as [string, number]) } }],
    columns: [{ key: 'product', title: 'Product' }, { key: 'sales', title: 'Sales', align: 'right' }, { key: 'share', title: 'Share', align: 'right' }, { key: 'cumulative', title: 'Cumulative', align: 'right' }, { key: 'abc', title: 'Class' }, { key: 'growth', title: 'Growth', align: 'right' }, { key: 'mover', title: 'Trend' }],
    rows, pick: 'abc', actions: ['Protect stock and detailing time on class A products.', 'Decide for each falling product: fix, bundle, or stop pushing.'] };
}

function expiryRisk(): InsightPayload {
  const r = rnd(7);
  const rows = PLACES.slice(0, 8).map((p, i) => { const qty = 10 + Math.round(r() * 200); const months = 1 + Math.round(r() * 5); const cover = 1 + Math.round(r() * 8); return { key: p, customer: p, product: PRODUCTS[i % 8], batch_qty: qty, expires_in: `${months} mo`, months_of_cover: cover, risk: cover > months ? 'Will expire' : cover > months * 0.7 ? 'Tight' : 'Safe', value: money(qty * 120) }; });
  return { ...base('expiry_risk', 'Expiry risk', 'Which stock will expire before the customer can sell it?'), availability: 'partial',
    missing: [{ what: 'Customer stock is only known where reps record expiry or stock take', how: 'Ask reps to record expiry on every visit to the top outlets; the cover is worked out from their last 3 months of orders.' }],
    findings: [`${money(rows.filter((x) => x.risk === 'Will expire').reduce((a, x) => a + Number(x.value.replace(/,/g, '')), 0))} of stock at customers is likely to expire unsold.`, 'Offer exchange or a transfer to a faster outlet before the last 60 days.'],
    kpis: [{ label: 'Likely to expire', value: String(rows.filter((x) => x.risk === 'Will expire').length), tone: 'bad' }, { label: 'Tight', value: String(rows.filter((x) => x.risk === 'Tight').length), tone: 'warn' }, { label: 'Value at risk', value: money(rows.filter((x) => x.risk !== 'Safe').reduce((a, x) => a + Number(x.value.replace(/,/g, '')), 0)) }],
    charts: [{ title: 'Stock by risk', spec: { kind: 'doughnut', title: 'Stock by risk', pairs: ['Will expire', 'Tight', 'Safe'].map((v) => [v, rows.filter((x) => x.risk === v).length] as [string, number]) } }],
    columns: [{ key: 'customer', title: 'Customer' }, { key: 'product', title: 'Product' }, { key: 'batch_qty', title: 'Quantity', align: 'right' }, { key: 'expires_in', title: 'Expires in' }, { key: 'months_of_cover', title: 'Months of cover', align: 'right' }, { key: 'risk', title: 'Risk' }, { key: 'value', title: 'Value', align: 'right' }],
    rows, pick: 'risk', actions: ['Arrange exchanges for "Will expire" lines now.', 'Stop supplying more of a product to an outlet that holds more than 6 months of it.'] };
}

function fieldDayQuality(): InsightPayload {
  const r = rnd(8);
  const rows = REPS.map((n, i) => { const calls = 8 + Math.round(r() * 12); const mins = 8 + Math.round(r() * 22); const geo = 60 + Math.round(r() * 40); return { key: n, rep: n, avg_calls: calls, first_call: `${8 + (i % 2)}:${String(10 + Math.round(r() * 40)).padStart(2, '0')}`, avg_minutes: mins, short_visits: Math.round(r() * 12), geofence: `${geo}%`, score: Math.round((calls * 3 + mins + geo) / 2.4) }; });
  return { ...base('field_day_quality', 'Field day quality', "How well is each rep's day used: start, calls, time with the customer?"), availability: 'ready',
    findings: ['Dan Kiprop starts late and makes the fewest calls, but stays longest at each visit.', 'Two reps have more than one in ten visits outside the customer geofence.'],
    kpis: [{ label: 'Average calls a day', value: String(Math.round(rows.reduce((a, x) => a + x.avg_calls, 0) / rows.length)) }, { label: 'Average minutes a visit', value: String(Math.round(rows.reduce((a, x) => a + x.avg_minutes, 0) / rows.length)) }, { label: 'Short visits', value: String(rows.reduce((a, x) => a + x.short_visits, 0)), tone: 'warn' }],
    charts: [{ title: 'Calls by weekday', spec: { kind: 'multi', title: 'Calls by weekday', mode: 'heat', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], series: REPS.map((n, i) => ({ name: n, values: [0, 1, 2, 3, 4, 5].map((d) => 6 + ((i * 3 + d * 5) % 9)) })) } }, { title: 'Day quality score', spec: { kind: 'hbar', title: 'Day quality score', pairs: rows.map((x) => [x.rep, x.score] as [string, number]) } }],
    columns: [{ key: 'rep', title: 'Rep' }, { key: 'avg_calls', title: 'Calls a day', align: 'right' }, { key: 'first_call', title: 'First call' }, { key: 'avg_minutes', title: 'Minutes a visit', align: 'right' }, { key: 'short_visits', title: 'Short visits', align: 'right' }, { key: 'geofence', title: 'In geofence', align: 'right' }, { key: 'score', title: 'Score', align: 'right' }],
    rows, actions: ['Talk to reps with many short visits: the call may not be worth counting.', 'Check the geofence misses before the next review.'] };
}

function jointWork(): InsightPayload {
  const r = rnd(9);
  const rows = REPS.map((n, i) => { const joint = Math.round(r() * 8); const before = 30 + Math.round(r() * 30); const after = before + Math.round(r() * 20) - 5; return { key: n, rep: n, manager: ['Grace Mutiso', 'Peter Ouma'][i % 2], joint_visits: joint, last_joint: joint ? `${String(2 + i * 4).padStart(2, '0')}-10-2026` : '-', strike_before: `${before}%`, strike_after: `${after}%`, change: `${after - before >= 0 ? '+' : ''}${after - before} pts`, coached: joint >= 2 ? 'Yes' : 'No' }; });
  return { ...base('joint_work', 'Joint field work', 'Which reps were coached in the field, and what changed afterwards?'), availability: 'partial',
    missing: [{ what: 'Only joint visits confirmed by the manager\'s code are counted', how: 'Ask managers to confirm each joint call with the one-time code in the app.' }],
    findings: [`${rows.filter((x) => x.coached === 'No').length} reps had fewer than two joint visits this month.`, 'Reps coached at least twice improved their strike rate by 6 points on average.'],
    kpis: [{ label: 'Joint visits', value: String(rows.reduce((a, x) => a + x.joint_visits, 0)) }, { label: 'Reps not coached', value: String(rows.filter((x) => x.coached === 'No').length), tone: 'warn' }],
    charts: [{ title: 'Joint visits by rep', spec: { kind: 'hbar', title: 'Joint visits by rep', pairs: rows.map((x) => [x.rep, x.joint_visits] as [string, number]) } }],
    columns: [{ key: 'rep', title: 'Rep' }, { key: 'manager', title: 'Manager' }, { key: 'joint_visits', title: 'Joint visits', align: 'right' }, { key: 'last_joint', title: 'Last joint visit' }, { key: 'strike_before', title: 'Strike before', align: 'right' }, { key: 'strike_after', title: 'Strike after', align: 'right' }, { key: 'change', title: 'Change', align: 'right' }, { key: 'coached', title: 'Coached' }],
    rows, pick: 'coached', actions: ['Plan next month\'s joint visits around the reps with the weakest strike rate.'] };
}

function creditHealth(): InsightPayload {
  const r = rnd(10);
  const rows = PLACES.map((p, i) => { const b = [0, 1, 2, 3].map(() => Math.round(r() * 80000)); const total = b.reduce((a, x) => a + x, 0); return { key: p, customer: p, rep: REPS[i % 5], current: money(b[0]), d30: money(b[1]), d60: money(b[2]), d90: money(b[3]), total: money(total), over60: total ? `${Math.round(((b[2] + b[3]) * 100) / total)}%` : '0%' }; });
  return { ...base('credit_health', 'Credit and collections', 'Who owes us, how old is it, and are we collecting as fast as we sell?'), availability: 'partial',
    missing: [{ what: 'Credit limits are not recorded per customer', how: 'Set a credit limit on each customer to see who is over it.' }],
    findings: ['A third of the outstanding amount is older than 60 days.', 'Collections this month covered 71% of sales: the balance is growing.'],
    kpis: [{ label: 'Outstanding', value: money(rows.reduce((a, x) => a + Number(x.total.replace(/,/g, '')), 0)) }, { label: 'Older than 60 days', value: '34%', tone: 'bad' }, { label: 'Collected / sold', value: '71%', tone: 'warn' }],
    charts: [{ title: 'Outstanding by age', spec: { kind: 'column', title: 'Outstanding by age', labels: ['Current', '1-30', '31-60', '61+'], values: [0, 1, 2, 3].map((k) => rows.reduce((a, x) => a + Number([x.current, x.d30, x.d60, x.d90][k].replace(/,/g, '')), 0)) } }],
    columns: [{ key: 'customer', title: 'Customer' }, { key: 'rep', title: 'Rep' }, { key: 'current', title: 'Current', align: 'right' }, { key: 'd30', title: '1-30', align: 'right' }, { key: 'd60', title: '31-60', align: 'right' }, { key: 'd90', title: '61+', align: 'right' }, { key: 'total', title: 'Total', align: 'right' }, { key: 'over60', title: 'Over 60 days', align: 'right' }],
    rows, actions: ['Hold new supply to customers with more than half their balance over 60 days.', 'Pair each rep\'s visit plan with their customers\' overdue amounts.'] };
}

/** One insight that has nothing to show yet, to see the "needs data" screen. */
export function sampleNeedsData(id: InsightId): InsightPayload {
  return { ...base(id, 'Not enough data yet', 'This report needs data that is not recorded yet.'), availability: 'needs_data', findings: [], kpis: [], charts: [], columns: [], rows: [], actions: [],
    missing: [{ what: 'No records found', how: 'Start recording the data this report uses, then open it again.' }] };
}

const MAKERS: Record<InsightId, () => InsightPayload> = {
  doctor_coverage: doctorCoverage, detailing_impact: detailingImpact, sample_gift_roi: sampleGiftRoi, lapsed_outlets: lapsedOutlets, churn_risk: churnRisk,
  portfolio_abc: portfolioAbc, expiry_risk: expiryRisk, field_day_quality: fieldDayQuality, joint_work: jointWork, credit_health: creditHealth,
};
export const sampleInsight = (id: string): InsightPayload => (MAKERS[id as InsightId] ?? MAKERS.doctor_coverage)();
