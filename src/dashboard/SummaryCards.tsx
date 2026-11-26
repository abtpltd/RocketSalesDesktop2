import type { ReactNode } from 'react';
import { AppstoreOutlined, EnvironmentOutlined, IdcardOutlined, MedicineBoxOutlined, ShopOutlined, ShoppingOutlined } from '@ant-design/icons';
import { useDrill } from '../drill';
import { cardTarget } from './drillMap';
import type { Change, MonthCompare } from './compare';
import type { DashboardSummary } from '../api/types';
import { Spark } from './DashParts';

const n = (v: number | undefined) => (typeof v === 'number' ? v.toLocaleString() : '-');
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export type CardId = 'customers' | 'doctors' | 'products' | 'attendance' | 'visits' | 'orders';
export const CARD_LABEL: Record<CardId, string> = { customers: 'Customers', doctors: 'Doctors', products: 'Products', attendance: 'Attendance today', visits: 'Visits today', orders: 'Orders today' };

/** Web card ids (kas page) and home card fields, so each company keeps its own card list and order. */
export const CARD_FOR: Record<string, CardId> = {
  CCOUNT: 'customers', DCOUNT: 'doctors', PCOUNT: 'products', ACOUNT: 'attendance', VCOUNT: 'visits', OCOUNT: 'orders',
  customerCount: 'customers', doctorCount: 'doctors', productCount: 'products', attendanceCount: 'attendance',
  visitCount: 'visits', orderCount: 'orders',
};

function Card({ tone, icon, label, value, unit, children, onOpen }: { tone: string; icon: ReactNode; label: string; value: ReactNode; unit?: string; children?: ReactNode; onOpen?: () => void }) {
  return (
    <section className={`sum-card tone-${tone}${onOpen ? ' can-open' : ''}`} {...(onOpen ? {
      role: 'button', tabIndex: 0, title: `Open ${label.toLowerCase()}`, onClick: onOpen,
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
    } : {})}>
      <header><span className="sum-icon" aria-hidden>{icon}</span><span className="sum-label">{label}</span></header>
      <div className="sum-value">{value}{unit && <span className="sum-unit">{unit}</span>}</div>
      <div className="sum-body">{children}</div>
    </section>
  );
}

/** Two parts of one whole as a single bar with a key under it (tagged / untagged, active / inactive). */
function Split({ a, b, aLabel, bLabel, aTone, bTone }: { a: number; b: number; aLabel: string; bLabel: string; aTone: string; bTone: string }) {
  const total = a + b;
  return (
    <>
      <div className="split" role="img" aria-label={`${aLabel} ${n(a)}, ${bLabel} ${n(b)}`}>
        <span className={`seg ${aTone}`} style={{ width: `${total ? (a / total) * 100 : 0}%` }} />
        <span className={`seg ${bTone}`} style={{ width: `${total ? (b / total) * 100 : 0}%` }} />
      </div>
      <div className="split-key">
        <span><i className={`dot ${aTone}`} />{aLabel}<b>{n(a)}</b><em>{pct(a, total)}%</em></span>
        <span><i className={`dot ${bTone}`} />{bLabel}<b>{n(b)}</b><em>{pct(b, total)}%</em></span>
      </div>
    </>
  );
}

/** "31 of 38" with a bar; done can pass the plan (unplanned visits), the bar then stays full. */
function Progress({ label, done, of, word = 'of' }: { label: string; done: number; of: number; word?: string }) {
  const share = of > 0 ? Math.min(100, (done / of) * 100) : 0;
  return (
    <div className="prog">
      <div className="prog-top"><span>{label}</span><span><b>{n(done)}</b> {word} {n(of)}</span></div>
      <div className="prog-track"><span style={{ width: `${share}%` }} /></div>
    </div>
  );
}

/** "▲ 12% vs Sep-2026" for the same days; nothing when last month is unknown. */
function Delta({ c, prev, what, money }: { c?: Change; prev?: string; what: string; money?: boolean }) {
  if (!c || !prev) return null;
  const fmt = (v: number) => (money ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString());
  const tone = c.pct === null ? 'flat' : c.pct > 0 ? 'up' : c.pct < 0 ? 'down' : 'flat';
  const tip = `${what} this month so far: ${fmt(c.now)}. Same days of ${prev}: ${fmt(c.before)}.`;
  return (
    <div className={`delta ${tone}`} title={tip} aria-label={tip}>
      <span className="delta-pct">{c.pct === null ? 'new' : `${c.pct > 0 ? '▲' : c.pct < 0 ? '▼' : '='} ${Math.abs(c.pct)}%`}</span>
      <span className="delta-text">{what} month to date vs {prev}</span>
    </div>
  );
}

