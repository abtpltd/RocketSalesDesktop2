import { useCallback, useRef, useState, type DragEvent, type HTMLAttributes, type ReactNode } from 'react';
import { App as AntApp, Button, Checkbox, Divider, Dropdown, Input, Popover, Segmented, Space, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, FilterOutlined, PushpinFilled, PushpinOutlined, SaveOutlined, TableOutlined } from '@ant-design/icons';
import { useSession } from '../session';
import { MAX_VIEWS, decodeRange, encodeRange, putView, rangeLabel, readJson, writeJson, type SavedView } from './prefsMath';
import { isDefaultOrder, moveColumn, orderColumns } from './gridOrder';

export type RowSize = 'small' | 'middle';
/** `order` and `frozen` were added later: settings saved before them simply keep the page's own column order and freeze nothing. */
interface GridPref { hidden: string[]; size: RowSize; order?: string[]; frozen?: string }
const DEFAULT: GridPref = { hidden: [], size: 'small' };
const okPref = (v: unknown) => {
  const p = v as GridPref;
  return !!p && typeof p === 'object' && Array.isArray(p.hidden) && (p.size === 'small' || p.size === 'middle')
    && (p.order === undefined || (Array.isArray(p.order) && p.order.every((k) => typeof k === 'string')))
    && (p.frozen === undefined || typeof p.frozen === 'string');
};
type HeaderCell = (col: never) => HTMLAttributes<HTMLElement>;

/** Preferences are kept per company, per user and per page on this computer. */
export function useOwnerKey(kind: string, page: string) {
  const { state } = useSession();
  const who = state.status === 'in' ? `${state.info.company.domain}|${state.info.user.email}` : 'anon';
  return `rs:${kind}:${who}:${page}`;
}

export function useGridPrefs(page: string) {
  const key = useOwnerKey('grid', page);
  const [pref, setPref] = useState<GridPref>(() => readJson<GridPref>(key, DEFAULT, okPref));
  const save = useCallback((p: GridPref) => { setPref(p); writeJson(key, p); }, [key]);
  const dragging = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  /**
   * The columns to show: in the person's order, without the hidden ones. Each movable column header can be dragged
   * onto another to move it there; the new order is saved at once.
   */
  const visible = useCallback(<C extends { key?: unknown; fixed?: unknown; onHeaderCell?: unknown; title?: unknown; className?: string }>(cols: C[]): C[] => {
    const ordered = orderColumns(cols, pref.order);
    const all = ordered.filter((c) => c.key != null && !c.fixed).map((c) => String(c.key));
    const kept = ordered.filter((c) => !pref.hidden.includes(String(c.key)));
    const shown = kept.length ? kept : ordered; // never an empty table
    const pinned = pref.frozen && shown.some((c) => c.key != null && !c.fixed && String(c.key) === pref.frozen) ? pref.frozen : undefined;
    const pin = (k: string, title: unknown): unknown => {
      const on = pinned === k;
      const button = (
        <button type="button" className={`gp-pin${on ? ' on' : ''}`} draggable={false} aria-pressed={on}
          aria-label={`${on ? 'Unfreeze' : 'Freeze'} column ${typeof title === 'string' ? title : k}`}
          title={on ? 'Unfreeze this column' : 'Freeze this column (keeps it in view while you scroll sideways)'}
          onMouseDown={(e) => e.stopPropagation()} onDragStart={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); save({ ...pref, frozen: on ? undefined : k }); }}>
          {on ? <PushpinFilled /> : <PushpinOutlined />}
        </button>
      );
      const label = (node: ReactNode) => <span className="gp-th">{node}{button}</span>;
      return typeof title === 'function' ? (...a: unknown[]) => label((title as (...x: unknown[]) => ReactNode)(...a)) : label((title ?? k) as ReactNode);
    };
    const out = shown.map((c) => {
      if (c.key == null || c.fixed) return c;
      const k = String(c.key);
      const own = c.onHeaderCell as HeaderCell | undefined;
      const onHeaderCell = (col: never): HTMLAttributes<HTMLElement> => {
        const base = own ? own(col) : {};
        return {
          ...base,
          draggable: true,
          className: [base.className, 'gp-drag', over === k && dragging.current !== k ? 'gp-over' : ''].filter(Boolean).join(' '),
          title: base.title ?? 'Drag to move this column',
          onDragStart: (e: DragEvent<HTMLElement>) => { dragging.current = k; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); },
          onDragOver: (e: DragEvent<HTMLElement>) => { if (dragging.current && dragging.current !== k) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== k) setOver(k); } },
          onDragLeave: () => setOver((o) => (o === k ? null : o)),
          onDrop: (e: DragEvent<HTMLElement>) => {
            e.preventDefault();
            const from = dragging.current;
            dragging.current = null; setOver(null);
            if (from && from !== k) save({ ...pref, order: moveColumn(all, from, k) });
          },
          onDragEnd: () => { dragging.current = null; setOver(null); },
        };
      };
      return { ...c, title: pin(k, c.title), onHeaderCell, ...(pinned === k ? { fixed: 'left', className: [c.className, 'gp-frozen'].filter(Boolean).join(' ') } : {}) } as C;
    });
    if (!pinned) return out;
    // a frozen column sits just after any columns the page itself fixes on the left, so the sticky offsets add up
    const at = out.findIndex((c) => (c as { className?: string }).className?.includes('gp-frozen'));
    const lead = out.filter((c, i) => i !== at && (c as { fixed?: unknown }).fixed === 'left' && i < at).length;
    const rest = out.slice();
    const [col] = rest.splice(at, 1);
    const firstFree = rest.findIndex((c) => (c as { fixed?: unknown }).fixed !== 'left');
    rest.splice(firstFree < 0 ? lead : firstFree, 0, col);
    return rest;
  }, [pref, save, over]);
  /** The columns for an Excel file: the ones shown in the grid, in the person's order. */
  const forExport = useCallback(<C extends { key?: unknown }>(cols: C[]): C[] => {
    const kept = orderColumns(cols, pref.order).filter((c) => !pref.hidden.includes(String(c.key)));
    return kept.length ? kept : cols;
  }, [pref]);
  return { pref, save, visible, forExport };
}

