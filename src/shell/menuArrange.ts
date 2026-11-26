import type { MenuSection } from '../api/types';

// Desktop-only menu arrangement, done here so it needs no server change and the web menu stays as it is.

export const GIFT_ALLOC = '/Transactions/GiftAllocationGrid';
export const SAMPLE_ALLOC = '/Transactions/SampleAllocationGrid';
/** Desktop-only entry: gift and sample allocations on one screen (each half follows its own web page's rights). */
export const ALLOC_PATH = '/GiftSampleAllocation';
export const ALLOC_TITLE = 'Gifts/Sample Allocation';

const GIFTS_ORDER = ['/master/GiftMaster', '/Samples', '/Transactions/GiftAndSampleStockRequest', ALLOC_PATH,
  '/Transactions/GiftStock', '/Transactions/SampleStock'];
/** Users & Roles: the user and role pages, gathered from wherever the web menu puts them. */
const USERS_ORDER = ['/master/MobileVanUser', '/master/AppUserSettings', '/master/AppUser', '/master/CustomizeRoleAccess'];
/** The "+ New ..." entries: each is a button on its own list page, so the menu does not repeat it (kept when the role has no such list). */
const CREATE_SHORTCUTS: Record<string, string[]> = { '/Sales/CreateSalesOrder': ['/Sales/Order', '/Sales/OrderGrid', '/OrderGrid', '/Order'] };
export const UTILITY_ID = 'utility';
export const UTILITY_TITLE = 'Utility';
/** The Trip menu: Eagle Eye View and the map. */
export const TRIP_ID = 'trip';
const TRIP_PAGES = ['/EagelEyeView', '/EagleEyeView', '/BO/EagleEyeView', '/MapView'];
export const MASTER_ID = 'master';
export const MASTER_TITLE = 'Master';
/** The sections shown inside Master, in this order (like the back office Master menu). */
const MASTER_CHILDREN = ['customers', 'doctors', 'products', 'marketing', 'users-roles', 'master-misc'];
const TRANSACTIONS_ID = 'transactions';
const STOCK_ID = 'stock';
const SECTION_TO_TOP: Record<string, string> = { sales: TRANSACTIONS_ID, purchase: TRANSACTIONS_ID, dispatch: TRANSACTIONS_ID, inventory: STOCK_ID, reports: 'reports',
  prospects: 'prospects', field: UTILITY_ID, targets: UTILITY_ID, questions: UTILITY_ID, services: UTILITY_ID, settings: 'settings', trip: TRIP_ID };
/** Where a page goes whatever section the web menu keeps it in; this follows the back office menu (html/menu/default.html): Transactions, Stock, Reports, Pipeline, Utility, Masters. */
const PATH_TO_GROUP: Record<string, string> = {
  '/Transactions/SampleAllocationGrid': TRANSACTIONS_ID, '/Transactions/GiftAllocationGrid': TRANSACTIONS_ID, '/Transactions/GiftAndSampleStockRequest': TRANSACTIONS_ID,
  '/GiftSampleAllocation': TRANSACTIONS_ID, '/Transactions/GiftStock': STOCK_ID, '/Transactions/SampleStock': STOCK_ID,
  '/GoGreen': 'reports', '/Pipeline/Settings': 'prospects', '/PipelineDashbord': 'prospects', '/Report/QuestionBankReport': 'reports', '/Report/ServiceCallReport': 'reports',
  '/master/MedicalRepCustomerDoctorMapping': 'customers', '/master/HospitalDoctorMapping': 'customers', '/master/CustomerRocketVanMapping': 'customers',
  '/master/CustomerVerification': 'customers', '/master/DoctorsVerification': 'doctors', '/UploadContacts': 'customers',
  '/master/GiftMaster': 'products', '/Samples': 'products', '/master/MachineAndEquipmentMaster': 'products', '/master/SpareParts': 'products',
  '/master/RocketVanPromo': 'marketing', '/master/LoyaltyProgram': 'marketing', '/master/Gamification': 'marketing', '/master/NoticeBoard': 'marketing',
  '/master/RockeyPushNotification': 'marketing', '/master/PromoMaster': 'marketing',
  '/master/AppTrainingAction': 'master-misc', '/master/RockeyEventMaster': 'master-misc', '/master/StoreLocation': 'master-misc', '/Support': 'master-misc',
  '/master/RocketFormMaster': 'master-misc', '/master/Supplier': 'master-misc', '/master/Account': 'master-misc' };
