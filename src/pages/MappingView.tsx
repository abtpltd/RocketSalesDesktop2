import MoreMenu from '../ui/MoreMenu';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Result, Segmented, Select, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { describeError, syncedAgo } from '../api/messages';
import { asAppError, useSession } from '../session';
import StillLoading from '../dashboard/StillLoading';

/** Which HQs, areas and codes a sales rep is mapped to (read only; changing a mapping is done in the classic window). */
export default function MappingView({ title, openClassic, classicPath }: {
  title: string; classicPath: string; openClassic: (path: string) => void;
}) {
  const { api, report, setOffline } = useSession();
  const [rep, setRep] = useState('');
  const [kind, setKind] = useState<'customer' | 'doctor'>('customer');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000); return () => clearInterval(t); }, []);

  const q = useQuery({ queryKey: ['mapping', rep, kind], queryFn: () => api.fetchMapping(rep, kind) });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  if (q.isPending) return <StillLoading />;
  if (q.isError && !q.data) {
    const d = describeError(asAppError(q.error));
    return (
      <Result status="warning" title={d.title} subTitle={d.text}
        extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
          <Button key="c" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />
    );
  }
  const { data: payload, source, saved_at } = q.data!;
  const sections: [string, string[]][] = [['HQ', payload.mapping.hq], ['Areas', payload.mapping.area], ['Codes', payload.mapping.code]];

  return (
    <>
      <div className="page-title">
        <h2>{title}</h2>
        <span className="muted">{source === 'offline' ? `Saved copy from ${syncedAgo(saved_at, now)}` : `Synced ${syncedAgo(saved_at, now)}`}</span>
        <Button size="small" icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <MoreMenu items={[{ key: 'classic', label: 'Change mapping in classic window', onClick: () => openClassic(classicPath) }]} />
      </div>
      {source === 'offline' && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }} title="You are working offline"
          description="This is the last copy saved on this computer. Reps you have not opened before are not available." />
      )}
      <div className="filters">
        <Select showSearch allowClear placeholder="Choose a sales rep" style={{ minWidth: 280 }} value={rep || undefined}
          onChange={(v) => setRep(v ?? '')} optionFilterProp="label"
          options={payload.reps.map((r) => ({ value: r.name, label: r.manager ? `${r.name} (${r.manager})` : r.name }))} />
        <Segmented value={kind} onChange={(v) => setKind(v as 'customer' | 'doctor')}
          options={[{ label: 'Customers', value: 'customer' }, { label: 'Doctors', value: 'doctor' }]} />
      </div>
      {!rep ? <Empty description="Choose a sales rep to see what is mapped to them" /> : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {sections.map(([label, items]) => (
            <Card key={label} size="small" title={`${label} (${items.length})`}>
              {items.length ? items.map((i) => <Tag key={i} style={{ marginBottom: 6 }}>{i}</Tag>) : <span className="muted">None</span>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
