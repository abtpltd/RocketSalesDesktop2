import { useState } from 'react';
import { App as AntApp, Button, Tooltip } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { buildXlsx, toBase64, type SheetColumn } from './excel';
import { useCan } from '../access';

/** Excel icon: loads every row (all pages, current filters and order), writes an .xlsx and saves it in Downloads. */
export default function ExportButton({ load, name, sheet, disabled }: {
  load: () => Promise<{ columns: SheetColumn[]; rows: Record<string, unknown>[]; cut?: boolean }>;
  name: string; sheet: string; disabled?: boolean;
}) {
  const { api } = useSession();
  const { message } = AntApp.useApp();
  const [busy, setBusy] = useState(false);
  const allowed = useCan('export');
  const run = async () => {
    setBusy(true);
    try {
      const { columns, rows, cut } = await load();
      const path = await api.saveDownload(name, toBase64(buildXlsx(sheet, columns, rows)));
      void message.success({
        content: (
          <span>
            Saved {rows.length.toLocaleString()} rows to Downloads{cut ? ' (the first 20,000 only)' : ''}.{' '}
            <a onClick={() => void api.showDownload(path)}>Show file</a>
          </span>
        ),
        duration: 6,
      });
    } catch (e) {
      const d = describeError(asAppError(e));
      void message.error(`${d.title}. ${d.text}`);
    } finally { setBusy(false); }
  };
  if (!allowed) return null;
  return (
    <Tooltip title="Export to Excel">
      <Button size="small" className="xls-btn" icon={<FileExcelOutlined />} loading={busy} disabled={disabled} onClick={() => void run()} aria-label="Export to Excel" />
    </Tooltip>
  );
}
