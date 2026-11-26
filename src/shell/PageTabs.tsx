import { createContext, useContext, type ReactNode } from 'react';
import { Dropdown, Tabs } from 'antd';
import { PushpinFilled, PushpinOutlined } from '@ant-design/icons';

/** At most this many pages stay open; the oldest one (never the dashboard) closes first. */
export const MAX_TABS = 10;

/** The tab list after opening `id`: kept where it is if already open, otherwise added at the end.
 *  Pinned tabs are never closed to make room (they do not count toward the limit). */
export function openTab(tabs: string[], id: string, pinned: string[] = []): string[] {
  if (tabs.includes(id)) return tabs;
  let next = [...tabs, id];
  while (next.filter((x) => !pinned.includes(x)).length > MAX_TABS) {
    const drop = next.find((x) => x !== 'dashboard' && x !== id && !pinned.includes(x));
    if (!drop) break;
    next = next.filter((x) => x !== drop);
  }
  return next;
}
/** The tab to show after closing `id`: its right neighbour, else its left one, else the dashboard. */
export function nextActive(tabs: string[], id: string): string {
  const i = tabs.indexOf(id);
  return tabs[i + 1] ?? tabs[i - 1] ?? 'dashboard';
}

/** Dashboard first, then pinned tabs (in pin order), then the rest as they were opened. */
export function arrangeTabs(tabs: string[], pinned: string[]): string[] {
  const pins = pinned.filter((x) => x !== 'dashboard' && tabs.includes(x));
  return ['dashboard', ...pins, ...tabs.filter((x) => x !== 'dashboard' && !pins.includes(x))];
}
/** Pin or unpin a tab; the pin list keeps its order (new pins at the end). */
export const togglePin = (pinned: string[], id: string) => (pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]);
export const MAX_PINS = 12;

const Active = createContext(true);
/** Whether the page is the one on screen (hidden tabs keep their state but ignore shortcuts). */
export function ActivePage({ active, children }: { active: boolean; children: ReactNode }) {
  return <Active.Provider value={active}>{children}</Active.Provider>;
}
export const useIsActivePage = () => useContext(Active);

export default function PageTabs({ tabs, active, titleOf, onPick, onClose, pinned, onPin, onCloseMany }: {
  tabs: string[]; active: string; titleOf: (id: string) => string; onPick: (id: string) => void; onClose: (id: string) => void;
  pinned: string[]; onPin: (id: string) => void; onCloseMany: (ids: string[]) => void;
}) {
  if (tabs.length < 2) return null;
  const unpinned = (except?: string) => tabs.filter((x) => x !== 'dashboard' && !pinned.includes(x) && x !== except);
  return (
    <div className="page-tabs">
      <Tabs type="editable-card" size="small" hideAdd activeKey={active} onChange={onPick}
        onEdit={(key, action) => { if (action === 'remove' && typeof key === 'string') onClose(key); }}
        items={tabs.map((id) => {
          const pin = pinned.includes(id);
          const label = (
            <Dropdown trigger={['contextMenu']} menu={{
              items: [
                ...(id !== 'dashboard' ? [{ key: 'pin', icon: pin ? <PushpinOutlined /> : <PushpinFilled />, label: pin ? 'Unpin tab' : 'Pin tab', disabled: !pin && pinned.length >= MAX_PINS }] : []),
                ...(id !== 'dashboard' && !pin ? [{ key: 'close', label: 'Close' }] : []),
                { key: 'others', label: 'Close other tabs', disabled: !unpinned(id).length },
                { key: 'all', label: 'Close all unpinned tabs', disabled: !unpinned().length },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'pin') onPin(id);
                else if (key === 'close') onClose(id);
                else if (key === 'others') onCloseMany(unpinned(id));
                else onCloseMany(unpinned());
              },
            }}>
              <span className={`tab-label${pin ? ' pinned' : ''}`} title={`${titleOf(id)}${id === 'dashboard' ? '' : ' (right-click to pin or close)'}`}>
                {pin && <PushpinFilled className="tab-pin" />}{titleOf(id)}
              </span>
            </Dropdown>
          );
          return { key: id, label, closable: id !== 'dashboard' && !pin };
        })} />
    </div>
  );
}
