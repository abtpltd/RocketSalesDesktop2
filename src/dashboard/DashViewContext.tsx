import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, Drawer, Empty } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import type { ViewState } from './views';
import { arranged, panelList, type Arrange, type DashView } from './savedView';

export interface ListItem { key: string; label: string }
type Part = 'charts' | 'cards';
interface Ctx {
  view: DashView;
  setChartView: (code: string, v: ViewState) => void;
  setArrange: (part: Part, a: Arrange) => void;
  register: (part: Part, items: ListItem[]) => void;
  lists: Record<Part, ListItem[]>;
}
const DashViewCtx = createContext<Ctx | null>(null);
export const useDashView = () => useContext(DashViewCtx);

/** Holds the dashboard view being edited (charts and cards each dashboard lists, chart views, order and hiding). */
export function DashViewProvider({ view, onChange, children }: { view: DashView; onChange: (v: DashView) => void; children: ReactNode }) {
  const [lists, setLists] = useState<Record<Part, ListItem[]>>({ charts: [], cards: [] });
  const latest = useRef(view);
  latest.current = view;
  const ctx = useMemo<Ctx>(() => ({
    view, lists,
    setChartView: (code, v) => onChange({ ...latest.current, views: { ...latest.current.views, [code]: v } }),
    setArrange: (part, a) => onChange({ ...latest.current, [part]: a }),
    register: (part, items) => setLists((l) => (JSON.stringify(l[part]) === JSON.stringify(items) ? l : { ...l, [part]: items })),
  }), [view, lists, onChange]);
  return <DashViewCtx.Provider value={ctx}>{children}</DashViewCtx.Provider>;
}

/** A dashboard tells the customise panel what it can show; returns the keys to show, in the person's order. */
export function useArranged(part: Part, items: ListItem[]): string[] {
  const ctx = useDashView();
  const register = ctx?.register;
  const json = JSON.stringify(items);
  useEffect(() => { register?.(part, JSON.parse(json) as ListItem[]); }, [register, part, json]);
  const keys = items.map((i) => i.key);
  return ctx ? arranged(keys, ctx.view[part]) : keys;
}

function Section({ title, part }: { title: string; part: Part }) {
  const ctx = useDashView()!;
  const items = ctx.lists[part];
  const label = new Map(items.map((i) => [i.key, i.label]));
  const rows = panelList(items.map((i) => i.key), ctx.view[part]);
  const put = (next: { key: string; shown: boolean }[]) =>
    ctx.setArrange(part, { order: next.map((r) => r.key), hidden: next.filter((r) => !r.shown).map((r) => r.key) });
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    put(next);
  };
  return (
    <section style={{ marginBottom: 22 }}>
      <h4 style={{ margin: '0 0 8px' }}>{title}</h4>
      {!rows.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to arrange here." />}
      {rows.map((r, i) => (
        <div key={r.key} className="dv-row">
          <Checkbox checked={r.shown} onChange={(e) => put(rows.map((x) => (x.key === r.key ? { ...x, shown: e.target.checked } : x)))}>
            {label.get(r.key) ?? r.key}
          </Checkbox>
          <span style={{ flex: 1 }} />
          <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label={`Move ${label.get(r.key)} up`} disabled={i === 0} onClick={() => move(i, -1)} />
          <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label={`Move ${label.get(r.key)} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
        </div>
      ))}
    </section>
  );
}

/** Show / hide and order the headline cards and charts (only those the person's role already sees). */
export function CustomiseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title="Customise dashboard" size={Math.min(440, window.innerWidth)}
      footer={<span className="muted">Changes show at once. Press <b>Save view</b> to keep them on this computer.</span>}>
      <p className="muted" style={{ marginTop: 0 }}>Only the cards and charts your role can see are listed. Each chart's own view
        (chart type, top, by week...) is kept too when you save.</p>
      <Section title="Headline cards" part="cards" />
      <Section title="Charts" part="charts" />
    </Drawer>
  );
}
