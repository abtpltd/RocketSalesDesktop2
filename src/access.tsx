import { createContext, useContext, type ReactNode } from 'react';
import { Alert, Result } from 'antd';
import type { Cap, DesktopAccess } from './api/types';

/** The signed-in role's desktop access and the web path of the page on screen. The server checks every action
 *  again; this only hides buttons the role cannot use. */
interface Ctx { access?: DesktopAccess; path?: string }
const AccessContext = createContext<Ctx>({});

export function AccessProvider({ access, path, children }: { access?: DesktopAccess; path?: string; children: ReactNode }) {
  return <AccessContext.Provider value={{ access, path }}>{children}</AccessContext.Provider>;
}

const FOLLOWS: Record<string, string> = {
  '/RocketSalesSettings': '/master/MobileVanUser', '/MasterUploads': '/master/MobileVanUser', '/DataExport': '/Settings', '/Samples': '/master/Product',
  '/MapView': '/Report/VisitReport', '/Report/RepProductivity': '/Report/SalesmenSalesSummary',
};

/** Whether the role may do this on a page (the page on screen unless a path is given). Not limited: always true. */
export function canDo(access: DesktopAccess | undefined, path: string | undefined, cap: Cap): boolean {
  if (!access || !access.limited || !path) return true;
  const page = path.split('?')[0];
  // a desktop-only page (Rockey Settings, Map, Samples...) uses the rights of the page it goes with
  const caps = access.pages[page] ?? (FOLLOWS[page] ? access.pages[FOLLOWS[page]] : undefined);
  // a limited role: a page the server did not list for it is not given (the server refuses it too), so its buttons stay hidden.
  // An older server (no version) did not list every button page: it decides, as before, and only a listed page is narrowed here.
  if (caps === undefined) return (access.v ?? 0) < 2;
  return caps.includes(cap);
}

export function useCan(cap: Cap, path?: string): boolean {
  const c = useContext(AccessContext);
  return canDo(c.access, path ?? c.path, cap);
}

export function useAccess(): DesktopAccess | undefined {
  return useContext(AccessContext).access;
}

/** A page that is all one action (an upload, a send form): a role that may open it but not do it sees why instead of a form that would be refused. */
export function NeedCan({ cap, children }: { cap: Cap; children: ReactNode }) {
  const ok = useCan(cap);
  if (ok) return <>{children}</>;
  return <Result status="info" title="View only" subTitle={`Your role can open this page but cannot ${cap === 'create' ? 'make changes on it' : cap} in the desktop app. Ask your administrator to tick ${cap === 'create' ? 'Create' : cap} for it in User Roles.`} />;
}

/** A settings page whose every control saves: a role without Edit sees it read-only (every field and button off) instead of one that is refused on Save. */
export function ReadOnlyUnless({ cap, children }: { cap: Cap; children: ReactNode }) {
  const ok = useCan(cap);
  if (ok) return <>{children}</>;
  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} title="View only" description="Your role can look at this page but not change it in the desktop app. Ask your administrator to tick Edit for it in User Roles." />
      <fieldset disabled className="ro-fieldset">{children}</fieldset>
    </>
  );
}

/** The settings pages that save through the page's Edit right (the server checks the same). */
// not the promo pages: they decide New offer (Create) and editing an offer (Edit) themselves, so a role with Create but not Edit can still add offers
export const EDIT_SETTINGS_PAGES = ['setup:app_training', 'setup:app_user_settings', 'setup:company_settings', 'setup:tip_of_day', 'setup:rs_settings', 'setup:promo_sms', 'gamification'];
