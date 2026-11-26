import { useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Input, Result, Segmented, Skeleton, Space, Table, Tag, Upload } from 'antd';
import { CloudUploadOutlined, DownloadOutlined, InboxOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ToolResult } from '../api/types';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { PageHeader, Panel } from '../ui/parts';
import { buildXlsx, fileName, toBase64 } from '../ui/excel';
import { readTable } from './fileRows';
import { MAP_COLUMNS, SAMPLE_ROWS, countRows, formatCheck, mapFileRows, uploadRows, type MapRow } from './hospitalMapRows';

interface Link { hospital_code: string; hospital_name: string; doctor_code: string; doctor_name: string; attended: boolean; attended_on: string; by: string }
interface Setup { columns: string[]; max_rows: number; links: Link[]; total: number; shown: number }
type Filter = 'all' | 'fine' | 'linked' | 'bad';
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
const TAG: Record<string, { color: string; text: string }> = {
  new: { color: 'green', text: 'Will be linked' },
  exists: { color: 'gold', text: 'Already linked' }, error: { color: 'red', text: 'Incorrect' }, pending: { color: 'default', text: 'Checking' },
};

/** Hospital - Doctor mapping: what is mapped now, and an Excel / CSV upload that is read and checked here and on the server. */
export default function HospitalMapPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const { message, modal } = AntApp.useApp();
  const q = useQuery({ queryKey: ['tool', 'hospital_doctor_map'], queryFn: () => api.fetchTool<Setup>('hospital_doctor_map'), staleTime: 0 });
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<MapRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ToolResult | null>(null);
  const [requestId, setRequestId] = useState(newId);
  const [search, setSearch] = useState('');

  const counts = useMemo(() => countRows(rows), [rows]);
  const shown = useMemo(() => rows.filter((r) => filter === 'all'
    || (filter === 'fine' && r.status === 'new')
    || (filter === 'linked' && r.status === 'exists')
    || (filter === 'bad' && r.status === 'error')), [rows, filter]);
  const links = useMemo(() => {
    const s = search.trim().toLowerCase();
    const all = q.data?.links ?? [];
    return s ? all.filter((l) => `${l.hospital_code} ${l.hospital_name} ${l.doctor_code} ${l.doctor_name}`.toLowerCase().includes(s)) : all;
  }, [q.data, search]);

  if (q.isPending) return <Skeleton active />;
  if (q.isError) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={<Button type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>} />;
  }
  const setup = q.data;

  const sample = async () => {
    try {
      const cols = MAP_COLUMNS.map((c) => ({ key: c.replace(' ', '_'), title: c }));
      const path = await api.saveDownload(fileName('Hospital Doctor Mapping Sample'), toBase64(buildXlsx('Mapping', cols, SAMPLE_ROWS)));
      void message.success({ content: <span>Sample saved to Downloads. <a onClick={() => void api.showDownload(path)}>Show file</a></span>, duration: 6 });
    } catch (e) {
      const d = describeError(asAppError(e));
      void message.error(`${d.title}. ${d.text}`);
    }
  };

  const read = async (f: File) => {
    setProblem(null); setDone(null); setRows([]); setFilter('all'); setFile(f.name); setRequestId(newId());
    try {
      const out = mapFileRows(await readTable(f));
      if (out.error) { setProblem(out.error); return; }
      const first = formatCheck(out.rows);
      setRows(first);
      setBusy(true);
      // the server checks the codes against the real hospitals, doctors, app users and the links already saved
      // rows that already failed the first check stay as they are; the server checks the rest
      const toCheck = first.filter((r) => r.status === 'pending').map((r) => out.rows.find((o) => o.row === r.row)!);
      if (!toCheck.length) return;
      const res = await api.saveTool('hospital_doctor_map', { rows: toCheck, dry_run: true });
      const back = new Map((res.results ?? []).map((r) => [r.row, r]));
      setRows(first.map((r) => {
        const s = back.get(r.row);
        return r.status !== 'pending' ? r : s ? ({ ...r, ...s } as MapRow) : r.status === 'pending' ? { ...r, status: 'error', message: 'The server did not answer for this row. Choose the file again.' } : r;
      }));
    } catch (e) {
      const d = describeError(asAppError(e));
      setProblem(e instanceof Error && !('code' in e) ? e.message : `${d.title}. ${d.text}`);
      setRows((cur) => cur.map((r) => (r.status === 'pending' ? { ...r, status: 'error', message: 'Not checked: the server could not be reached.' } : r)));
    } finally { setBusy(false); }
  };

  const upload = () => {
    const send = uploadRows(rows);
    if (!send.length) return;
    modal.confirm({
      title: `Upload ${send.length} correct row${send.length === 1 ? '' : 's'}?`,
      content: counts.bad ? `${counts.bad} incorrect row(s) are left out. Fix them in the file and upload them again.` : 'Every row in the file is fine.',
      okText: 'Upload',
      onOk: async () => {
        setBusy(true); setProblem(null);
        try {
          const res = await api.saveTool('hospital_doctor_map', { rows: send, request_id: requestId });
          setDone(res);
          setRequestId(newId());
          if (res.results) {
            // rows that were saved are done; the ones the server refused stay in the table so they can be fixed
            const refused = new Map(res.results.filter((r) => r.status === 'error').map((r) => [r.row, r.message]));
            setRows((cur) => cur.filter((r) => r.status === 'error' || r.status === 'exists' || refused.has(r.row))
              .map((r) => (refused.has(r.row) ? { ...r, status: 'error', message: refused.get(r.row) ?? r.message } : r)));
          }
          if (res.ok) void message.success(res.message || 'Uploaded'); else void message.warning(res.message || 'Some rows were not saved');
          void q.refetch();
        } catch (e) {
          const d = describeError(asAppError(e));
          setProblem(`${d.title}. ${d.text} Some rows may be saved: check the list below, then upload the file again. A pair that is already linked is never added twice.`);
          setRequestId(newId());
          report(e);
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <>
      <PageHeader title="Hospital - Doctor Mapping" meta={<span>Columns: {setup.columns.join(', ')}</span>}
        actions={<Space><Button icon={<DownloadOutlined />} onClick={() => void sample()}>Download sample file</Button>
          <Button onClick={() => openClassic(classicPath)}>Open in classic window</Button></Space>} />
      <Panel title="Upload file">
        <p className="muted" style={{ marginTop: 0 }}>
          HOSPITAL CODE and DOCTOR CODE are required. REP (app user name or code) is optional; with no REP the link is a company link that
          every app user receives. New links start as Attended: No (the rep sets it on the phone). A pair that is already linked is never added twice. Up to {setup.max_rows} rows at a time.
        </p>
        <Upload.Dragger accept=".xlsx,.csv" showUploadList={false} beforeUpload={(f) => { void read(f); return false; }} disabled={busy}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p>{file || 'Drop an .xlsx or .csv file here, or click to choose one'}</p>
        </Upload.Dragger>
        {problem && <Alert type="error" showIcon style={{ marginTop: 12 }} title={problem} />}
      </Panel>

      {rows.length > 0 && (
        <Panel title="File check" sub={file} extra={<Segmented size="small" value={filter} onChange={(v) => setFilter(v as Filter)}
          options={[{ label: `All ${counts.all}`, value: 'all' }, { label: `Fine ${counts.fine}`, value: 'fine' },
            { label: `Already linked ${counts.linked}`, value: 'linked' }, { label: `Incorrect ${counts.bad}`, value: 'bad' }]} />} flush>
          <Table size="small" rowKey="row" dataSource={shown} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
            rowClassName={(r) => (r.status === 'error' ? 'row-bad' : '')}
            columns={[
              { title: 'Row', dataIndex: 'row', width: 70 },
              { title: 'Hospital code', dataIndex: 'hospital_code' }, { title: 'Hospital', dataIndex: 'hospital_name' },
              { title: 'Doctor code', dataIndex: 'doctor_code' }, { title: 'Doctor', dataIndex: 'doctor_name' },
              { title: 'REP', dataIndex: 'rep' },
              { title: 'Result', key: 'm', render: (_: unknown, r: MapRow) => <span><Tag color={TAG[r.status].color}>{TAG[r.status].text}</Tag>{r.status === 'error' || r.status === 'exists' ? r.message : ''}</span> },
            ]} />
        </Panel>
      )}

      {done && (
        <Panel title="Upload result" flush>
          <div style={{ padding: 12 }}>
            <Alert type={done.ok ? 'success' : 'warning'} showIcon title={done.message || (done.ok ? 'Uploaded' : 'Not uploaded')} />
          </div>
          {(done.results?.length ?? 0) > 0 && (
            <Table size="small" rowKey="row" dataSource={done.results} pagination={{ pageSize: 50, hideOnSinglePage: true }}
              columns={[{ title: 'Row', dataIndex: 'row', width: 70 }, { title: 'Hospital code', dataIndex: 'hospital_code' }, { title: 'Doctor code', dataIndex: 'doctor_code' },
                { title: 'Result', key: 'm', render: (_: unknown, r: { status: string; message: string }) => <span><Tag color={TAG[r.status]?.color}>{r.status === 'error' ? 'Not saved' : r.status === 'exists' ? 'Already linked' : 'Saved'}</Tag>{r.message}</span> }]} />
          )}
        </Panel>
      )}

      <Panel title="Already mapped" sub={`${setup.total} link${setup.total === 1 ? '' : 's'}${setup.total > setup.shown ? `, first ${setup.shown} shown` : ''}`}
        extra={<Space><Input.Search allowClear placeholder="Search hospital, doctor or code" style={{ width: 280 }} onChange={(e) => setSearch(e.target.value)} />
          <Button icon={<ReloadOutlined />} onClick={() => void q.refetch()} /></Space>} flush>
        <Table size="small" rowKey={(l) => `${l.hospital_code}|${l.doctor_code}`} dataSource={links} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          columns={[{ title: 'Hospital code', dataIndex: 'hospital_code' }, { title: 'Hospital', dataIndex: 'hospital_name' },
            { title: 'Doctor code', dataIndex: 'doctor_code' }, { title: 'Doctor', dataIndex: 'doctor_name' },
            { title: 'Attended', dataIndex: 'attended', render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Yes' : 'No'}</Tag> },
            { title: 'Attended on', dataIndex: 'attended_on' }, { title: 'Mapped by', dataIndex: 'by' }]} />
      </Panel>

      {rows.length > 0 && (
        <Button type="primary" size="large" icon={<CloudUploadOutlined />} loading={busy} disabled={counts.fine === 0 || counts.pending > 0} onClick={upload}
          style={{ position: 'fixed', right: 28, bottom: 24, zIndex: 20, boxShadow: '0 4px 14px rgba(0,0,0,.3)' }}>
          Upload {counts.fine} correct row{counts.fine === 1 ? '' : 's'}
        </Button>
      )}
    </>
  );
}
