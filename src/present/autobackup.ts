// Automatic local backup: when a presentation is closed, at most once a day, all the person's presentations are saved
// to a locked file in Documents\RocketSales\Presentations (the newest five are kept). The password is set once and kept
// in the computer's credential store, never in the file or in the app's own storage.
import { packDecks, textToBase64 } from './backup';
import { today } from './model';
import type { DeckStore } from './store';

export const KEEP = 5;
export const secretName = (company: string, email: string) => `presentation-backup|${company.toLowerCase()}|${email.toLowerCase()}`;
export const fileNameFor = (day: string) => `RocketSales-auto-${day}.rspres`;

export interface BackupApi {
  backupSecret(name: string): Promise<string | null>;
  saveBackup(name: string, dataBase64: string, keep: number): Promise<string>;
}
export interface LastRun { get(): string; set(day: string): void }

export type Outcome = { kind: 'saved'; path: string } | { kind: 'skipped' } | { kind: 'no_password' } | { kind: 'failed'; error: string };

export async function runAutoBackup(api: BackupApi, store: DeckStore, secret: string, last: LastRun, opts: { force?: boolean; day?: string } = {}): Promise<Outcome> {
  const day = opts.day ?? today();
  try {
    const password = await api.backupSecret(secret);
    if (!password) return { kind: 'no_password' };
    if (!opts.force && last.get() === day) return { kind: 'skipped' };
    const decks = await store.list();
    if (!decks.length) return { kind: 'skipped' };
    const path = await api.saveBackup(fileNameFor(day), textToBase64(await packDecks(decks, password)), KEEP);
    last.set(day);
    return { kind: 'saved', path };
  } catch (e) { return { kind: 'failed', error: e instanceof Error ? e.message : 'The backup could not be saved.' }; }
}

export const browserLast = (key: string): LastRun => ({
  get: () => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } },
  set: (d) => { try { localStorage.setItem(key, d); } catch { /* the next close tries again */ } },
});