/** Order of the pages inside each menu (default.html order); pages not listed follow in the order the server sent them. */
const GROUP_ORDER: Record<string, string[]> = {
  [TRANSACTIONS_ID]: ['/OrderGrid', '/Sales/CreateSalesOrder', '/TransferOrderGrid', '/QuotationGrid', '/Transactions/SampleAllocationGrid', '/Transactions/GiftAllocationGrid', ALLOC_PATH, '/Transactions/GiftAndSampleStockRequest'],
  [STOCK_ID]: ['/Transactions/SampleStock', '/Transactions/GiftStock'],
  [UTILITY_ID]: ['/Utility/ManagementReview', '/Utility/LeaveManagement', '/Utility/SurveyForm', '/Utility/TargetEntry', '/Utility/ItemizedTarget', '/Utility/UpdatePriceAndDiscount',
    '/Utility/PromotionalSMS', '/Utility/PromotionalSMSHistory', '/Utility/HQOrderLimit', '/Utility/ServiceCall', '/Utility/QuestionBank', '/Utility/RouteplanExpense'],
  prospects: ['/PipelineDashbord', '/Pipeline/Settings'],
  products: ['/master/Product', '/master/BasePricing', '/master/GiftMaster', '/Samples', '/master/MachineAndEquipmentMaster', '/master/SpareParts'],
  customers: ['/master/Client', '/master/CustomerVerification', '/master/MedicalRepCustomerDoctorMapping', '/master/HospitalDoctorMapping'],
};
const SECTION_META: Record<string, { title: string; icon: string }> = { [TRANSACTIONS_ID]: { title: 'Transactions', icon: 'shopping' }, [STOCK_ID]: { title: 'Stock', icon: 'inbox' },
  reports: { title: 'Reports', icon: 'reports' }, prospects: { title: 'Pipeline', icon: 'prospects' }, [UTILITY_ID]: { title: UTILITY_TITLE, icon: 'settings' },
  customers: { title: 'Customers', icon: 'customers' }, doctors: { title: 'Doctors', icon: 'doctors' }, products: { title: 'Products', icon: 'products' },
  marketing: { title: 'Marketing & Promotions', icon: 'marketing' }, 'master-misc': { title: 'Other masters', icon: 'database' }, settings: { title: 'Settings & Admin', icon: 'settings' }, [TRIP_ID]: { title: 'Trip', icon: 'car' } };

/**
 * Puts every page in the menu it has in the back office menu (html/menu/default.html): Transactions, Stock, Reports, Pipeline, Utility
 * and Master (with Customers, Doctors, Products, Marketing, Users & Roles inside it). A page the back office menu does not know goes by the
 * section the server put it in, so nothing is lost and nothing needs a new rule to show up.
 */
