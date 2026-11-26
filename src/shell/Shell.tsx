import { DrillProvider, setPending, type DrillTarget } from '../drill';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, ConfigProvider, Dropdown, Menu, Modal, Popover, Result, Skeleton, Tooltip, theme as antTheme } from 'antd';
import type { MenuProps } from 'antd';
import {
  QuestionCircleOutlined, AimOutlined, UsergroupAddOutlined,
  AppstoreOutlined, BankOutlined, BarChartOutlined, DatabaseOutlined, InboxOutlined, MenuFoldOutlined,
  MenuUnfoldOutlined, SearchOutlined, SettingOutlined, ShoppingOutlined, TagOutlined, TeamOutlined,
  UserOutlined, StarFilled, HistoryOutlined, LogoutOutlined, BgColorsOutlined, ExportOutlined, CloudOutlined, CarOutlined, NotificationOutlined,
  GiftOutlined, CustomerServiceOutlined, TrophyOutlined, MedicineBoxOutlined, RiseOutlined, ToolOutlined,
  BellOutlined,
  FundProjectionScreenOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { describeError } from '../api/messages';
import type { SessionInfo } from '../api/types';
import { asAppError, useSession } from '../session';
import Dashboard from '../pages/Dashboard';
import AppSettings from '../pages/AppSettings';
import MasterList from '../pages/MasterList';
import MappingView from '../pages/MappingView';
import Orders from '../pages/Orders';
import OrderSummary from '../pages/OrderSummary';
import ReportTable, { type ReportName } from '../pages/ReportTable';
import Timeline from '../pages/Timeline';
import FormPage from '../pages/FormPage';
import ThemePicker from '../ui/ThemePicker';
import { useTheme } from '../theme';
import GridPage from '../pages/GridPage';
import VanPromosPage from '../pages/VanPromosPage';
import TrainingPage from '../pages/TrainingPage';
import AppUserSettingsPage from '../pages/AppUserSettingsPage';
import CompanySettingsPage from '../pages/admin/CompanySettingsPage';
import ServiceCallsPage from '../pages/service/ServiceCallsPage';
import PriceListsPage from '../pages/PriceListsPage';
import SparePartsPage from '../pages/service/SparePartsPage';
import TipOfDayPage from '../pages/admin/TipOfDayPage';
import ProfilePage from '../pages/admin/ProfilePage';
import ResetPasswordPage from '../pages/admin/ResetPasswordPage';
import TargetVsSalesPage from '../pages/targets/TargetVsSalesPage';
import TargetItemizedPage from '../pages/targets/TargetItemizedPage';
import PerformancePage from '../pages/targets/PerformancePage';
import RocketSalesSettingsPage from '../pages/admin/RocketSalesSettingsPage';
import SurveyFormsPage from '../designers/SurveyFormsPage';
import RocketFormsPage from '../designers/RocketFormsPage';
import QuestionBanksPage from '../designers/QuestionBanksPage';
import PushPage from '../tools/PushPage';
import UploadPage from '../tools/UploadPage';
import HospitalMapPage from '../tools/HospitalMapPage';
import UpdateNotice from './UpdateNotice';
import Bell from './Bell';
import PageTabs, { ActivePage, arrangeTabs, MAX_PINS, nextActive, openTab, togglePin } from './PageTabs';
import { readJson, writeJson } from '../ui/prefsMath';
import { busy } from '../ui/useRowKeys';
import PipelinePage from '../pages/PipelinePage';
import EagleEyePage from '../pages/EagleEyePage';
import RolesPage from '../pages/RolesPage';
import GamificationPage from '../pages/GamificationPage';
import type { GridName } from '../api/types';
import PageFinder from './PageFinder';
import AskPanel from '../assistant/AskPanel';
import { WhatsNewPage } from './WhatsNew';
import { canSeeWhatsNew, isUnread, markSeen, readSeen } from './releaseNotes';
import { onOpenAsk } from '../assistant/bus';
import { useAssistantSettings, useAttentionCount } from '../assistant/useAssistant';
import { AccessProvider, EDIT_SETTINGS_PAGES, NeedCan, ReadOnlyUnless } from '../access';
import { flatten, loadRecents, pushRecent, recentsKey, saveRecents, type PageRef } from './recents';
import AppLogo from '../ui/AppLogo';
import { ALLOC_PATH, arrangeMenu, openOne } from './menuArrange';
import AllocationPage from '../pages/AllocationPage';
import ServiceCallsList from '../pages/service/ServiceCallsList';
import SmsPage from '../pages/sms/SmsPage';
import ScreenFitPrompt from '../ui/ScreenFitPrompt';
import PresentationsPage from '../present/PresentationsPage';
import PresentProvider, { usePresent } from '../present/PresentProvider';
import MapViewPage from '../pages/mapview/MapViewPage';
import ProductivityPage from '../pages/productivity/ProductivityPage';
import InsightsPage from '../pages/insights/InsightsPage';

const ICONS: Record<string, React.ReactNode> = {
  shopping: <ShoppingOutlined />, inbox: <InboxOutlined />, database: <DatabaseOutlined />, team: <TeamOutlined />,
  user: <UserOutlined />, tag: <TagOutlined />, bank: <BankOutlined />, 'bar-chart': <BarChartOutlined />,
  setting: <SettingOutlined />, car: <CarOutlined />, cloud: <CloudOutlined />, notification: <NotificationOutlined />,
  // the names the server's menu sends (src/desktop_api/menu.py SECTIONS)
  purchase: <InboxOutlined />, inventory: <DatabaseOutlined />, dispatch: <CarOutlined />, fieldforce: <TeamOutlined />,
  customers: <UserOutlined />, products: <TagOutlined />, finance: <BankOutlined />, marketing: <NotificationOutlined />,
  reports: <BarChartOutlined />, settings: <SettingOutlined />,
  doctors: <MedicineBoxOutlined />, prospects: <RiseOutlined />, gifts: <GiftOutlined />, machines: <ToolOutlined />,
  services: <CustomerServiceOutlined />, gamification: <TrophyOutlined />,
  questions: <QuestionCircleOutlined />, targets: <AimOutlined />, users: <UsergroupAddOutlined />,
};
const iconFor = (name: string) => ICONS[name] ?? <AppstoreOutlined />;

/** Pages that already exist natively in the desktop app. Everything else opens in the classic window. */
const TABLE_REPORTS: Record<string, { name: ReportName; noun: string }> = {
  'report:visits': { name: 'visits', noun: 'visits' },
  'report:joint_calls': { name: 'joint_calls', noun: 'joint calls' },
  'report:attendance': { name: 'attendance', noun: 'rows' },
  'report:dcr': { name: 'dcr', noun: 'calls' },
  'report:detailing': { name: 'detailing', noun: 'records' },
  'report:sampling': { name: 'sampling', noun: 'records' },
  'report:gifts': { name: 'gifts', noun: 'records' },
  'report:mobile_customers': { name: 'mobile_customers', noun: 'waiting' },
  'report:mobile_doctors': { name: 'mobile_doctors', noun: 'waiting' },
  'report:geocode_changes': { name: 'geocode_changes', noun: 'requests' },
  'report:doctor_geocode_changes': { name: 'doctor_geocode_changes', noun: 'requests' },
  'report:prescription_audit': { name: 'prescription_audit', noun: 'rows' },
  'report:route_planning': { name: 'route_planning', noun: 'plans' },
  'report:prospects': { name: 'prospects', noun: 'prospects' },
  'report:last_activity': { name: 'last_activity', noun: 'customers' },
  'report:leaves': { name: 'leaves', noun: 'leaves' },
  'report:quotations': { name: 'quotations', noun: 'quotations' },
  'report:sales_invoices': { name: 'sales_invoices', noun: 'invoices' },
  'report:transfer_orders': { name: 'transfer_orders', noun: 'transfer orders' },
  'report:stock_requests': { name: 'stock_requests', noun: 'requests' },
  'report:gift_stock': { name: 'gift_stock', noun: 'items' },
  'report:sample_stock': { name: 'sample_stock', noun: 'products' },
  'report:gift_allocations': { name: 'gift_allocations', noun: 'documents' },
  'report:sample_allocations': { name: 'sample_allocations', noun: 'documents' },
  'report:bank_deposit': { name: 'bank_deposit', noun: 'deposits' },
  'report:payment_collection': { name: 'payment_collection', noun: 'payments' },
  'report:expiry': { name: 'expiry', noun: 'rows' },
  'report:feedback': { name: 'feedback', noun: 'entries' },
  'report:daily_notes': { name: 'daily_notes', noun: 'notes' },
  'report:doctor_meetings': { name: 'doctor_meetings', noun: 'meetings' },
  'report:customer_ageing': { name: 'customer_ageing', noun: 'customers' },
  'report:customer_coverage': { name: 'customer_coverage', noun: 'rows' },
  'report:daily_orders': { name: 'daily_orders', noun: 'lines' },
  'report:monthly_visit_summary': { name: 'monthly_visit_summary', noun: 'HQs' },
  'report:rockey_log': { name: 'rockey_log', noun: 'entries' },
  'report:survey': { name: 'survey', noun: 'answers' },
  'report:sms_history': { name: 'sms_history', noun: 'messages' },
  'report:service_calls': { name: 'service_calls', noun: 'calls' },
  'report:question_bank': { name: 'question_bank', noun: 'sales people' },
  'report:daily_summary': { name: 'daily_summary', noun: 'sales people' },
  'report:availability': { name: 'availability', noun: 'rows' },
  'report:meetings': { name: 'meetings', noun: 'meetings' },
  'report:competitor_stock': { name: 'competitor_stock', noun: 'rows' },
  'report:customer_order_analysis': { name: 'customer_order_analysis', noun: 'customers' },
  'report:supply_performance': { name: 'supply_performance', noun: 'products' },
  'report:rocket_form_report': { name: 'rocket_form_report', noun: 'forms' },
  'report:go_green': { name: 'go_green', noun: 'products' },
  'report:item_sales_analysis': { name: 'item_sales_analysis', noun: 'lines' },
  'report:item_sales_matrix': { name: 'item_sales_matrix', noun: 'products' },
  'report:customer_sales_analysis': { name: 'customer_sales_analysis', noun: 'customers' },
  'report:salesmen_sales_analysis': { name: 'salesmen_sales_analysis', noun: 'customers' },
  'report:salesmen_sales_summary': { name: 'salesmen_sales_summary', noun: 'products' },
  'report:salesmen_supplier_summary': { name: 'salesmen_supplier_summary', noun: 'suppliers' },
};

// desktop-only menu entries and the web page each one is part of
// desktop-only menu entries open the web page they belong to in the classic window
const CLASSIC_ALIAS: Record<string, string> = { '/RocketSalesSettings': '/master/MobileVanUser', '/Samples': '/master/Product', '/MapView': '/Report/VisitReport', '/Report/RepProductivity': '/Report/SalesmenSalesSummary', '/Report/Insights': '/Report/VisitReport', '/JointCalls': '/Report/VisitReport' };

const NATIVE: Record<string, string> = {
  '/': 'dashboard', '/Home': 'dashboard',
  '/master/Product': 'master:products', '/master/Client': 'master:customers', '/master/Doctors': 'master:doctors',
  '/master/GiftMaster': 'master:gifts', '/Samples': 'master:samples', '/master/BasePricing': 'setup:price_lists',
  '/master/AppUser': 'master:backoffice_users',
  '/master/CustomerVerification': 'master:customer_verification', '/master/DoctorsVerification': 'master:doctor_verification',
  '/master/MedicalRepCustomerDoctorMapping': 'mapping', '/OrderGrid': 'orders',
  '/Report/OrderSummaryReport': 'report:order_summary', '/Report/VisitReport': 'report:visits', '/JointCalls': 'report:joint_calls', '/Report/Attendance': 'report:attendance', '/Report/DCR': 'report:dcr',
  '/DoctorReport/Detailing': 'report:detailing', '/DoctorReport/Sampeling': 'report:sampling', '/DoctorReport/Gifts': 'report:gifts',
  '/Report/TargetVsSalesReport': 'report:target_vs_sales',
  '/Report/PerformanceReport': 'report:performance',
  '/Report/VisitPerformanceTimeline': 'report:visit_timeline',
  '/Report/getDoctorMeetings': 'report:doctor_meetings',
  '/Report/DailyNoteReport': 'report:daily_notes',
  '/Report/FeedbackReport': 'report:feedback',
  '/Report/BankDepositReport': 'report:bank_deposit', '/Report/PaymentCollection': 'report:payment_collection',
  '/Report/ExpiryReport': 'report:expiry',
  '/Report/GoecodeChangeRequestReport': 'report:geocode_changes', '/Report/DoctorGoecodeChangeRequestReport': 'report:doctor_geocode_changes',
  '/Report/GetPrescriptionAuditReport': 'report:prescription_audit', '/Report/RoutePlanning': 'report:route_planning',
  '/Report/ProspectReport': 'report:prospects', '/Report/CustomersLastVisitsOrdersHistory': 'report:last_activity',
  '/Report/MobileCustomer': 'report:mobile_customers', '/Report/MobileDoctor': 'report:mobile_doctors',
  '/Report/TargetVsSalesReportItemized': 'report:target_itemized',
  '/Report/CustomerPurchaseAgeingReport': 'report:customer_ageing',
  '/master/MobileVanUser': 'master:app_users', '/master/StoreLocation': 'master:stores',
  '/ProspectGrid': 'master:prospects_grid', '/master/MachineAndEquipmentMaster': 'master:machines',
  '/master/RockeyEventMaster': 'master:app_events', '/master/VehicleCheckList': 'master:vehicle_checklists',
  '/master/NoticeBoard': 'form:notice_board', '/Pipeline/Settings': 'form:pipeline_settings',
  '/Utility/ManagementReview': 'form:management_review', '/master/Gamification': 'gamification', '/Utility/LeaveManagement': 'report:leaves', '/QuotationGrid': 'report:quotations',
  '/Sales/SalesInvoiceGrid': 'report:sales_invoices', '/TransferOrderGrid': 'report:transfer_orders',
  '/Transactions/GiftAndSampleStockRequest': 'report:stock_requests', '/Transactions/GiftStock': 'report:gift_stock',
  '/Transactions/SampleStock': 'report:sample_stock', '/Transactions/GiftAllocationGrid': 'report:gift_allocations',
  '/Transactions/SampleAllocationGrid': 'report:sample_allocations',
  '/master/RockeyPushNotification': 'tool:push_notification', '/Utility/RouteplanExpense': 'tool:route_expense',
  '/Sales/SalesInvoiceCSVUpload': 'tool:invoice_upload', '/UploadContacts': 'tool:contact_upload',
  '/master/HospitalDoctorMapping': 'tool:hospital_doctor_map',
  '/Utility/TargetEntry': 'grid:targets', '/Utility/ItemizedTarget': 'grid:itemized_targets', '/Utility/HQOrderLimit': 'grid:hq_order_limit',
  '/Utility/AreaDistanceCombination': 'grid:area_distance', '/Utility/UpdatePriceAndDiscount': 'grid:price_discount', '/master/LoyaltyProgram': 'grid:loyalty_points',
  '/master/RocketVanPromo': 'setup:van_promos', '/master/AppTrainingAction': 'setup:app_training',
  '/master/AppUserSettings': 'setup:app_user_settings', '/master/CustomizeRoleAccess': 'setup:roles',
  '/Settings': 'setup:company_settings', '/Support': 'setup:tip_of_day', '/Profile': 'setup:my_profile',
  '/ResetPassword': 'setup:reset_password', '/RocketSalesSettings': 'setup:rs_settings',
  '/Utility/SurveyForm': 'designer:survey_forms', '/master/RocketFormMaster': 'designer:rocket_forms', '/Utility/QuestionBank': 'designer:question_banks',
  '/Report/CustomerCoverageReport': 'report:customer_coverage', '/Report/DailyOrderReport': 'report:daily_orders',
  '/Report/MonthlyVisitSummery': 'report:monthly_visit_summary', '/Report/RockeyLog': 'report:rockey_log', '/Report/Survey': 'report:survey',
  '/Utility/PromotionalSMSHistory': 'report:sms_history', '/Report/ServiceCallReport': 'report:service_calls',
  '/Report/QuestionBankReport': 'report:question_bank', '/Report/DailySummaryReport': 'report:daily_summary',
  '/Report/AvailabilityReport': 'report:availability', '/Report/MobileMeeting': 'report:meetings',
  '/Report/CompetitorStock': 'report:competitor_stock', '/Report/CustomerOrderAnalysis': 'report:customer_order_analysis',
  '/Report/SupplyPerformance': 'report:supply_performance', '/Report/RocketFormReport': 'report:rocket_form_report', '/GoGreen': 'report:go_green',
  '/Utility/ServiceCall': 'setup:service_calls', '/master/SpareParts': 'setup:spare_parts',
  '/Report/ItemSalesAnalysis': 'report:item_sales_analysis', '/Report/ItemSalesAnalysisMatrix': 'report:item_sales_matrix',
  '/Report/CustomerSalesAnalysis': 'report:customer_sales_analysis', '/Report/SalesmenSalesAnalysis': 'report:salesmen_sales_analysis',
  '/Report/SalesmenSalesSummary': 'report:salesmen_sales_summary', '/Report/SalesmenSupplierSalesSummary': 'report:salesmen_supplier_summary', '/PipelineDashbord': 'pipeline', '/EagelEyeView': 'eagle',
  [ALLOC_PATH]: 'alloc', '/Utility/PromotionalSMS': 'setup:promo_sms', '/MapView': 'mapview', '/Report/RepProductivity': 'productivity', '/Report/Insights': 'insights',
};
const SETTINGS_KEY = '__app_settings';
const PRESENT_KEY = '__presentations';
const RECENT_PREFIX = 'recent:';

export default function Shell({ info }: { info: SessionInfo }) {
  return <AntApp style={{ height: '100%' }}><ShellInner info={info} /></AntApp>;
}

function AddToPresentation() {
  const { pick, picking } = usePresent();
  return (
    <Tooltip title="Pick a card, chart or table on this page and add it to one of your presentations">
      <button type="button" className="search-pill pres-pill" onClick={pick} disabled={picking} data-no-capture="1"><FundProjectionScreenOutlined /><span className="label-text">Add to presentation</span></button>
    </Tooltip>
  );
}

function ShellInner({ info }: { info: SessionInfo }) {
  const { api, report, offline, setOffline, signOut } = useSession();
  const { message } = AntApp.useApp();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1000);
  const { primary, theme: colourTheme } = useTheme();
  const sideTheme = useMemo(() => ({
    algorithm: antTheme.darkAlgorithm,
    // the side menu is always dark: keep its light text even where the page uses dark text on buttons
    token: { colorPrimary: primary, colorTextLightSolid: '#ffffff' },
    components: { Menu: { darkItemBg: 'transparent', darkSubMenuItemBg: 'transparent', darkItemColor: '#b9cbe0', darkItemHoverBg: 'rgba(255,255,255,.07)',
      darkItemSelectedBg: colourTheme.deep, darkItemSelectedColor: '#ffffff', darkPopupBg: colourTheme.side, itemBorderRadius: 9, itemHeight: 42, iconSize: 16, itemMarginInline: 0,
      // collapsed: the menu is 52px wide inside the 72px side bar (10px padding each side), icons centred
      collapsedWidth: 52, collapsedIconSize: 17 } },
  }), [primary, colourTheme]);
  const [page, setActive] = useState<string>('dashboard');
  const [tabs, setTabs] = useState<string[]>(['dashboard']);
  const [nonce, setNonce] = useState<Record<string, number>>({});
  // pinned tabs: kept per company and person on this computer, opened again at sign-in
  const pinKey = `rs:pins:${info.company.domain}|${info.user.email}`.toLowerCase();
  const [pinned, setPinned] = useState<string[]>(() => readJson<string[]>(pinKey, [], (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')).slice(0, MAX_PINS));
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const pinTab = useCallback((id: string) => {
    setPinned((p) => { const next = togglePin(p, id).slice(0, MAX_PINS); writeJson(pinKey, next); return next; });
  }, [pinKey]);
  const setPage = useCallback((id: string) => {
    setActive(id);
    setTabs((t) => openTab(t, id, pinnedRef.current));
  }, []);
  const closeTab = useCallback((id: string) => {
    if (pinnedRef.current.includes(id)) return;
    setTabs((t) => {
      const next = t.filter((x) => x !== id);
      setActive((cur) => (cur === id ? nextActive(t, id) : cur));
      return next.length ? next : ['dashboard'];
    });
  }, []);
  const closeTabs = useCallback((ids: string[]) => {
    const drop = ids.filter((x) => x !== 'dashboard' && !pinnedRef.current.includes(x));
    setTabs((t) => {
      const next = t.filter((x) => !drop.includes(x));
      setActive((cur) => (drop.includes(cur) ? (next[next.length - 1] ?? 'dashboard') : cur));
      return next.length ? next : ['dashboard'];
    });
  }, []);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [finder, setFinder] = useState(false);
  const storeKey = recentsKey(info.company.domain, info.user.email);
  const [recent, setRecent] = useState<string[]>(() => loadRecents(storeKey));

  // refreshed every 2 minutes, so a change made in the provider's menu control or on the role screen reaches an open window without signing in again
  const menu = useQuery({ queryKey: ['menu'], queryFn: () => api.fetchMenu(), refetchInterval: 120_000 });
  useEffect(() => { if (menu.data) setOffline(menu.data.source === 'offline'); }, [menu.data, setOffline]);
  useEffect(() => { if (menu.error) report(menu.error); }, [menu.error, report]);

  const access = menu.data?.data.desktop_access;
  const classicAllowed = access?.settings.classic !== false;
  // a role that may not open web pages in the classic window only sees pages with a desktop screen
  const arranged = useMemo(() => arrangeMenu((menu.data?.data.sections ?? [])
    .map((s) => ({ ...s, items: (info.user.is_admin ? s.items : s.items.filter((i) => i.path !== '/master/CustomizeRoleAccess')) })) // the role screen is for administrators only
    .map((s) => ({ ...s, items: classicAllowed ? s.items : s.items.filter((i) => NATIVE[i.path] && !(menu.data?.data.classic_paths ?? []).includes(i.path)) }))
    .filter((s) => s.items.length), new Set(menu.data?.data.classic_paths ?? [])), [menu.data, classicAllowed, info.user.is_admin]);
  const sections = arranged.sections;
  const pages = useMemo(() => flatten(sections), [sections]);
  const byId = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const classic = useMemo(() => new Set(menu.data?.data.classic_paths ?? []), [menu.data]);
  const nativeOf = useCallback((path: string) => (classic.has(path) ? undefined : NATIVE[path]), [classic]);

  const openClassic = useCallback((path: string) => {
    if (!classicAllowed) { void message.warning('Your role cannot open web pages in the desktop app.'); return; }
    api.openClassic(CLASSIC_ALIAS[path] ?? path).catch((e) => {
      const d = describeError(asAppError(e));
      report(e);
      void message.error(`${d.title}. ${d.text}`);
    });
  }, [api, message, report, classicAllowed]);

  const go = useCallback((p: PageRef) => {
    setRecent((r) => { const next = pushRecent(r, p.id); saveRecents(storeKey, next); return next; });
    const native = nativeOf(p.path);
    if (native) setPage(native);
    else openClassic(p.path);
  }, [openClassic, storeKey, nativeOf, setPage]);

  // dashboard clicks: open the page with its filters; a page outside the role's menu is refused, not opened
  const drill = useCallback((t: DrillTarget) => {
    const p = pages.find((x) => x.path === t.path);
    if (!p) { void message.warning(`Your role cannot open ${t.label.split(' ')[0].toLowerCase()} from here.`); return; }
    const native = nativeOf(p.path);
    if (native) { setPending(t); setNonce((n) => ({ ...n, [native]: (n[native] ?? 0) + 1 })); setPage(native); }
    else { setPending(null); openClassic(p.path); }
  }, [pages, nativeOf, openClassic, message, setPage]);
  const back = useCallback(() => setPage('dashboard'), [setPage]);

  const [keysHelp, setKeysHelp] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  // the first time this version is opened after an update, show what is new once
  const newsAllowed = canSeeWhatsNew(info.user); // the provider decides who sees What is new (off unless switched on)
  useEffect(() => { if (newsAllowed && isUnread(readSeen())) { setPage('whatsnew'); markSeen(); } }, [setPage, newsAllowed]);
  const { allowed: askAllowed } = useAssistantSettings();
  const attention = useAttentionCount(askOpen);
  useEffect(() => onOpenAsk(() => setAskOpen(true)), []);
  const askRef = useRef(false);
  askRef.current = askAllowed;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setFinder(true); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && askRef.current) { e.preventDefault(); setAskOpen((o) => !o); return; }
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const t = tabsRef.current;
        setActive((cur) => { const i = t.indexOf(cur); return t[(i + (e.key === 'ArrowRight' ? 1 : t.length - 1)) % t.length] ?? cur; });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || busy(e.target)) return;
      if (e.key === '/') {
        const box = document.querySelector<HTMLInputElement>('.tab-pane:not([hidden]) .filters input.ant-input, .tab-pane:not([hidden]) .dash-filter input.ant-input');
        if (box) { e.preventDefault(); box.focus(); box.select(); }
      } else if (e.key === '?') {
        e.preventDefault(); setKeysHelp(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items: MenuProps['items'] = useMemo(() => {
    const recentPages = recent.map((id) => byId.get(id)).filter((p): p is PageRef => !!p);
    const leaf = (p: PageRef, prefix = '') => ({
      key: prefix + p.id,
      label: p.title,
      icon: nativeOf(p.path) ? undefined : <ExportOutlined style={{ fontSize: 11, opacity: 0.45 }} />,
    });
    const list: NonNullable<MenuProps['items']> = [];
    if (recentPages.length) {
      list.push({ key: 'recent', label: 'Recent', icon: <HistoryOutlined />, children: recentPages.map((p) => leaf(p, RECENT_PREFIX)) });
    }
    for (const s of sections) {
      // one top menu with its pages in a plain list: no sub-menus and no sub-headings (like the Desktop menu control screen)
      const children: NonNullable<MenuProps['items']> = s.items.map((i) => leaf({ ...i, section: s.title }));
      list.push({ key: s.id, label: <span title={s.title}>{s.title}</span>, icon: iconFor(s.icon), children });
    }
    list.push({ type: 'divider' });
    list.push({ key: PRESENT_KEY, label: 'Presentations', icon: <FundProjectionScreenOutlined /> });
    list.push({ key: SETTINGS_KEY, label: 'App settings', icon: <SettingOutlined /> });
    return list;
  }, [sections, recent, byId, nativeOf]);

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === SETTINGS_KEY) { setPage('settings'); return; }
    if (key === PRESENT_KEY) { setPage('presentations'); return; }
    const id = key.startsWith(RECENT_PREFIX) ? key.slice(RECENT_PREFIX.length) : key;
    const p = byId.get(id);
    if (p) go(p);
  };

  // open the pinned tabs again once the menu says which pages this person has (a page the role lost is skipped)
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !menu.data) return;
    restored.current = true;
    const ok = pinnedRef.current.filter((id) => id === 'settings' || (id === 'whatsnew' && newsAllowed) || id === 'presentations' || pages.some((p) => nativeOf(p.path) === id));
    if (ok.length) setTabs((t) => [...t, ...ok.filter((x) => !t.includes(x))]);
  }, [menu.data, pages, nativeOf, newsAllowed]);
  const titleOf = (id: string) => (id === 'dashboard' ? 'Dashboard' : id === 'settings' ? 'App settings' : id === 'presentations' ? 'My presentations' : id === 'whatsnew' ? 'What is new' : pages.find((p) => NATIVE[p.path] === id)?.title ?? id);
  const subOf = useMemo(() => new Map<string, string>(), []);
  const selected = page === 'settings' ? [SETTINGS_KEY] : page === 'presentations' ? [PRESENT_KEY]
    : [pages.find((p) => NATIVE[p.path] === page)?.id ?? ''];

  const initials = info.user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || 'U';
  const userMenu: MenuProps['items'] = [
    { key: 'who', label: <div><b>{info.user.name}</b><div className="muted">{info.user.email}</div></div>, disabled: true },
    { type: 'divider' },
    { key: 'settings', label: 'App settings', icon: <SettingOutlined />, onClick: () => setPage('settings') },
    { key: 'present', label: 'My presentations', icon: <FundProjectionScreenOutlined />, onClick: () => setPage('presentations') },
    ...(newsAllowed ? [{ key: 'news', label: 'What is new', icon: <BellOutlined />, onClick: () => setPage('whatsnew') }] : []),
    { key: 'keys', label: 'Keyboard shortcuts  (?)', icon: <QuestionCircleOutlined />, onClick: () => setKeysHelp(true) },
    { key: 'out', label: 'Sign out', icon: <LogoutOutlined />, danger: true, onClick: () => void signOut() },
  ];

  // one page; each open tab keeps its own copy mounted, so filters and scroll stay when switching tabs
  const view = (page: string) => (
    <>
          {page === 'dashboard' && <Dashboard isAdmin={info.user.is_admin} openClassic={openClassic} />}
          {page === 'settings' && <AppSettings info={info} />}
          {page === 'whatsnew' && newsAllowed && <WhatsNewPage active />}
          {page === 'presentations' && <PresentationsPage info={info} />}
          {page.startsWith('master:') && (
            <MasterList module={page.slice(7)} title={pages.find((p) => NATIVE[p.path] === page)?.title ?? 'List'}
              classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page.startsWith('form:') && (
            <FormPage page={page.slice(5)} title={pages.find((p) => NATIVE[p.path] === page)?.title ?? 'Form'}
              classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page === 'gamification' && <GamificationPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/master/Gamification'} openClassic={openClassic} />}
          {page === 'eagle' && (
            <EagleEyePage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/EagelEyeView'} openClassic={openClassic} />
          )}
          {page === 'mapview' && <MapViewPage classicPath="/Report/VisitReport" openClassic={openClassic} />}
          {page === 'insights' && <InsightsPage classicPath="/Report/VisitReport" openClassic={openClassic} />}
          {page === 'productivity' && <ProductivityPage classicPath="/Report/SalesmenSalesSummary" openClassic={openClassic} />}
          {page === 'alloc' && <AllocationPage kinds={arranged.allocKinds} openClassic={openClassic} />}
          {page === 'pipeline' && (
            <PipelinePage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/PipelineDashbord'} openClassic={openClassic} />
          )}
          {page === 'setup:van_promos' && <VanPromosPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />}
          {page === 'setup:app_training' && <TrainingPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />}
          {page === 'setup:roles' && <RolesPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/master/CustomizeRoleAccess'} openClassic={openClassic} />}
          {page === 'setup:promo_sms' && <SmsPage classicPath="/Utility/PromotionalSMS" openClassic={openClassic} />}
          {page === 'setup:price_lists' && <PriceListsPage classicPath="/master/BasePricing" openClassic={openClassic} />}
          {page === 'setup:service_calls' && <ServiceCallsPage classicPath="/Utility/ServiceCall" openClassic={openClassic} />}
          {page === 'setup:spare_parts' && <SparePartsPage classicPath="/master/SpareParts" openClassic={openClassic} />}
          {page === 'setup:company_settings' && <CompanySettingsPage classicPath="/Settings" openClassic={openClassic} />}
          {page === 'setup:tip_of_day' && <TipOfDayPage classicPath="/Support" openClassic={openClassic} />}
          {page === 'setup:my_profile' && <ProfilePage classicPath="/Profile" openClassic={openClassic} />}
          {page === 'setup:reset_password' && <ResetPasswordPage classicPath="/ResetPassword" openClassic={openClassic} />}
          {page === 'setup:rs_settings' && <RocketSalesSettingsPage classicPath="/RocketSalesSettings" openClassic={openClassic} />}
          {page === 'setup:app_user_settings' && <AppUserSettingsPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />}
          {page === 'designer:survey_forms' && <SurveyFormsPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/Utility/SurveyForm'} openClassic={openClassic} />}
          {page === 'designer:rocket_forms' && <RocketFormsPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/master/RocketFormMaster'} openClassic={openClassic} />}
          {page === 'designer:question_banks' && <QuestionBanksPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/Utility/QuestionBank'} openClassic={openClassic} />}
          {page === 'tool:push_notification' && (
            <PushPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {(page === 'tool:route_expense' || page === 'tool:invoice_upload' || page === 'tool:contact_upload') && (
            <UploadPage key={page} kind={page.slice(5) as 'route_expense' | 'invoice_upload' | 'contact_upload'}
              classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page === 'tool:hospital_doctor_map' && (
            <HospitalMapPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/master/HospitalDoctorMapping'} openClassic={openClassic} />
          )}
          {page.startsWith('grid:') && (
            <GridPage key={page} name={page.slice(5) as GridName}
              classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page === 'report:target_vs_sales' && (
            <TargetVsSalesPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/Report/TargetVsSalesReport'} openClassic={openClassic} />
          )}
          {page === 'report:target_itemized' && (
            <TargetItemizedPage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/Report/TargetVsSalesReportItemized'} openClassic={openClassic} />
          )}
          {page === 'report:performance' && (
            <PerformancePage classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/Report/PerformanceReport'} openClassic={openClassic} />
          )}
          {page === 'report:visit_timeline' && (
            <Timeline classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page === 'report:service_calls' && (
            <ServiceCallsList classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/Report/ServiceCallReport'} openClassic={openClassic} canAdd={arranged.serviceAdd} />
          )}
          {page in TABLE_REPORTS && page !== 'report:service_calls' && (
            <ReportTable key={page} name={TABLE_REPORTS[page].name} noun={TABLE_REPORTS[page].noun}
              classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page === 'report:order_summary' && (
            <OrderSummary classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page === 'orders' && (
            <Orders classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/OrderGrid'} openClassic={openClassic} />
          )}
          {page === 'mapping' && (
            <MappingView title={pages.find((p) => NATIVE[p.path] === page)?.title ?? 'Mapping'}
              classicPath={pages.find((p) => NATIVE[p.path] === page)?.path ?? '/'} openClassic={openClassic} />
          )}
          {page !== 'dashboard' && page !== 'settings' && page !== 'whatsnew' && page !== 'presentations' && page !== 'mapping' && page !== 'orders' && page !== 'report:order_summary' && page !== 'report:visit_timeline' && page !== 'report:target_vs_sales' && page !== 'report:target_itemized' && page !== 'report:performance' && !(page in TABLE_REPORTS) && !page.startsWith('master:') && !page.startsWith('form:') && !page.startsWith('grid:') && !page.startsWith('tool:') && !page.startsWith('designer:') && !page.startsWith('setup:') && page !== 'pipeline' && page !== 'eagle' && page !== 'gamification' && page !== 'alloc' && page !== 'mapview' && page !== 'productivity' && page !== 'insights' && <Result status="404" title="Page not found" />}
    </>
  );

  return (
    <PresentProvider info={info} page={page} tabs={tabs} goto={setPage} closeTab={closeTab} openPresentations={() => setPage('presentations')}>
    <div className="shell">
      <ScreenFitPrompt />
      <aside className={`sider${collapsed ? ' collapsed' : ''}`} style={{ width: collapsed ? 72 : 256 }}>
        <button type="button" className="brand" title="Dashboard" aria-label="Open the dashboard" onClick={() => setPage('dashboard')}>
          <AppLogo className="brand-logo" title="" /><div>RocketSales<small>Pharma AI Powered SFA Solution</small></div>
        </button>
        <div className="sider-scroll">
          {menu.isPending && !collapsed && <div style={{ padding: 8 }}><Skeleton active title={false} paragraph={{ rows: 7 }} /></div>}
          {menu.isError && !menu.data && !collapsed && (
            <div style={{ padding: 4 }}>
              <Alert type="warning" showIcon title={describeError(asAppError(menu.error)).title}
                description={describeError(asAppError(menu.error)).text}
                action={<Button size="small" onClick={() => void menu.refetch()}>Retry</Button>} />
            </div>
          )}
          <ConfigProvider theme={sideTheme}>
            <Menu theme="dark" mode="inline" inlineCollapsed={collapsed} items={items} selectedKeys={selected} openKeys={openKeys}
              onOpenChange={(keys) => setOpenKeys(openOne(keys, openKeys, subOf))} // one section open at a time (a sub-menu keeps its parent open)
              onClick={onClick} />
          </ConfigProvider>
        </div>
        <div className="sider-foot">
          <Tooltip title={collapsed ? 'Expand menu' : 'Collapse menu'} placement="right">
            <Button type="text" block icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((c) => !c)} aria-label="Toggle menu">{collapsed ? '' : 'Collapse'}</Button>
          </Tooltip>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button type="button" className="search-pill" onClick={() => setFinder(true)}>
            <SearchOutlined /><span className="label-text">Find a page</span><kbd>Ctrl K</kbd>
          </button>
          <AddToPresentation />
          {askAllowed && (
            <Tooltip title="RocketPilot AI: ask about your sales, visits and customers (Ctrl J)">
              <button type="button" className="ask-pill" onClick={() => setAskOpen(true)}><StarFilled /> RocketPilot AI{attention > 0 && <span className="ask-badge">{attention > 99 ? '99+' : attention}</span>}</button>
            </Tooltip>
          )}
          <span className="spacer" />
          <span className="company muted">{info.company.title}</span>
          <span className={`chip ${offline ? 'warn' : 'ok'}`}><span className="dot" />{offline ? 'Offline' : 'Online'}</span>
          <Bell onOpen={(i) => {
            const p = pages.find((x) => x.path === i.path);
            if (p) go(p); else void message.warning('Your role cannot open this page here.');
          }} />
          <Popover trigger="click" placement="bottomRight" content={<ThemePicker />} title="Appearance">
            <Button shape="circle" icon={<BgColorsOutlined />} aria-label="Colour theme and appearance" />
          </Popover>
          <Dropdown menu={{ items: userMenu }} trigger={['click']} placement="bottomRight">
            <button type="button" className="avatar" aria-label="Account">{initials}</button>
          </Dropdown>
        </div>
        <PageTabs tabs={arrangeTabs(tabs, pinned)} active={page} titleOf={titleOf} onPick={setPage} onClose={closeTab} pinned={pinned} onPin={pinTab} onCloseMany={closeTabs} />
        <main className="content"><DrillProvider drill={drill} back={back}>
          <UpdateNotice />
          {askAllowed && <AskPanel open={askOpen} onClose={() => setAskOpen(false)} />}
          {tabs.map((id) => (
            <div key={`${id}#${nonce[id] ?? 0}`} className="tab-pane" hidden={id !== page}>
              <ActivePage active={id === page}>
                <AccessProvider access={access} path={pages.find((p) => NATIVE[p.path] === id)?.path}>{id.startsWith('tool:') ? <NeedCan cap="create">{view(id)}</NeedCan> : EDIT_SETTINGS_PAGES.includes(id) ? <ReadOnlyUnless cap="edit">{view(id)}</ReadOnlyUnless> : view(id)}</AccessProvider>
              </ActivePage>
            </div>
          ))}
        </DrillProvider></main>
      </div>
      <Modal open={keysHelp} onCancel={() => setKeysHelp(false)} footer={null} title="Keyboard shortcuts" width={420}>
        <div className="kbd-list">
          <kbd>Ctrl K</kbd><span>Find a page</span>
          <kbd>Ctrl J</kbd><span>Open RocketPilot AI</span>
          <kbd>/</kbd><span>Go to the search box of this page</span>
          <kbd>↑ ↓</kbd><span>Move through the rows (also j and k)</span>
          <kbd>Enter</kbd><span>Open the selected row</span>
          <kbd>Esc</kbd><span>Close a panel, or clear the selected row</span>
          <kbd>Alt ← →</kbd><span>Previous or next tab</span>
          <kbd>?</kbd><span>This list</span>
        </div>
      </Modal>
      <PageFinder open={finder} pages={pages} onClose={() => setFinder(false)}
        onPick={(p) => { setFinder(false); go(p); }} />
    </div>
    </PresentProvider>
  );
}
