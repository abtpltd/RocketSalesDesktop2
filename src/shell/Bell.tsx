import { Badge, Button, Empty, Popover } from 'antd';
import { BellOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '../session';
import type { NotificationItem } from '../api/types';

/** Things waiting for this person. Hidden while offline or when the server does not offer it yet (older server). */
export default function Bell({ onOpen }: { onOpen: (item: NotificationItem) => void }) {
  const { api, offline } = useSession();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['notifications'], queryFn: () => api.fetchNotifications(), enabled: !offline,
    refetchInterval: 120_000, refetchOnWindowFocus: true, retry: false, staleTime: 60_000,
  });
  if (offline || q.isError || !q.data) return null;
  const items = Array.isArray(q.data.items) ? q.data.items.filter((i) => i && i.count > 0) : [];
  const total = items.reduce((a, i) => a + i.count, 0);
  const content = (
    <div className="bell-list">
      {items.length ? items.map((i) => (
        <button type="button" key={i.id} className="bell-item" onClick={() => { setOpen(false); onOpen(i); }}>
          <span className="bell-count">{i.more ? '99+' : i.count}</span>
          <span className="bell-label">{i.label}</span>
          <RightOutlined className="muted" />
        </button>
      )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing waiting for you" />}
    </div>
  );
  return (
    <Popover trigger="click" placement="bottomRight" title="Waiting for you" content={content} open={open} onOpenChange={setOpen}>
      <Badge count={total} overflowCount={99} size="small" offset={[-4, 4]}>
        <Button shape="circle" icon={<BellOutlined />} aria-label={total ? `${total} things waiting for you` : 'Nothing waiting for you'} />
      </Badge>
    </Popover>
  );
}
