import { useState } from 'react';
import { Segmented, Select } from 'antd';
import type { PipelineBoard, ProspectKind } from '../../api/types';
import { useSession } from '../../session';
import RecordForm from '../../ui/RecordForm';

/** New prospect: the Prospects page's own form, plus its stage and whether it is a customer or a doctor. */
export default function ProspectDrawer({ board, onClose, onSaved }: { board: PipelineBoard; onClose: () => void; onSaved: () => void }) {
  const { api } = useSession();
  const [kind, setKind] = useState<ProspectKind>('customer');
  const [stage, setStage] = useState(board.stage_names[0] ?? '');
  return (
    <RecordForm name="prospects_grid" recordKey={null} open onClose={onClose} onSaved={onSaved} allowCreate title="New prospect" saveLabel="Save prospect"
      submit={(values, requestId) => api.pipelineAct({ action: 'create', stage, kind, values, request_id: requestId })}
      top={<div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted">This prospect is a</span>
          <Segmented value={kind} onChange={(v) => setKind(v as ProspectKind)}
            options={[{ value: 'customer', label: 'Customer' }, { value: 'doctor', label: 'Doctor' }, { value: '', label: 'Not sure yet' }]} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
          <span className="muted">Stage</span>
          <Select value={stage || undefined} onChange={setStage} options={board.stage_names.map((s) => ({ value: s, label: s }))} placeholder="First stage" />
        </label>
      </div>} />
  );
}
