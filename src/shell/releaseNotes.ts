import releases from '../assets/releases.json';

export interface Release { id: string; date: string; title: string; notes: string[] }
const ok = (r: unknown): r is Release => !!r && typeof r === 'object' && typeof (r as Release).id === 'string' && Array.isArray((r as Release).notes);
/** The release history that came with this app, newest first. A bad entry is dropped, never an error. */
export const RELEASES: Release[] = (Array.isArray(releases) ? releases : []).filter(ok);
/** "What is new" is shown only when the provider has switched it on for this person (server setting). Missing = off, e.g. an older server. */
export const canSeeWhatsNew = (user: { news_allowed?: boolean } | null | undefined): boolean => user?.news_allowed === true;
const SEEN = 'rs:whatsnew:seen';
export const newestId = (list: Release[] = RELEASES): string => list[0]?.id ?? '';
export function readSeen(): string { try { return localStorage.getItem(SEEN) ?? ''; } catch { return ''; } }
export function markSeen(id: string = newestId()): void { try { localStorage.setItem(SEEN, id); } catch { /* not saved: it shows again next time */ } }
export const isUnread = (seen: string, list: Release[] = RELEASES): boolean => !!newestId(list) && seen !== newestId(list);
/** The notes as the update server sends them: the newest release, one line each. */
export const notesText = (list: Release[] = RELEASES): string => (list[0]?.notes ?? []).map((n) => `- ${n}`).join('\n');
