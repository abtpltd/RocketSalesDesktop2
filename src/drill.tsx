import { createContext, useContext, useState, type ReactNode } from 'react';
import { Alert, Button, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

/** Where a dashboard click leads: a page (by web path) opened with filters set. Every filter is optional. */
export interface DrillTarget { path: string; from?: string; to?: string; search?: string; rep?: string; label: string }

interface Ctx { drill: (t: DrillTarget) => void; back: () => void }
const DrillContext = createContext<Ctx>({ drill: () => undefined, back: () => undefined });

let pending: DrillTarget | null = null;
const base = (p?: string) => String(p ?? '').split('?')[0];
/** Keep the target until the page it is for picks it up (once). */
export function setPending(t: DrillTarget | null) { pending = t; }
export function takePending(path?: string): DrillTarget | null {
  if (!pending || !path || base(pending.path) !== base(path)) return null;
  const t = pending; pending = null; return t;
}
const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** The target's dates only when both are real dates, so a bad value never reaches a filter. */
export const drillRange = (t: DrillTarget | null) => (t && isDay(t.from) && isDay(t.to) && t.from! <= t.to! ? [t.from!, t.to!] as const : null);

export function DrillProvider({ drill, back, children }: Ctx & { children: ReactNode }) {
  return <DrillContext.Provider value={{ drill, back }}>{children}</DrillContext.Provider>;
}
export const useDrill = () => useContext(DrillContext);

/** For a page: the dashboard filter meant for it (read once when it opens). */
export function useDrillIn(path?: string): DrillTarget | null {
  const [t] = useState(() => takePending(path));
  return t;
}

/** The strip at the top of a page opened from the dashboard. */
export function DrillBanner({ t, onClear }: { t: DrillTarget | null; onClear?: () => void }) {
  const { back } = useDrill();
  const [shown, setShown] = useState(true);
  if (!t || !shown) return null;
  return (
    <Alert type="info" showIcon className="drill-banner" title={<>Opened from the dashboard: <b>{t.label}</b></>}
      action={<Space size={6}>
        {onClear && <Button size="small" onClick={() => { setShown(false); onClear(); }}>Show all</Button>}
        <Button size="small" type="primary" icon={<ArrowLeftOutlined />} onClick={back}>Back to dashboard</Button>
      </Space>} />
  );
}
