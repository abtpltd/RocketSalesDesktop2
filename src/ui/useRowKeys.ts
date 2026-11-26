import { useEffect, useState } from 'react';
import { useIsActivePage } from '../shell/PageTabs';

/** Is the person typing, or is a drawer / dialog open? Then table keys are left alone. */
export function busy(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return true;
  return !!document.querySelector('.ant-drawer-open, .ant-modal-wrap:not([style*="display: none"]) .ant-modal, .ant-dropdown:not(.ant-dropdown-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden)');
}

/** The next row index for a key, or null when the key is not a move. */
export function moveRow(key: string, at: number, count: number): number | null {
  if (!count) return null;
  if (key === 'ArrowDown' || key === 'j') return at < 0 ? 0 : Math.min(count - 1, at + 1);
  if (key === 'ArrowUp' || key === 'k') return at < 0 ? 0 : Math.max(0, at - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Up / down (or j / k) pick a row, Enter opens it. Works only on the page on screen. */
export function useRowKeys(count: number, onOpen?: (index: number) => void) {
  const active = useIsActivePage();
  const [at, setAt] = useState(-1);
  useEffect(() => { setAt(-1); }, [count]);
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || busy(e.target)) return;
      const next = moveRow(e.key, at, count);
      if (next !== null) {
        e.preventDefault();
        setAt(next);
        requestAnimationFrame(() => document.querySelector('.tab-pane:not([hidden]) .row-kb')?.scrollIntoView({ block: 'nearest' }));
      } else if (e.key === 'Enter' && at >= 0 && onOpen) {
        e.preventDefault();
        onOpen(at);
      } else if (e.key === 'Escape' && at >= 0) {
        setAt(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, at, count, onOpen]);
  return { at, setAt, rowClass: (i: number) => (i === at ? 'row-kb' : '') };
}
