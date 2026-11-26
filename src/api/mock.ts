import { sampleEagle } from './mockEagle';
import { sampleBoard, sampleMonth, sampleRules } from './mockGame';
import { sampleMissing, sampleProductivity } from './mockProductivity';
import { sampleInsight } from './mockInsights';
import type { Api, AppError, GridQuery, FormPayload, FormValue, DashboardPayload, DashboardSummary, Fetched, MappingPayload, MasterListPayload, MenuPayload, OrderDetailPayload, OrderSummaryPayload, OrdersPayload, ReportQuery, SessionInfo, RowsReportPayload, DesignerName } from './types';

// Sample data for `npm run dev:mock`. Pick a case with ?scenario=<name> in the address:
//   default | kas | kpi | offline | login | expired | unsupported | revoked | pending
export type Scenario = 'default' | 'kas' | 'kpi' | 'offline' | 'login' | 'expired' | 'unsupported' | 'revoked' | 'pending' | 'update';

const mockRecords: Record<string, Record<string, FormValue>> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let mockLogo = '';
let mockJoint: import('./types').JointSettings = { enabled: true, confirm: 'app', otp: false, distance_rule: 'flag', distance_meters: 300, max_people: 5, invite_scope: 'hierarchy', auto_close: true };
let mockAssistant: import('./types').AssistantSettings = { enabled: true, roles: [], pinned: ['Which rep needs a visit today?'], lo: 50, hi: 80, late: '09:30', stale_days: 30, bad_days: 60, expiry_months: 3, morning_summary: true, voice: false, ai_mode: 'off' };
const err = (code: string, message: string): AppError => ({ code, message });
const now = () => Math.floor(Date.now() / 1000);

const session = (offline: boolean): SessionInfo => ({
  user: { name: 'Asha Mehta', email: 'asha@demo.example', role: 'ADMIN', is_admin: true },
  company: { domain: 'demo', title: 'Demo Traders Ltd', country: 'KE', currency: 'KES' },
  offline_days: 7, offline, base_url: 'https://demo.rocketsalespharma.net/',
});

const days = (n: number, f: (i: number) => number) =>
  JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), f(i)])));

const sampleRows = (module: string) =>
  Array.from({ length: 230 }, (_, i) => ({
    key: `${module}-${i}`, code: `${module.slice(0, 1).toUpperCase()}${String(i + 1).padStart(4, '0')}`,
    name: `${module === 'doctors' ? 'Dr. ' : ''}Sample ${module.slice(0, -1)} ${i + 1}`,
    route: `Route ${(i % 7) + 1}`, status: i % 9 === 0 ? 'Inactive' : 'Active',
  }));

export const sampleMenu: MenuPayload = {
  sections: [
    { id: 'targets', title: 'Targets/Achievements', icon: 'targets', items: [
      { id: 'targetentry', title: 'Target Entry', path: '/Utility/TargetEntry', group: 'Set targets' },
      { id: 'itemized', title: 'Itemized Targets', path: '/Utility/ItemizedTarget', group: 'Set targets' },
      { id: 'tvs', title: 'Target Vs Sales', path: '/Report/TargetVsSalesReport', group: 'Achievements' },
      { id: 'tvsi', title: 'Target Vs Sales Itemized', path: '/Report/TargetVsSalesReportItemized', group: 'Achievements' },
      { id: 'perf', title: 'Performance Report', path: '/Report/PerformanceReport', group: 'Achievements' },
      { id: 'timeline', title: 'Visit Performance Report', path: '/Report/VisitPerformanceTimeline', group: 'Achievements' } ] },
    { id: 'sales', title: 'Sales & Orders', icon: 'shopping', items: [
      { id: 'home', title: 'Dashboard', path: '/' },
      { id: 'ordergrid', title: 'Order grid', path: '/OrderGrid' },
      { id: 'invoices', title: 'Invoices', path: '/InvoiceGrid' } ] },
    { id: 'purchase', title: 'Purchase', icon: 'inbox', items: [
      { id: 'po', title: 'Purchase orders', path: '/PurchaseOrder' } ] },
    { id: 'inventory', title: 'Inventory & Stock', icon: 'database', items: [
      { id: 'stock', title: 'Stock position', path: '/StockReport' },
      { id: 'transfer', title: 'Stock transfer', path: '/StockTransfer' } ] },
    { id: 'gifts', title: 'Gift & Samples', icon: 'gifts', items: [
      { id: 'samplealloc', title: 'Sample Allocation', path: '/Transactions/SampleAllocationGrid' },
      { id: 'giftalloc', title: 'Gift Allocation', path: '/Transactions/GiftAllocationGrid' },
      { id: 'stockreq', title: 'Gifts/Sample Requests', path: '/Transactions/GiftAndSampleStockRequest' },
      { id: 'samplestock', title: 'Sample Stock', path: '/Transactions/SampleStock' },
      { id: 'giftstock', title: 'Gift Stock', path: '/Transactions/GiftStock' },
      { id: 'giftmaster', title: 'Gifts', path: '/master/GiftMaster' },
      { id: 'samples', title: 'Samples', path: '/Samples' } ] },
    { id: 'machines', title: 'Machine & Equipments', icon: 'machines', items: [
      { id: 'machinelist', title: 'Machine/Equipment List', path: '/master/MachineAndEquipmentMaster' } ] },
    { id: 'field', title: 'Field Force', icon: 'team', items: [
      { id: 'att', title: 'Attendance', path: '/Attendance' },
      { id: 'visits', title: 'Customer visits', path: '/CustomerVisit' },
      { id: 'push', title: 'Push Notification', path: '/master/RockeyPushNotification' },
      { id: 'rpexp', title: 'Route Plan Expense', path: '/Utility/RouteplanExpense' },
      { id: 'contacts', title: 'Upload Contacts', path: '/UploadContacts' },
      { id: 'hdmap', title: 'Hospital-Doctor Mapping', path: '/master/HospitalDoctorMapping' },
      { id: 'eagle', title: 'Eagle Eye View', path: '/EagelEyeView' },
      { id: 'map-view', title: 'Map View', path: '/MapView' },
      { id: 'gamif', title: 'Gamification', path: '/master/Gamification' },
      { id: 'survey', title: 'Survey Form', path: '/Utility/SurveyForm' },
      { id: 'quesbank', title: 'Question Bank', path: '/Utility/QuestionBank' } ] },
    { id: 'customers', title: 'Customers', icon: 'user', items: [
      { id: 'cust', title: 'Customers', path: '/master/Client' },
      { id: 'doc', title: 'Doctors', path: '/master/Doctors' } ] },
    { id: 'products', title: 'Products & Pricing', icon: 'tag', items: [
      { id: 'baseprice', title: 'Base Pricing', path: '/master/BasePricing' },
      { id: 'prod', title: 'Products', path: '/master/Product' },
      { id: 'price', title: 'Price lists', path: '/PriceList' },
      { id: 'pricedisc', title: 'Update Price And Discount', path: '/Utility/UpdatePriceAndDiscount' },
      { id: 'pipeline', title: 'Pipeline Dashboard', path: '/PipelineDashbord' },
      { id: 'loyalty', title: 'Loyalty Program', path: '/master/LoyaltyProgram' },
      { id: 'vanpromo', title: 'App Promo', path: '/master/RocketVanPromo' },
      { id: 'training', title: 'App Training', path: '/master/AppTrainingAction' },
      { id: 'appsettings', title: 'App User Settings', path: '/master/AppUserSettings' } ,
      { id: 'rocketform', title: 'Rocket Form Master', path: '/master/RocketFormMaster' } ] },
    { id: 'finance', title: 'Finance', icon: 'bank', items: [
      { id: 'pay', title: 'Payments', path: '/Payment' } ] },
    { id: 'reports', title: 'Reports', icon: 'bar-chart', items: [
      { id: 'dcr', title: 'Daily call report', path: '/Report/DCR' },
      { id: 'visitrep', title: 'Visit Report', path: '/Report/VisitReport' },
      { id: 'attrep', title: 'Attendance Report', path: '/Report/Attendance' },
      { id: 'isa', title: 'Item Sales Analysis', path: '/Report/ItemSalesAnalysis' },
      { id: 'sss', title: 'Salesman Sales Summary', path: '/Report/SalesmenSalesSummary' },
      { id: 'rep-productivity', title: 'Rep Productivity', path: '/Report/RepProductivity' },
      { id: 'insights', title: 'Insights', path: '/Report/Insights' },
      { id: 'rfr', title: 'Rocket Form Report', path: '/Report/RocketFormReport' },
      { id: 'gogreen', title: 'Go Green Report', path: '/GoGreen' },
      { id: 'spare', title: 'Spare Parts', path: '/master/SpareParts' } ] },
    { id: 'services', title: 'Services', icon: 'services', items: [
      { id: 'svclist', title: 'Service Calls', path: '/Report/ServiceCallReport' },
      { id: 'svc', title: '+ Add Service Call', path: '/Utility/ServiceCall' } ] },
    { id: 'marketing', title: 'Customer App & Marketing', icon: 'marketing', items: [
      { id: 'sms', title: 'Promotional SMS', path: '/Utility/PromotionalSMS' },
      { id: 'smshist', title: 'SMS History', path: '/Utility/PromotionalSMSHistory' } ] },
    { id: 'settings', title: 'Settings & Admin', icon: 'setting', items: [
      { id: 'company', title: 'Company settings', path: '/Settings' },
      { id: 'rocketsales-settings', title: 'RocketSales Settings', path: '/RocketSalesSettings' },
      { id: 'roles', title: 'Backoffice Users Role', path: '/master/CustomizeRoleAccess' },
      { id: 'appuser', title: 'App User', path: '/master/MobileVanUser' },
      { id: 'bousers', title: 'Backoffice Users', path: '/master/AppUser' },
      { id: 'support', title: 'Tip Of The Day', path: '/Support' },
      { id: 'profile', title: 'My Profile', path: '/Profile' },
      { id: 'reset', title: 'Reset Password', path: '/ResetPassword' },
      { id: 'users', title: 'Users', path: '/UserAccount' },
      { id: 'notice', title: 'Notice Board', path: '/master/NoticeBoard' } ] },
  ],
  menu_template: 'html/menu/default.html',
};

