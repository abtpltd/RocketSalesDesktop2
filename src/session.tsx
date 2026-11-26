import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Api, AppError, SessionInfo } from './api/types';
import { describeError, type Described } from './api/messages';
import { saveLastUser } from './pages/signInMemory';

type State =
  | { status: 'loading' }
  | { status: 'out'; notice?: Described }
  | { status: 'in'; info: SessionInfo };

interface Ctx {
  api: Api;
  state: State;
  /** true while the screen shows a saved copy because the server could not be reached */
  offline: boolean;
  setOffline: (v: boolean) => void;
  restore: () => Promise<void>;
  login: (company: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Pages call this with any failure; if the session is over it returns to the sign-in screen. */
  report: (e: unknown) => void;
}

const SessionContext = createContext<Ctx | null>(null);

export function useSession(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('SessionProvider is missing');
  return ctx;
}

export const asAppError = (e: unknown): AppError =>
  e && typeof e === 'object' && 'code' in e ? (e as AppError) : { code: 'unknown', message: String(e ?? '') };

export function SessionProvider({ api, children }: { api: Api; children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [offline, setOffline] = useState(false);

  const restore = useCallback(async () => {
    try {
      const info = await api.sessionRestore();
      setOffline(info?.offline ?? false);
      setState(info ? { status: 'in', info } : { status: 'out' });
    } catch (e) {
      setState({ status: 'out', notice: describeError(asAppError(e)) });
    }
  }, [api]);

  const login = useCallback(async (company: string, email: string, password: string) => {
    const info = await api.login(company, email, password); // errors go to the sign-in form
    saveLastUser(company, info.user.name, info.user.email); // for "Welcome back, <name>" next time
    setOffline(false);
    setState({ status: 'in', info });
  }, [api]);

  const signOut = useCallback(async () => {
    try { await api.signOut(); } finally { setOffline(false); setState({ status: 'out' }); }
  }, [api]);

  const report = useCallback((e: unknown) => {
    const d = describeError(asAppError(e));
    if (d.needsLogin) setState({ status: 'out', notice: d });
  }, []);

  const value = useMemo(
    () => ({ api, state, offline, setOffline, restore, login, signOut, report }),
    [api, state, offline, restore, login, signOut, report],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
