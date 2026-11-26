import MoreMenu from '../ui/MoreMenu';
import { useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Result, Skeleton, Table, Tag } from 'antd';
import { IdcardOutlined, ReloadOutlined } from '@ant-design/icons';
import Profile360 from './Profile360';
import { useQuery } from '@tanstack/react-query';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import ActionBar from '../ui/ActionBar';
import OrderEditor from '../ui/OrderEditor';
import { showDate } from '../ui/dates';

const MONEY = new Set(['rate', 'discount', 'tax_amount', 'total']);
const money = (v: unknown) => (typeof v === 'number' ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? ''));

/** One order, read only. Changing, approving or e-mailing an order is done in the classic window. */
export default function OrderDetails({ orderKey, onClose, openClassic, classicPath, kind }: {
  orderKey: string | null; onClose: () => void; classicPath: string; openClassic: (path: string) => void; kind?: 'quotation' | 'transfer';
}) {
  const { api, report, setOffline } = useSession();
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['order', orderKey], queryFn: () => api.fetchOrder(orderKey!, kind), enabled: !!orderKey });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const o = q.data?.data.order;
  const columns = (q.data?.data.line_columns ?? []).map((c) => ({
    title: c.title, dataIndex: c.key, key: c.key, ellipsis: true,
    align: MONEY.has(c.key) || ['qty', 'sub_qty', 'supplied'].includes(c.key) ? ('right' as const) : undefined,
    render: MONEY.has(c.key) ? (v: unknown) => money(v) : undefined,
  }));

  return (
    <Drawer open={!!orderKey} onClose={onClose} size={860} title={`${kind === 'quotation' ? 'Quotation' : kind === 'transfer' ? 'Transfer order' : 'Order'}${o ? ` ${String(o.order_number)}` : ''}`}
      extra={<MoreMenu items={[{ key: 'classic', label: 'Edit or approve in classic window', onClick: () => openClassic(classicPath) }]} />}>
      {q.isPending && orderKey && <Skeleton active paragraph={{ rows: 8 }} />}
      {q.isError && !q.data && (
        <Result status="warning" title={describeError(asAppError(q.error)).title} subTitle={describeError(asAppError(q.error)).text}
          extra={<Button icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>} />
      )}
      {q.data && o && (
        <>
          {q.data.source === 'offline' && (
            <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="Saved copy" description="Shown from the copy saved on this computer." />
          )}
          {orderKey && q.data.source !== 'offline' && (
            <div style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!o.cancelled && kind !== 'transfer' && <Button onClick={() => setEditing(true)}>Edit products</Button>}
              <ActionBar actions={q.data.data.actions ?? []} recordKey={orderKey} refresh={[['orders'], ['order', orderKey], ['report', 'quotations']]} />
            </div>
          )}
          {orderKey && editing && kind !== 'transfer' && <OrderEditor kind={kind ?? 'order'} orderKey={orderKey} open={editing} onClose={() => setEditing(false)} />}
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Customer">{String(o.customer)} <Tag>{String(o.code)}</Tag>
              {String(o.code ?? '').trim() && <Button type="link" size="small" icon={<IdcardOutlined />} onClick={() => setProfile(`code:${String(o.code).trim()}`)}>360°</Button>}
            </Descriptions.Item>
            <Descriptions.Item label="Status">{String(o.status)}{o.cancelled ? <Tag color="red" style={{ marginLeft: 8 }}>Cancelled</Tag> : null}</Descriptions.Item>
            <Descriptions.Item label="Received">{String(showDate(o.received))}</Descriptions.Item>
            <Descriptions.Item label="Order date">{String(showDate(o.order_date))}</Descriptions.Item>
            <Descriptions.Item label="Address">{String(o.customer_address || '-')}</Descriptions.Item>
            <Descriptions.Item label="HQ / route">{String(o.customer_hq || '-')} / {String(o.customer_route || '-')}</Descriptions.Item>
            <Descriptions.Item label="Creator">{String(o.creator || '-')}</Descriptions.Item>
            <Descriptions.Item label="Invoice">{String(o.invoice_number || '-')}</Descriptions.Item>
            <Descriptions.Item label="Ex VAT">{money(o.ex_vat)}</Descriptions.Item>
            <Descriptions.Item label={`Total (tax ${String(o.tax_flow).toLowerCase()})`}>{money(o.total)}</Descriptions.Item>
            {o.onhold ? <Descriptions.Item label="On-hold remarks" span={2}>{String(o.onhold)}</Descriptions.Item> : null}
          </Descriptions>
          <Table size="small" rowKey={(_, i) => String(i)} columns={columns} dataSource={q.data.data.lines} pagination={false}
            scroll={{ x: 'max-content' }} />
        </>
      )}
      {/* only orders have a customer to open; quotations and transfers keep their own panels */}
      <Profile360 kind="customer" recordKey={profile} onClose={() => setProfile(null)} />
    </Drawer>
  );
}