const names = (prefix: string, n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i + 1}`, `${prefix === 'C' ? 'Customer' : prefix === 'D' ? 'Doctor' : 'Product'} ${i + 1}`]));
const top = (prefix: string, n: number, base: number): [string, number][] =>
  Array.from({ length: n }, (_, i) => [`${prefix}${i + 1}`, Math.round(base * (1 - i * 0.08))]);

/** A KAS company dashboard (the web payload, with per-rep master counts instead of the full lists). */
/** Headline cards as a server from 2026-10-24 sends them. */
export const SAMPLE_SUMMARY: DashboardSummary = {
  customers: { total: 1727, tagged: 1388, untagged: 339 },
  doctors: { total: 2371, tagged: 1604, untagged: 767 },
  products: { total: 1305, active: 1219, inactive: 86 },
  attendance: { app_users: 38, app_present: 31, backoffice_users: 12, backoffice_present: 9 },
  visits: { customers_done: 112, customers_planned: 146, doctors_done: 75, doctors_planned: 118 },
  orders_today: 22,
};

export function sampleKasDashboard(month = 'Oct-2026'): DashboardPayload {
  const past = month !== 'Oct-2026';
  const days = 31; const end = past ? days : 23;
  const day = (f: (i: number) => number) => JSON.stringify(Object.fromEntries(Array.from({ length: end }, (_, i) => [String(i + 1), f(i)])));
  const rep = (c: string, n: string, appCategory: string, k: number) => ({
    c, n, appCategory, days: 14 + k, doctorUniqueVisit: 40 + 7 * k, hospitalUniqueVisit: 10 + k, pharmacyUniqueVisit: 22 + 3 * k,
    doctorUniquePlan: k % 3 === 0 ? 0 : 70 + k, hospitalUniquePlan: 16 + k, pharmacyUniquePlan: k % 2 ? 0 : 30 + k,
    orderCount: 6 + k, orderAmt: 48000 + 9100 * k, orderItems: 31 + 4 * k, prospectCount: k % 4, kolCount: 5 + k, jobsCount: 3 + k,
  });
  return {
    kind: 'kas', month, today: '2026-10-24', months: ['Oct-2026', 'Sep-2026', 'Aug-2026', 'Jul-2026'],
    previous: { month: 'Sep-2026', visitDta: day((i) => (i % 7 === 6 ? 0 : 110 + ((i * 31) % 55))), doctorVisitDta: day((i) => (i % 7 === 6 ? 0 : 95 + ((i * 19) % 40))),
      orderDta: day((i) => (i % 7 === 6 ? 0 : 172000 + ((i * 6007) % 80000))) },
    layout: { active_kpis: [], count_cards: ['OCOUNT', 'VCOUNT'], chart_cards: ['HQV', 'SWV'] },
    data: {
      doctorCount: 1874, customerCount: 942, productCount: 268, attendanceCount: 31, visitCount: 187, orderCount: 22,
      visitDta: day((i) => (i % 7 === 6 ? 0 : 120 + ((i * 37) % 60))), doctorVisitDta: day((i) => (i % 7 === 6 ? 0 : 90 + ((i * 23) % 45))),
      orderDta: day((i) => (i % 7 === 6 ? 0 : 180000 + ((i * 7919) % 90000))),
      specialityDta: JSON.stringify({ Clinician: 412, Gynaecologist: 233, Paediatrician: 190, ENT: 96, Surgeon: 71 }),
      hqAmt: JSON.stringify({ NAIROBI: 2410000, MOMBASA: 980500, KISUMU: 640200, NAKURU: 410900, ELDORET: 288300 }),
      hqVisits: JSON.stringify({ NAIROBI: 1820, MOMBASA: 760, KISUMU: 515, NAKURU: 340, ELDORET: 260, NYERI: 120 }),
      regionOrderDta: JSON.stringify({ 'Nairobi Metro': 2100000, Coast: 980500, 'Lake Region': 640200, 'Rift Valley': 699200 }),
      customerCatOrderDta: JSON.stringify({ PHARMACY: 2950000, HOSPITAL: 1410000, CLINIC: 360000 }),
      top10Doctor: [['D1', 14], ['D2', 12], ['D3', 11], ['D4', 9], ['D5', 8], ['D6', 8], ['D7', 7]],
      doctorCodeName: { D1: 'Dr. Achieng Otieno', D2: 'Dr. Brian Kamau', D3: 'Dr. Faith Wanjiru', D4: 'Dr. Hassan Ali', D5: 'Dr. Ruth Mutua', D6: 'Dr. Peter Njoroge', D7: 'Dr. Mercy Chebet' },
      top10Customer: [['C1', 612000], ['C2', 455000], ['C3', 390000], ['C4', 260000], ['C5', 198000]],
      customerCodeName: { C1: 'Aga Khan Hospital', C2: 'Goodlife Pharmacy Westlands', C3: 'Mombasa Hospital', C4: 'Haltons Pharmacy', C5: 'Kisumu Medical Centre' },
      top10Product: [['P1', 840000], ['P2', 610000], ['P3', 420000], ['P4', 300000], ['P5', 180000]],
      productCodeName: { P1: 'Glucometer Kit', P2: 'HbA1c Test Strips', P3: 'CRP Rapid Test', P4: 'Urine Analyser Strips' },
      top10RepAmt: [['Ann Wanjiru', 820000], ['Brian Otieno', 640000], ['Cate Mwangi', 512000], ['Dan Kiprop', 330000]],
      top10RepVisit: [['Ann Wanjiru', 410], ['Cate Mwangi', 366], ['Brian Otieno', 301], ['Dan Kiprop', 254]],
      repDtaArray: [rep('R01', 'Brian Otieno', 'SALES PHARMA', 2), rep('R02', 'Ann Wanjiru', 'SALES PHARMA', 4), rep('R03', 'Cate Mwangi', 'SALES PHARMA', 3),
        rep('R04', 'Dan Kiprop', 'SALES LAB', 1), rep('R05', 'Esther Atieno', 'SALES LAB', 0), rep('R06', 'Felix Mwende', 'ENGINEER', 2)],
      repCounts: { PHARMACY: { 'Brian Otieno': 48, 'Cate Mwangi': 51 }, HOSPITAL: {}, DOCTOR: { 'Brian Otieno': 92, 'Cate Mwangi': 110 } },
      end_day: end - 1, days_in_month: days,
    },
  };
}

export function sampleDashboard(full: boolean): DashboardPayload {
  const charts = full ? ['CV', 'OTS', 'T10C', 'T10P', 'T10SR', 'CCWO', 'CRWO', 'HQO', 'T10RCV']
    : ['CV', 'OTS', 'T10C'];
  const counts = full ? ['AC', 'AO', 'DCA', 'PCA', 'ADS', 'AI', 'CC', 'MC'] : ['AC', 'AO', 'CC'];
  return {
    kind: 'kpi', month: 'Oct-2026', today: '2026-10-23',
    layout: { active_kpis: [...charts, ...counts], count_cards: counts, chart_cards: charts },
    data: {
      customerCount: 1284, productCount: 342, attendanceCount: 37, visitCount: 214, orderCount: 96,
      visitDta: days(22, (i) => 180 + ((i * 37) % 70)),
      orderDta: days(22, (i) => 60 + ((i * 53) % 55)),
      hqAmt: JSON.stringify({ Nairobi: 482000, Mombasa: 391000, Kisumu: 255000, Nakuru: 198000 }),
      top10Customer: top('C', 10, 520000), customerCodeName: names('C', 10),
      top10Product: top('P', 10, 310000), productCodeName: names('P', 10),
      top10RepAmt: top('R', 8, 410000), top10RepVisit: top('R', 8, 140),
      regionOrderDta: JSON.stringify({ Central: 38, Coast: 27, Western: 19, Rift: 16 }),
      customerCatOrderDta: JSON.stringify({ Pharmacy: 54, Hospital: 28, Clinic: 18 }),
      AC: '41.5', AO: '88.2', DCA: '12.0', PCA: '6.4', ADS: '3.1', AI: '75.0', CC: '82.3', MC: '14',
    },
  };
}

const SURVEY_TYPES: [string, string][] = [['text', 'Text'], ['paragraph', 'Paragraph'], ['date', 'Date'], ['picture', 'Picture'], ['geotag', 'Geo-Tag'],
  ['switch', 'Yes/No'], ['dropdown', 'Dropdown'], ['multichoice', 'Multi-Choice'], ['radio', 'Radio-Button'], ['numeric', 'Numeric'], ['signature', 'Signature'],
  ['multichoiceother', 'Multi-Choice-Other']];
const surveyField = (title: string, type: string, options: string[] = []): [string, string][] => [['title', title], ['type', type], ['mandatory', 'on'],
  ['defaultvalue', ''], ['subform', ''], ['formlayout', 'VERTICAL'], ['min', '0'], ['max', '100'], ['prefix', ''], ['sufix', ''], ['option', ''],
  ...options.map((o): [string, string] => ['option', o]), ['defaultoption', '']];
const surveyMeta = (key: string, title: string, shortName: string) => ({ key, title, shortName, description: `${title} for field visits`, clientGroup: ['CHEMIST'],
  active: true, forServiceCall: false, forAppMenu: true, forProspect: false, forSalesCall: key === 'F1' });
const mockSurvey = [
  { ...surveyMeta('F1', 'Pharmacy audit', 'PA'), fields: [surveyField('Shop name', 'text'), surveyField('Stock level', 'dropdown', ['Low', 'Medium', 'High']),
    surveyField('Competitor present', 'switch'), surveyField('Shelf photo', 'picture')] },
  { ...surveyMeta('F2', 'Doctor feedback', 'DF'), fields: [surveyField('Feedback', 'paragraph'), surveyField('Interest', 'radio', ['Yes', 'No', 'Later'])] },
  { ...surveyMeta('F3', 'Old sectioned form', 'OS'), fields: [] },
];
const mockRocket = [{ k: 'R1', shortname: 'JC', title: 'Job card', design: 'BaylemJobCard', sendByMail: false },
  { k: 'R2', shortname: 'SC', title: 'Service card', design: 'KasServiceCard', sendByMail: true }];
const mockBank = [{ q: 'What is the adult dose of Product A?', t: 'radio', op: [{ t: '5 mg', a: 'Yes' }, { t: '10 mg', a: 'No' }, { t: '20 mg', a: 'No' }] },
  { q: 'Which are side effects?', t: 'checkbox', op: [{ t: 'Nausea', a: 'Yes' }, { t: 'Headache', a: 'Yes' }, { t: 'Fever', a: 'No' }] }];

// in-memory pipeline for npm run dev:mock
const blankCard = (key: string, name: string) => ({ key, name, stage: '', rep: '', contactPerson: '', phone: '', email: '', linkedIn: '',
  reminderDateStr: '', website: '', category: '', border: '', kind: '' as '' | 'customer' | 'doctor', converted_code: '', converted_kind: '' as '' | 'customer' | 'doctor' });
const mockPipe = {
  stages: ['Lead', 'Contacted', 'Demo', 'Negotiation', 'Won'],
  won: 'Won',
  activities: { Lead: ['Call'], Demo: ['Product detailing', 'Sample given'] } as Record<string, string[]>,
  prospects: [
    { ...blankCard('P1', 'Uhuru Pharmacy'), stage: 'Lead', rep: 'Ann Wanjiru', phone: '0722 145 908', kind: 'customer' as const, category: 'Retail' },
    { ...blankCard('P2', 'Dr Amina Said'), stage: 'Lead', rep: 'Brian Otieno', kind: 'doctor' as const },
    { ...blankCard('P3', 'MedPlus Chemists'), stage: 'Contacted', rep: 'Ann Wanjiru', reminderDateStr: '28-10-2026', kind: 'customer' as const },
    { ...blankCard('P4', 'Dr Peter Otieno'), stage: 'Demo', rep: 'Brian Otieno', kind: 'doctor' as const },
    { ...blankCard('P5', 'Bahari Pharmacy'), stage: 'Negotiation', rep: 'Ann Wanjiru' },
    { ...blankCard('P6', 'CityCare Pharmacy'), stage: 'Won', kind: 'customer' as const, converted_code: 'CM0412', converted_kind: 'customer' as const },
    { ...blankCard('P7', 'Afya Clinic'), stage: 'Visit done' },
  ],
};

// the settings file of npm run dev:mock (kept for the page's life)
const mockPrefsFile: Record<string, string> = {};

export function createMockApi(scenario?: Scenario): Api {
  const s = (scenario ?? (new URLSearchParams(location.search).get('scenario') as Scenario) ?? 'default') || 'default';
  let signedIn = s !== 'login' && s !== 'pending';
  const savedAt = now() - 3 * 3600;

  const offlineOrOnline = async <T>(data: T): Promise<Fetched<T>> =>
    s === 'offline' ? { data, source: 'offline', saved_at: savedAt } : { data, source: 'server', saved_at: now() };

  const api: Api = {
    async sessionRestore() {
      await sleep(300);
      if (s === 'expired') throw err('session_expired', 'Please sign in again.');
      if (s === 'revoked') throw err('device_revoked', 'This computer has been switched off by your administrator.');
      return signedIn ? session(s === 'offline') : null;
    },
    async login(company, _email, password) {
      await sleep(500);
      if (s === 'unsupported') throw err('unsupported', '404 Not Found. The server may be an older version.');
      if (s === 'pending') throw err('device_pending', 'This computer is waiting for approval.');
      if (password === 'wrong') throw err('bad_credentials', 'Check the email and password.');
      if (company === 'locked') throw { ...err('rate_limited', 'Too many.'), retry_after_seconds: 600 };
      if (company === 'off') throw err('company_not_enabled', 'not enabled');
      signedIn = true;
      return session(false);
    },
    async fetchDashboard(month) {
      await sleep(s === 'kpi' ? 900 : 400);
      if (s === 'unsupported') throw err('unsupported', '404 Not Found. The server may be an older version.');
      if (s === 'kas') return offlineOrOnline({ ...sampleKasDashboard(month), summary: SAMPLE_SUMMARY });
      if (s === 'kpi') return offlineOrOnline(sampleDashboard(true));
      const k = sampleKasDashboard(month);  // the same chart data the web home page gets, for this month
      return offlineOrOnline({ ...k, kind: 'home', months: undefined, summary: new URLSearchParams(location.search).has('nosummary') ? undefined : SAMPLE_SUMMARY,
        data: { ...k.data, customerInactive: 3, productInactive: 2, doctorInactive: 11 } });
    },
    async fetchMenu() {
      await sleep(250);
      return offlineOrOnline(sampleMenu);
    },
    async fetchForm(name, key) {
      await sleep(250);
      if (s === 'offline') throw err('offline', 'You are offline. Adding or changing records needs a connection to the server.');
      if (name === 'gamification') {
        const pts = (n: string, l: string, sec = 'Points per activity') => ({ name: n, label: l, kind: 'int' as const, section: sec });
        const fields = [pts('startDay', 'Start day'), pts('endDay', 'End day'), pts('visit', 'Visit'), pts('visitPicture', 'Visit picture'),
          pts('targetVisits', 'Reaching target visits'), pts('geotag', 'Geotag'), pts('order', 'Order'), pts('sales', 'Sales'), pts('avail', 'Availability'),
          pts('feedback', 'Feedback'), pts('goodsReturn', 'Goods return'), pts('salesCollection', 'Sales collection'), pts('paymentColc', 'Payment collection'),
          pts('stockTake', 'Stock take'), pts('survey', 'Survey'), pts('expiry', 'Expiry'), pts('compStock', 'Competitor stock'), pts('addCustomer', 'New customer'),
          pts('addPreCustomer', 'Customer request'), pts('tagVerifyByEmail', 'Geotag verified by email'), pts('customerOtpVerify', 'Customer OTP verify (also gift and detailing)'),
          pts('fullBatteryAtnd', 'Full battery at attendance', 'Tracking'), pts('duTrack', 'Duty tracking', 'Tracking'),
          pts('orderAmtPointDenomitor', 'Order amount per point', 'Amount rules'), pts('salesAmtPointDenomitor', 'Sales amount per point', 'Amount rules'),
          { name: 'customer_group_wise_visit', label: 'Customer group wise visit points', kind: 'switch' as const, section: 'Amount rules' }];
        return { form: name, title: 'Gamification points', path: '/master/Gamification', key: '', can_create: false, can_deactivate: false, status_field: '', list: '',
          fields, values: Object.fromEntries(fields.map((f, i) => [f.name, f.kind === 'switch' ? true : [2, 1, 5, 2, 10, 3, 5, 5, 2, 2, 1, 3, 3, 2, 4, 1, 2, 10, 5, 3, 2, 2, 1, 1000, 1000][i] ?? 0])) } as unknown as FormPayload;
      }
      const saved = key ? (mockRecords[key] ?? { name: `Sample ${name} ${key}`, code: key.toUpperCase(), status: true, uom: 'PCS', price: 120, description: '', sample: false }) : {};
      const payload: FormPayload = {
        form: name, title: name[0].toUpperCase() + name.slice(1, -1), path: '/master/Product', key: key ?? '',
        can_create: true, can_deactivate: true, status_field: 'status', list: name,
        fields: [
          { name: 'code', label: 'Code', kind: 'text', create_only: true, help: 'Leave empty to get the next number automatically.', section: 'Basics' },
          { name: 'name', label: 'Name', kind: 'text', required: true, section: 'Basics' },
          { name: 'status', label: 'Active', kind: 'switch', section: 'Basics' },
          { name: 'description', label: 'Description', kind: 'textarea', section: 'Basics' },
          { name: 'uom', label: 'Unit (UOM)', kind: 'select', options: ['PCS', 'BOX', 'STRIP'].map((v) => ({ value: v, label: v })), section: 'Units' },
          { name: 'price', label: 'Price', kind: 'number', section: 'Price & tax' },
          { name: 'sample', label: 'Sample product', kind: 'switch', section: 'Flags' },
        ],
        values: { code: '', name: '', status: true, uom: 'PCS', price: 0, description: '', sample: false, ...saved } as Record<string, FormValue>,
      };
      return payload;
    },
    async submitForm(name, body) {
      await sleep(400);
      if (s === 'offline') throw err('offline', 'You are offline. Adding or changing records needs a connection to the server.');
      const key = body.key || `${name}-new-${Math.floor(Math.random() * 1000)}`;
      const before = mockRecords[key] ?? {};
      if (body.action === 'deactivate' || body.action === 'activate') mockRecords[key] = { ...before, status: body.action === 'activate' };
      else mockRecords[key] = { ...before, ...(body.values ?? {}) };
      return { ok: true, key, message: body.action === 'create' ? 'Created' : body.action === 'update' ? 'Updated' : body.action === 'deactivate' ? 'Deactivated' : 'Activated' };
    },
    async fetchOrderEdit(kind, key) {
      await sleep(300);
      return { kind, key, editable: true, reason: '', remark: 'deliver Monday', number: 'SO-1001', customer: 'Alpha Chemist', base_price: 'WHOLESALE',
        base_price_lists: ['WHOLESALE', 'RETAIL'],
        lines: [{ index: 0, code: 'P0001', name: 'Sample product A', uom: 'BOX', uc: 10, qty: '2.5', rate: 100, discount: 0, tax: 16, act_wt: 0.1, tax_amt: 34.48, total: 250, sb_amt: 215.5172 },
          { index: 1, code: 'P0002', name: 'Sample product B', uom: 'PCS', uc: 1, qty: '1', rate: 50, discount: 10, tax: 0, act_wt: 0.2, tax_amt: 0, total: 45, sb_amt: 45 }],
        products: Array.from({ length: 40 }, (_, i) => ({ code: `P${String(i + 1).padStart(4, '0')}`, name: `Sample product ${i + 1}`, uom: 'BOX', u2: 'PCS', uc: 10, mrp: 100 + i, wt: 0.1, tx: 16, d: 0, spl: 'SUP', grp: 'OTC' })) };
    },
    async fetchBasePrices() { await sleep(150); return { base_price: { P0003: 99 } }; },
    fetchDesigner: (async (name: DesignerName, key?: string) => {
      await sleep(250);
      if (name === 'rocket_forms') return { rows: mockRocket, designs: ['BaylemJobCard', 'Renaissance', 'VitalMediquip', 'KasServiceCard'] };
      if (name === 'question_banks') {
        const banks = [{ key: 'Q1', title: 'Week 1 product quiz', perday: 3, status: true, questions: mockBank.length }];
        if (key) return { banks, categories: ['MR', 'AM'], editable: true, reason: '', bank: { key: 'Q1', title: 'Week 1 product quiz', perday: 3, status: true, category_list: ['MR'], questions: mockBank } };
        return { banks, categories: ['MR', 'AM'] };
      }
      const forms = mockSurvey.map(({ fields: _f, ...m }) => m);
      const base = { forms, client_groups: ['CHEMIST', 'HOSPITAL', 'CLINIC'], types: SURVEY_TYPES, hidden_types: ['number', 'phone', 'subform'] };
      if (key) { const f = mockSurvey.find((x) => x.key === key) ?? mockSurvey[0]; return { ...base, form: f, editable: key !== 'F3', reason: key === 'F3' ? 'This form has sections, which the web page can no longer save.' : '' }; }
      return base;
    }) as Api['fetchDesigner'],
    async saveDesigner(_name, body) { await sleep(400); return { ok: true, message: body.key ? 'Form updated' : 'Form Created', key: String(body.key || 'NEW') }; },
    async fetchGrid(name, params) {
      await sleep(250);
      const col = (key: string, title: string, kind: 'text' | 'number' | 'int' | 'select' = 'text', edit = false) => ({ key, title, kind, edit });
      const reps = ['Ann Wanjiru', 'Brian Otieno', 'Cate Mwangi'];
      if (name === 'targets') return { name, title: 'Sales targets', month: params.month || '2026-10', note: 'Targets can be set from this month to 11 months ahead.',
        columns: [col('rep', 'Sales person'), col('amount', 'Target amount', 'number', true), col('qty', 'Target qty', 'int', true), col('last_amount', "Last month's target", 'number'), col('sales', 'Achieved', 'number')],
        today: '2026-10-23', rows: reps.map((r, i) => ({ id: r, rep: r, amount: 1000 * (i + 1), qty: 10 * (i + 1), last_amount: i === 2 ? 0 : 950 * (i + 1), sales: 700 * i + 300 })) };
      if (name === 'hq_order_limit') return { name, title: 'HQ order limits', columns: [col('hq', 'HQ'), col('limit', 'Order limit', 'number', true)],
        rows: ['NAIROBI', 'MOMBASA', 'KISUMU'].map((h) => ({ id: h, hq: h, limit: 5000 })) };
      if (name === 'area_distance') return { name, title: 'Area to area distance', columns: [col('hq', 'HQ'), col('from', 'From area'), col('to', 'To area'), col('distance', 'Distance (km)', 'number', true)],
        rows: [['Westlands', 'Karen'], ['Karen', 'Westlands']].map(([f, t]) => ({ id: `${f}_${t}`, hq: 'NAIROBI', from: f, to: t, distance: 12 })) };
      if (name === 'loyalty_points') return { name, title: 'Loyalty points', columns: [col('group', 'Product group'), { ...col('base', 'Based on', 'select', true), options: ['Amount', 'Quantity'] }, col('value', 'For every', 'int', true), col('points', 'Points', 'int', true)],
        rows: ['OTC', 'RX', 'COSMETICS'].map((g, i) => ({ id: g, group: g, base: i ? '' : 'Amount', value: i ? 0 : 100, points: i ? 0 : 1 })) };
      if (name === 'price_discount') return { name, title: 'Update price and discount', supplier: params.supplier || '', suppliers: ['SUP A', 'SUP B'],
        columns: [col('code', 'Code'), col('name', 'Product'), col('mrp', 'Price', 'number', true), col('discount', 'Discount %', 'number', true)],
        rows: params.supplier ? Array.from({ length: 30 }, (_, i) => ({ id: `P${i}`, code: `P${i}`, name: `Product ${i}`, mrp: 100 + i, discount: 0 })) : [] };
      return { name, title: 'Itemized targets', month: params.month || '2026-10', rep: params.rep || '', reps, base_price: params.base_price || '', base_price_lists: ['WHOLESALE'],
        columns: [col('code', 'Code'), col('name', 'Product'), col('group', 'Group'), col('price', 'Price', 'number'), col('last_qty', 'Last month qty', 'number'), col('qty', 'Target qty', 'number', true), col('value', 'Value', 'number')],
        amount_target: params.rep ? 2500 : undefined,
        rows: params.rep ? Array.from({ length: 25 }, (_, i) => ({ id: `P${i}`, code: `P${i}`, name: `Product ${i}`, group: ['Antibiotics', 'Analgesics', 'Paediatrics', 'Diabetes', 'Cardio', 'Allergy'][i % 6], price: 50 + i, last_qty: (i + 1) % 3, qty: i % 3, value: (50 + i) * (i % 3) })) : [] };
    },
    async saveGrid(_name, body) { await sleep(400); return { ok: true, message: `Saved ${Object.keys(body.changes).length}.` }; },
    async fetchStockRequest(key) {
      await sleep(250);
      return { key, doc_number: 'SR-0042', stock_type: 'Gift', to: 'Ann Wanjiru', approved: false, from_places: ['GIFT STORE', 'Brian Otieno'],
        lines: [{ item: 'G1', name: 'Pen', qty: 20 }, { item: 'G2', name: 'Cap', qty: 5 }] };
    },
    async approveStockRequest() { await sleep(400); return { ok: true, message: 'Transfer Stock Successfuly' }; },
    async fetchSetup(name) {
      await sleep(250);
      if (name === 'gamification_rules') return sampleRules() as never;
      const admin = sampleAdmin(name);
      if (admin) return admin as never;
      if (name === 'roles') {
        const g = (title: string, head: string | null, items: [string, string][]) => ({ title, head, items: items.map(([n, l]) => ({ name: n, label: l })) });
        return { name, title: 'User Roles', catalog: { weblogin: true,
          groups: [g('General', null, [['DispatchDashbord', 'Dispatch DashBoard'], ['DELPI', 'Delete PI (Purchase Invoice)'], ['DELST', 'Delete Stock Transfer']]),
            g('Sales', 'Sales', [['SO', 'Sales Order'], ['SOC', 'Sales Order Create'], ['SOE', 'Sales Order Edit'], ['SOAH', 'Sales Order Approve/Hold'], ['SI', 'Sales Invoice'], ['CN', 'Credit Note']]),
            g('Inventory', 'Inventory', [['ICS', 'Current Stock'], ['STIN', 'Stock In'], ['ST', 'Stock Transfer']]),
            g('Utility', 'Utility', [['UUPD', 'Update Price'], ['UTE', 'Target Entry'], ['EEV', 'Eagle Eye View']]),
            g('Reports', 'Report', [['ISA', 'Item Sales Analysis'], ['SSA', 'Salesman Sales Analysis'], ['ATT', 'Attendance'], ['FEED', 'Feedback'], ['DCR', 'DCR']]),
            g('Masters', 'master', [['MP', 'Products'], ['MC', 'Customers'], ['MVU', 'App User'], ['MVUS', 'App User Settings']])],
          dashboard: [{ name: 'SPH', label: 'Sales Pharma KPI' }, { name: 'SLAB', label: 'Sales Lab KPI' }],
          cards: [{ name: 'CCOUNT', label: 'Customers' }, { name: 'DCOUNT', label: 'Doctors' }],
          charts: [{ name: 'CV', label: 'Customer Visits' }, { name: 'DV', label: 'Doctor Visits' }, { name: 'OTS', label: 'Orders Trend' }] },
          roles: [
            { key: 'r1', role: 'PHARMA HEAD', description: 'Heads the pharma reps', weblogin: true, modules: ['Sales', 'SO', 'SOAH', 'Report', 'ISA', 'ATT', 'FEED', 'Utility', 'EEV'], dashboard: ['SPH', 'CV', 'DV'], count_cards: [], chart_cards: [], base: 'b1' },
            { key: 'r2', role: 'SERVICE HEAD', description: '', weblogin: true, modules: ['Inventory', 'ICS'], dashboard: [], count_cards: [], chart_cards: [], base: 'b2' },
            { key: 'r3', role: 'SERVICE TECHNICAL', description: 'Engineers', weblogin: false, modules: [], dashboard: [], count_cards: [], chart_cards: [], base: 'b3' },
          ], desktop: mockDesktopAccess() } as never;
      }
      const products = Array.from({ length: 12 }, (_, i) => ({ c: `P${i + 1}`, n: `Product ${i + 1}`, g: i % 2 ? 'OTC' : 'RX', uom: 'BOX', mrp: 100 + i }));
      if (name === 'van_promos') return { name, title: 'App Promo', count: 3, categories: ['PHARMACY', 'HOSPITAL', 'CLINIC'], groups: ['OTC', 'RX'],
        types: ['Free Item Advance', 'Item Slabs Rate', 'Item Slabs Free', 'Item Free PCS', 'Item Slabs Discount', 'Items Bundle Discount', 'Items Bundle Free'],
        uoms: ['CTN', 'PCS'], products, history: [{ n: 'Slab rate', s: 'On', d: '20Oct 10:12', u: 'admin@demo.com' }],
        offers: [
          { index: 0, title: 'Slab rate October', type: 'Item Slabs Rate', active: true, start: '2026-10-01', end: '2026-10-31', categories: ['ALL'], checked: '01-10-2026', editable: true, codes: ['P1'], base: 'a',
            lines: [{ index: 0, c: 'P1', r: 90, fq: 1, tq: 10 }, { index: 1, c: 'P1', r: 85, fq: 11, tq: 50 }] },
          { index: 1, title: 'Buy 5 get 1', type: 'Items Bundle Free', active: true, start: '2026-10-01', end: '2026-11-30', categories: ['PHARMACY'], checked: '', editable: true, codes: ['P2', 'P3'], base: 'b',
            lines: [{ index: 0, c: ['P2', 'P3'], sq: 5, oc: 'P4', oq: 1 }] },
          { index: 2, title: 'Old free items', type: 'Free Item Advance', active: false, start: '2026-08-01', end: '2026-08-31', categories: ['ALL'], checked: '', editable: true, codes: ['P5'], base: 'c',
            lines: [{ index: 0, sc: 'P5', oc: 'P6', sq: 2, su: 'CTN', oq: 3, ou: 'PCS' }] },
        ] } as never;
      if (name === 'app_training') return { name, title: 'App Training', base: 'x', items: [
        { index: 0, t: 'Welcome to RocketSales', yt: 'https://www.youtube.com/watch?v=abc' },
        { index: 1, t: 'Visit rules', yt: 'Start the visit at the customer.\nTake a photo before ending it.' }] } as never;
      const flag = (n: string, l: string, g: string) => ({ name: n, label: l, group: g });
      const flags = [flag('status', 'Status', 'settings'), flag('pipeline', 'Pipeline', 'activities'), flag('doSales', 'Sales', 'activities'), flag('doOrder', 'Order', 'activities'),
        flag('doFeedback', 'Feedback', 'activities'), flag('customerModule', 'Customer Module', 'settings'), flag('workOnlineOnly', 'Work Online Only', 'settings'),
        flag('hidePrice', 'Hide Price', 'settings'), flag('officeCheckIn', 'Office Check-in', 'settings')];
      return { name, title: 'App User Settings', flags, users: ['Ann Wanjiru', 'Brian Otieno', 'Cate Mwangi'].map((n, i) => ({
        key: `U${i}`, name: n, code: `R0${i + 1}`, pipelineStags: i ? [] : ['Created', 'Won'], assignOfficeCheckIn: [],
        status: true, pipeline: !i, doSales: true, doOrder: i !== 2, doFeedback: false, customerModule: true, workOnlineOnly: false, hidePrice: i === 1, officeCheckIn: false })) } as never;
    },
    async saveSetup() { await sleep(400); return { ok: true, message: 'Updated' }; },
    async fetchTool(name) {
      await sleep(250);
      const reps = ['Ann Wanjiru', 'Brian Otieno', 'Cate Mwangi'];
      if (name === 'push_notification') return { reps: reps.map((r, i) => ({ key: `R${i}`, label: `R0${i + 1}-${r}` })),
        customers: ['Alpha Chemist', 'Beta Pharmacy'].map((c, i) => ({ key: `K${i}`, label: `${c}(C00${i + 1})` })) } as never;
      if (name === 'productivity_settings') return { must_sell: ['P0003'], max: 60, products: Array.from({ length: 12 }, (_, i) => ({ code: `P${String(i + 1).padStart(4, '0')}`, name: `Sample product ${i + 1}` })) } as never;
      if (name === 'route_expense') return { heads: ['FUEL', 'LUNCH', 'HOTEL'], types: ['DAILY', 'WEEKLY', 'MONTHLY'],
        columns: ['CODE', 'EXPENSE_TYPE', 'EXPENSE_HEAD', 'EXPENSE_AMOUNT'],
        reps: reps.map((r, i) => ({ key: `R${i}`, code: `R0${i + 1}`, name: r, active: true, expenses: [{ EXPENSE_TYPE: 'DAILY', EXPENSE_HEAD: 'FUEL', EXPENSE_AMOUNT: 300 + i * 50 }] })) } as never;
      if (name === 'invoice_upload') return { columns: ['Date', 'InvoiceNo', 'Amount', 'CustomerCode', 'Salesmen'], sample: ['26-04-2024', 'IN0132', '123', 'M01', 'RAVI'] } as never;
      if (name === 'hospital_doctor_map') return { columns: ['HOSPITAL CODE', 'DOCTOR CODE', 'REP'], max_rows: 5000, total: 2, shown: 2, links: [
        { hospital_code: 'H001', hospital_name: 'City Hospital', doctor_code: 'D001', doctor_name: 'Dr Amina Yusuf', attended: true, attended_on: '12-11-2026 10:30', by: 'Company' },
        { hospital_code: 'H001', hospital_name: 'City Hospital', doctor_code: 'D002', doctor_name: 'Dr John Kamau', attended: false, attended_on: '', by: 'Ann Wanjiru' }] } as never;
      return { columns: ['CUSTOMER CODE', 'CONTACT NAME', 'DESIGNATION', 'EMAIL', 'PHONE', 'LOCATION NAME', 'LOCATION TAG'] } as never;
    },
    async saveTool(name, body) {
      await sleep(400);
      if (name === 'hospital_doctor_map') {
        // the mock knows hospitals H001-H009 and doctors D001-D009; H001/D001 and H001/D002 are already linked
        const results = ((body.rows as { row: number; hospital_code: string; doctor_code: string; rep: string }[]) ?? []).map((r) => {
          const ok = /^H00\d$/.test(r.hospital_code) && /^D00\d$/.test(r.doctor_code);
          const linked = r.hospital_code === 'H001' && ['D001', 'D002'].includes(r.doctor_code);
          return { row: r.row, hospital_code: r.hospital_code, doctor_code: r.doctor_code, rep: r.rep,
            status: !ok ? 'error' as const : linked ? 'exists' as const : 'new' as const,
            message: !ok ? `${/^H00\d$/.test(r.hospital_code) ? 'Doctor' : 'Hospital'} code ${/^H00\d$/.test(r.hospital_code) ? r.doctor_code : r.hospital_code} does not exist.` : linked ? 'Already linked. Left as it is.' : body.dry_run ? 'Will be linked.' : 'Linked.',
            hospital_name: ok ? 'City Hospital' : undefined, doctor_name: ok ? 'Dr Sample' : undefined };
        });
        const n = results.filter((r) => r.status === 'new').length;
        const bad = results.filter((r) => r.status === 'error').length;
        return { ok: body.dry_run ? n > 0 : bad === 0, message: `${n} linked, ${results.filter((r) => r.status === 'exists').length} already linked (left as they were)${bad ? `, ${bad} not saved` : ''}.`, results, saved: n };
      }
      if (body.dry_run) return { ok: true, message: 'Checked', problems: [], replaced: [{ code: 'R01', name: 'Ann Wanjiru', before: 1, after: 2 }], contacts: 2, customers: 1, skipped: 0, rows: 2 };
      return { ok: true, message: name === 'push_notification' ? 'Notification sent: info' : 'Saved.', recipients: 3 };
    },
    async fetchStockDoc(kind) {
      await sleep(250);
      const store = kind.startsWith('gift') ? 'GIFT STORE' : 'SAMPLE STORE';
      const reps = ['Ann Wanjiru', 'Brian Otieno', 'Cate Mwangi'];
      return { kind, store, reps, from_places: [store, ...reps], managers: { 'Max Kamau': reps.slice(0, 2), 'Lucy Njeri': reps.slice(2) },
        items: Array.from({ length: 12 }, (_, i) => ({ id: `I${i + 1}`, name: `${kind.startsWith('gift') ? 'Gift' : 'Sample'} item ${i + 1}` })) };
    },
    async saveStockDoc(kind) { await sleep(400); return { ok: true, message: kind.endsWith('stock_in') ? 'Stock IN' : 'Allocated' }; },
    async saveOrderEdit() { await sleep(400); return { ok: true, message: 'Saved.' }; },
    async runAction(name) {
      await sleep(400);
      return { ok: true, message: name === 'order_approve' ? 'Order Approved' : name === 'order_hold' ? 'Order OnHold' : 'Order Canceled' };
    },
    async fetchMasterList(q) {
      await sleep(250);
      const all = sampleRows(q.module);
      const needle = (q.search ?? '').trim().toLowerCase();
      const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
      const size = q.size ?? 100;
      const page = q.page ?? 1;
      const payload: MasterListPayload = {
        module: q.module, title: q.module[0].toUpperCase() + q.module.slice(1), path: '',
        columns: [{ key: 'code', title: 'Code' }, { key: 'name', title: 'Name' }, { key: 'route', title: 'Route' }, { key: 'status', title: 'Status' }],
        rows: found.slice((page - 1) * size, page * size), total: found.length, page, size, status: q.status ?? '',
        status_choices: q.module === 'products' ? ['active', 'inactive', 'all'] : [],
      };
      if (q.module === 'app_users') {
        payload.columns = [{ key: 'version', title: 'App version' }, { key: 'live', title: 'Signed in' }, { key: 'code', title: 'Code' }, { key: 'name', title: 'Name' },
          { key: 'manager', title: 'Manager' }, { key: 'user_name', title: 'User name' }, { key: 'location', title: 'Location' }, { key: 'stock_location', title: 'Transfer stock location' }, { key: 'vehicle', title: 'Vehicle' }];
        payload.rows = payload.rows.map((r, i) => ({ ...r, version: '3.4.1', live: i % 2 ? 'LIVE' : '', manager: 'Ben Manager', user_name: 'rep' + i, location: 'Main store', stock_location: 'Depot', vehicle: 'KCA 12' + i, has_device: true,
          actions: [{ name: 'app_user_reset_session', label: 'Reset session', confirm: null, needs: { remarks: { label: 'Reset remarks', default: '' } } }] })) as unknown as typeof payload.rows;
      }
      return offlineOrOnline(payload);
    },
    async fetchMapping(rep, kind) {
      await sleep(250);
      const payload: MappingPayload = {
        module: 'mapping', title: 'Customers/Doctors Mapping', rep, kind,
        reps: [{ name: 'Asha Rep', manager: 'Ben Manager' }, { name: 'Carl Rep', manager: 'Ben Manager' }],
        mapping: rep ? { hq: ['Nairobi HQ'], area: ['Westlands', 'Kilimani'], code: ['C0001', 'C0002'] }
          : { hq: [], area: [], code: [] },
      };
      return offlineOrOnline(payload);
    },
    async fetchOrders(q) {
      await sleep(250);
      const all = Array.from({ length: 140 }, (_, i) => ({
        key: `o${i}`, order_number: `SO${String(1000 + i)}`, received: '2026-10-05 08:30:00', order_date: '2026-10-05',
        code: `C${String(i % 30).padStart(4, '0')}`, customer: `Sample customer ${i % 30}`, onhold: '',
        ex_vat: 8620 + i * 10, total: 10000 + i * 10, status: i % 3 ? 'Created' : 'Approved', creator: 'rep@demo.example',
      }));
      const needle = (q.search ?? '').trim().toLowerCase();
      const found = all.filter((r) => (!q.status || r.status === q.status)
        && (!needle || Object.values(r).some((v) => String(v).toLowerCase().includes(needle))));
      const size = q.size ?? 100;
      const page = q.page ?? 1;
      const payload: OrdersPayload = {
        title: 'Orders', path: '/OrderGrid', from: q.from || '2026-10-01', to: q.to || '2026-10-31', status: q.status ?? '',
        columns: [{ key: 'order_number', title: 'Order number' }, { key: 'order_date', title: 'Order date' },
          { key: 'customer', title: 'Customer' }, { key: 'ex_vat', title: 'Ex VAT' }, { key: 'total', title: 'Total' },
          { key: 'status', title: 'Status' }],
        rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        status_choices: ['Approved', 'Created'],
        sum_ex_vat: found.reduce((s, r) => s + r.ex_vat, 0), sum_total: found.reduce((s, r) => s + r.total, 0),
      };
      return offlineOrOnline(payload);
    },
    async fetchOrder(key) {
      await sleep(250);
      const payload: OrderDetailPayload = {
        order: { order_number: `SO-${key}`, received: '2026-10-05 08:30:00', order_date: '2026-10-05', code: 'C0001',
          customer: 'Sample customer 1', customer_address: 'Westlands, Nairobi', customer_hq: 'Nairobi HQ', customer_route: 'Route 3',
          status: 'Created', onhold: '', ex_vat: 8620, total: 10000, creator: 'rep@demo.example', cancelled: false,
          invoice_number: '', tax_flow: 'EXCLUSIVE' },
        line_columns: [{ key: 'name', title: 'Product' }, { key: 'code', title: 'Code' }, { key: 'qty', title: 'Qty' },
          { key: 'rate', title: 'Rate' }, { key: 'tax_amount', title: 'Tax' }, { key: 'total', title: 'Total' }],
        actions: [{ name: 'order_hold', label: 'Put on hold', needs: { remark: { label: 'Reason', default: '' } } }, { name: 'order_approve', label: 'Approve' },
          { name: 'order_cancel', label: 'Cancel order', confirm: 'Cancel this order? It stays in the list as cancelled.' }],
        lines: [{ name: 'Sample product A', code: 'P0001', qty: 10, rate: 500, tax_amount: 800, total: 5800 },
          { name: 'Sample product B', code: 'P0002', qty: 6, rate: 600, tax_amount: 576, total: 4176 }],
      };
      return offlineOrOnline(payload);
    },
    fetchReport: (async (name: string, q: ReportQuery = {}) => {
      await sleep(300);
      if (s === 'pending') throw err('not_allowed', 'This report is not available in the desktop app for your role or company. Open it in the classic window.');
      if (name === 'visit_timeline') {
        const mk = (start: string, end: string, kind: 'order' | 'order_offline' | 'visit' | 'visit_offline', client: string, amount = 0) => {
          const m = (t: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);
          const s0 = m(start); const e0 = m(end);
          return { client, start, end, s: s0, e: e0, minutes: s0 !== null && e0 !== null ? e0 - s0 : 0, kind, amount,
            history: amount ? [{ k: 'Order', a: amount, t: end }] : [{ k: 'Visit', t: end }] };
        };
        const rep1 = [mk('09:00', '09:25', 'order', 'Alpha Chemist C0001', 4200), mk('09:40', '10:05', 'visit', 'Beta Pharmacy C0002'),
          mk('10:30', '10:50', 'visit_offline', 'Gamma Clinic C0003'), mk('11:15', '11:45', 'order_offline', 'Delta Stores C0004', 900), mk('14:10', '', 'visit', 'Epsilon C0005')];
        const rep2 = [mk('08:50', '09:10', 'visit', 'Zeta Chemist C0010'), mk('13:00', '13:40', 'order', 'Eta Pharmacy C0011', 1500)];
        const lane = (name: string, code: string, v: typeof rep1, start: string, last: string, end: string, percent: number) => ({
          name, code, start, last_visit: last, day_end: end, visits: v, count: v.length, percent, orders: v.reduce((a, x) => a + x.amount, 0),
          start_m: Number(start.slice(0, 2)) * 60 + Number(start.slice(3)), last_m: Number(last.slice(0, 2)) * 60 + Number(last.slice(3)),
          end_m: end ? Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) : null,
        });
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const reps = [lane('Sample rep 1', 'R1', rep1, '08:45', '17:00', '17:00', 18.4), lane('Sample rep 2', 'R2', rep2, '08:30', '16:30', '16:30', 9)]
          .filter((r) => !q.rep || r.code === q.rep);
        return offlineOrOnline({
          report: 'visit_timeline', title: 'Visit Performance Timeline', path: '/Report/VisitPerformanceTimeline',
          from: q.from || '2026-10-23', to: q.to || '2026-10-23', users, rep: q.rep ?? '',
          timeline: { office_start: '06:30', office_end: '17:02', axis_start: 360, axis_end: 1080, days: [{ date: '23-10-2026', reps }] },
        });
      }
      if (name === 'geocode_changes' || name === 'doctor_geocode_changes' || name === 'prescription_audit' || name === 'route_planning'
        || name === 'prospects' || name === 'last_activity') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const defs: Record<string, { title: string; path: string; cols: [string, string][] }> = {
          geocode_changes: { title: 'Geocode Change History', path: '/Report/GoecodeChangeRequestReport', cols: [['date', 'Date'], ['code', 'Code'], ['name', 'Customer Name'], ['geo_code', 'Geotag'], ['new_geo_code', 'New Geocode'], ['rep', 'Rep Name'], ['approved_by', 'Approve By'], ['count', 'ChangeReq Count']] },
          doctor_geocode_changes: { title: 'Doctor Geocode Change History', path: '/Report/DoctorGoecodeChangeRequestReport', cols: [['date', 'Date'], ['code', 'Code'], ['name', 'Customer Name'], ['geo_code', 'Geotag'], ['new_geo_code', 'New Geocode'], ['rep', 'Rep Name'], ['approved_by', 'Approve By'], ['count', 'ChangeReq Count']] },
          prescription_audit: { title: 'Prescription Audit', path: '/Report/GetPrescriptionAuditReport', cols: [['date', 'Date'], ['rep', 'Rep Name'], ['customer', 'Customer Name'], ['hq', 'HQ'], ['area', 'Area'], ['product', 'Products'], ['prescription', 'Prescription'], ['mobile_id', 'Mobile Id']] },
          route_planning: { title: 'Route Planning', path: '/Report/RoutePlanning', cols: [['date', 'Plan Date'], ['hq', 'HQ'], ['area', 'Area'], ['customers', 'Customer'], ['customer_count', 'Customer Count'], ['doctors', 'Doctor'], ['rep', 'User'], ['night_stay', 'Night Stay'], ['remarks', 'Remarks']] },
          prospects: { title: 'Prospect Report', path: '/Report/ProspectReport', cols: [['date', 'Date'], ['customer', 'Customer'], ['rep', 'Rep'], ['time', 'Time'], ['geocode', 'Geocode'], ['hq', 'HQ'], ['area', 'Area'], ['count', 'Product Count'], ['remarks', 'Remark']] },
          last_activity: { title: 'Customers Last Visits & Orders', path: '/Report/CustomersLastVisitsOrdersHistory', cols: [['code', 'Code'], ['name', 'Name'], ['hq', 'HQ'], ['area', 'Area'], ['rep', 'Last Sales-Rep'], ['last_visit', 'Last Visit'], ['last_order', 'Last Order']] },
        };
        const def = defs[name];
        const all = Array.from({ length: 30 }, (_, i) => ({
          key: `g${i}`, date: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026`, code: `C${100 + i}`, name: `Sample ${i}`, geo_code: '-1.28,36.81',
          new_geo_code: '-1.29,36.82', rep: users[i % 2].name, approved_by: 'admin@example.com', count: String(1 + (i % 3)),
          customer: `Sample customer ${i}`, hq: 'Nairobi', area: 'Westlands', product: `Product ${i}`, prescription: 'x1', mobile_id: String(i),
          customers: '1.Alpha\n2.Beta (pay)', customer_count: 2, doctors: '1.Dr One', night_stay: '', remarks: '', time: '10:15AM', geocode: '-1.28,36.81',
          last_visit: '05 Oct, 2026', last_order: '01 Oct, 2026',
        }));
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: name, title: def.title, path: def.path, from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          users: name === 'last_activity' ? undefined : users, rep, columns: def.cols.map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'bank_deposit' || name === 'payment_collection' || name === 'expiry') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const def: Record<string, [string, string][]> = {
          bank_deposit: [['date', 'Date'], ['bank', 'Bank'], ['branch', 'Branch'], ['ref', 'Ref No#'], ['amount', 'Amount'], ['rep', 'Salesrep'], ['vehicle', 'Vehicle No.']],
          payment_collection: [['date', 'Date'], ['customer', 'Customer'], ['hq', 'HQ'], ['area', 'Area'], ['amount', 'Amount'], ['mode', 'PaymentMode'], ['ref', 'Ref No#'], ['remarks', 'Remarks'], ['rep', 'Sales Rep']],
          expiry: [['date', 'Date'], ['rep', 'Sales-Rep'], ['customer', 'Customer'], ['product', 'Product'], ['expiry', 'Expiry'], ['qty', 'Qty']],
        };
        const titles = { bank_deposit: 'Bank Deposit', payment_collection: 'Payment Collection', expiry: 'Expiry' };
        const paths = { bank_deposit: '/Report/BankDepositReport', payment_collection: '/Report/PaymentCollection', expiry: '/Report/ExpiryReport' };
        const all = Array.from({ length: 25 }, (_, i) => ({
          key: `b${i}`, date: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026`, bank: 'KCB', branch: 'CBD', ref: `REF${i}`, amount: '12,000.00',
          rep: users[i % 2].name, vehicle: `KDA${i}`, customer: `Sample customer ${i}`, hq: 'Nairobi', area: 'Westlands', mode: 'MPESA',
          remarks: '', product: `Product ${i}`, expiry: '12-2026', qty: String(i),
        }));
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: name, title: titles[name], path: paths[name], from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          users: name === 'payment_collection' ? [] : users, rep: q.rep ?? '',
          columns: def[name].map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
          summary: name === 'bank_deposit' ? 'Total Amount: 300,000.00' : undefined,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'feedback') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const all = Array.from({ length: 20 }, (_, i) => ({
          key: `f${i}`, date: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026`, customer: `Sample customer ${i}`, rep: users[i % 2].name,
          vehicle: `KDA${100 + i}(V${i % 4})`, feedback: i % 2 ? 'Syrup\nWorks well' : 'Delay: Delivery was late',
        })).filter((r) => !rep || r.rep === users.find((u) => u.code === rep)?.name);
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: 'feedback', title: 'Feedback', path: '/Report/FeedbackReport', from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          users, rep, columns: [['date', 'Date'], ['customer', 'Customer'], ['rep', 'Salesrep'], ['vehicle', 'Vehicle No.'], ['feedback', 'Feedback']]
            .map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'daily_notes') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const all = Array.from({ length: 25 }, (_, i) => ({
          key: `n${i}`, date: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026`, rep: users[i % 2].name, new_customers: i % 3,
          orders: i % 7, notes: 'Market was busy', labeled: 'Stock: low\nPrice: high',
        })).filter((r) => !rep || r.rep === users.find((u) => u.code === rep)?.name);
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: 'daily_notes', title: 'Daily Notes', path: '/Report/DailyNoteReport', from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          users, rep, columns: [['date', 'Date'], ['rep', 'User'], ['new_customers', 'New Customer'], ['orders', 'Orders'], ['notes', 'Notes'],
            ['labeled', 'Labeled Notes']].map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'doctor_meetings') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const all = Array.from({ length: 20 }, (_, i) => ({
          key: `m${i}`, date: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026`, rep: users[i % 2].name, start: '09:00', end: '10:30',
          agenda: `CME topic ${i}`, purpose: 'Product update', remarks: '',
        })).filter((r) => !rep || r.rep === users.find((u) => u.code === rep)?.name);
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: 'doctor_meetings', title: 'Doctor Meeting', path: '/Report/getDoctorMeetings', from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          users, rep, columns: [['date', 'Date'], ['rep', 'Sales-Rep'], ['start', 'Started On'], ['end', 'Ends On'], ['agenda', 'Agenda'],
            ['purpose', 'Purpose'], ['remarks', 'Closing Remarks']].map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'mobile_customers' || name === 'mobile_doctors') {
        const customers = name === 'mobile_customers';
        const cols: [string, string][] = customers
          ? [['date', 'Date'], ['rep', 'Sales-Rep'], ['name', 'Name'], ['person', 'Person'], ['phone', 'Phone'], ['hq', 'HQ'], ['area', 'Area'], ['status', 'Status']]
          : [['date', 'Datetime'], ['rep', 'Sales-Rep'], ['name', 'Name'], ['hq', 'HQ'], ['area', 'Area'], ['speciality', 'Speciality'], ['mobile', 'Mobile']];
        const all = Array.from({ length: 30 }, (_, i) => ({
          key: `m${i}`, date: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026 09:${String(i % 60).padStart(2, '0')}:00`,
          rep: `Sample rep ${i % 3}`, name: customers ? `New shop ${i}` : `Dr New ${i}`, person: 'Owner', phone: '0700000000',
          hq: 'Nairobi', area: 'Westlands', status: 'Pending', speciality: 'General', mobile: '0711000000',
        }));
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: name, title: customers ? 'Mobile Customers' : 'Mobile Doctors', path: customers ? '/Report/MobileCustomer' : '/Report/MobileDoctor',
          from: '', to: '', columns: cols.map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'performance') {
        const kind = q.kind || 'orders';
        const names = ['Asha', 'Bo', 'Cy', 'Dee', 'Eli'];
        const rows = Array.from({ length: 14 }, (_, d) => ({
          key: `d${d}`, date: `${String(1 + d).padStart(2, '0')}-10-2026`,
          ...Object.fromEntries(names.map((_n, i) => [`r${i}`, ((d + 1) * (i + 2) * 137) % 2000])),
        }));
        const payload: RowsReportPayload = {
          report: 'performance', title: `Performance Report (${kind[0].toUpperCase()}${kind.slice(1)})`, path: '/Report/PerformanceReport',
          from: q.from || '2026-10-01', to: q.to || '2026-10-14', managers: ['Lead One', 'Lead Two'], rep: q.rep ?? '', kind,
          columns: [{ key: 'date', title: 'Date' }, ...names.map((n, i) => ({ key: `r${i}`, title: n }))],
          rows, total: rows.length, page: 1, size: rows.length, max: 2000,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'target_itemized') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const all = rep ? Array.from({ length: 15 }, (_, i) => ({
          key: `p${i}`, product: `Product ${String.fromCharCode(90 - i)}`, target_qty: String(100 + i), target_value: '12,000',
          sales_qty: String(i * 7), sales_value: (i * 900).toLocaleString('en-US'),
        })) : [];
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => r.product.toLowerCase().includes(needle)) : all;
        const month = (q.from || '2026-10').slice(0, 7) + '-01';
        const payload: RowsReportPayload = {
          report: 'target_itemized', title: 'Target Vs Sales (itemized)', path: '/Report/TargetVsSalesReportItemized', from: month, to: month,
          users, rep, columns: [['product', 'Product Name'], ['target_qty', 'Target Qty'], ['target_value', 'Target Value'],
            ['sales_qty', 'Sales Qty'], ['sales_value', 'Sales Value']].map(([key, title]) => ({ key, title })),
          rows: found, total: found.length, page: 1, size: q.size ?? 100,
        };
        if (rep && s !== 'unsupported') {
          const rows = found.map((r, i) => {
            const tq = 100 + i, tv = tq * 120, sq = Math.round(tq * [1.15, 1.14, 0.97, 0.89, 0.71, 0.63, 0.53, 0.24][i % 8]), sv = sq * 120;
            return { ...r, target_qty_n: tq, target_value_n: tv, sales_qty_n: sq, sales_value_n: sv, pct: Math.round(sv / tv * 1000) / 10 };
          });
          const tv = rows.reduce((a, r) => a + r.target_value_n, 0), sv = rows.reduce((a, r) => a + r.sales_value_n, 0);
          Object.assign(payload, { rows, totals: { target_value: tv, sales_value: sv, pct: Math.round(sv / tv * 1000) / 10 },
            unplanned: [{ code: 'X1', product: 'Cetirizine Syrup 60ml', qty: 40, value: 28900 }, { code: 'X2', product: 'Diclofenac Gel 30g', qty: 30, value: 21300 }], unplanned_value: 50200 });
        }
        return offlineOrOnline(payload);
      }
      if (name === 'customer_ageing') {
        const all = Array.from({ length: 150 }, (_, i) => {
          const b = i % 6;
          return {
            key: `c${i}`, code: `C${1000 + i}`, name: `Sample customer ${i}`, hq: 'Nairobi', area: 'Westlands', sm: 'Rep A,Rep B',
            d7: b === 0 ? '20-10-2026' : '', d15: b === 1 ? '12-10-2026' : '', d30: b === 2 ? '05-10-2026' : '',
            d60: b === 3 ? '10-09-2026' : '', d61: b === 4 ? '01-06-2026' : '',
          };
        });
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: 'customer_ageing', title: 'Customer Order Ageing', path: '/Report/CustomerPurchaseAgeingReport',
          from: '2026-10-23', to: '2026-10-23',
          columns: [['code', 'Code'], ['name', 'Name'], ['hq', 'HQ'], ['area', 'Area'], ['sm', 'Sales Person'], ['d7', '7 Days'],
            ['d15', '8-15 Days'], ['d30', '16-30 Days'], ['d60', '31-60 Days'], ['d61', 'Over 60']].map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'target_vs_sales') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const all = Array.from({ length: 12 }, (_, i) => ({
          key: `t${i}`, rep: `Sample rep ${i + 1}`, target: (9500 + i * 100).toLocaleString('en-US'), sales: (i * 700).toLocaleString('en-US'),
        })).filter((r) => !rep || r.rep === users.find((u) => u.code === rep)?.name);
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => r.rep.toLowerCase().includes(needle)) : all;
        const month = (q.from || '2026-10').slice(0, 7) + '-01';
        const payload: RowsReportPayload = {
          report: 'target_vs_sales', title: 'Target Vs Sales', path: '/Report/TargetVsSalesReport', from: month, to: month,
          users, rep, columns: [{ key: 'rep', title: 'App User' }, { key: 'target', title: 'Target' }, { key: 'sales', title: 'Sales' }],
          rows: found, total: found.length, page: 1, size: q.size ?? 100,
        };
        if (s !== 'unsupported') {
          const past = month < '2026-10-01', gone = past ? 31 : 23;
          const P = [1.03, 0.94, 0.93, 0.92, 0.85, 0.81, 0.67, 0.65, 0.57, 0.88, 1.1, 0.4];
          const T = [1200000, 650000, 750000, 1100000, 950000, 850000, 900000, 800000, 700000, 600000, 500000, 450000];
          const rows = found.map((r) => {
            const i = Number(r.key.slice(1)); const target = T[i], sales = Math.round(target * P[i] * (past ? 1.05 : 1));
            const projected = past ? sales : Math.round(sales / gone * 31); const pct = Math.round(sales / target * 1000) / 10; const ppct = Math.round(projected / target * 1000) / 10;
            const status = sales >= target ? 'ahead' : past ? 'missed' : ppct >= 100 ? 'on_track' : 'behind';
            let run = 0; const daily = Array.from({ length: gone }, (_, d) => (run += (sales / gone) * (0.6 + ((d * 37) % 9) / 10)));
            const k = sales / (daily[daily.length - 1] || 1);
            return { ...r, target: target.toLocaleString('en-US'), sales: sales.toLocaleString('en-US'), target_n: target, sales_n: sales, pct, gap: sales - target, projected, projected_pct: ppct, status, daily: daily.map((v) => Math.round(v * k)) };
          });
          const counts = { ahead: 0, on_track: 0, behind: 0, missed: 0, no_target: 0 } as Record<string, number>;
          rows.forEach((r) => { counts[r.status] += 1; });
          Object.assign(payload, { rows, month_days: 31, days_gone: gone,
            totals: { target: rows.reduce((a, r) => a + r.target_n, 0), sales: rows.reduce((a, r) => a + r.sales_n, 0), projected: rows.reduce((a, r) => a + r.projected, 0), counts } });
        }
        return offlineOrOnline(payload);
      }
      if (name === 'detailing' || name === 'sampling' || name === 'gifts') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const all = Array.from({ length: 40 }, (_, i) => ({
          key: `x${i}`, dt: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026 10:${String(i % 60).padStart(2, '0')}:00`,
          user_code: `R${1 + (i % 2)}`, type: 'Doctor', user: `Sample rep ${1 + (i % 2)}`, code: `D${i}`,
          doctor: `Dr Sample ${i}`, count: 2, items: 'Item A, Item B', remarks: '',
        })).filter((r) => !rep || r.user_code === rep);
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const titles = { detailing: 'Detailing Report', sampling: 'Sampling Report', gifts: 'Gifts Report' };
        const paths = { detailing: '/DoctorReport/Detailing', sampling: '/DoctorReport/Sampeling', gifts: '/DoctorReport/Gifts' };
        const cols: [string, string][] = name === 'detailing'
          ? [['dt', 'Datetime'], ['user_code', 'User Code'], ['type', 'Type'], ['user', 'User'], ['code', 'Code'], ['doctor', 'Doctor/Customer'], ['count', 'Count'], ['items', 'Items'], ['remarks', 'Remarks']]
          : [['dt', 'Datetime'], ['user', 'User'], ['doctor', 'Doctor'], ['count', 'Count'], ['items', 'Items']];
        const payload: RowsReportPayload = {
          report: name, title: titles[name], path: paths[name], from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          users, rep, columns: cols.map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'dcr') {
        const users = [{ code: 'R1', name: 'Sample rep 1' }, { code: 'R2', name: 'Sample rep 2' }];
        const rep = q.rep ?? '';
        const all = rep ? Array.from({ length: 25 }, (_, i) => ({
          key: `d${i}`, date: `${String(1 + (i % 20)).padStart(2, '0')}-10-2026`, in_time: '09:05AM', out_time: '09:30AM',
          rep: users.find((u) => u.code === rep)?.name ?? '', pre_call: '', type: i % 3 ? 'Chemist' : 'Doctor',
          name: `Sample customer ${i}`, hq: 'Nairobi', area: 'Westlands', onsite: 'Onsite', planned: i % 2 ? 'Y' : 'N',
          speciality: '', category: 'A', product: 'Product A\nProduct B', amount: '1,200.00', gift_sample: '(G) Pen (2)',
          stock: 'Tab(5)', remarks: '', work_with: '',
        })) : [];
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: 'dcr', title: 'Daily Call Report', path: '/Report/DCR', from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          users, rep, rep_name: users.find((u) => u.code === rep)?.name,
          columns: [['date', 'Date'], ['in_time', 'In Time'], ['out_time', 'Out Time'], ['rep', 'Rep'], ['pre_call', 'Pre Call Remark'],
            ['type', 'Type'], ['name', 'Name'], ['hq', 'HQ'], ['area', 'Area'], ['onsite', 'Onsite'], ['planned', 'Planned'],
            ['speciality', 'Specialization'], ['category', 'Category'], ['product', 'Product'], ['amount', 'Amount'],
            ['gift_sample', 'Gift/Sample(Qty)'], ['stock', 'Stock'], ['remarks', 'Remark'], ['work_with', 'Work With']]
            .map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'attendance') {
        const all = Array.from({ length: 90 }, (_, i) => ({
          key: `a${i}`, date: `${String(1 + (i % 30)).padStart(2, '0')}-10-2026`, rep: `Sample rep ${i % 6}`, ap: i % 7 ? 'P' : 'A',
          half_day: i % 11 === 4 ? 'First half' : '', start_day: i % 5 === 3 ? '10:20AM(88%)' : '08:05AM(95%)', end_day: '05:10PM(40%)', first_visit: '9:00 AM - 9:30 AM',
          last_visit: '3:00 PM - 3:20 PM', customer_visits: [8, 4, 6, 2, 7, 3][i % 6], doctor_visits: [2, 1, 1, 0, 1, 1][i % 6], productive: 5, target: 10,
        }));
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: 'attendance', title: 'Attendance', path: '/Report/Attendance', from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          columns: [['date', 'Date'], ['rep', 'Sales Person'], ['ap', 'A/P'], ['start_day', 'Start Day'], ['end_day', 'End Day'],
            ['first_visit', 'First Visit'], ['last_visit', 'Last Visit'], ['customer_visits', 'Customer Visits'],
            ['doctor_visits', 'Doctor Visits'], ['productive', 'Productive Visits'], ['target', 'Visit Target']]
            .map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'joint_calls') {
        const rows = [
          { key: 'j1', date: '05-10-2026', customer: 'Afya Chemist', members: 'Asha Rep, Brian Otieno', people: 2, status: 'Closed',
            key_points: 'Stock check; new brochure shared', improve: 'Detailing depth', actions: 'Send brochure (Asha Rep / 2026-10-12)', started_by: 'Asha Rep' },
          { key: 'j2', date: '07-10-2026', customer: 'Dr. Mwangi', members: 'Brian Otieno, Cy Kamau, Asha Rep', people: 3, status: 'Open',
            key_points: '', improve: '', actions: '', started_by: 'Brian Otieno' },
        ];
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : rows;
        const payload: RowsReportPayload = {
          report: 'joint_calls', title: 'Joint Calls', path: '/JointCalls', from: q.from || '2026-10-01', to: q.to || '2026-10-25',
          columns: [['date', 'Date'], ['customer', 'Customer'], ['members', 'Together'], ['people', 'People'], ['status', 'Status'],
            ['key_points', 'Key points'], ['improve', 'To improve'], ['actions', 'Action points'], ['started_by', 'Started by']].map(([key, title]) => ({ key, title })),
          rows: found, total: found.length, page: 1, size: q.size ?? 100,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'visits') {
        const all = Array.from({ length: 180 }, (_, i) => ({
          key: `v${i}`, date: '05-10-2026', start: '08:30AM', end: '09:10AM', type: i % 5 ? 'C' : 'D', code: `C${String(i).padStart(4, '0')}`,
          customer: `Sample customer ${i}`, hq: 'Nairobi HQ', area: 'Westlands', planned: i % 3 ? 'YES' : 'NO', order: '12,000',
          order_qty: '30', sales: '0', rep: 'Asha Rep', visit_type: 'Onsite', feedback: 'Good', remarks: '', distance: '25 Meters',
          expense: 0, short_visit: '', visited_with: '', tier: '', activities: 'Contact: 1',
        }));
        // one shared visit: a single row naming everyone who was there, with a "People" column
        Object.assign(all[0], { rep: 'Asha Rep, Brian Otieno', visit_type: 'Joint', joint: 2, customer: 'Afya Chemist (joint)' });
        const needle = (q.search ?? '').trim().toLowerCase();
        const found = needle ? all.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(needle))) : all;
        const size = q.size ?? 100;
        const page = q.page ?? 1;
        const payload: RowsReportPayload = {
          report: 'visits', title: 'Visit Report', path: '/Report/VisitReport', from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          columns: [['date', 'Date'], ['start', 'In time'], ['end', 'Out time'], ['type', 'Type'], ['code', 'Code'], ['customer', 'Customer/Doctor'],
            ['hq', 'HQ'], ['planned', 'Planned?'], ['order', 'Order'], ['sales', 'Sales'], ['rep', 'Sales Rep'], ['visit_type', 'Visit Type'], ['joint', 'People']]
            .map(([key, title]) => ({ key, title })),
          rows: found.slice((page - 1) * size, page * size), total: found.length, page, size,
        };
        return offlineOrOnline(payload);
      }
      if (name === 'insights') return offlineOrOnline(sampleInsight(q.kind ?? '') as never);
      if (name === 'rep_productivity') return offlineOrOnline((q.kind === 'missing' ? sampleMissing() : sampleProductivity(q.from || '2026-10')) as never);
      if (name === 'gamification') return offlineOrOnline((q.kind === 'month' ? sampleMonth(q.from || '2026-10') : sampleBoard(q.from || '2026-10')) as never);
      if (name === 'map_view') return offlineOrOnline(sampleMapView(q.kind === 'doctors' ? 'doctors' : 'customers', q.from || '2026-10-01', q.to || '2026-10-25') as never);
      if (name === 'tag_visits') return offlineOrOnline(sampleTagVisits(q.search ?? 'C1', q.kind === 'doctors' ? 'doctors' : 'customers', q.from || '2026-10-01', q.to || '2026-10-25') as never);
      if (name === 'eagle_eye') return offlineOrOnline(sampleEagle(q.rep ?? '', q.from || '2026-10-23') as never);
      if (name === 'pipeline') {
        const C = ['#DC143C', '#FF8C00', '#FFD700', '#32CD32', '#008080'];
        const stages = ['Created', 'Contacted', 'Proposal', 'Negotiation', 'Won'];
        const all = Array.from({ length: 14 }, (_, i) => ({ key: `P${i}`, name: `${['Aga Khan', 'Nairobi West', 'MP Shah', 'Karen', 'Coast General', 'Kisumu Lab', 'Mater'][i % 7]} ${i < 7 ? 'Hospital' : 'Lab'}`,
          stage: stages[i % 5], rep: ['Ann Wanjiru', 'Brian Otieno', ''][i % 3], contactPerson: i % 2 ? 'Dr. Kamau' : '', phone: '0700 000 00' + (i % 10),
          email: '', linkedIn: '', reminderDateStr: i % 4 === 0 ? '30-10-2026' : '', website: '', category: i < 7 ? 'Hospital' : 'Lab', border: C[(i + 1) % 5] }));
        const sq = (q.search || '').toLowerCase();
        const shown = all.filter((c) => !sq || Object.values(c).some((v) => String(v).toLowerCase().includes(sq)));
        return offlineOrOnline({ report: 'pipeline', title: 'Pipeline Dashboard', path: '/PipelineDashbord', columns: [], rows: [], total: shown.length,
          page: 1, size: shown.length, from: '', to: '', hidden: 1,
          stages: stages.map((s, i) => ({ stage: s, color: C[i], cards: shown.filter((c) => c.stage === s) })) } as unknown as OrderSummaryPayload);
      }
      if (name === 'go_green' || name === 'rocket_form_report') {
        const green = name === 'go_green';
        const users = green ? [{ code: 'CH1', name: 'Goodlife Chain' }] : [{ code: 'R1', name: 'Ann Wanjiru' }, { code: 'R2', name: 'Brian Otieno' }];
        const rows = green
          ? ['Amoxil 500', 'Panadol', 'Zinc tabs', 'ORS sachet', 'Vitamin C'].map((p, i) => ({ key: `P${i}`, product: p, 'o:B1': i % 2 ? '' : 4 + i, 'o:B2': i === 1 ? 6 : '', 'o:B3': i < 3 ? 2 : '' }))
          : ['City Lab', 'Beta Pharmacy', 'Gamma Clinic'].map((c, i) => ({ key: `K${i}`, date: `2026-10-2${i} 10:1${i}`, rep: users[i % 2].name, customer: c, code: `C00${i}`,
            short_name: c.split(' ')[0], title: 'Equipment audit', design: 'D1', print: i === 2 ? '' : `/mobile/RocketForm?design=D1&k=K${i}` }));
        const columns = green ? [['product', 'Product'], ['o:B1', 'Westlands'], ['o:B2', 'Karen'], ['o:B3', 'CBD']]
          : [['date', 'Date'], ['rep', 'Sales person'], ['customer', 'Customer'], ['code', 'Customer code'], ['short_name', 'Short name'], ['title', 'Form'], ['design', 'Design']];
        const picked = !green || q.rep;
        return offlineOrOnline({ report: name, title: green ? 'Go Green Report' : 'Rocket Form Report', path: '/', from: q.from || '2026-10-20', to: q.to || '2026-10-24',
          columns: (picked ? columns : columns.slice(0, 1)).map(([key, title]) => ({ key, title })), rows: picked ? rows : [], total: picked ? rows.length : 0,
          page: 1, size: 100, users, rep: q.rep ?? '', summary: green && picked ? '5 of 5 products ordered' : '' } as unknown as OrderSummaryPayload);
      }
      if (name !== 'order_summary') {
        const users = [{ code: 'R1', name: 'Ann Wanjiru' }, { code: 'R2', name: 'Brian Otieno' }];
        const rows = Array.from({ length: 6 }, (_, i) => ({ key: `K${i}`, doc_number: `DOC-${100 + i}`, date: '23-10-2026', rep: users[i % 2].name,
          item: `Item ${i + 1}`, qty: 5 * (i + 1), approved: i % 2 ? 'Yes' : 'No' }));
        return offlineOrOnline({ report: name, title: name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), path: '/', from: q.from || '2026-10-23', to: q.to || '2026-10-23',
          columns: ['doc_number', 'date', 'rep', 'item', 'qty', 'approved'].map((k) => ({ key: k, title: k.replace('_', ' ') })), rows, total: rows.length,
          page: 1, size: 100, users } as unknown as OrderSummaryPayload);
      }
      const row = (n: string, i: number) => ({ name: n, existing_orders: 120000 + i * 5000, existing_customers: 12 + i,
        new_orders: 8000 * i, new_customers: i, customers_total: 12 + 2 * i, orders_total: 120000 + i * 13000 });
      const rows = ['Asha Rep', 'Carl Rep', 'Dina Rep'].map(row);
      const sum = (k: keyof ReturnType<typeof row>) => rows.reduce((a, r) => a + (r[k] as number), 0);
      const table = { rows, totals: { existing_orders: sum('existing_orders'), existing_customers: sum('existing_customers'),
        new_orders: sum('new_orders'), new_customers: sum('new_customers'), customers_total: sum('customers_total'), orders_total: sum('orders_total') } };
      const payload: OrderSummaryPayload = {
        report: 'order_summary', title: 'Order Summary', path: '/Report/OrderSummaryReport',
        from: q.from || '2026-10-23', to: q.to || '2026-10-23', from_date: '23-Oct-2026', to_date: '23-Oct-2026',
        columns: [{ key: 'name', title: '' }, { key: 'existing_orders', title: 'Existing orders' }, { key: 'existing_customers', title: 'Existing customers' },
          { key: 'new_orders', title: 'New orders' }, { key: 'new_customers', title: 'New customers' },
          { key: 'customers_total', title: 'Customer total' }, { key: 'orders_total', title: 'Order total' }],
        by_rep: table, by_hq: { ...table, rows: rows.map((r, i) => ({ ...r, name: ['Nairobi', 'Mombasa', 'Kisumu'][i] })) },
      };
      return offlineOrOnline(payload);
    }) as Api['fetchReport'],
    async syncList() { return { changed: 0, removed: 0, total: 0, full: false, offline: false }; },
    async localList() { throw err('no_copy', 'This list has not been copied to this computer yet.'); },
    async signOut() {
      signedIn = false;
    },
    async setProtected(on) { (window as unknown as { __protected?: boolean }).__protected = on; },
    async guardScan() {
      const w = window as unknown as { __mockScan?: string[] };
      return { findings: (w.__mockScan ?? []).map((name) => ({ kind: 'capture' as const, name })) };
    },
    async guardReport(action, names) {
      const w = window as unknown as { __guardReports?: string[]; __mockSupport?: boolean };
      (w.__guardReports ??= []).push(action + ':' + names.join(','));
      return { support: !!w.__mockSupport };
    },
    async appVersion() { return '0.2.19'; },
    async fetchPipeline(q) {
      await sleep(200);
      if (s === 'offline') throw err('offline', 'offline');
      if (s === 'unsupported') throw err('unsupported', 'This server does not have the desktop app address (404 Not Found).');
      const C = ['#DC143C', '#FF8C00', '#FFD700', '#32CD32', '#008080', '#00BFFF', '#4B0082'];
      const sq = (q || '').toLowerCase();
      const counts: Record<string, number> = {};
      for (const p of mockPipe.prospects) counts[p.stage] = (counts[p.stage] ?? 0) + 1;
      const cards = mockPipe.prospects.filter((c) => !sq || c.name.toLowerCase().includes(sq));
      return {
        report: 'pipeline', title: 'Pipeline Dashboard', path: '/PipelineDashbord', columns: [], rows: [], total: cards.length, page: 1,
        size: cards.length, from: '', to: '', hidden: mockPipe.prospects.filter((p) => !mockPipe.stages.includes(p.stage)).length,
        stages: mockPipe.stages.map((st, i) => ({ stage: st, color: C[i % C.length], cards: cards.filter((c) => c.stage === st) })),
        stage_names: [...mockPipe.stages], stage_counts: Object.fromEntries(mockPipe.stages.map((st) => [st, counts[st] ?? 0])),
        orphans: Object.entries(counts).filter(([st]) => !mockPipe.stages.includes(st)).map(([stage, count]) => ({ stage, count })),
        activities: mockPipe.activities, won_stage: mockPipe.won,
        can: { move: true, stages: true, create: true, customer: true, doctor: true },
      };
    },
    async pipelineAct(body) {
      await sleep(250);
      if (s === 'offline') throw err('offline', 'offline');
      const find = (k: string) => mockPipe.prospects.find((p) => p.key === k);
      switch (body.action) {
        case 'move': { const p = find(body.key)!; const from = p.stage; p.stage = body.stage; return { ok: true, message: `Moved to "${body.stage}".`, from }; }
        case 'move_all': { const l = mockPipe.prospects.filter((p) => p.stage === body.from); l.forEach((p) => { p.stage = body.to; }); return { ok: true, message: `Moved ${l.length} prospect(s) to "${body.to}".` }; }
        case 'stages': mockPipe.stages = [...body.stages]; if (!body.stages.includes(mockPipe.won)) mockPipe.won = ''; return { ok: true, message: 'Stages saved.' };
        case 'activity': (mockPipe.activities[body.stage] ??= []).push(body.activity); return { ok: true, message: 'Activity added.' };
        case 'won_stage': mockPipe.won = body.stage; return { ok: true, message: 'Saved.' };
        case 'kind': find(body.key)!.kind = body.kind; return { ok: true, message: 'Saved.' };
        case 'create': {
          const key = `P${mockPipe.prospects.length + 100}`;
          mockPipe.prospects.push({ ...blankCard(key, String(body.values.name ?? 'New prospect')), stage: body.stage || mockPipe.stages[0], kind: body.kind, rep: String(body.values.rep ?? '') });
          return { ok: true, message: 'Prospect saved.', key };
        }
        case 'code_status': {
          const c = body.code.trim().toUpperCase();
          if (/^(CM|DM)\d+$/.test(c)) return { ok: true, free: false, message: 'Codes like CM0012 or DM0012 are given by the system.' };
          return c === 'CU-7' ? { ok: true, free: false, message: 'Code CU-7 is used by customer "Old".' } : { ok: true, free: true, message: 'Free.' };
        }
        case 'convert': {
          const p = find(body.key)!;
          const code = body.code_mode === 'typed' ? (body.code ?? '').toUpperCase() : (body.kind === 'customer' ? 'CM0413' : 'DM0207');
          Object.assign(p, { converted_code: code, converted_kind: body.kind, kind: body.kind });
          if (mockPipe.won) p.stage = mockPipe.won;
          return { ok: true, message: `${body.kind === 'customer' ? 'Customer' : 'Doctor'} ${code} created from "${p.name}".`, code };
        }
      }
      return { ok: false, message: 'Unknown change.' };
    },
    async fetchNotifications() {
      await sleep(200);
      return { items: [
        { id: 'orders', path: '/OrderGrid', label: 'Orders waiting for approval', count: 12, more: false },
        { id: 'customer_verification', path: '/master/CustomerVerification', label: 'Customers to verify', count: 4, more: false },
        { id: 'stock_requests', path: '/Transactions/GiftAndSampleStockRequest', label: 'Stock requests to approve', count: 2, more: false },
      ], total: 18 };
    },
    async fetchProfile(kind, key) {
      await sleep(300);
      const doctor = kind === 'doctor';
      const day = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
      const timeline = [
        { type: 'touches', label: 'Touch base', date: `${day(0)} 10:12`, channel: 'call', note: 'Confirmed stock for next week', by: 'asha@demo.example' },
        { type: 'visits', label: 'Visit', date: day(1), time: '10:05AM', end: '10:30AM', rep: 'Ann Wanjiru', remarks: 'Met the owner', order: doctor ? 0 : 12400 },
        ...(doctor ? [
          { type: 'detailing', label: 'Detailing', date: day(1), rep: 'Ann Wanjiru', products: ['Amoxil 500mg', 'Zinc tablets'], remarks: '' },
          { type: 'samples', label: 'Samples', date: day(1), rep: 'Ann Wanjiru', products: [['Amoxil 500mg', 4]] },
          { type: 'meetings', label: 'Meeting', date: day(-3), status: 'Scheduled', agenda: 'New molecule launch', purpose: 'Detailing' },
        ] : [
          { type: 'orders', label: 'Order', date: day(1), number: 'ORD-1042', amount: 12400, status: 'Approved', cancel: false },
          { type: 'payments', label: 'Collection', date: day(4), amount: 8000, mode: 'M-Pesa', rep: 'Ann Wanjiru', remarks: '' },
          { type: 'feedback', label: 'Feedback', date: day(6), ftype: 'Product', kind: 'Complain', status: 'Created', remarks: 'Late delivery last week' },
          { type: 'orders', label: 'Order', date: day(9), number: 'ORD-1001', amount: 9800, status: 'Approved', cancel: false },
        ]),
        { type: 'visits', label: 'Visit', date: day(9), time: '11:40AM', end: '12:02PM', rep: 'Brian Otieno', remarks: '', order: 0 },
      ];
      const weeks = Array.from({ length: 12 }, (_, i) => ({ week: day((11 - i) * 7), visits: [1, 0, 2, 1, 3, 1, 0, 2, 2, 1, 3, 2][i] }));
      const counts: Record<string, number> = {};
      timeline.forEach((e) => { counts[e.type] = (counts[e.type] ?? 0) + 1; });
      return { kind, key, master: doctor ? { n: 'Dr. Jane Mwaura', c: 'D0012', sp: 'Paediatrics', h: 'NAIROBI', a: 'WESTLANDS', m: '0722 123 456', e: 'jane@clinic.example', add: 'Sarit Centre', gc: '-1.2610,36.8030' }
        : { n: 'City Lab Pharmacy', c: 'C0042', category: 'RETAIL', h: 'NAIROBI', a: 'CBD', p: '0700 111 222', em: 'orders@citylab.example', ad: 'Moi Avenue', pr: 'John Kariuki', gc: '-1.2840,36.8230' },
        figures: doctor ? { visits_30: 3, visits_90: 9, last_visit: day(1), reps: ['Ann Wanjiru'], detailing_90: 8, samples_90: 5, gifts_90: 1, next_meeting: day(-3), top_products: [{ name: 'Amoxil 500mg', qty: 6 }, { name: 'Zinc tablets', qty: 4 }], weeks }
          : { visits_30: 4, visits_90: 11, last_visit: day(1), reps: ['Ann Wanjiru', 'Brian Otieno'], orders_90: 6, order_value_90: 64200, avg_order: 10700, collected_90: 38000, open_feedback: 1,
            last_order: day(1), top_products: [{ name: 'Panadol Extra', qty: 48 }, { name: 'ORS sachets', qty: 30 }, { name: 'Vitamin C 1000', qty: 12 }], weeks },
        timeline, counts, reps: [{ key: 'R1', name: 'Ann Wanjiru', code: 'R01', notify: true }, { key: 'R2', name: 'Brian Otieno', code: 'R02', notify: false }],
        channels: [] } as never;
    },
    async touchBase() { await sleep(300); return { ok: true, message: 'Logged.' }; },
    async openContact() { await sleep(50); },
    async fetchBrand() { await sleep(100); return { company: 'Maxpro Pharma', logo: mockLogo }; },
    /** the sample screen pretends the computer already saved these reports */
    async savedReports(name) {
      const saved = new Set(['attendance', 'last_activity', 'expiry', 'target_vs_sales', 'customer_ageing', 'target_itemized']);
      if (!saved.has(name)) return [];
      const r = await api.fetchReport(name, { size: 500 });
      return [{ ...r, source: 'offline' as const, saved_at: Math.floor(Date.now() / 1000) - 3600 }];
    },
    async fetchAssistant() { await sleep(100); return { ...mockAssistant }; },
    async fetchJoint() { await sleep(100); return { ...mockJoint }; },
    async saveJoint(s) { await sleep(300); mockJoint = { ...s }; return { ...s, message: 'Joint-call settings saved' }; },
    async saveAssistant(s) { await sleep(300); mockAssistant = { ...s }; return { ...s, message: 'Assistant settings saved' }; },
    async saveBrand(logo: string) { await sleep(300); mockLogo = logo; return { logo, message: logo ? 'Logo saved' : 'Logo removed' }; },
    async fetchThought() {
      await sleep(150);
      return { line1: 'Good morning, champion', line2: 'Every visit is a chance to help a patient',
        author: 'Swami Vivekananda', text: 'Arise, awake, and stop not till the goal is reached.' };
    },
    async checkUpdate() { await sleep(200); return s === 'update' ? { version: '0.2.99', notes: 'New reports and fixes.' } : null; },
    async installUpdate() { await sleep(1500); },
    async appInfo() {
      return { version: '0.1.0', device_name: 'DEMO-PC', device_id: '00000000-demo-0000' };
    },
    async prefsLoad() { return { ...mockPrefsFile }; },
    async prefsSave(p) { for (const k of Object.keys(mockPrefsFile)) delete mockPrefsFile[k]; Object.assign(mockPrefsFile, p); },
    async mapStatus() {
      return { use_source: 'osm', pmtiles_url: '', source_setting: 'auto', osm_blocked_until: 0, cached_bytes: 0, cached_pieces: 0, max_bytes: 500 * 1024 * 1024 };
    },
    mapTileUrl: () => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    async mapRange() { throw err('map_unavailable', 'No Protomaps file in the demo.'); },
    async openClassic(path) {
      if (s === 'offline') throw err('offline', 'offline');
      console.info('[mock] would open classic window for', path);
    },
    async saveDownload(name, dataBase64) {
      const bytes = Uint8Array.from(atob(dataBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement('a'); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return `C:\\Users\\demo\\Downloads\\${name}`;
    },
    async saveBackup(name, dataBase64, keep) {
      const kept = JSON.parse(localStorage.getItem('mock-backups') ?? '[]') as { name: string; data: string }[];
      const next = [...kept.filter((k) => k.name !== name), { name, data: dataBase64 }].sort((a, b) => b.name.localeCompare(a.name)).slice(0, Math.max(1, Math.min(20, keep)));
      localStorage.setItem('mock-backups', JSON.stringify(next));
      return `C:\\Users\\demo\\Documents\\RocketSales\\Presentations\\${name}`;
    },
    async backupSecret(name) { return localStorage.getItem(`mock-secret-${name}`); },
    async setBackupSecret(name, value) { if (value) localStorage.setItem(`mock-secret-${name}`, value); else localStorage.removeItem(`mock-secret-${name}`); },
    async showDownload() { /* the browser shows its own downloads */ },
  };
  return withGrid(api);
}

