export type TableReportName = 'visits' | 'attendance' | 'dcr' | 'detailing' | 'sampling' | 'gifts' | 'target_vs_sales' | 'customer_ageing' | 'target_itemized' | 'performance' | 'mobile_customers' | 'mobile_doctors' | 'doctor_meetings' | 'daily_notes' | 'feedback' | 'bank_deposit' | 'payment_collection' | 'expiry' | 'geocode_changes' | 'doctor_geocode_changes' | 'prescription_audit' | 'route_planning' | 'prospects' | 'last_activity' | 'leaves' | 'quotations' | 'sales_invoices' | 'transfer_orders' | 'stock_requests' | 'gift_stock' | 'sample_stock' | 'gift_allocations' | 'sample_allocations' | 'map_view' | 'tag_visits' | 'joint_calls'
  | 'customer_coverage' | 'daily_orders' | 'monthly_visit_summary' | 'rockey_log' | 'survey'
  | 'sms_history' | 'service_calls' | 'question_bank' | 'daily_summary' | 'availability' | 'meetings' | 'competitor_stock'
  | 'pipeline' | 'customer_order_analysis' | 'supply_performance' | 'eagle_eye' | 'gamification'
  | 'item_sales_analysis' | 'item_sales_matrix' | 'customer_sales_analysis' | 'salesmen_sales_analysis' | 'salesmen_sales_summary' | 'salesmen_supplier_summary'
  | 'rocket_form_report' | 'go_green';

/** kas Pipeline Dashboard: one column per stage, prospect cards (read-only). */
export interface PipelineCard {
  key: string; name: string; stage: string; rep: string; contactPerson: string; phone: string; email: string;
  linkedIn: string; reminderDateStr: string; website: string; category: string; border: string;
}
export interface PipelinePayload extends RowsReportPayload { stages: { stage: string; color: string; cards: PipelineCard[] }[]; hidden: number }

/** The editable board (server pipeline_edit.py). Cards also say customer / doctor and what they became. */
export type ProspectKind = 'customer' | 'doctor' | '';
export interface PipelineBoardCard extends PipelineCard { kind: ProspectKind; converted_code: string; converted_kind: ProspectKind }
export interface PipelineBoard extends Omit<PipelinePayload, 'stages'> {
  stages: { stage: string; color: string; cards: PipelineBoardCard[] }[];
  stage_names: string[];
  stage_counts: Record<string, number>;
  orphans: { stage: string; count: number }[];
  activities: Record<string, string[]>;
  won_stage: string;
  can: { move: boolean; stages: boolean; create: boolean; customer: boolean; doctor: boolean };
  server_time?: number;
}
export type PipelineAction =
  | { action: 'move'; key: string; stage: string; from?: string }
  | { action: 'move_all'; from: string; to: string }
  | { action: 'stages'; base: string[]; stages: string[] }
  | { action: 'activity'; stage: string; activity: string }
  | { action: 'won_stage'; stage: string }
  | { action: 'kind'; key: string; kind: ProspectKind }
  | { action: 'create'; stage: string; kind: ProspectKind; values: Record<string, FormValue>; request_id: string }
  | { action: 'code_status'; code: string }
  | { action: 'convert'; key: string; kind: 'customer' | 'doctor'; code_mode: 'auto' | 'typed'; code?: string; values: Record<string, FormValue>; request_id: string };
export interface PipelineResult extends SubmitResult { from?: string; code?: string; free?: boolean }

/** Eagle Eye View: one rep's working day (server src/desktop_api/eagle_eye.py). Times are 24-hour HH:MM. */
export interface EagleStop {
  n: number; kind: 'customer' | 'doctor' | 'service'; name: string; code: string;
  time_in: string; time_out: string; minutes: number | null; geo: [number, number] | null;
  distance_m: number | null; within_geofence: boolean; planned: boolean; feedback: string; remarks: string;
  category: string; speciality: string; hq: string; area: string; visited_with: string;
  detailing: number; samples: number; gifts: number; photo: boolean;
  activities: { kind: string; amount: number | string; time: string }[];
  order_amount: number | string; sales_amount: number | string;
}
export interface EaglePayload extends RowsReportPayload {
  users: { key: string; name: string; code: string }[];
  rep: string; date: string;
  day?: { start: string; end: string; start_battery: string; end_battery: string; start_geo: [number, number] | null };
  track?: [number, number, string][];
  last?: { geo: [number, number] | null; time: string };
  stops?: EagleStop[];
  gaps?: { before: number; from: string; to: string; minutes: number }[];
  totals?: { customers: number; doctors: number; service: number; orders: number; order_value: number; distance_km: number;
    minutes_at_stops: number; minutes_working: number | null };
}

// Shapes returned by the Rust commands (see src-tauri/core/src/service.rs) and the server (src/desktop_api).
export interface AppError {
  code: string;
  message: string;
  retry_after_seconds?: number | null;
}

export interface UserInfo {
  name: string;
  email: string;
  role: string;
  is_admin: boolean;
  /** the provider has stopped this role from copying and printing in the app */
  copy_blocked?: boolean;
  /** the provider lets this person's window be screen-shared */
  share_allowed?: boolean;
  /** the provider has switched "What is new" on for this person; missing (older server) counts as off */
  news_allowed?: boolean;
}

