import { useMemo, useState } from 'react';
import { Alert, App as AntApp, Button, Input, Result, Segmented, Select, Skeleton } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { PageHeader, Panel } from '../ui/parts';

interface Who { key: string; label: string }
const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** Push notifications to the sales reps' app or to customers signed in to the customer app (web: Rockey Push Notification). */
export default function PushPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { api, report } = useSession();
  const { message, modal } = AntApp.useApp();
  const q = useQuery({ queryKey: ['tool', 'push_notification'], queryFn: () => api.fetchTool<{ reps: Who[]; customers: Who[] }>('push_notification'), staleTime: 0 });
  const [audience, setAudience] = useState<'reps' | 'customers'>('reps');
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = useMemo(() => (audience === 'reps' ? q.data?.reps : q.data?.customers) ?? [], [q.data, audience]);
  const count = target ? 1 : list.length;

  if (q.isPending) return <Skeleton active />;
  if (q.isError) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={<Button type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>} />;
  }

  const send = () => {
    if (!text.trim()) { setProblem('Write the message first.'); return; }
    if (!count) { setProblem('Nobody can receive notifications.'); return; }
    const who = target ? list.find((w) => w.key === target)?.label : audience === 'reps' ? 'all sales reps with the app' : 'all customers signed in to the customer app';
    modal.confirm({
      title: `Send this notification to ${count} ${count === 1 ? 'recipient' : 'recipients'}?`,
      content: <><p style={{ marginTop: 0 }}>To: {who}</p><p style={{ whiteSpace: 'pre-wrap' }}>{text.trim()}</p><p>A sent notification cannot be taken back.</p></>,
      okText: `Send to ${count}`,
      onOk: async () => {
        setBusy(true); setProblem(null);
        try {
          const res = await api.saveTool('push_notification', { audience, target, text, confirm_count: count, request_id: newId() });
          if (!res.ok) { setProblem(res.message || 'Not sent.'); return; }
          void message.success(`${res.message || 'Sent'} (${res.recipients ?? count})`);
          setText('');
        } catch (e) {
          const d = describeError(asAppError(e));
          setProblem(`${d.title}. ${d.text}`);
          report(e);
          void q.refetch();
        } finally { setBusy(false); }
      },
    });
  };

  return (
    <>
      <PageHeader title="Push notifications" meta={<span>{q.data.reps.length} reps and {q.data.customers.length} customers can receive notifications</span>}
        actions={<Button onClick={() => openClassic(classicPath)}>Open in classic window</Button>} />
      <Panel title="New notification">
        <div style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
          <Segmented value={audience} onChange={(v) => { setAudience(v as 'reps' | 'customers'); setTarget(''); }}
            options={[{ value: 'reps', label: 'Sales reps app' }, { value: 'customers', label: 'Customer app' }]} />
          <Select showSearch optionFilterProp="label" value={target} onChange={setTarget}
            options={[{ value: '', label: `All (${list.length})` }, ...list.map((w) => ({ value: w.key, label: w.label }))]} />
          <Input.TextArea rows={4} maxLength={1000} showCount placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
          {problem && <Alert type="error" showIcon title={problem} />}
          <div><Button type="primary" icon={<SendOutlined />} loading={busy} disabled={!text.trim() || !count} onClick={send}>
            Send to {count} {count === 1 ? 'recipient' : 'recipients'}</Button></div>
        </div>
      </Panel>
    </>
  );
}