function regroup(sections: MenuSection[]): MenuSection[] {
  const buckets = new Map<string, { sec: MenuSection; items: MenuSection['items'] }>();
  const put = (id: string, from: MenuSection, item: MenuSection['items'][number]) => {
    let b = buckets.get(id);
    if (!b) {
      const meta = SECTION_META[id] ?? { title: from.title, icon: from.icon };
      b = { sec: { id, title: id === from.id ? from.title : meta.title, icon: meta.icon, items: [] }, items: [] };
      buckets.set(id, b);
    }
    // a sub-heading only means something in the section it came from
    b.items.push(id === from.id ? item : { ...item, group: undefined });
  };
  for (const s of sections) {
    for (const i of s.items) {
      let id = PATH_TO_GROUP[i.path];
      if (!id && TRIP_PAGES.includes(i.path)) id = TRIP_ID;
      if (!id && i.path.startsWith('/Utility/')) id = UTILITY_ID;
      if (!id && (i.path.startsWith('/Report/') || i.path.startsWith('/DoctorReport/'))) id = 'reports';
      if (!id) id = SECTION_TO_TOP[s.id] ?? (MASTER_CHILDREN.includes(s.id) ? s.id : s.id === 'gifts' || s.id === 'machines' ? 'products' : s.id === 'gamification' ? 'marketing' : 'master-misc');
      put(id, s, i);
    }
  }
  const out: MenuSection[] = [];
  const rank = (id: string, p: string) => { const n = (GROUP_ORDER[id] ?? []).indexOf(p); return n < 0 ? 999 : n; };
  for (const [id, b] of buckets) {
    const items = b.items.map((i, n) => ({ i, n })).sort((x, y) => rank(id, x.i.path) - rank(id, y.i.path) || x.n - y.n).map((x) => x.i);
    out.push({ ...b.sec, items });
  }
  return out.map((s) => (MASTER_CHILDREN.includes(s.id)
    ? { ...s, parent: MASTER_ID, parentTitle: MASTER_TITLE, parentIcon: 'database', flat: s.id === 'master-misc' ? false : undefined } : s));
}
/** Pipeline Settings sits next to the Pipeline Dashboard, wherever the web menu keeps it. */
const PIPE_PAGE = '/PipelineDashbord';
const PIPE_SETTINGS = '/Pipeline/Settings';
const CALL_LIST = '/Report/ServiceCallReport';
const ADD_CALL = '/Utility/ServiceCall';
const SECTION_TITLES: Record<string, string> = { machines: 'Machines & Equipment', marketing: 'Marketing & Promotions', products: 'Products', services: 'Service Call', prospects: 'Pipeline' };
/** The order of the sections; any section not listed goes just before Settings & Admin. */
const SECTION_ORDER = [TRANSACTIONS_ID, STOCK_ID, 'reports', 'prospects', UTILITY_ID, ...MASTER_CHILDREN, TRIP_ID, 'settings'];
/** Products: the list, then the price lists. */
const PRODUCTS_ORDER = ['/master/Product', '/master/BasePricing', '/Utility/UpdatePriceAndDiscount'];
/** Desktop names for single menu entries (the web menu keeps its own). */
const ITEM_TITLES: Record<string, string> = { '/master/BasePricing': 'Price Lists', '/Utility/UpdatePriceAndDiscount': 'Master Pricelist',
  '/Utility/PromotionalSMS': 'SMSs', '/master/CustomizeRoleAccess': 'Backoffice Roles' };

export type AllocKind = 'gift' | 'sample';

/**
 * Gift & Samples: Gifts, Samples, Gifts/Sample Requests, Gifts/Sample Allocation (the two allocation pages joined),
 * then the stock lists and anything else. Pages the server says to open in the classic window are left apart.
 * Returns the sections and which allocation kinds the person has.
 */