export interface CompanyInfo {
  domain: string;
  title: string;
  country: string;
  currency: string;
}

export interface SessionInfo {
  user: UserInfo;
  company: CompanyInfo;
  offline_days: number;
  offline: boolean;
  base_url: string;
  /** the provider's map setting for this company (absent from older servers: OpenStreetMap) */
  map?: MapSettings;
}

/** Map source per company, set on /superadmin/DesktopControl. */
export interface MapSettings { source: 'auto' | 'osm' | 'protomaps' | string; pmtiles_url: string }

/** Where the map screen takes its pictures from now (the app decides; see src-tauri/core/src/map.rs). */
export interface MapStatus {
  use_source: 'osm' | 'protomaps';
  pmtiles_url: string;
  source_setting: string;
  osm_blocked_until: number; // unix seconds, 0 when OpenStreetMap is not paused
  cached_bytes: number;
  cached_pieces: number;
  max_bytes: number;
}

export interface Fetched<T> {
  data: T;
  source: 'server' | 'offline';
  saved_at: number; // unix seconds, when the server answer was saved
}

export interface AppInfo {
  version: string;
  device_name: string;
  device_id: string;
}

export interface MenuItem {
  id: string;
  title: string;
  path: string;
  /** optional sub-heading inside a section (Targets/Achievements: "Set targets", "Achievements") */
  group?: string;
}

export interface MenuSection {
  id: string;
  title: string;
  icon: string;
  items: MenuItem[];
  /** desktop-only: this section is shown inside a parent menu (Master > Customers > pages); the id of the parent */
  parent?: string;
  parentTitle?: string;
  parentIcon?: string;
  /** with a parent: the pages sit directly under the parent, not in a sub-menu of their own */
  flat?: boolean;
}

export interface MenuPayload {
  sections: MenuSection[];
  menu_template?: string;
  /** pages the company's admin has sent back to the classic window */
  classic_paths?: string[];
  /** what the signed-in role may do on each page in the desktop app (server desktop_access.py) */
  desktop_access?: DesktopAccess;
  server_time?: number;
}

export type Cap = 'view' | 'create' | 'edit' | 'delete' | 'activate' | 'deactivate' | 'approve' | 'export';
export interface DesktopAccess { pages: Record<string, Cap[]>; settings: { offline: boolean; classic: boolean }; limited: boolean; v?: number; assigned?: boolean }
export interface DesktopRules { pages: Record<string, Cap[]>; settings: Record<string, boolean> }
export interface DesktopCatalog {
  sections: { id: string; title: string; items: { path: string; title: string; caps: Cap[] }[] }[];
  caps: { id: Cap; label: string }[];
  settings: { id: string; label: string; help: string }[];
}

export interface DashboardLayout {
  active_kpis: string[];
  count_cards: string[];
  chart_cards: string[];
}

/** KPI maps arrive as JSON text or as objects, keyed by day / name. */
export type MapLike = string | Record<string, unknown> | null | undefined;

export interface KpiData {
  customerCount?: number;
  productCount?: number;
  attendanceCount?: number;
  visitCount?: number;
  orderCount?: number;
  visitDta?: MapLike;
  doctorVisitDta?: MapLike;
  orderDta?: MapLike;
  hqAmt?: MapLike;
  hqVisits?: MapLike;
  specialityDta?: MapLike;
  regionOrderDta?: MapLike;
  customerCatOrderDta?: MapLike;
  top10Customer?: [string, number][];
  top10Doctor?: [string, number][];
  top10Product?: [string, number][];
  top10RepAmt?: [string, number][];
  top10RepVisit?: [string, number][];
  customerCodeName?: Record<string, string>;
  doctorCodeName?: Record<string, string>;
  productCodeName?: Record<string, string>;
  [code: string]: unknown; // AC, AO, DCA, ... come as numbers or strings
}

export interface DashboardPayload {
  kind: 'kpi' | 'kas' | 'home';
  month: string;
  today: string;
  layout: DashboardLayout;
  data: KpiData;
  /** KAS company only: the months the web month list offers, newest first ('Oct-2026'). */
  months?: string[];
  server_time?: number;
  /** Headline cards (server 2026-10-24 and later). Older servers leave it out and the cards show the web figures. */
  summary?: DashboardSummary;
  /** Last month's day-by-day figures for "vs last month" (server 2026-10-25 and later; left out when there are none). */
  previous?: { month: string; visitDta?: unknown; doctorVisitDta?: unknown; orderDta?: unknown };
}

/** Today's headline figures. Masters are active records; tagged means the record has a location (geotag). */
export interface DashboardSummary {
  customers: { total: number; tagged: number; untagged: number };
  doctors: { total: number; tagged: number; untagged: number };
  products: { total: number; active: number; inactive: number };
  attendance: { app_users: number; app_present: number; backoffice_users: number; backoffice_present: number };
  visits: { customers_done: number; customers_planned: number; doctors_done: number; doctors_planned: number };
  orders_today: number;
}

/** The company's display name and sign-in logo (a data URL, '' for none). */
export interface Brand { company: string; logo: string }

/** The thought of the day set by the provider; shown on the sign-in screen. */
export interface Thought { line1: string; line2: string; author: string; text: string }

