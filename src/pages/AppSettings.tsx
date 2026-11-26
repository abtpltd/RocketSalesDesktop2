import { useEffect, useState } from 'react';
import { Button, Descriptions, Popconfirm, Segmented } from 'antd';
import { readQuoteMode, writeQuoteMode, type QuoteMode } from '../ui/dailyQuote';
import ThemePicker from '../ui/ThemePicker';
import CompanyLogo from './CompanyLogo';
import { PageHeader, Panel } from '../ui/parts';
import AssistantAdmin from '../assistant/AssistantAdmin';
import JointAdmin from './JointAdmin';
import { useSession } from '../session';
import type { AppInfo, SessionInfo } from '../api/types';

export default function AppSettings({ info }: { info: SessionInfo }) {
  const { api, signOut } = useSession();
  const [app, setApp] = useState<AppInfo>();
  const [quoteMode, setQuoteMode] = useState<QuoteMode>(readQuoteMode);
  useEffect(() => { void api.appInfo().then(setApp).catch(() => undefined); }, [api]);
  return (
    <>
      <PageHeader title="App settings" meta="Account, offline use and appearance" />
      <Panel title="Appearance" sub="Pick a colour theme and light or dark mode. Saved on this computer."><ThemePicker /></Panel>
      <Panel title="Quote of the day" sub="The quote on the sign-in screen and the dashboard. A thought set by your company on the web always comes first. Saved on this computer.">
        <Segmented value={quoteMode} onChange={(v) => { const m = v as QuoteMode; setQuoteMode(m); writeQuoteMode(m); }}
          options={[{ label: 'New quote at every sign-in', value: 'signin' }, { label: 'One quote a day', value: 'daily' }]} />
      </Panel>
      <Panel title="Company logo" sub="Shown on the sign-in screen of every computer that uses this company.">
        <CompanyLogo company={info.company.domain} admin={info.user.role === 'ADMIN'} />
      </Panel>
      <Panel title="RocketPilot AI" sub="Company settings for RocketPilot AI (Ctrl J). They apply to every computer that uses this company.">
        <AssistantAdmin admin={info.user.role === 'ADMIN'} />
      </Panel>
      <Panel title="Joint calls" sub="Two or more people on one customer visit. Company settings: they apply to every computer and phone that uses this company.">
        <JointAdmin admin={info.user.role === 'ADMIN'} />
      </Panel>
      <Descriptions bordered column={1} size="middle" style={{ maxWidth: 720, background: 'var(--card)', borderRadius: 14 }}>
        <Descriptions.Item label="Signed in as">{info.user.name} ({info.user.email})</Descriptions.Item>
        <Descriptions.Item label="Role">{info.user.role}</Descriptions.Item>
        <Descriptions.Item label="Company">{info.company.title} ({info.company.domain})</Descriptions.Item>
        <Descriptions.Item label="Server">{info.base_url}</Descriptions.Item>
        <Descriptions.Item label="Offline use">
          Saved figures stay usable for {info.offline_days} day{info.offline_days === 1 ? '' : 's'} without internet.
          This is set by your company's administrator.
        </Descriptions.Item>
        <Descriptions.Item label="This computer">{app?.device_name ?? '...'}</Descriptions.Item>
        <Descriptions.Item label="App version">{app?.version ?? '...'}</Descriptions.Item>
      </Descriptions>
      <Popconfirm title="Sign out?" description="Saved offline data on this computer will be removed."
        okText="Sign out" onConfirm={() => void signOut()}>
        <Button danger style={{ marginTop: 16 }}>Sign out</Button>
      </Popconfirm>
    </>
  );
}