/** Choose the columns and the row height of a grid. */
export function GridSettings({ columns, prefs }: { columns: { key: string; title: string }[]; prefs: ReturnType<typeof useGridPrefs> }) {
  const { pref, save } = prefs;
  const shown = columns.filter((c) => !pref.hidden.includes(c.key)).length;
  const list = orderColumns(columns, pref.order);
  const keys = list.map((c) => c.key);
  const step = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const next = [...keys];
    [next[i], next[j]] = [next[j], next[i]];
    save({ ...pref, order: next });
  };
  const changed = !isDefaultOrder(columns.map((c) => c.key), pref.order);
  const content = (
    <div className="grid-prefs">
      <div className="gp-label">Row height</div>
      <Segmented size="small" block value={pref.size} onChange={(v) => save({ ...pref, size: v as RowSize })}
        options={[{ value: 'small', label: 'Compact' }, { value: 'middle', label: 'Comfortable' }]} />
      <Divider style={{ margin: '10px 0' }} />
      {pref.frozen && columns.some((c) => c.key === pref.frozen) && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          <PushpinFilled /> Frozen: <b>{columns.find((c) => c.key === pref.frozen)?.title}</b>{' '}
          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => save({ ...pref, frozen: undefined })}>Unfreeze</Button>
        </div>
      )}
      <div className="gp-label">Columns ({shown} of {columns.length})</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Tick to show. Use the arrows, or drag a column heading in the grid, to change the order.</div>
      <div className="gp-cols">
        {list.map((c, i) => {
          const on = !pref.hidden.includes(c.key);
          const name = c.title || c.key;
          return (
            <div key={c.key} className="gp-col">
              <Checkbox checked={on} disabled={on && shown === 1}
                onChange={(e) => save({ ...pref, hidden: e.target.checked ? pref.hidden.filter((k) => k !== c.key) : [...pref.hidden, c.key] })}>
                {name}
              </Checkbox>
              <span style={{ flex: 1 }} />
              <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label={`Move ${name} left`} disabled={i === 0} onClick={() => step(i, -1)} />
              <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label={`Move ${name} right`} disabled={i === list.length - 1} onClick={() => step(i, 1)} />
            </div>
          );
        })}
      </div>
      <Space size={12} wrap style={{ marginTop: 6 }}>
        <Button size="small" type="link" style={{ padding: 0 }} disabled={!changed} onClick={() => save({ ...pref, order: undefined })}>Original column order</Button>
        <Button size="small" type="link" style={{ padding: 0 }} onClick={() => save(DEFAULT)}>Reset all</Button>
      </Space>
    </div>
  );
  return (
    <Popover trigger="click" placement="bottomRight" content={content} title="Columns and rows">
      <Tooltip title="Columns: show, hide, reorder; row height"><Button icon={<TableOutlined />} aria-label="Columns and row height">{pref.hidden.length ? `${shown}/${columns.length}` : null}</Button></Tooltip>
    </Popover>
  );
}