export interface MasterColumn {
  key: string;
  title: string;
}

export interface MasterListPayload {
  module: string;
  title: string;
  path: string;
  columns: MasterColumn[];
  rows: Record<string, string | number | null>[];
  total: number;
  page: number;
  size: number;
  status: string;
  status_choices: string[];
  grid?: GridInfo;
  export_cut?: boolean;
  server_time?: number;
}

export interface MasterQuery extends GridQuery {
  module: string;
  search?: string;
  page?: number;
  size?: number;
  status?: string;
}

export interface MappingPayload {
  module: 'mapping';
  title: string;
  reps: { name: string; manager: string }[];
  rep: string;
  kind: 'customer' | 'doctor';
  mapping: { hq: string[]; area: string[]; code: string[] };
  server_time?: number;
}

export interface OrdersPayload {
  /** first day the provider lets this company see ('' = no limit) */
  data_from?: string;
  title: string;
  path: string;
  columns: MasterColumn[];
  rows: Record<string, string | number | null>[];
  total: number;
  page: number;
  size: number;
  from: string;
  to: string;
  status: string;
  status_choices: string[];
  sum_ex_vat: number;
  sum_total: number;
  grid?: GridInfo;
  export_cut?: boolean;
  server_time?: number;
}

export interface OrdersQuery extends GridQuery {
  from?: string;
  to?: string;
  status?: string;
  search?: string;
  page?: number;
  size?: number;
}

export interface OrderDetailPayload {
  order: Record<string, string | number | boolean | null>;
  lines: Record<string, string | number | null>[];
  line_columns: MasterColumn[];
  /** what this user may do to the order now (the same buttons the web page shows) */
  actions?: RecordAction[];
  server_time?: number;
}

export interface SummaryRow {
  name: string;
  existing_orders: number;
  existing_customers: number;
  new_orders: number;
  new_customers: number;
  customers_total: number;
  orders_total: number;
}

export interface SummaryTable {
  rows: SummaryRow[];
  totals: Omit<SummaryRow, 'name'>;
}

export interface OrderSummaryPayload {
  report: 'order_summary';
  title: string;
  path: string;
  from: string;
  to: string;
  from_date: string;
  to_date: string;
  columns: MasterColumn[];
  by_rep: SummaryTable;
  by_hq: SummaryTable;
  server_time?: number;
}

export interface RowsReportPayload {
  /** first day the provider lets this company see ('' = no limit) */
  data_from?: string;
  grid?: GridInfo;
  export_cut?: boolean;
  report: TableReportName;
  title: string;
  path: string;
  columns: MasterColumn[];
  rows: Record<string, string | number | null>[];
  total: number;
  page: number;
  size: number;
  from: string;
  to: string;
  /** Daily Call Report only: the sales people to pick from, and the one picked */
  users?: { code: string; name: string }[];
  rep?: string;
  rep_name?: string;
  /** Performance Report only: managers to pick from, the activity shown and the biggest cell value (for shading) */
  managers?: string[];
  kind?: string;
  max?: number;
  /** a one-line total or note shown beside the title (Bank Deposit total) */
  summary?: string;
  server_time?: number;
}

export type TimelineKind = 'order' | 'order_offline' | 'visit' | 'visit_offline';
export interface TimelineVisit {
  client: string;
  /** 24-hour "09:05" text, and minutes after midnight (null when the time could not be read) */
  start: string; end: string; s: number | null; e: number | null;
  minutes: number; kind: TimelineKind; amount: number;
  history: { k: string; t: string; a?: number }[];
}
export interface TimelineRep {
  name: string; code: string; start: string; last_visit: string; day_end: string;
  start_m: number | null; last_m: number | null; end_m: number | null;
  visits: TimelineVisit[]; count: number; percent: number; orders: number;
}
export interface TimelinePayload {
  report: 'visit_timeline'; title: string; path: string; from: string; to: string;
  users: { code: string; name: string }[]; rep: string;
  timeline: { office_start: string; office_end: string; axis_start: number; axis_end: number; days: { date: string; reps: TimelineRep[] }[] };
  server_time?: number;
}

export type FieldKind = 'text' | 'textarea' | 'number' | 'int' | 'select' | 'multi' | 'switch' | 'date' | 'time' | 'list' | 'join' | 'tags' | 'flags' | 'json' | 'taglist';
export interface Choice { value: string; label: string }
export interface FormField {
  name: string; label: string; kind: FieldKind; required?: boolean; create_only?: boolean; readonly?: boolean;
  help?: string; section?: string; secret?: boolean; create_required?: boolean; options?: Choice[]; choices?: Choice[]; default?: unknown;
}
export type FormValue = string | number | boolean | string[] | null;
export interface FormPayload {
  form: string; title: string; path: string; key: string; fields: FormField[]; values: Record<string, FormValue>;
  can_create: boolean; can_deactivate: boolean; status_field?: string | null; list?: string | null;
}
export interface SubmitBody { action: 'create' | 'update' | 'deactivate' | 'activate'; key?: string; values?: Record<string, FormValue>; request_id: string }
export interface RecordAction { name: string; label: string; confirm?: string | null; needs?: Record<string, { label: string; default?: unknown; optional?: boolean; kind?: 'expenses' | 'number' | 'text' }> | null }
export interface SubmitResult { ok: boolean; message: string; key?: string; notice?: boolean; duplicate?: boolean }

