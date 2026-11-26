import { useEffect, useState } from 'react';
import { Input, Segmented } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import type { PipelineBoardCard } from '../../api/types';
import { useSession } from '../../session';
import { convertPresets } from '../../dashboard/pipeline';
import RecordForm from '../../ui/RecordForm';

/**
 * Turn a prospect into a customer or a doctor: the Customers / Doctors page's own form, filled from the prospect.
 * The code is the next one the system gives (as on the web) or one typed here; a typed code is checked while typing
 * and again on the server, where it is reserved so it stays unique.
 */
export default function ConvertDrawer({ card, kind, onClose, onSaved }: {
  card: PipelineBoardCard; kind: 'customer' | 'doctor'; onClose: () => void; onSaved: () => void;
}) {
  const { api } = useSession();
  const [mode, setMode] = useState<'auto' | 'typed'>('auto');
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<{ busy: boolean; free?: boolean; message?: string }>({ busy: false });
  useEffect(() => {
    if (mode !== 'typed' || !code.trim()) { setCheck({ busy: false }); return; }
    setCheck({ busy: true });
    let alive = true;
    const t = setTimeout(() => {
      api.pipelineAct({ action: 'code_status', code })
        .then((r) => { if (alive) setCheck({ busy: false, free: !!r.free, message: r.message }); })
        .catch(() => { if (alive) setCheck({ busy: false }); });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [api, code, mode]);
  const word = kind === 'customer' ? 'customer' : 'doctor';
  return (
    <RecordForm name={kind === 'customer' ? 'customers' : 'doctors'} recordKey={null} open onClose={onClose} onSaved={onSaved} allowCreate
      presets={convertPresets(kind, card)} title={`Convert “${card.name}” to a ${word}`} saveLabel={`Create ${word}`}
      submit={async (values, requestId) => {
        if (mode === 'typed' && check.free === false) return { ok: false, message: check.message || 'Choose another code.' };
        return api.pipelineAct({ action: 'convert', key: card.key, kind, code_mode: mode, code: mode === 'typed' ? code : undefined, values, request_id: requestId });
      }}
      top={<div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          <span className="muted">Code</span>
          <Segmented style={{ alignSelf: 'flex-start' }} value={mode} onChange={(v) => setMode(v as 'auto' | 'typed')}
            options={[{ value: 'auto', label: 'Give the next code' }, { value: 'typed', label: 'Type a code' }]} />
        </div>
        {mode === 'typed' && (
          <div style={{ marginBottom: 8 }}>
            <Input value={code} maxLength={20} placeholder="e.g. CCP-001" aria-label="Typed code" status={check.free === false ? 'error' : undefined}
              onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ maxWidth: 240 }} />
            <div style={{ fontSize: 12, marginTop: 4 }} aria-live="polite">
              {check.busy ? <span className="muted"><LoadingOutlined /> Checking…</span>
                : check.free === true ? <span style={{ color: 'var(--ant-color-success, #2e8b57)' }}><CheckCircleFilled /> Free</span>
                : check.free === false ? <span style={{ color: 'var(--ant-color-error, #c0392b)' }}><CloseCircleFilled /> {check.message}</span>
                : <span className="muted">Letters, digits, "-", "_" or "/"; it must not be used by any customer or doctor.</span>}
            </div>
          </div>
        )}
        <p className="muted" style={{ margin: 0 }}>Name, contact, phone and email are copied from the prospect. The prospect is marked converted and
          keeps a link to the new code.</p>
      </div>} />
  );
}
