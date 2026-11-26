import { useState } from 'react';
import { Segmented } from 'antd';
import { GiftOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { AccessProvider, useAccess } from '../access';
import { readJson, writeJson } from '../ui/prefsMath';
import { GIFT_ALLOC, SAMPLE_ALLOC, type AllocKind } from '../shell/menuArrange';
import ReportTable from './ReportTable';

const KEY = 'rs:alloc-kind';

/**
 * Gifts/Sample Allocation: the gift and the sample allocation pages on one screen, switched at the top. Each half is
 * the same screen as before and follows its own web page's rights (new allocation, classic window).
 */
export default function AllocationPage({ kinds, openClassic }: { kinds: AllocKind[]; openClassic: (p: string) => void }) {
  const access = useAccess();
  const [kind, setKind] = useState<AllocKind>(() => {
    const saved = readJson<string>(KEY, '', (v) => v === 'gift' || v === 'sample') as AllocKind;
    return kinds.includes(saved) ? saved : kinds[0];
  });
  const [seen, setSeen] = useState<AllocKind[]>([kind]);
  const pick = (k: AllocKind) => { setKind(k); writeJson(KEY, k); setSeen((s) => (s.includes(k) ? s : [...s, k])); };
  return (
    <>
      {kinds.length > 1 && (
        <div className="filters" style={{ marginBottom: 4 }}>
          <Segmented value={kind} onChange={(v) => pick(v as AllocKind)} options={[
            { value: 'gift', label: 'Gifts', icon: <GiftOutlined /> },
            { value: 'sample', label: 'Samples', icon: <MedicineBoxOutlined /> },
          ]} />
        </div>
      )}
      {kinds.filter((k) => seen.includes(k)).map((k) => {
        const path = k === 'gift' ? GIFT_ALLOC : SAMPLE_ALLOC;
        return (
          <div key={k} hidden={k !== kind}>
            <AccessProvider access={access} path={path}>
              <ReportTable name={k === 'gift' ? 'gift_allocations' : 'sample_allocations'} noun="documents" classicPath={path} openClassic={openClassic} />
            </AccessProvider>
          </div>
        );
      })}
    </>
  );
}