export interface EditLine {
  index?: number | null; code: string; name: string; uom: string; uc: number; qty: string; rate: number; discount: number;
  tax: number; act_wt: number; tax_amt?: number; total?: number; sb_amt?: number; qty_main?: number; qty_sub?: number;
}
export interface EditProduct { code: string; name: string; uom: string; u2: string; uc: number; mrp: number; wt: number; tx: number; d: number; spl: string; grp: string }
export type DesignerName = 'survey_forms' | 'rocket_forms' | 'question_banks';
/** One survey form field as saved: its XML elements in order, [name, text]. */
export type FieldItems = [string, string][];
export interface SurveyFormMeta {
  key: string; title: string; shortName: string; description: string; clientGroup: string[]; active: boolean;
  forServiceCall: boolean; forAppMenu: boolean; forProspect: boolean; forSalesCall: boolean;
  /** fingerprint of the form as opened; the server refuses a save over a newer edit */
  base?: string;
}
export interface SurveyListPayload { forms: SurveyFormMeta[]; client_groups: string[]; types: [string, string][]; hidden_types: string[] }
export interface SurveyFormPayload {
  form: SurveyFormMeta & { fields: FieldItems[] }; editable: boolean; reason: string; client_groups: string[];
  types: [string, string][]; hidden_types: string[];
}
export interface RocketFormRow { k: string; shortname: string; title: string; design: string; sendByMail: boolean }
export interface RocketFormsPayload { rows: RocketFormRow[]; designs: string[] }
export interface BankQuestion { q: string; t: 'checkbox' | 'radio' | string; op: { t: string; a: 'Yes' | 'No' | string; [k: string]: unknown }[]; [k: string]: unknown }
export interface QuestionBank { key: string; title: string; perday: number; status: boolean; category_list: string[]; questions: BankQuestion[]; base?: string }
export interface BankListPayload { banks: { key: string; title: string; perday: number; status: boolean; questions: number }[]; categories: string[] }
export interface BankPayload { bank: QuestionBank; editable: boolean; reason: string; categories: string[] }

export type GridName = 'targets' | 'itemized_targets' | 'hq_order_limit' | 'area_distance' | 'price_discount' | 'loyalty_points';
export interface GridColumn { key: string; title: string; kind: 'text' | 'number' | 'int' | 'select'; edit: boolean; options?: string[] }
export interface GridPayload {
  name: GridName;
  title: string;
  note?: string;
  columns: GridColumn[];
  rows: ({ id: string } & Record<string, unknown>)[];
  month?: string;
  rep?: string;
  reps?: string[];
  supplier?: string;
  suppliers?: string[];
  base_price?: string;
  base_price_lists?: string[];
  /** desktop-only figures (newer servers): the server's today, and the rep's Target Entry amount on Itemized Targets */
  today?: string;
  amount_target?: number;
}
export type GridParams = Partial<Record<'month' | 'rep' | 'supplier' | 'base_price', string>>;

export interface StockRequestPayload {
  key: string; doc_number: string; stock_type: string; to: string; approved: boolean; from_places: string[];
  lines: { item: string; name: string; qty: number }[];
}

export type SetupName = 'van_promos' | 'app_training' | 'app_user_settings' | 'roles' | 'gamification_rules'
  | 'company_settings' | 'tip_of_day' | 'my_profile' | 'reset_password' | 'rs_settings' | 'service_calls' | 'spare_parts' | 'price_lists' | 'promo_sms';

/** SMSs (the web's Promotional SMS; server promo_sms.py). Read only: sending is not switched on. */
export interface SmsPayload {
  name: string; title: string;
  groups: { name: string; customers: number; with_phone: number }[];
  all: { customers: number; with_phone: number };
  sample_name: string; placeholder: string; gateway_ready: boolean; can_send: boolean; send_note: string;
}

export interface PriceLine { key: string; code: string; name: string; rate: number }
export interface PriceListsPayload { name: string; title: string; lists: { name: string; count: number; lines: PriceLine[] }[];
  products: { code: string; name: string; mrp: number; tax: number; group: string }[] }

/** Service app pages (server service_pages.py). Keys are the web page's short keys. */
export interface SparePart { c: string; pc: string; pn: string; uom: string; pr: number | string }
export interface ServiceCallsPayload {
  name: string; title: string;
  engineers: { n: string; k: string; c: string; p: string }[];
  customers: { n: string; k: string; c: string; ph: string; hq: string; ar: string; g: string }[];
  equipments: { n: string; k: string; c: string }[];
  spare_parts: SparePart[]; sell_modes: { value: string; label: string }[];
}
export interface SparePartsPayload { name: string; title: string; parts: SparePart[]; equipments: { code: string; name: string }[] }

