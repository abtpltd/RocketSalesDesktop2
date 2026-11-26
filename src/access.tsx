import { createContext, useContext, type ReactNode } from 'react';
import type { Cap, DesktopAccess } from './api/types';

/** The signed-in role's desktop access and the web path of the page on screen. The server checks every action
 *  again; this only hides buttons the role cannot use. */
interface Ctx { access?: DesktopAccess; path?: string }
const AccessContext = createContext<Ctx>({});

export function AccessProvider({ access, path, children }: { access?: DesktopAccess; path?: string; children: ReactNode }) {
  return <AccessContext.Provider value={{ access, path }}>{children}</AccessContext.Provider>;
}

/** Whether the role may do this on a page (the page on screen unless a path is given). Not limited: always true. */
export function canDo(access: DesktopAccess | undefined, path: string | undefined, cap: Cap): boolean {
  if (!access || !access.limited || !path) return true;
  const caps = access.pages[path.split('?')[0]];
  return caps === undefined ? true : caps.includes(cap);
}

export function useCan(cap: Cap, path?: string): boolean {
  const c = useContext(AccessContext);
  return canDo(c.access, path ?? c.path, cap);
}

export function useAccess(): DesktopAccess | undefined {
  return useContext(AccessContext).access;
}
