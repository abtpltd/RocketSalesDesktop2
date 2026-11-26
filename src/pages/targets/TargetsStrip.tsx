import { useState } from 'react';
import { Button, InputNumber, Modal, Space } from 'antd';
import { CopyOutlined, RiseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { GridPayload } from '../../api/types';
import type { Changes } from '../gridMath';
import { copyLastMonth, copyLastQty, groupSplit, qtyOf, raiseBy, short, targetKpis, whole, type ItemRow, type TargetRow } from './targetsMath';

const COLORS = ['var(--brand)', 'color-mix(in srgb, var(--brand) 55%, var(--card))', 'var(--ok)', 'var(--warn)', 'var(--mute)'];

/**
 * Figures and quick fills above the Target Entry and Itemized Targets grids. Quick fills only change the cells on
 * screen (marked as changed); nothing is saved until Save, which still runs the web's own Target Entry save.
 */
export default function TargetsStrip({ name, payload: p, changes, setChanges, canEdit }: {
  name: 'targets' | 'itemized_targets' | string; payload: GridPayload; changes: Changes;
  setChanges: (c: Changes) => void; canEdit: boolean;
}) {
  const [raise, setRaise] = useState<number | null>(null);
  const put = (c: Record<string, Record<string, unknown>>) => setChanges(c as Changes);

  if (name === 'targets') {
    const rows = p.rows as unknown as TargetRow[];
    const k = targetKpis(rows, changes, p.month ?? dayjs().format('YYYY-MM'), p.today ?? dayjs().format('YYYY-MM-DD'));
    const hasLast = rows.some((r) => Number(r.last_amount ?? 0) > 0);
    return (
      <>
        <div className="game-strip">
          <div><div className="l">Team target</div><div className="v">{short(k.team)}<small>{rows.length} people</small></div></div>
          <div><div className="l">Achieved so far</div><div className="v">{short(k.achieved)}<small>{k.pct == null ? '' : `${k.pct}%`}</small></div></div>
          <div><div className="l">Days left</div><div className="v">{k.daysLeft}<small>in the month</small></div></div>
          <div><div className="l">Needed per day</div><div className="v">{k.perDay ? short(k.perDay) : '–'}<small>{k.perDay ? 'to reach 100%' : ''}</small></div></div>
          <div><div className="l">Without a target</div><div className="v">{k.without.length}<small>{k.without.slice(0, 2).join(', ')}</small></div></div>
        </div>
        {canEdit && (
          <Space wrap style={{ marginBottom: 10 }}>
            <Button icon={<CopyOutlined />} disabled={!hasLast} title={hasLast ? undefined : 'No targets were saved last month'}
              onClick={() => put(copyLastMonth(rows, changes))}>Copy last month</Button>
            <Button icon={<RiseOutlined />} onClick={() => setRaise(5)}>Raise all by %</Button>
            <span className="muted">Fills the grid only; review and press Save.</span>
          </Space>
        )}
        <Modal open={raise !== null} title="Raise every target by a percentage" okText="Fill the grid" onCancel={() => setRaise(null)}
          onOk={() => { if (raise) put(raiseBy(rows, changes, raise)); setRaise(null); }}>
          <p className="muted">Every target above 0 is raised (or lowered, with a minus) and rounded to a whole number. Nothing is saved until Save.</p>
          <InputNumber value={raise} min={-50} max={200} addonAfter="%" onChange={(v) => setRaise(v == null ? null : Number(v))} />
        </Modal>
      </>
    );
  }

  const rows = p.rows as unknown as ItemRow[];
  const withTarget = rows.filter((r) => qtyOf(r, changes) > 0);
  const value = rows.reduce((a, r) => a + qtyOf(r, changes) * Number(r.price ?? 0), 0);
  const amount = p.amount_target ?? 0;
  const split = groupSplit(rows, changes);
  const splitTotal = split.reduce((a, s) => a + s.value, 0);
  const hasLast = rows.some((r) => Number(r.last_qty ?? 0) > 0);
  return (
    <>
      <div className="game-strip">
        <div><div className="l">Products with a target</div><div className="v">{withTarget.length}<small>of {rows.length}</small></div></div>
        <div><div className="l">Itemized value</div><div className="v">{whole(value)}</div></div>
        <div><div className="l">Amount target (Target Entry)</div><div className="v">{amount ? whole(amount) : '–'}</div></div>
        <div><div className="l">Difference</div><div className={`v ${amount && value >= amount ? 'tg-up' : amount ? 'tg-dn' : ''}`}>{amount ? `${value >= amount ? '+' : '−'}${whole(Math.abs(value - amount))}` : '–'}
          <small>{amount ? (value >= amount ? 'covered' : 'short') : 'no amount target'}</small></div></div>
        <div><div className="l">Biggest group</div><div className="v">{split[0]?.group ?? '–'}<small>{split[0] && splitTotal ? `${Math.round(split[0].value / splitTotal * 100)}%` : ''}</small></div></div>
      </div>
      {split.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', background: 'var(--grid)' }} aria-hidden>
            {split.map((s, i) => <span key={s.group} style={{ width: `${s.value / splitTotal * 100}%`, background: COLORS[i % COLORS.length] }} />)}
          </div>
          <div className="tg-legend" style={{ marginTop: 6 }}>
            {split.map((s, i) => <span key={s.group}><i style={{ background: COLORS[i % COLORS.length] }} />{s.group} · {Math.round(s.value / splitTotal * 100)}%</span>)}
          </div>
        </div>
      )}
      {canEdit && (
        <Space wrap style={{ marginBottom: 10 }}>
          <Button icon={<CopyOutlined />} disabled={!hasLast} title={hasLast ? undefined : 'No itemized target was saved last month'}
            onClick={() => put(copyLastQty(rows, changes))}>Copy last month's quantities</Button>
          <span className="muted">Fills the grid only; review and press Save.</span>
        </Space>
      )}
    </>
  );
}
