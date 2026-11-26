import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Drawer, Space, Switch, Tooltip } from 'antd';
import { CopyOutlined, DownOutlined, IdcardOutlined, UpOutlined } from '@ant-design/icons';
import { showDate } from './dates';

type Row = Record<string, unknown>;
export interface PanelLink { label: string; onClick: () => void }

const text = (v: unknown) => {
  const x = showDate(v);
  return x === null || x === undefined ? '' : typeof x === 'number' ? x.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(x);
};
/** The heading of a row: the first name-like column with a value. */
const HEAD_KEYS = ['customer', 'doctor', 'name', 'rep', 'title', 'number'];
const SUB_KEYS = ['date', 'start', 'end', 'rep', 'hq', 'area'];

/** Every field of one report row, read like a record card; ↑ / ↓ move through the rows. */
export default function RecordPanel({ rows, index, columns, title, onIndex, onClose, links }: {
  rows: Row[]; index: number | null; columns: { key: string; title: string }[]; title: string;
  onIndex: (i: number) => void; onClose: () => void; links?: (row: Row) => PanelLink[];
}) {
  const { message } = AntApp.useApp();
  const [empty, setEmpty] = useState(false);
  const row = index !== null ? rows[index] : undefined;
  const head = useMemo(() => {
    if (!row) return { h: '', sub: '' };
    const hk = HEAD_KEYS.find((k) => text(row[k]).trim());
    const sub = SUB_KEYS.filter((k) => k !== hk && text(row[k]).trim()).map((k) => text(row[k])).join('  ·  ');
    return { h: hk ? text(row[hk]) : title, sub };
  }, [row, title]);
  useEffect(() => {
    if (index === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'ArrowDown' && index < rows.length - 1) { e.preventDefault(); onIndex(index + 1); }
      if (e.key === 'ArrowUp' && index > 0) { e.preventDefault(); onIndex(index - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, rows.length, onIndex]);
  if (!row) return <Drawer open={false} onClose={onClose} />;
  const shown = columns.filter((c) => empty || text(row[c.key]).trim() !== '');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(columns.map((c) => `${c.title}: ${text(row[c.key])}`).join('\n'));
      void message.success('Details copied');
    } catch { void message.error('The details could not be copied.'); }
  };
  return (
    <Drawer open onClose={onClose} size={Math.min(560, window.innerWidth)} className="record-panel"
      title={<div className="rp-head"><b>{head.h}</b>{head.sub && <span className="muted">{head.sub}</span>}</div>}
      extra={<Space size={4}>
        <Tooltip title="Previous (↑)"><Button size="small" icon={<UpOutlined />} disabled={index === 0} onClick={() => onIndex(index! - 1)} aria-label="Previous row" /></Tooltip>
        <Tooltip title="Next (↓)"><Button size="small" icon={<DownOutlined />} disabled={index === rows.length - 1} onClick={() => onIndex(index! + 1)} aria-label="Next row" /></Tooltip>
      </Space>}>
      <div className="rp-actions">
        {(links?.(row) ?? []).map((l) => <Button key={l.label} size="small" type="primary" icon={<IdcardOutlined />} onClick={l.onClick}>{l.label}</Button>)}
        <Button size="small" icon={<CopyOutlined />} onClick={() => void copy()}>Copy details</Button>
        <span className="rp-empty"><Switch size="small" checked={empty} onChange={setEmpty} /> Show empty fields</span>
      </div>
      <dl className="rp-fields">
        {shown.map((c) => (
          <div key={c.key} className="rp-field"><dt>{c.title}</dt><dd>{text(row[c.key]) || <span className="muted">Not filled</span>}</dd></div>
        ))}
      </dl>
      <div className="muted rp-foot">{index! + 1} of {rows.length} on this page</div>
    </Drawer>
  );
}