// Sample team for the Manager / App User grid filters.
const TEAM = [
  { code: 'R01', name: 'Ann Wanjiru', manager: 'Peter Kamau' }, { code: 'R02', name: 'Brian Otieno', manager: 'Peter Kamau' },
  { code: 'R03', name: 'Cate Mwangi', manager: 'Grace Akinyi' }, { code: 'R04', name: 'Dan Kiprop', manager: 'Grace Akinyi' },
];
const tok = (u: { code: string; name: string }) => [u.name.toLowerCase(), u.code.toLowerCase(), `${u.name} (${u.code})`.toLowerCase()];
const cells = (r: Record<string, unknown>) => Object.entries(r).filter(([k, v]) => k !== 'key' && typeof v === 'string')
  .flatMap(([, v]) => { const t = String(v).toLowerCase().trim(); return [t, ...t.split(',').map((x) => x.trim())]; });

/** The server's grid step (sort, filters, export) done on the sample rows. */
function withGrid(api: Api): Api {
  type Rows = { rows?: Record<string, unknown>[]; total?: number; grid?: unknown; page?: number; size?: number };
  const apply = <T>(f: Fetched<T>, q: GridQuery): Fetched<T> => {
    const d = f.data as unknown as Rows;
    if (!d || !Array.isArray(d.rows)) return f;
    const all = TEAM.flatMap(tok);
    const filterable = d.rows.some((r) => cells(r).some((c) => all.includes(c)));
    let rows = d.rows;
    if (q.manager) { const ms = q.manager.split('|'); const t = TEAM.filter((u) => ms.includes(u.manager)).flatMap(tok); rows = rows.filter((r) => cells(r).some((c) => t.includes(c))); }
    if (q.app_user) { const t = q.app_user.split('|').flatMap((a) => { const u = TEAM.find((x) => x.code === a || x.name === a); return u ? tok(u) : [a.toLowerCase()]; }); rows = rows.filter((r) => cells(r).some((c) => t.includes(c))); }
    if (q.sort) {
      const k = q.sort; const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')));
      rows = [...rows].sort((a, b) => {
        const x = a[k]; const y = b[k];
        if (x == null || x === '') return 1; if (y == null || y === '') return -1;
        const c = Number.isFinite(num(x)) && Number.isFinite(num(y)) ? num(x) - num(y) : String(x).localeCompare(String(y));
        return q.desc ? -c : c;
      });
    }
    const data = { ...d, rows, total: q.manager || q.app_user ? rows.length : d.total,
      grid: { filterable, managers: filterable ? [...new Set(TEAM.map((u) => u.manager))] : [], app_users: filterable ? TEAM : [] } };
    return { ...f, data: data as unknown as T };
  };
  return {
    ...api,
    fetchReport: (async (name: string, q: ReportQuery = {}) => apply(await (api.fetchReport as (n: string, q?: ReportQuery) => Promise<Fetched<unknown>>)(name, q), q)) as Api['fetchReport'],
    fetchMasterList: async (q) => apply(await api.fetchMasterList(q), q),
  };
}

