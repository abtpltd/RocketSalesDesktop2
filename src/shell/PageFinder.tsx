import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { searchPages, type PageRef } from './recents';

export default function PageFinder({ open, pages, onClose, onPick }: {
  open: boolean; pages: PageRef[]; onClose: () => void; onPick: (p: PageRef) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<InputRef>(null);
  const results = useMemo(() => searchPages(pages, query), [pages, query]);

  useEffect(() => { if (open) { setQuery(''); setIndex(0); setTimeout(() => input.current?.focus(), 50); } }, [open]);
  useEffect(() => setIndex(0), [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[index]) onPick(results[index]);
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} title="Go to page" width={520} destroyOnHidden>
      <Input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
        placeholder="Type a page name..." allowClear />
      <div style={{ marginTop: 10, maxHeight: 340, overflowY: 'auto' }}>
        {results.map((p, i) => (
          <div key={p.id} className={`finder-row${i === index ? ' active' : ''}`} onClick={() => onPick(p)}
            onMouseEnter={() => setIndex(i)}>
            <span>{p.title}</span><span className="muted">{p.section}</span>
          </div>
        ))}
        {!results.length && <div className="muted" style={{ padding: 10 }}>No page matches "{query}".</div>}
      </div>
    </Modal>
  );
}
