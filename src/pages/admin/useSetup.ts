import { useCallback, useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SetupName, SetupPayload, SubmitResult } from '../../api/types';
import { describeError } from '../../api/messages';
import { asAppError, useSession } from '../../session';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

/** Loads one setup page and saves parts of it. A save sends a fresh request id, shows the answer and reloads the page. */
export function useSetup<T extends SetupPayload>(name: SetupName) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['setup', name], queryFn: () => api.fetchSetup<T>(name), staleTime: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (q.error) report(q.error); }, [q.error, report]);

  const save = useCallback(async (part: string, body: Record<string, unknown>, opts: { reload?: boolean } = {}): Promise<SubmitResult | null> => {
    setBusy(part);
    try {
      const res = await api.saveSetup(name, { ...body, part, request_id: newId() });
      if (res.ok) void message.success(res.message || 'Saved');
      else void message.error(res.message || 'Not saved.');
      if (res.ok && opts.reload !== false) await qc.invalidateQueries({ queryKey: ['setup', name] });
      return res;
    } catch (e) {
      const d = describeError(asAppError(e));
      void message.error(`${d.title}. ${d.text}`);
      report(e);
      return null;
    } finally { setBusy(null); }
  }, [api, name, message, qc, report]);

  return { q, save, busy };
}
