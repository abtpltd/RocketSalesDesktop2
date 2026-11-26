import { Button, InputNumber, Popover, Switch, Input } from 'antd';
import { BgColorsOutlined } from '@ant-design/icons';
import type { ToneConfig } from './rowTone';

const HELP: Record<string, string> = {
  attendance: 'Red: absent, or visits below the first %. Amber: half day, or below the second %. Start times later than the cut-off show in red.',
  target_vs_sales: 'Red: sales below the first % of target. Amber: below the second %.',
  target_itemized: 'Red: sales value below the first % of target. Amber: below the second %.',
  customer_ageing: 'Amounts in "Over 60" show in red and "31-60 Days" in amber.',
  last_activity: 'Amber: last visit over 30 days ago. Red: over 60 days, or never.',
  expiry: 'Amber: expires within 3 months. Red: already expired.',
  visits: 'Short-time visits show in amber.',
};
const SHARE = new Set(['attendance', 'target_vs_sales', 'target_itemized']);

/** One button above a report: switch row colours on or off and set the limits (kept per user on this computer). */
export default function RowColours({ report, value, onChange, fallback }: { report: string; value: ToneConfig; onChange: (t: ToneConfig) => void; /** the company's own limits, restored by Reset */ fallback?: ToneConfig }) {
  const body = (
    <div style={{ width: 290, display: 'grid', gap: 10 }}>
      <label style={{ display: 'flex', justifyContent: 'space-between' }}>Highlight rows <Switch size="small" checked={value.on} onChange={(on) => onChange({ ...value, on })} /></label>
      {SHARE.has(report) && (
        <>
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>Red below <InputNumber size="small" min={1} max={199} value={value.lo} suffix="%" onChange={(v) => v != null && onChange({ ...value, lo: Math.min(v, value.hi) })} /></label>
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>Amber below <InputNumber size="small" min={1} max={200} value={value.hi} suffix="%" onChange={(v) => v != null && onChange({ ...value, hi: Math.max(v, value.lo) })} /></label>
        </>
      )}
      {report === 'attendance' && (
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>Late start after <Input size="small" style={{ width: 90 }} value={value.late} placeholder="09:30" onChange={(e) => onChange({ ...value, late: e.target.value })} /></label>
      )}
      <span className="muted">{HELP[report]}</span>
      <Button size="small" onClick={() => onChange(fallback ?? { on: true, lo: 50, hi: 80, late: '09:30' })}>Reset to company limits</Button>
    </div>
  );
  return (
    <Popover trigger="click" placement="bottomRight" title="Row colours" content={body}>
      <Button size="small" icon={<BgColorsOutlined />} type={value.on ? 'default' : 'dashed'}>Colours{value.on ? '' : ': Off'}</Button>
    </Popover>
  );
}
