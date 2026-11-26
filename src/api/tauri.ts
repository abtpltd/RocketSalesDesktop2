import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import type { Api, AppError, DesignerName, GridQuery, ReportQuery } from './types';

/** Grid options in the shape the Rust commands take (absent ones stay null). */
const grid = (q: GridQuery) => ({ sort: q.sort || null, desc: q.desc ?? null, manager: q.manager || null, appUser: q.app_user || null, export: q.export ?? null });

/** Rust commands reject with an AppError object; anything else is turned into one. */
function toAppError(e: unknown): AppError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) return e as AppError;
  return { code: 'unknown', message: typeof e === 'string' ? e : 'Something went wrong.' };
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toAppError(e);
  }
}

export const tauriApi: Api = {
  sessionRestore: () => call('session_restore'),
  login: (company, email, password) => call('login', { company, email, password }),
  fetchDashboard: (month) => call('fetch_dashboard', { month: month ?? null }),
  fetchMenu: () => call('fetch_menu'),
  fetchForm: (name, key) => call('fetch_form', { name, key: key ?? null }),
  submitForm: (name, body) => call('submit_form', { name, body }),
  runAction: (name, body) => call('run_action', { name, body }),
  fetchOrderEdit: (kind, key) => call('fetch_order_edit', { kind, key, basePrice: null }),
  fetchBasePrices: (name) => call('fetch_order_edit', { kind: 'order', key: null, basePrice: name }),
  saveOrderEdit: (body) => call('save_order_edit', { body }),
  fetchDesigner: ((name: DesignerName, key?: string) => call('fetch_designer', { name, key: key ?? null })) as Api['fetchDesigner'],
  saveDesigner: (name, body) => call('save_designer', { name, body }),
  fetchGrid: (name, params) => call('fetch_grid', { name, params }),
  saveGrid: (name, body) => call('save_grid', { name, body }),
  fetchStockRequest: (key) => call('fetch_stock_request', { key }),
  approveStockRequest: (body) => call('approve_stock_request', { body }),
  fetchSetup: (name) => call('fetch_setup', { name }),
  saveSetup: (name, body) => call('save_setup', { name, body }),
  fetchTool: (name) => call('fetch_tool', { name }),
  saveTool: (name, body) => call('save_tool', { name, body }),
  fetchStockDoc: (kind) => call('fetch_stock_doc', { kind }),
  saveStockDoc: (kind, body) => call('save_stock_doc', { kind, body }),
  syncList: (module) => call('sync_list', { module }),
  localList: (q) => call('local_list', { module: q.module, search: q.search ?? null, page: q.page ?? null, size: q.size ?? null, status: q.status ?? null, sort: q.sort ?? null, desc: q.desc ?? null }),
  fetchMasterList: (q) => call('fetch_master_list', { module: q.module, search: q.search ?? null, page: q.page ?? null, size: q.size ?? null, status: q.status ?? null, ...grid(q) }),
  fetchMapping: (rep, kind) => call('fetch_mapping', { rep, kind }),
  fetchOrders: (q) => call('fetch_orders', { from: q.from ?? null, to: q.to ?? null, status: q.status ?? null, search: q.search ?? null, page: q.page ?? null, size: q.size ?? null, ...grid(q) }),
  fetchOrder: (key, kind) => call('fetch_order', { key, kind: kind ?? null }),
  fetchReport: ((name: string, q: ReportQuery = {}) => call('fetch_report', { name, from: q.from ?? null, to: q.to ?? null, search: q.search ?? null, rep: q.rep ?? null, kind: q.kind ?? null, page: q.page ?? null, size: q.size ?? null, ...grid(q) })) as Api['fetchReport'],
  signOut: () => call('sign_out'),
  setProtected: (on) => call('set_protected', { on }),
  guardScan: () => call('guard_scan'),
  guardReport: (action, names, kinds) => call('guard_report', { action, names, kinds }),
  appInfo: () => call('app_info'),
  appVersion: () => getVersion(),
  fetchThought: (company) => call('fetch_thought', { company: company || null }),
  fetchProfile: (kind, key) => call('fetch_profile', { kind, key }),
  fetchNotifications: () => call('fetch_notifications'),
  touchBase: (kind, body) => call('touch_base', { kind, body }),
  openContact: (url) => call('open_contact', { url }),
  fetchBrand: (company) => call('fetch_brand', { company: company || null }),
  saveBrand: (logo) => call('save_brand', { logo }),
  savedReports: ((name: string) => call('saved_reports', { name })) as Api['savedReports'],
  fetchAssistant: () => call('fetch_assistant'),
  saveAssistant: (settings) => call('save_assistant', { settings }),
  fetchJoint: () => call('fetch_joint'),
  saveJoint: (settings) => call('save_joint', { settings }),
  saveDownload: (name, dataBase64) => call('save_download', { name, dataBase64 }),
  saveBackup: (name, dataBase64, keep) => call('save_backup', { name, dataBase64, keep }),
  backupSecret: (name) => call('backup_secret_get', { name }),
  setBackupSecret: (name, value) => call('backup_secret_set', { name, value }),
  showDownload: (path) => call('show_download', { path }),
  checkUpdate: () => call('check_update'),
  installUpdate: () => call('install_update'),
  openClassic: (path) => call('open_classic', { path }),
  fetchPipeline: (q) => call('fetch_pipeline', { q: q ?? null }),
  pipelineAct: (body) => call('pipeline_act', { body }),
  prefsLoad: () => call('prefs_load'),
  prefsSave: (prefs) => call('prefs_save', { prefs }),
  mapStatus: () => call('map_status'),
  // custom protocols are http://<name>.localhost/ on Windows and <name>://localhost/ elsewhere
  mapTileUrl: () => (/Windows/i.test(navigator.userAgent) ? 'http://rsmap.localhost' : 'rsmap://localhost') + '/osm/{z}/{x}/{y}.png',
  mapRange: (url, offset, length) => call('map_range', { url, offset, length }),
};