/** Sample data for the Settings & Admin pages. */
function sampleAdmin(name: string): Record<string, unknown> | null {
  if (name === 'company_settings') return { name, title: 'Company settings', sms: 'Dear {Customer}, your location was tagged by {Organization}.',
    order_table: { show_tax: true, product_code: true, customer_code: false, skip_email: 'orders@demo.example' },
    workflow: [{ active: true, stage: 'Approved', role: 'ADMIN,PHARMA HEAD' }, { active: true, stage: 'Packed', role: 'STORE' },
      { active: false, stage: 'Invoiced', role: 'ADMIN' }, { active: true, stage: 'Delivered', role: 'DISPATCH' }],
    roles: ['ADMIN', 'DISPATCH', 'PHARMA HEAD', 'STORE'], line_status: ['Open', 'Short supply', 'Cancelled'],
    dashboard: { top_products: 10, top_customers: 8 }, sales_roles: ['Rep', 'Supervisor', 'Manager'], odoo: false, sequence_on_web: false,
    salesmen: ['ASHA MEHTA', 'BRIAN OTIENO', 'CATE MWANGI', 'DAVID KIPROP'].map((n, i) => ({ key: `S${i}`, name: n, role: ['Rep', 'Rep', 'Supervisor', 'Manager'][i],
      code: `R0${i + 1}`, rs_code: '0', phone: `+254 700 00${i}${i}${i}`, picking_type: 0, active: true })),
    base: { sms: 'a', order_table: 'b', workflow: 'c', line_status: 'd', dashboard: 'e', salesmen: 'f' } };
  if (name === 'tip_of_day') return { name, title: 'Tip Of The Day', line1: 'Good morning {Name}', line2: 'Every visit is a chance to help a patient',
    line3: '', tip: 'Arise, awake, and stop not till the goal is reached.', play_services: 'https://play.google.com/store/apps/details?id=com.google.android.gms',
    google_map: '', whatsapp: '+91 98765 43210', help_note: '', group_link: 'https://chat.whatsapp.com/demo',
    notes: [{ h: 'Cannot sign in', p: 'Check the company name, then ask your manager to reset your device.' }], base: 'x' };
  if (name === 'my_profile') return { name, title: 'My Profile', user_name: 'Asha Mehta', email: 'asha@demo.example', role: 'ADMIN', picture: '' };
  if (name === 'reset_password') return { name, title: 'Reset Password', email: 'asha@demo.example', otp_length: 6, case_insensitive: true };
  if (name === 'promo_sms') return { name, title: 'SMSs', placeholder: '[CustomerName]', sample_name: 'Afya Chemists', gateway_ready: true, can_send: false,
    send_note: 'Sending is not switched on. The web page does not send either: its Send stops before any SMS is queued.',
    all: { customers: 412, with_phone: 368 },
    groups: [{ name: 'Retail', customers: 220, with_phone: 201 }, { name: 'Chemists', customers: 130, with_phone: 118 }, { name: 'Hospitals', customers: 52, with_phone: 41 }, { name: 'Wholesale', customers: 10, with_phone: 8 }] };
  if (name === 'price_lists') {
    const prods = ['Amoxil 500mg', 'Panadol Extra', 'Zinc tablets', 'ORS sachets', 'Vitamin C 1000', 'Cough syrup 100ml'].map((n, i) => ({ code: `P00${i + 1}`, name: n, mrp: 120 + i * 35, tax: i % 2 ? 16 : 0, group: i % 2 ? 'OTC' : 'RX' }));
    const lines = (f: number, n: number) => prods.slice(0, n).map((p, i) => ({ key: `${f}-${i}`, code: p.code, name: p.name, rate: Math.round(p.mrp * f) }));
    return { name, title: 'Base Pricing', products: prods, lists: [{ name: 'GENERAL', count: 6, lines: lines(1, 6) }, { name: 'TEST', count: 2, lines: lines(0.8, 2) },
      { name: 'TEST 2', count: 0, lines: [] }, { name: 'WHOLESALE', count: 5, lines: lines(0.9, 5) }] };
  }
  if (name === 'service_calls') return { name, title: 'Service Calls',
    engineers: [{ n: 'JOHN KAMAU', k: 'U1', c: 'E01', p: '' }, { n: 'MARY ATIENO', k: 'U2', c: 'E02', p: '' }],
    customers: ['City Lab', 'Aga Khan Hospital', 'Nairobi West Clinic'].map((n, i) => ({ n, k: `C${i}`, c: `C00${i + 1}`, ph: '', hq: 'NAIROBI', ar: ['CBD', 'PARKLANDS', 'LANGATA'][i], g: '' })),
    equipments: [{ n: 'Hematology Analyser DV-H6', k: 'Q1', c: 'ME01' }, { n: 'Microscope', k: 'Q2', c: 'ME02' }],
    spare_parts: [{ c: 'ME01', pc: 'BHJ040000625', pn: 'Sample probe', uom: 'PCS', pr: 1120 }, { c: 'ME01', pc: 'BHJ040000626', pn: 'Pump tube', uom: 'PCS', pr: 450 }],
    sell_modes: [{ value: '', label: 'Not set' }, { value: 'sale', label: 'Sale' }, { value: 'rent', label: 'Rent / Lease' }, { value: 'demo', label: 'Demo' }, { value: 'consignment', label: 'Consignment' }] };
  if (name === 'spare_parts') return { name, title: 'Spare Parts',
    equipments: [{ code: 'ME01', name: 'Hematology Analyser DV-H6' }, { code: 'ME02', name: 'Microscope' }],
    parts: [{ c: 'ME01', pc: 'BHJ040000625', pn: 'Sample probe', uom: 'PCS', pr: 1120 }, { c: 'ME01', pc: 'BHJ040000626', pn: 'Pump tube', uom: 'PCS', pr: 450 },
      { c: 'ME02', pc: 'MS-LENS-40', pn: 'Objective lens 40x', uom: 'PCS', pr: 3800 }, { c: 'ME09', pc: 'X-1', pn: 'Fuse 2A', uom: 'BOX', pr: '' }] };
  if (name === 'rs_settings') {
    let n = 0;
    const id = () => `f${n++}`;
    const check = (label: string, on = false) => ({ id: id(), kind: 'checkbox', name: label, label, checked: on });
    return { name, title: 'RocketSales Settings', base: 'x', sections: [
      { title: 'Attendance', fields: [{ id: id(), kind: 'time', name: 'st', label: 'Day start time', value: '09:00' },
        { id: id(), kind: 'time', name: 'et', label: 'Day end time', value: '18:30' }, check('Selfie at day start', true), check('Battery 95% needed', false),
        { id: id(), kind: 'number', name: 'gf', label: 'Geofence radius (metres)', value: '200', min: '0' }] },
      { title: 'Visits', fields: [check('Photo at every visit', true), check('Visit only tagged customers'), check('Allow offline visits', true),
        { id: id(), kind: 'select', name: 'vm', label: 'Visit mode', value: 'route', options: [{ value: 'route', label: 'Route plan' }, { value: 'free', label: 'Free' }] },
        { id: id(), kind: 'minutes', name: 'VanVisitMinTime', label: 'Minimum visit time by vehicle (minutes)', rows: [{ key: 'car', label: 'Car', value: 10 }, { key: 'bike', label: 'Bike', value: 5 }] }] },
      { title: 'Orders and payments', fields: [check('Show stock in orders', true), { id: id(), kind: 'list', label: 'Modes of payment',
        columns: [{ name: 'mop', label: 'Mode of payment', type: 'text' }], rows: [{ mop: 'Cash' }, { mop: 'M-Pesa' }, { mop: 'Cheque' }] },
        { id: id(), kind: 'textarea', name: 'note', label: 'Order footer note', value: 'Thank you for your order.' }] },
    ] };
  }
  return null;
}

