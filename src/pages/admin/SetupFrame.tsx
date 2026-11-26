import type { ReactNode } from 'react';
import { Alert, Button, Result } from 'antd';
import { ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UseQueryResult } from '@tanstack/react-query';
import { describeError } from '../../api/messages';
import { asAppError } from '../../session';
import StillLoading from '../../dashboard/StillLoading';
import { PageHeader } from '../../ui/parts';
import { useCan } from '../../access';

/** Title, loading and error states shared by the Settings & Admin pages. */
export default function SetupFrame<T>({ q, title, meta, classicPath, openClassic, actions, children }: {
  q: UseQueryResult<T>; title: string; meta?: ReactNode; classicPath: string; openClassic: (p: string) => void;
  actions?: ReactNode; children: (data: T) => ReactNode;
}) {
  const canEdit = useCan('edit');
  const canCreate = useCan('create');
  if (q.isPending) return <StillLoading />;
  if (q.isError || !q.data) {
    const d = describeError(asAppError(q.error));
    return <Result status="warning" title={d.title} subTitle={d.text}
      extra={[<Button key="r" icon={<ReloadOutlined />} onClick={() => void q.refetch()}>Try again</Button>,
        <Button key="c" type="primary" onClick={() => openClassic(classicPath)}>Open in classic window</Button>]} />;
  }
  return (
    <div className="admin-page">
      <PageHeader title={title} meta={meta} actions={<>
        {actions}
        <Button icon={<ReloadOutlined />} loading={q.isFetching} onClick={() => void q.refetch()}>Refresh</Button>
        <Button icon={<ExportOutlined />} onClick={() => openClassic(classicPath)}>Classic window</Button>
      </>} />
      {!canEdit && !canCreate && <Alert type="info" showIcon style={{ marginBottom: 14 }} title="View only for your role" description="Changes made here will not be saved." />}
      {children(q.data)}
    </div>
  );
}