/** Company settings (server admin_pages.py): the System, Med Rep and Dashboard tabs of the web Settings page. */
export interface WorkflowStep { active: boolean; stage: string; role: string }
export interface SalesPerson { key: string; name: string; role: string; code: string; rs_code: string; phone: string; picking_type: number; active: boolean }
export interface CompanySettingsPayload {
  name: string; title: string;
  sms: string;
  order_table: { show_tax: boolean; product_code: boolean; customer_code: boolean; skip_email: string };
  workflow: WorkflowStep[]; roles: string[]; line_status: string[];
  dashboard: { top_products: number; top_customers: number };
  salesmen: SalesPerson[]; sales_roles: string[]; odoo: boolean; sequence_on_web: boolean;
  base: Record<'sms' | 'order_table' | 'workflow' | 'line_status' | 'dashboard' | 'salesmen', string>;
}
/** Tip of the day and help contacts, shared by every company (server admin_pages.py). */
export interface TipPayload {
  name: string; title: string; line1: string; line2: string; line3: string; tip: string; play_services: string; google_map: string;
  whatsapp: string; help_note: string; group_link: string; notes: { h: string; p: string }[]; base: string;
}
export interface ProfilePayload { name: string; title: string; user_name: string; email: string; role: string; picture: string }
export interface ResetPayload { name: string; title: string; email: string; otp_length: number; case_insensitive: boolean }
/** RocketSales Settings (server app_settings.py): the App Users page's settings form, section by section. */
export interface RsColumn { name: string; label: string; type: 'text' | 'number' }
export type RsField =
  | { id: string; kind: 'checkbox'; name: string; label: string; checked: boolean }
  | { id: string; kind: 'text' | 'number' | 'time' | 'date' | 'email' | 'hidden'; name: string; label: string; value: string; placeholder?: string; min?: string; max?: string; step?: string }
  | { id: string; kind: 'select'; name: string; label: string; value: string; options: { value: string; label: string }[]; multiple?: boolean }
  | { id: string; kind: 'textarea'; name: string; label: string; value: string }
  | { id: string; kind: 'list'; label: string; columns: RsColumn[]; rows: Record<string, string>[] }
  | { id: string; kind: 'minutes'; name: string; label: string; rows: { key: string; label: string; value: number }[] };
export interface RsSettingsPayload { name: string; title: string; sections: { title: string; fields: RsField[] }[]; base: string }

/** Gamification leaderboard (server gamification.py): every active rep ranked by the field app's score. */
export interface GameRep {
  key: string; code: string; name: string; manager: string; hq: string; score: number; rank: number; position: string;
  before: number | null; move: number | null; activities: { title: string; points: number }[];
}
export interface GameBoardPayload extends RowsReportPayload {
  kind: 'board'; month: string;
  stats: { reps: number; points: number; average: number; top: number; leader: string; best_activity: string; best_share: number; has_before: boolean };
}
export interface GameMonthPayload extends RowsReportPayload { kind: 'month'; month: string; groups: string[] }
export interface GameRulesPayload {
  name: 'gamification_rules'; title: string; base: string; group_wise: boolean;
  values: Record<string, number>; groups: { name: string; points: number }[];
  rules: { field: string; label: string; group: string; amount: boolean }[];
}

/** Back-office user roles: the choices on the company's own role page and every role. */
export interface RoleChoice { name: string; label: string }
export interface RoleGroup { title: string; head: string | null; items: RoleChoice[] }
export interface RoleRow {
  key: string; role: string; description: string; weblogin: boolean; modules: string[]; dashboard: string[];
  count_cards: string[]; chart_cards: string[]; base: string;
}
export interface RolesPayload {
  /** the company's menu as the Web access tab lists it (module ids a role holds); null: the menu file has no module rules */
  web_menu?: { id: string; title: string; gated: boolean; single?: boolean; items: { id: string; title: string; path: string; gated: boolean }[] }[] | null;
  name: 'roles'; title: string;
  catalog: { groups: RoleGroup[]; dashboard: RoleChoice[]; cards: RoleChoice[]; charts: RoleChoice[]; weblogin: boolean };
  roles: RoleRow[];
  /** the Desktop app tab: the company's desktop pages and each role's saved rules (null: not limited) */
  desktop?: { catalog: DesktopCatalog; roles: Record<string, { rules: DesktopRules | null; base: string; assigned?: boolean; start?: Record<string, Cap[]> }> } | null;
}
export type PromoLine = { index?: number; [k: string]: unknown };
export interface PromoOffer {
  index: number; title: string; type: string; active: boolean; start: string; end: string; categories: string[];
  checked: string; editable: boolean; lines: PromoLine[]; codes: string[]; base: string;
}
export interface PromoProduct { c: string; n: string; g: string; uom: string; mrp: number }
export interface VanPromosPayload {
  name: 'van_promos'; title: string; offers: PromoOffer[]; count: number; history: { n: string; s: string; d: string; u: string }[];
  categories: string[]; groups: string[]; types: string[]; products: PromoProduct[]; uoms: string[];
}
export interface TrainingItem { index?: number; t: string; yt: string; [k: string]: unknown }
export interface TrainingPayload { name: 'app_training'; title: string; items: TrainingItem[]; base: string }
export interface AppUserRow { key: string; name: string; code: string; pipelineStags: string[]; assignOfficeCheckIn: string[]; [flag: string]: unknown }
export interface UserSettingsPayload {
  name: 'app_user_settings'; title: string; users: AppUserRow[]; flags: { name: string; label: string; group: 'activities' | 'settings' }[]; can_change_status?: boolean;
}
export type SetupPayload = VanPromosPayload | TrainingPayload | UserSettingsPayload | RolesPayload | GameRulesPayload
  | CompanySettingsPayload | TipPayload | ProfilePayload | ResetPayload | RsSettingsPayload | ServiceCallsPayload | SparePartsPayload | PriceListsPayload | SmsPayload;
