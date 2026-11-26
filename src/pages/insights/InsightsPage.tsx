import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Result, Table, Tag } from 'antd';
import { BulbOutlined, ReloadOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { InsightId, InsightPayload } from '../../api/types';
import { describeError } from '../../api/messages';
import { asAppError, useSession } from '../../session';
import StillLoading from '../../dashboard/StillLoading';
import KasChart from '../../dashboard/KasChart';
import ExportButton from '../../ui/ExportButton';
import { fileName } from '../../ui/excel';
import { AVAILABILITY_WORDS, INSIGHTS, filterRows, hasBody } from './insightList';

const GROUPS = ['Doctors', 'Customers', 'Products', 'Field team', 'Finance'] as const;

/**
 * Insights: advanced pharma reports worked out from what the company already records. The list is always shown; each
 * report says what it found, shows charts and a table, suggests what to do, and, when data is missing, says what to
 * record so it works. A report that cannot be built never takes the others down.
 */
export default function InsightsPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const [id, setId] = useState<InsightId>('doctor_coverage');
  const meta = INSIGHTS.find((i) => i.id === id) ?? INSIGHTS[0];
  return (
    <div className="ins">
      <div className="page-title">
        <h2>Insights</h2>
        <span className="muted">Worked out from your visits, orders, stock and doctors. Nothing here changes any record.</span>
      </div>
      <div className="ins-layout">
        <nav className="ins-nav" aria-label="Insight reports">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="grp">{g}</div>
              {INSIGHTS.filter((i) => i.group === g).map((i) => (
                <button key={i.id} className={i.id === id ? 'on' : ''} onClick={() => setId(i.id)}>{i.title}</button>
              ))}
            </div>
          ))}
        </nav>
        <section className="ins-body">
          <h3>{meta.title}</h3>
          <p className="muted q">{meta.question}</p>
          <Insight key={id} id={id} classicPath={classicPath} openClassic={openClassic} />
        </section>
      </div>
    </div>
  );
}

function Insight({ id, classicPath, openClassic }: { id: InsightId; classicPath: string; openClassic: (p: string) => void }) {
  const { api, report, setOffline } = useSession();
  const q = useQuery({
    queryKey: ['report', 'insights', id],
    queryFn: () => api.fetchReport('insights', { kind: id, size: 500 }),
    placeholderData: keepPreviousData,
  });
  useEffect(() => { if (q.data) setOffline(q.data.source === 'offline'); }, [q.data, setOffline]);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);
  const p = q.data?.data as InsightPayload | undefined;
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState('');
  const rows = useMemo(() => (p ? filterRows(p.rows, search, p.pick, picked) : []), [p, search, picked]);
  if (q.isPending) return <StillLoading />;
  if (q.isError && !p) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  if (!p) return null;
  const av = AVAILABILITY_WORDS[p.availability];
  return (
    <>
      <div className="ins-status">
        <Tag color={av.tone === 'ok' ? 'green' : av.tone === 'warn' ? 'orange' : 'red'}>{av.label}</Tag>
        <span className="muted">As of {p.as_of}</span>
      </div>
      {!!p.missing.length && (
        <Alert type={p.availability === 'needs_data' ? 'warning' : 'info'} showIcon style={{ marginBottom: 12 }}
          message={p.availability === 'needs_data' ? 'This report needs data that is not recorded yet' : 'Some of this report is limited by data that is not recorded yet'}
          description={<ul className="ins-missing">{p.missing.map((m) => <li key={m.what}><b>{m.what}.</b> {m.how}</li>)}</ul>} />
      )}
      {!hasBody(p) ? <Empty description="Nothing to show yet." /> : (
        <>
          {!!p.findings.length && (
            <div className="ins-findings">
              <div className="h"><BulbOutlined /> What stands out</div>
              <ul>{p.findings.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          {!!p.kpis.length && (
            <div className="ins-kpis">
              {p.kpis.map((k) => <div key={k.label}><div className="l">{k.label}</div><div className={`v ${k.tone ?? ''}`}>{k.value}</div>{k.note && <div className="n">{k.note}</div>}</div>)}
            </div>
          )}
          {!!p.charts.length && (
            <div className="ins-charts">
              {p.charts.map((c) => (
                <div key={c.title} className={`ins-chart ${c.wide ? 'wide' : ''}`}>
                  <div className="t">{c.title}</div>
                  <KasChart spec={c.spec} height={250} onPick={p.pick ? (name) => setPicked((cur) => (cur === name ? '' : name)) : undefined} />
                </div>
              ))}
            </div>
          )}
          {!!p.rows.length && (
            <div className="game-card flush" style={{ marginTop: 14 }}>
              <div className="filters" style={{ padding: '10px 14px' }}>
                <Input.Search allowClear style={{ maxWidth: 280 }} placeholder="Search this table" value={search} onChange={(e) => setSearch(e.target.value)} />
                {picked && <Tag closable onClose={() => setPicked('')}>{picked}</Tag>}
                <span className="spacer" />
                <span className="muted">{rows.length} of {p.rows.length}</span>
                <ExportButton name={fileName(p.title, p.as_of)} sheet={p.title.slice(0, 30)} disabled={!rows.length}
                  load={async () => ({ columns: p.columns, rows: rows as unknown as Record<string, unknown>[] })} />
              </div>
              <Table size="small" rowKey="key" dataSource={rows} pagination={{ pageSize: 25, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
                columns={p.columns.map((c) => ({ title: c.title, dataIndex: c.key, align: c.align,
                  sorter: (a: Record<string, string | number>, b: Record<string, string | number>) =>
                    (typeof a[c.key] === 'number' && typeof b[c.key] === 'number' ? (a[c.key] as number) - (b[c.key] as number) : String(a[c.key] ?? '').localeCompare(String(b[c.key] ?? ''), undefined, { numeric: true })) }))} />
            </div>
          )}
          {!!p.actions.length && (
            <div className="ins-actions">
              <div className="h">What to do next</div>
              <ul>{p.actions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
