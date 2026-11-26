import { Button, Dropdown } from 'antd';
import { EllipsisOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface MoreItem { key: string; label: string; icon?: ReactNode; onClick: () => void; disabled?: boolean }

/** The page header's less-used actions (classic window and the like) behind one button. */
export default function MoreMenu({ items }: { items: MoreItem[] }) {
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <Dropdown trigger={['click']} placement="bottomRight"
      menu={{ items: shown.map((i) => ({ key: i.key, label: i.label, icon: i.icon, disabled: i.disabled })), onClick: ({ key }) => shown.find((i) => i.key === key)?.onClick() }}>
      <Button size="small" icon={<EllipsisOutlined />} aria-label="More actions">More</Button>
    </Dropdown>
  );
}