/** The Desktop app tab of User Roles: the menu's pages with what can be done on each. */
function mockDesktopAccess() {
  const caps = (path: string): string[] => {
    if (path.startsWith('/master/')) return ['view', 'create', 'edit', 'delete', 'export'];
    if (path === '/OrderGrid') return ['view', 'edit', 'delete', 'approve', 'export'];
    if (path.startsWith('/Report/') || path === '/GoGreen') return ['view', 'export'];
    if (path.startsWith('/Utility/') || path === '/Settings' || path === '/Support') return ['view', 'edit'];
    return ['view'];
  };
  const sections = sampleMenu.sections.map((s) => ({ id: s.id, title: s.title, items: s.items.map((i) => ({ path: i.path.split('?')[0], title: i.title, caps: caps(i.path) })) }));
  return {
    catalog: { sections, caps: ['view', 'create', 'edit', 'delete', 'approve', 'export'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
      settings: [{ id: 'offline', label: 'Keep offline copies on this computer', help: 'Saved lists and reports stay readable without internet.' },
        { id: 'classic', label: 'Open web pages in the classic window', help: 'Pages without a desktop screen open the web page inside the app.' }] },
    roles: { 'PHARMA HEAD': { rules: { pages: { '/OrderGrid': ['view', 'approve', 'export'], '/master/Client': ['view', 'export'] }, settings: { offline: true, classic: false } }, base: 'x' },
      'SERVICE HEAD': { rules: null, base: 'y' }, 'SERVICE TECHNICAL': { rules: null, base: 'z' } },
  };
}


/** Map View sample: customers / doctors around six HQs, a few with no location. */
function sampleMapView(kind: 'customers' | 'doctors', from: string, to: string) {
  const HQ: [string, number, number, string[]][] = [
    ['Nairobi', -1.286, 36.817, ['CBD', 'Westlands', 'Eastlands', 'Kiambu', 'Karen & Langata', 'Thika Road']],
    ['Mombasa', -4.04, 39.67, ['Island', 'Nyali', 'Likoni']], ['Kisumu', -0.09, 34.77, ['Kisumu Town', 'Kondele']],
    ['Nakuru', -0.30, 36.07, ['Nakuru Town', 'Naivasha']], ['Eldoret', 0.51, 35.27, ['Eldoret Town', 'Iten']], ['Nyeri', -0.42, 36.95, ['Nyeri Town', 'Karatina']]];
  const first = ['Grace', 'John', 'Mary', 'Peter', 'Faith', 'Kevin', 'Ann', 'Brian', 'Ruth', 'Hassan'];
  const last = ['Wanjiku', 'Otieno', 'Kamau', 'Achieng', 'Mutua', 'Njoroge', 'Chebet', 'Ali'];
  const shops = ['Afya', 'Uzima', 'Tumaini', 'Neema', 'Baraka', 'Shifa', 'Faraja', 'Upendo', 'Jamii', 'Imani'];
  let seed = kind === 'doctors' ? 11 : 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const points: unknown[] = []; const targets: Record<string, number> = {}; const repSales: Record<string, number> = {};
  let n = 0, r = 0;
  for (const [hq, lat, lng, areas] of HQ) {
    areas.forEach((area, ai) => {
      const alat = lat + (rnd() - 0.5) * 0.25 + (ai % 2 ? 0.05 : -0.05), alng = lng + (rnd() - 0.5) * 0.25 + ai * 0.03;
      for (let k = 0; k < 2; k++) {
        const rep = `${first[r % first.length]} ${last[(r * 3) % last.length]}`; r++;
        const count = 8 + Math.floor(rnd() * (hq === 'Nairobi' ? 22 : 12));
        let sales = 0;
        for (let i = 0; i < count; i++) {
          n++;
          const value = kind === 'customers' && rnd() > 0.3 ? Math.round(5000 + rnd() * 180000) : 0;
          sales += value;
          const days = rnd() < 0.1 ? null : Math.floor(rnd() * (rnd() < 0.2 ? 70 : 25));
          const lastIso = days === null ? '' : new Date(Date.UTC(2026, 9, 25 - days)).toISOString().slice(0, 10);
          const located = rnd() > 0.05;
          points.push([kind === 'doctors' ? `DM${String(n).padStart(4, '0')}` : `CM${String(n).padStart(5, '0')}`,
            kind === 'doctors' ? `Dr. ${first[Math.floor(rnd() * 10)]} ${last[Math.floor(rnd() * 8)]}` : `${shops[Math.floor(rnd() * 10)]} Chemists ${area} ${i + 1}`,
            hq, area, rep, located ? +(alat + (rnd() - 0.5) * 0.08).toFixed(5) : null, located ? +(alng + (rnd() - 0.5) * 0.08).toFixed(5) : null,
            value, value ? 1 + Math.floor(rnd() * 3) : 0, days !== null && days <= 25 ? 1 + Math.floor(rnd() * 4) : 0, lastIso]);
        }
        if (kind === 'customers') { targets[rep] = Math.round(sales * (0.8 + rnd() * 0.5)); repSales[rep] = sales; }
      }
    });
  }
  return { report: 'map_view', title: 'Map View', kind, fields: [], points, targets, rep_sales: repSales, month: from.slice(0, 7) + '-01', today: '2026-10-25', from, to };
}

function sampleTagVisits(code: string, kind: 'customers' | 'doctors', from: string, to: string) {
  const tag: [number, number] = [-1.2864, 36.8172];
  const spot = (dLat: number, dLng: number): [number, number] => [tag[0] + dLat, tag[1] + dLng];
  const m = (a: [number, number]) => Math.round(Math.hypot((a[0] - tag[0]) * 111000, (a[1] - tag[1]) * 111000 * Math.cos(1.2864 * Math.PI / 180)));
  const at = [spot(0.0001, 0.0001), spot(-0.0002, 0.0001), spot(0.0094, 0.0121), spot(0.0001, -0.0001), spot(0.0097, 0.0118)];
  const visits = at.map((a, i) => ({ date: `2026-10-${String(3 + i * 4).padStart(2, '0')}`, rep: i % 2 ? 'Ben Otieno' : 'Ann Wanjiru', start: '10:1' + i, end: '10:4' + i,
    at: a, away_m: m(a), recorded_m: m(a), within: m(a) < 200 }));
  return { report: 'tag_visits', title: 'Tag check', kind, from, to,
    record: { code, name: 'Afya Pharmacy', tag, tagged_by: 'Ann Wanjiru', verified: false, requests: 2, history: 1, pending: '' },
    visits, verdict: 'some_far', typical_m: 60, far: 2 };
}