export function arrangeMenu(sections: MenuSection[], classic: Set<string>): { sections: MenuSection[]; allocKinds: AllocKind[]; serviceAdd: boolean } {
  let allocKinds: AllocKind[] = [];
  let serviceAdd = false;
  const all = new Set(sections.flatMap((s) => s.items.map((i) => i.path)));
  // "+ Add Service Call" is a button on the Service Calls list, not a menu entry (when both are desktop screens)
  if (all.has(CALL_LIST) && all.has(ADD_CALL) && !classic.has(CALL_LIST) && !classic.has(ADD_CALL)) serviceAdd = true;
  const out = sections.map((s0) => {
    const s = { ...s0, items: s0.items.map((i) => (ITEM_TITLES[i.path] ? { ...i, title: ITEM_TITLES[i.path] } : i)) };
    const title = SECTION_TITLES[s.id] ?? s.title;
    if (serviceAdd && s.items.some((i) => i.path === ADD_CALL)) {
      return { ...s, title, items: s.items.filter((i) => i.path !== ADD_CALL) };
    }
    if (s.id === 'products') {
      const rank = (p: string) => { const n = PRODUCTS_ORDER.indexOf(p); return n < 0 ? PRODUCTS_ORDER.length : n; };
      return { ...s, title, items: s.items.map((i, n) => ({ i, n })).sort((a, b) => rank(a.i.path) - rank(b.i.path) || a.n - b.n).map((x) => x.i) };
    }
    if (s.id !== 'gifts') return { ...s, title };
    const paths = s.items.map((i) => i.path);
    const kinds: AllocKind[] = [];
    if (paths.includes(GIFT_ALLOC) && !classic.has(GIFT_ALLOC)) kinds.push('gift');
    if (paths.includes(SAMPLE_ALLOC) && !classic.has(SAMPLE_ALLOC)) kinds.push('sample');
    let items = s.items;
    if (kinds.length) {
      allocKinds = kinds;
      const merged = new Set<string>(kinds.map((k) => (k === 'gift' ? GIFT_ALLOC : SAMPLE_ALLOC)));
      const at = items.findIndex((i) => merged.has(i.path));
      items = items.filter((i) => !merged.has(i.path));
      items.splice(at, 0, { id: 'gift-sample-allocation', title: ALLOC_TITLE, path: ALLOC_PATH });
    }
    const rank = (p: string) => { const n = GIFTS_ORDER.indexOf(p); return n < 0 ? GIFTS_ORDER.length : n; };
    items = items.map((i, n) => ({ i, n })).sort((a, b) => rank(a.i.path) - rank(b.i.path) || a.n - b.n).map((x) => x.i);
    return { ...s, title, items };
  });
  const users = out.flatMap((s) => s.items.filter((i) => USERS_ORDER.includes(i.path)))
    .sort((a, b) => USERS_ORDER.indexOf(a.path) - USERS_ORDER.indexOf(b.path));
  let final = out;
  if (users.length) {
    final = out.map((s) => ({ ...s, items: s.items.filter((i) => !USERS_ORDER.includes(i.path)) }));
    const at = final.findIndex((s) => s.id === 'settings');
    final.splice(at < 0 ? final.length : at, 0, { id: 'users-roles', title: 'Users & Roles', icon: 'users', items: users });
  }
  const setting = final.flatMap((s) => s.items).find((i) => i.path === PIPE_SETTINGS);
  if (setting && final.some((s) => s.items.some((i) => i.path === PIPE_PAGE))) {
    final = final.map((s) => {
      const rest = s.items.filter((i) => i.path !== PIPE_SETTINGS);
      const at = rest.findIndex((i) => i.path === PIPE_PAGE);
      if (at >= 0) rest.splice(at + 1, 0, setting);
      return { ...s, items: rest };
    });
  }
  final = regroup(final);
  const have = new Set(final.flatMap((s) => s.items.map((i) => i.path)));
  final = final.map((s) => ({ ...s, items: s.items.filter((i) => !(CREATE_SHORTCUTS[i.path] ?? []).some((l) => have.has(l))) }));
  const place = (id: string) => { const n = SECTION_ORDER.indexOf(id); return n < 0 ? SECTION_ORDER.length - 1.5 : n; };
  final = final.map((s, n) => ({ s, n })).sort((a, b) => place(a.s.id) - place(b.s.id) || a.n - b.n).map((x) => x.s);
  return { sections: final.filter((s) => s.items.length), allocKinds, serviceAdd };
}

/**
 * Which menus stay open after one is opened or closed: only one top menu at a time, and a sub-menu keeps the menu it sits in open
 * (Master > Customers). `subOf` maps a sub-menu key to its parent's key.
 */
export function openOne(keys: string[], before: string[], subOf: Map<string, string>): string[] {
  const added = keys.filter((k) => !before.includes(k));
  const last = added[added.length - 1];
  if (last === undefined) return keys.filter((k) => !subOf.has(k) || keys.includes(subOf.get(k) as string));
  const parent = subOf.get(last);
  return parent ? [parent, last] : [last];
}