export type ToolName = 'push_notification' | 'route_expense' | 'invoice_upload' | 'contact_upload' | 'productivity_settings' | 'hospital_doctor_map';
export interface ToolResult extends SubmitResult { problems?: string[]; recipients?: number; replaced?: { code: string; name: string; before: number; after: number }[]; contacts?: number; customers?: number; skipped?: number; rows?: number;
  /** hospital_doctor_map: one answer per file row */
  results?: { row: number; hospital_code: string; doctor_code: string; rep: string; status: 'new' | 'exists' | 'error'; message: string; hospital_name?: string; doctor_name?: string }[];
  saved?: number }

export type StockDocKind = 'gift_stock_in' | 'sample_stock_in' | 'gift_allocation' | 'sample_allocation';
export interface StockDocPayload {
  kind: StockDocKind;
  store: string;
  items: { id: string; name: string }[];
  from_places: string[];
  reps: string[];
  managers: Record<string, string[]>;
}
export interface StockDocLine { item: string; qty: number; from?: string; to?: string }

export interface OrderEditPayload {
  kind: 'order' | 'quotation'; key: string; editable: boolean; reason: string; remark: string; number: string; customer: string;
  base_price: string; base_price_lists?: string[]; lines?: EditLine[]; products?: EditProduct[];
}

/** Sorting, Manager / App User filters and export; the server applies them to every row, then pages. */
export interface GridQuery {
  sort?: string;
  desc?: boolean;
  manager?: string;
  app_user?: string;
  export?: boolean;
}

/** What the Manager / App User filters can offer for a grid (only grids whose rows name app users). */
export interface GridInfo {
  filterable: boolean;
  managers: string[];
  app_users: { code: string; name: string; manager: string }[];
}

export interface ReportQuery extends GridQuery {
  from?: string;
  to?: string;
  search?: string;
  rep?: string;
  kind?: string;
  page?: number;
  size?: number;
}

