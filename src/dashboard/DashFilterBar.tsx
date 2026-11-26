import { DatePicker, Input, Segmented, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { monthOf } from './drillMap';
import type { DashFilter } from './views';

/** One filter for the whole dashboard: the days shown in the day-by-day charts, and a name for the top lists. */
export default function DashFilterBar({ filter, onChange, month, today }: { filter: DashFilter; onChange: (f: DashFilter) => void; month?: string; today?: string }) {
  const [y, m] = monthOf(month, today);
  const first = dayjs(new Date(y, m - 1, 1));
  const last = first.endOf('month');
  const custom = filter.days === 'custom' && filter.from && filter.to
    ? [first.date(filter.from), first.date(Math.min(filter.to, last.date()))] as [dayjs.Dayjs, dayjs.Dayjs] : null;
  const active = filter.days !== 'month' || filter.find.trim() !== '';
  return (
    <div className={`dash-filter${active ? ' on' : ''}`} role="search" aria-label="Dashboard filter">
      <Segmented size="small" value={filter.days} aria-label="Days shown"
        onChange={(v) => onChange({ ...filter, days: v as DashFilter['days'], ...(v === 'custom' && !filter.from ? { from: 1, to: last.date() } : {}) })}
        options={[{ value: 'month', label: 'Whole month' }, { value: 'last7', label: 'Last 7 days' }, { value: 'custom', label: 'Choose days' }]} />
      {filter.days === 'custom' && (
        <DatePicker.RangePicker size="small" allowClear={false} value={custom}
          disabledDate={(d) => d.isBefore(first, 'day') || d.isAfter(last, 'day')} defaultPickerValue={[first, first]}
          onChange={(v) => { if (v?.[0] && v[1]) onChange({ ...filter, from: v[0].date(), to: v[1].date() }); }} />
      )}
      <Input.Search size="small" allowClear placeholder="Find a name in the top lists" style={{ width: 240 }} value={filter.find}
        onChange={(e) => onChange({ ...filter, find: e.target.value })} aria-label="Find a name in the top lists" />
      <Tooltip title="Days apply to the day-by-day charts. The top lists are for the whole month, so the name narrows them instead. A click on a chart opens the records with the same filter.">
        <InfoCircleOutlined className="muted" />
      </Tooltip>
      {active && <a className="dash-filter-clear" onClick={() => onChange({ days: 'month', find: '' })}>Clear</a>}
    </div>
  );
}
