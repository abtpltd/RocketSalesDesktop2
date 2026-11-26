import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AssistantSettings } from '../api/types';
import { useSession } from '../session';
import { readJson, writeJson } from '../ui/prefsMath';
import type { Copy, Loader } from './types';
import type { ToneConfig } from '../ui/rowTone';

export const ASSISTANT_DEFAULTS: AssistantSettings = {
  enabled: true, roles: [], pinned: [], lo: 50, hi: 80, late: '09:30', stale_days: 30, bad_days: 60, expiry_months: 3,
  morning_summary: true, voice: false, ai_mode: 'off',
};
const ok = (v: unknown) => !!v && typeof v === 'object' && typeof (v as AssistantSettings).lo === 'number' && Array.isArray((v as AssistantSettings).pinned);

/** The company's settings: from the server, kept on this computer so they still apply offline; built-in defaults if the
 * server does not have them yet. */
export function useAssistantSettings() {
  const { api, state } = useSession();
  const company = state.status === 'in' ? state.info.company.domain : '';
  const role = state.status === 'in' ? state.info.user.role : '';
  const key = `rs:assistant:${company}`;
  const q = useQuery({
    queryKey: ['assistant-settings', company],
    enabled: !!company,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<AssistantSettings> => {
      try {
        const got = { ...ASSISTANT_DEFAULTS, ...(await api.fetchAssistant()) };
        writeJson(key, got);
        return got;
      } catch {
        return { ...ASSISTANT_DEFAULTS, ...(readJson<AssistantSettings | null>(key, null, ok) ?? {}) };
      }
    },
  });
  const settings = q.data ?? ASSISTANT_DEFAULTS;
  const allowed = !!company && settings.enabled && (settings.roles.length === 0 || settings.roles.includes(role));
  return { settings, allowed, loading: q.isPending, refetch: q.refetch, role };
}

/** The saved reports, read from this computer only (never from the server). */
export function useLoader(): Loader {
  const { api } = useSession();
  return useCallback(async (report: string): Promise<Copy[]> => {
    try {
      const saved = await api.savedReports(report as never);
      return saved.map((f) => ({ report, rows: f.data.rows ?? [], total: f.data.total ?? (f.data.rows ?? []).length, from: String(f.data.from ?? ''), to: String(f.data.to ?? ''), savedAt: f.saved_at }));
    } catch { return []; }
  }, [api]);
}

/** The company's red / amber limits as the starting colours of every report (a person's own choice still wins). */
export function companyTone(s: AssistantSettings): ToneConfig {
  return { on: true, lo: s.lo, hi: s.hi, late: s.late, stale: s.stale_days, bad: s.bad_days, expiry: s.expiry_months };
}
export const useCompanyTone = (): ToneConfig => { const { settings } = useAssistantSettings(); return useMemo(() => companyTone(settings), [settings]); };

/** How many things need attention, from the saved reports (for the badge on the RocketPilot button). Never throws. */
export function useAttentionCount(refreshKey: unknown): number {
  const { settings, allowed } = useAssistantSettings();
  const load = useLoader();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!allowed) { setN(0); return; }
    let live = true;
    const go = () => { void import('./skills').then((m) => m.facts({ q: '', toks: [], mods: {}, s: settings, today: new Date(), load })).then((f) => { if (live) setN(f.length); }).catch(() => { if (live) setN(0); }); };
    go();
    const t = setInterval(go, 10 * 60_000);
    return () => { live = false; clearInterval(t); };
  }, [allowed, settings, load, refreshKey]);
  return n;
}