export interface Api {
  sessionRestore(): Promise<SessionInfo | null>;
  login(company: string, email: string, password: string): Promise<SessionInfo>;
  fetchDashboard(month?: string): Promise<Fetched<DashboardPayload>>;
  fetchMenu(): Promise<Fetched<MenuPayload>>;
  fetchReport(name: 'order_summary', q?: ReportQuery): Promise<Fetched<OrderSummaryPayload>>;
  fetchReport(name: 'visit_timeline', q?: ReportQuery): Promise<Fetched<TimelinePayload>>;
  fetchReport(name: 'rep_productivity', q?: ReportQuery): Promise<Fetched<ProductivityPayload>>;
  fetchReport(name: 'insights', q?: ReportQuery): Promise<Fetched<InsightPayload>>;
  fetchReport(name: TableReportName, q?: ReportQuery): Promise<Fetched<RowsReportPayload>>;
  fetchOrder(key: string, kind?: 'quotation' | 'transfer'): Promise<Fetched<OrderDetailPayload>>;
  fetchOrders(q: OrdersQuery): Promise<Fetched<OrdersPayload>>;
  fetchMapping(rep: string, kind: 'customer' | 'doctor'): Promise<Fetched<MappingPayload>>;
  fetchMasterList(q: MasterQuery): Promise<Fetched<MasterListPayload>>;
  /** Brings this computer's own copy of a list up to date (everything the first time, then only changes). */
  syncList(module: string): Promise<{ changed: number; removed: number; total: number; full: boolean; offline: boolean }>;
  /** A page of the list read from this computer's own copy; fails with code "no_copy" before the first sync. */
  localList(q: MasterQuery): Promise<Fetched<MasterListPayload>>;
  fetchForm(name: string, key?: string): Promise<FormPayload>;
  submitForm(name: string, body: SubmitBody): Promise<SubmitResult>;
  runAction(name: string, body: { key: string; request_id: string; [field: string]: unknown }): Promise<SubmitResult>;
  fetchOrderEdit(kind: 'order' | 'quotation', key: string): Promise<OrderEditPayload>;
  fetchBasePrices(name: string): Promise<{ base_price: Record<string, number> }>;
  saveOrderEdit(body: { kind: string; key: string; lines: { index?: number | null; code: string; qty: string; rate: number; discount: number }[]; remark: string; request_id: string }): Promise<SubmitResult & { totals?: Record<string, string> }>;
  fetchDesigner(name: 'survey_forms', key?: string): Promise<SurveyListPayload & Partial<SurveyFormPayload>>;
  fetchDesigner(name: 'rocket_forms', key?: string): Promise<RocketFormsPayload>;
  fetchDesigner(name: 'question_banks', key?: string): Promise<BankListPayload & Partial<BankPayload>>;
  saveDesigner(name: DesignerName, body: Record<string, unknown> & { request_id: string }): Promise<SubmitResult & { key?: string }>;
  fetchGrid(name: GridName, params: GridParams): Promise<GridPayload>;
  saveGrid(name: GridName, body: { params: GridParams; changes: Record<string, Record<string, number | string>>; request_id: string }): Promise<SubmitResult & { saved?: number; failed?: number }>;
  fetchStockRequest(key: string): Promise<StockRequestPayload>;
  approveStockRequest(body: { key: string; from: string; lines: { item: string; qty: number }[]; request_id: string }): Promise<SubmitResult>;
  fetchSetup<T extends SetupPayload>(name: SetupName): Promise<T>;
  saveSetup(name: SetupName, body: Record<string, unknown> & { request_id: string }): Promise<SubmitResult>;
  fetchTool<T = Record<string, unknown>>(name: ToolName): Promise<T>;
  saveTool(name: ToolName, body: Record<string, unknown>): Promise<ToolResult>;
  fetchStockDoc(kind: StockDocKind): Promise<StockDocPayload>;
  saveStockDoc(kind: StockDocKind, body: { location?: string; lines: StockDocLine[]; request_id: string }): Promise<SubmitResult>;
  signOut(): Promise<void>;
  /** Remote-control or screen-recording programs running now (Windows; empty elsewhere). */
  /** Hides the app's windows from screenshots, recorders and screen-sharing (true), or lets them show. */
  setProtected(on: boolean): Promise<void>;
  guardScan(): Promise<{ findings: { kind: 'remote' | 'capture'; name: string }[] }>;
  /** Tells the server about them: 'detected', or 'switch_off' once the grace time is over. */
  guardReport(action: 'detected' | 'switch_off', names: string[], kinds: string[]): Promise<{ support?: boolean }>;
  appInfo(): Promise<AppInfo>;
  /** This app's version; works before sign-in. */
  appVersion(): Promise<string>;
  /** Saves a file (an Excel export) in Downloads; returns the full path. */
  saveDownload(name: string, dataBase64: string): Promise<string>;
  /** Saves an automatic presentations backup in Documents\RocketSales\Presentations and keeps the newest `keep`; returns the full path. */
  saveBackup(name: string, dataBase64: string, keep: number): Promise<string>;
  /** The presentations backup password, kept in the computer's credential store (null: none set). */
  backupSecret(name: string): Promise<string | null>;
  setBackupSecret(name: string, value: string | null): Promise<void>;
  /** Shows a saved download in its folder. */
  showDownload(path: string): Promise<void>;
  /** The thought of the day; works before sign-in. */
  fetchThought(company?: string): Promise<Thought>;
  /** The company's name and sign-in logo; works before sign-in. */
  fetchBrand(company?: string): Promise<Brand>;
  /** Customer / doctor 360 view (live). */
  fetchProfile(kind: ProfileKind, key: string): Promise<ProfilePayload360>;
  /** The bell (server 2026-10-25 and later; older servers answer not_found). */
  fetchNotifications(): Promise<NotificationsPayload>;
  /** Opens a tel:, mailto:, WhatsApp or Google Maps link in the computer's own app. */
  openContact(url: string): Promise<void>;
  /** Log a contact or ask a rep to visit, from the 360 view. */
  touchBase(kind: ProfileKind, body: Record<string, unknown> & { key: string; channel: string; request_id?: string }): Promise<SubmitResult>;
  /** Sets the company logo (a data URL), or removes it with ''; administrators only. */
  saveBrand(logo: string): Promise<{ logo: string; message: string }>;
  /** What this computer already holds for a report (any date range), newest first. Never calls the server. */
  savedReports(name: TableReportName): Promise<Fetched<RowsReportPayload>[]>;
  /** The company's settings for the Ask assistant. */
  fetchAssistant(): Promise<AssistantSettings>;
  saveAssistant(s: AssistantSettings): Promise<AssistantSettings & { message: string }>;
  fetchJoint(): Promise<JointSettings>;
  saveJoint(s: JointSettings): Promise<JointSettings & { message: string }>;
  checkUpdate(): Promise<{ version: string; notes?: string | null } | null>;
  installUpdate(): Promise<void>;
  openClassic(path: string): Promise<void>;
  /** The editable pipeline board (live; older servers answer "unsupported"). */
  fetchPipeline(q?: string): Promise<PipelineBoard>;
  /** One pipeline change: move a card, stages, activities, a new prospect, convert. */
  pipelineAct(body: PipelineAction): Promise<PipelineResult>;
  /** Screen settings kept in a file in the app data folder (survive a new installer). */
  prefsLoad(): Promise<Record<string, string>>;
  prefsSave(prefs: Record<string, string>): Promise<void>;
  /** Map pictures kept on this computer: the source to draw now. */
  mapStatus(): Promise<MapStatus>;
  /** Leaflet tile address of OpenStreetMap pictures through the cache on this computer. */
  mapTileUrl(): string;
  /** One byte range of the company's Protomaps file (from disk, or downloaded once). */
  mapRange(url: string, offset: number, length: number): Promise<ArrayBuffer>;
}

/** Customer / doctor 360 view (server profile360.py). Master keys are the web's short keys (n, c, p, ad...). */
export type ProfileKind = 'customer' | 'doctor';
export interface TimelineEntry { type: string; label: string; date: string; time?: string; [k: string]: unknown }
export interface NotificationItem { id: string; path: string; label: string; count: number; more: boolean }
export interface NotificationsPayload { items: NotificationItem[]; total: number; server_time?: number }