export function summaryCard(id: CardId, s: DashboardSummary, orderSpark?: (number | null)[], onOpen?: () => void, compare?: MonthCompare | null): ReactNode {
  // older servers may leave a part out: show '-' rather than fail
  if (!s || !(id === 'orders' ? true : (s as unknown as Record<string, unknown>)[id])) return null;
  switch (id) {
    case 'customers':
      return (
        <Card key={id} onOpen={onOpen} tone="blue" icon={<ShopOutlined />} label="Customers" value={n(s.customers.total)} unit="total">
          <Split a={s.customers.tagged} b={s.customers.untagged} aLabel="Tagged" bLabel="Untagged" aTone="t-ok" bTone="t-warn" />
        </Card>
      );
    case 'doctors':
      return (
        <Card key={id} onOpen={onOpen} tone="teal" icon={<MedicineBoxOutlined />} label="Doctors" value={n(s.doctors.total)} unit="total">
          <Split a={s.doctors.tagged} b={s.doctors.untagged} aLabel="Tagged" bLabel="Untagged" aTone="t-ok" bTone="t-warn" />
        </Card>
      );
    case 'products':
      return (
        <Card key={id} onOpen={onOpen} tone="violet" icon={<AppstoreOutlined />} label="Products" value={n(s.products.total)} unit="total">
          <Split a={s.products.active} b={s.products.inactive} aLabel="Active" bLabel="Inactive" aTone="t-brand" bTone="t-mute" />
        </Card>
      );
    case 'attendance': {
      const a = s.attendance;
      return (
        <Card key={id} onOpen={onOpen} tone="green" icon={<IdcardOutlined />} label="Attendance today" value={n(a.app_users + a.backoffice_users)} unit="users">
          <Progress label="App users present" done={a.app_present} of={a.app_users} />
          <Progress label="Back office present" done={a.backoffice_present} of={a.backoffice_users} />
        </Card>
      );
    }
    case 'visits': {
      const v = s.visits;
      const done = v.customers_done + v.doctors_done;
      const planned = v.customers_planned + v.doctors_planned;
      return (
        <Card key={id} onOpen={onOpen} tone="orange" icon={<EnvironmentOutlined />} label="Visits today"
          value={<>{n(done)}<span className="sum-of">/ {n(planned)}</span></>} unit="done / scheduled">
          <Progress label="Customer visits" done={v.customers_done} of={v.customers_planned} word="/" />
          <Progress label="Doctor visits" done={v.doctors_done} of={v.doctors_planned} word="/" />
          {compare && <Delta c={{ now: compare.visits.now + compare.doctors.now, before: compare.visits.before + compare.doctors.before,
            pct: compare.visits.before + compare.doctors.before > 0 ? Math.round((((compare.visits.now + compare.doctors.now) - (compare.visits.before + compare.doctors.before)) / (compare.visits.before + compare.doctors.before)) * 1000) / 10 : null }}
            prev={compare.prevMonth} what="Visits" />}
        </Card>
      );
    }
    case 'orders':
      return (
        <Card key={id} onOpen={onOpen} tone="rose" icon={<ShoppingOutlined />} label="Orders today" value={n(s.orders_today)} unit="orders">
          {orderSpark && <><div className="sum-note">Order value this month, day by day</div><Spark values={orderSpark} label="Order value" /></>}
          <Delta c={compare?.orders} prev={compare?.prevMonth} what="Order value" money />
        </Card>
      );
    default:
      return null;
  }
}

/** The headline cards in the order given (each company's own card list). */
export default function SummaryCards({ ids, summary, orderSpark, today, compare }: { ids: CardId[]; summary: DashboardSummary; orderSpark?: (number | null)[]; today?: string; compare?: MonthCompare | null }) {
  const { drill } = useDrill();
  if (!ids.length || !summary) return null;
  return <div className="sum-grid">{ids.map((id) => {
    const to = cardTarget(id, today);
    return summaryCard(id, summary, orderSpark, to ? () => drill(to) : undefined, compare);
  })}</div>;
}
