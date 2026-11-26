import { useEffect, useState } from 'react';
import { Avatar, Button, Input } from 'antd';
import { SaveOutlined, UserOutlined } from '@ant-design/icons';
import type { ProfilePayload } from '../../api/types';
import { Panel } from '../../ui/parts';
import SetupFrame from './SetupFrame';
import { useSetup } from './useSetup';

type Props = { classicPath: string; openClassic: (p: string) => void };

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

/** My Profile: the signed-in person's name, email, role and picture. */
export default function ProfilePage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<ProfilePayload>('my_profile');
  const [name, setName] = useState('');
  useEffect(() => { if (q.data) setName(q.data.user_name); }, [q.data]);
  return (
    <SetupFrame q={q} title="My Profile" classicPath={classicPath} openClassic={openClassic}>
      {(d) => (
        <div className="profile">
          <div className="profile-card">
            <Avatar size={96} src={d.picture || undefined} icon={!d.picture && !d.user_name ? <UserOutlined /> : undefined}>{initials(d.user_name)}</Avatar>
            <div>
              <h2>{d.user_name || 'No name yet'}</h2>
              <div className="muted">{d.email}</div>
              <span className="role-pill">{d.role}</span>
            </div>
          </div>
          <Panel title="Your name" sub="Shown in the app, on reports and on the web site.">
            <div className="admin-row">
              <Input style={{ maxWidth: 360 }} value={name} maxLength={100} onChange={(e) => setName(e.target.value)}
                onPressEnter={() => name.trim() && name !== d.user_name && void save('name', { name })} />
              <Button type="primary" icon={<SaveOutlined />} disabled={!name.trim() || name === d.user_name} loading={busy === 'name'}
                onClick={() => void save('name', { name })}>Save name</Button>
            </div>
          </Panel>
        </div>
      )}
    </SetupFrame>
  );
}