/** Saved filters for a page: save the filters in use under a name, pick one to use it again. */
export function SavedViews<F extends Record<string, string>>({ page, from, to, filters, onApply }: {
  page: string; from: string; to: string; filters: F; onApply: (range: [string, string] | null, filters: F) => void;
}) {
  const key = useOwnerKey('views', page);
  const { message } = AntApp.useApp();
  const [views, setViews] = useState<SavedView<F>[]>(() => readJson<SavedView<F>[]>(key, [],
    (v) => Array.isArray(v) && v.every((x) => x && typeof x === 'object' && typeof (x as SavedView<F>).name === 'string' && typeof (x as SavedView<F>).filters === 'object')));
  const [naming, setNaming] = useState<string | null>(null);
  const store = (v: SavedView<F>[]) => { setViews(v); writeJson(key, v); };
  const save = () => {
    const name = (naming ?? '').trim();
    if (!name) return;
    store(putView(views, { name, range: encodeRange(from, to), filters }));
    setNaming(null);
    void message.success(`Saved "${name}"`);
  };
  const describe = (v: SavedView<F>) => [rangeLabel(v.range), ...Object.entries(v.filters).filter(([, x]) => x && x.length <= 30).map(([k, x]) => `${k}: ${x}`)].filter(Boolean).join(', ') || 'no filters';
  return (
    <Dropdown trigger={['click']} open={naming !== null ? false : undefined} menu={{
      items: [
        ...(views.length ? views.map((v) => ({
          key: `v:${v.name}`,
          label: <div className="sv-item"><div><b>{v.name}</b><div className="muted">{describe(v)}</div></div>
            <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Delete ${v.name}`}
              onClick={(e) => { e.stopPropagation(); store(views.filter((x) => x !== v)); }} /></div>,
        })) : [{ key: 'none', label: <span className="muted">No saved filters yet</span>, disabled: true }]),
        { type: 'divider' as const },
        { key: 'save', icon: <SaveOutlined />, label: views.length >= MAX_VIEWS ? `Save current filters (oldest of ${MAX_VIEWS} is replaced)` : 'Save current filters...' },
      ],
      onClick: ({ key: k }) => {
        if (k === 'save') { setNaming(''); return; }
        const v = views.find((x) => `v:${x.name}` === k);
        if (v) onApply(decodeRange(v.range), { ...v.filters });
      },
    }}>
      <span>
        <Popover open={naming !== null} placement="bottomRight" onOpenChange={(o) => { if (!o) setNaming(null); }} title="Name these filters"
          content={<Space.Compact style={{ width: 260 }}>
            <Input autoFocus maxLength={40} placeholder="For example: Nairobi, this month" value={naming ?? ''} onChange={(e) => setNaming(e.target.value)} onPressEnter={save} />
            <Button type="primary" onClick={save} disabled={!(naming ?? '').trim()}>Save</Button>
          </Space.Compact>}>
          <Tooltip title="Saved filters"><Button icon={<FilterOutlined />} aria-label="Saved filters">{views.length ? views.length : null}</Button></Tooltip>
        </Popover>
      </span>
    </Dropdown>
  );
}
