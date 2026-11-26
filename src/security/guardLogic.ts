/** Rules for the protective cover, the idle lock and clipboard clearing. Pure, so they can be tested. */
export const GRACE_SECONDS = 30;
export const SCAN_EVERY_MS = 10_000;
export const IDLE_MINUTES = 10;
export const IDLE_MINUTES_OFFLINE = 5;
export const CLIPBOARD_CLEAR_SECONDS = 60;
/** Working on the saved offline copy this long asks for the password again (and needs a connection to check it). */
export const OFFLINE_REPROMPT_HOURS = 12;

export const offlineTooLong = (now: number, offlineSince: number) =>
  offlineSince > 0 && now - offlineSince >= OFFLINE_REPROMPT_HOURS * 3_600_000;

export interface Finding { kind: 'remote' | 'capture'; name: string }

export const idleLimitMs = (offline: boolean) => (offline ? IDLE_MINUTES_OFFLINE : IDLE_MINUTES) * 60_000;

/** Lock after a quiet spell, but never while a presentation is playing full screen. */
export const shouldLock = (now: number, lastActive: number, offline: boolean, fullScreen: boolean) =>
  !fullScreen && now - lastActive >= idleLimitMs(offline);

export const graceLeft = (startedAt: number, now: number) =>
  Math.max(0, GRACE_SECONDS - Math.floor((now - startedAt) / 1000));

export const names = (f: Finding[]) => Array.from(new Set(f.map((x) => x.name)));

/** Keys that print or save the page, or take a screen picture, blocked for roles that may not copy. */
export function isBlockedKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }) {
  const k = e.key.toLowerCase();
  if (k === 'printscreen') return true;
  return (e.ctrlKey || e.metaKey) && (k === 'p' || k === 's' || k === 'c' || k === 'x' || k === 'a');
}