export interface ProfilePayload360 {
  kind: ProfileKind; key: string; master: Record<string, unknown>;
  figures: { visits_30: number; visits_90: number; last_visit: string; reps: string[]; top_products: { name: string; qty: number }[];
    weeks: { week: string; visits: number }[]; [k: string]: unknown };
  timeline: TimelineEntry[]; counts: Record<string, number>;
  reps: { key: string; name: string; code: string; notify: boolean }[]; channels: { id: string; label: string }[];
}

/** The company's choices for joint calls (two or more people on one visit). Kept on the server, changed by the administrator. */
export interface JointSettings {
  enabled: boolean;
  /** none: the invite is enough; app: the other person confirms in the app; app_distance: and must also be near the customer */
  confirm: 'none' | 'app' | 'app_distance';
  /** also ask for a one-time code made by the server */
  otp: boolean;
  /** a confirmation from too far away: allow it, start the visit flagged, or block it */
  distance_rule: 'allow' | 'flag' | 'block';
  distance_meters: number;
  max_people: number;
  invite_scope: 'hierarchy';
  /** a joint visit still open at the end of the day is closed for the people on it */
  auto_close: boolean;
}

/** The company's choices for the Ask assistant (kept on the server, changed by the administrator). */
export interface AssistantSettings {
  enabled: boolean;
  /** roles that may use it; empty means every role */
  roles: string[];
  /** the company's own pinned questions */
  pinned: string[];
  /** red below `lo` %, amber below `hi` % of target */
  lo: number; hi: number;
  /** a start of day later than this (HH:MM) is late */
  late: string;
  /** customers not visited for this many days: amber / red */
  stale_days: number; bad_days: number;
  expiry_months: number;
  morning_summary: boolean;
  voice: boolean;
  ai_mode: 'off';
}

/** Rep Productivity (server productivity.py): Sales = Calls x Strike rate x Lines per call x Value per line. */
export type ProdLeverKey = 'calls' | 'strike' | 'lpc' | 'vpl';
export interface ProdLever { key: ProdLeverKey; label: string; value: number | null; team: number | null; ratio: number | null; gain: number }
export interface ProdFigures {
  calls: number; doctor_calls: number; productive: number; orders: number; order_days: number; lines: number; sales: number;
  strike: number | null; lpc: number | null; vpl: number | null; aov: number | null;
}
export interface ProdChange { sales: number | null; calls: number | null; lpc: number | null; vpl: number | null; aov: number | null; strike: number | null }
export interface ProdRow extends ProdFigures { key: string; rep: string; code: string; levers: ProdLever[]; weakest: '' | ProdLeverKey; change?: ProdChange | null }
export interface ProdTrap { rep: string; code: string; trap: string; title: string; detail: string }
export interface ProdMissingItem { code: string; name: string; kind: 'must_sell' | 'usual' }
export interface ProdMissingRow {
  key: string; customer: string; code: string; rep: string; last_order: string; usual_missing: number; must_missing: number;
  items: ProdMissingItem[]; summary: string;
}
export interface ProductivityPayload<R = ProdRow> {
  data_from?: string; report: 'rep_productivity'; title: string; path: string; kind: 'reps' | 'missing'; month: string;
  from: string; to: string; page: number; size: number; total: number; rows: R[]; truncated?: boolean;
  totals?: ProdFigures; previous?: ProdFigures | null; change?: ProdChange | null; reps_with_calls?: number;
  what_if?: { key: ProdLeverKey; label: string; gain: number }[]; traps?: ProdTrap[];
  must_sell_count?: number; recent_days?: number; usual_days?: number; window_to?: string;
}
export interface MustSellSetup { must_sell: string[]; products: { code: string; name: string }[]; max: number }

/**
 * Insights: advanced pharma reports built from data the company already records. One contract for all of them, so a
 * report whose data is missing still answers with `availability` and `missing` (what to record to unlock it) instead of
 * an error. The server returns the same shape (kind = the insight id).
 */
export type InsightId = 'doctor_coverage' | 'detailing_impact' | 'sample_gift_roi' | 'lapsed_outlets' | 'churn_risk' | 'portfolio_abc'
  | 'expiry_risk' | 'field_day_quality' | 'joint_work' | 'credit_health';
export type InsightAvailability = 'ready' | 'partial' | 'needs_data';
export interface InsightKpi { label: string; value: string; note?: string; tone?: 'ok' | 'warn' | 'bad' }
export interface InsightChart { title: string; spec: import('../dashboard/KasChart').KasSpec; wide?: boolean }
export interface InsightColumn { key: string; title: string; align?: 'right' }
export interface InsightPayload {
  data_from?: string; report: 'insights'; insight: InsightId; title: string; question: string; as_of: string;
  availability: InsightAvailability;
  /** what is not recorded yet and how to start recording it */
  missing: { what: string; how: string }[];
  /** plain sentences worked out from the data ("12 A-tier doctors were not visited this month") */
  findings: string[];
  kpis: InsightKpi[]; charts: InsightChart[];
  columns: InsightColumn[]; rows: Record<string, string | number>[];
  /** what a manager can do about it */
  actions: string[];
  /** the column that holds the chart label, so a click on a bar filters the table */
  pick?: string;
}
