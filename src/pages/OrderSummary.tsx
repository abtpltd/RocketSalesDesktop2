import MoreMenu from '../ui/MoreMenu';
import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Result, Table } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { describeError, syncedAgo } from '../api/messages';
import type { SummaryRow, SummaryTable } from '../api/types';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';
import ExportButton from '../ui/ExportButton';
import { fileName } from '../ui/excel';
import { showDate } from '../ui/dates';

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const COLUMNS: [Exclude<keyof SummaryRow, 'name'>, string, boolean][] = [
  ['existing_orders', 'Existing orders', true], ['existing_customers', 'Existing customers', false],
  ['new_orders', 'New orders', true], ['new_customers', 'New customers', false],
  ['customers_total', 'Customer total', false], ['orders_total', 'Order total', true],
];

function SummaryGrid({ label, table, file }: { label: string; table: SummaryTable; file: string }) {
  const fmt = (v: unknown, isMoney: boolean) => (typeof v === 'number' ? (isMoney ? money(v) : String(v)) : '');
  const columns = [
    { title: label, dataIndex: 'name', key: 'name', fixed: 'left' as const,
      sorter: (a: SummaryRow, b: SummaryRow) => String(a.name).localeCompare(String(b.name)) },
    ...COLUMNS.map(([key, title, isMoney]) => ({
      title, dataIndex: key, key, align: 'right' as const, render: (v: unknown) => fmt(v, isMoney),
      sorter: (a: SummaryRow, b: SummaryRow) => Number(a[key] ?? 0) - Number(b[key] ?? 0),
    })),
  ];
  return (
    <div className="panel flush">
      <div className="panel-head" style={{ padding: '10px 14px 0', margin: 0, justifyContent: 'flex-end' }}>
        <ExportButton name={file} sheet={label} disabled={!table.rows.length}
          load={async () => ({ columns: [{ key: 'name', title: label }, ...COLUMNS.map(([key, title]) => ({ key, title }))],
            rows: [...(table.rows as unknown as Record<string, unknown>[]), { name: 'Totals', ...table.totals }] })} />
      </div>
      <Table size="small" rowKey="name" columns={columns} dataSource={table.rows} pagination={false}
      scroll={{ x: 'max-content' }}
      summary={() => (
        <Table.Summary fixed>
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}><strong>Totals</strong></Table.Summary.Cell>
            {COLUMNS.map(([key, , isMoney], i) => (
              <Table.Summary.Cell key={key} index={i + 1} align="right"><strong>{fmt(table.totals[key], isMoney)}</strong></Table.Summary.Cell>
            ))}
          </Table.Summary.Row>
        </Table.Summary>
      )} /></div>
  );
}

/** Order Summary: orders and customers by sales person and by HQ for a date range (read only). */
export default function OrderSummary({ openClassic, classicPath }: { classicPath: string; openClassic: (path: string) => void }) {
  const { api, report, setOffline } = useSession();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null); // null: today, decided by the server
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000); return () => clearInterval(t); }, []);
  const from = range ? range[0].format('YYYY-MM-DD') : '';
  const to = range ? range[1].format('YYYY-MM-DD') : '';
  const q = useQuery({ queryKey: ['report', 'order_summary', from, to], queryFn: () => api.fetchReport('order_summary', { from, to }) });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) {
    const d = describeError(asAppError(q.error));
    return (
      <Result status="warning" title={d.title} subTitle={d.text}
        extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
          <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />
    );
  }
  const { data: p, source, saved_at } = q.data!;
  return (
    <>
      <div className="page-title">
        <h2>{p.title}</h2>
        <span className="muted">{String(showDate(p.from_date))} to {String(showDate(p.to_date))}</span>
        <span className="muted">{source === 'offline' ? `Saved copy from ${syncedAgo(saved_at, now)}` : `Synced ${syncedAgo(saved_at, now)}`}</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Print or export in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      {source === 'offline' && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="You are working offline"
          description="This is the last copy saved on this computer. Dates you have not opened before are not available." />
      )}
      <div className="filters">
        <DatePicker.RangePicker allowClear value={range ?? [dayjs(p.from), dayjs(p.to)]}
          onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} />
      </div>
      <SummaryGrid label="Sales person" table={p.by_rep} file={fileName("Order Summary by sales person", p.from, p.to)} />
      <SummaryGrid label="HQ" table={p.by_hq} file={fileName("Order Summary by HQ", p.from, p.to)} />
    </>
  );
}
