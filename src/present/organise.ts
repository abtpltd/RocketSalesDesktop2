// Finding decks again: search, audience, folder, period, pinned first, recently opened.
import type { Deck } from './model';

export interface Filter { q: string; audience: string; folder: string; periodKind: string; showCopies: boolean }
export const noFilter = (): Filter => ({ q: '', audience: '', folder: '', periodKind: '', showCopies: false });

const hay = (d: Deck) => [d.name, d.audience, d.period, d.folder, ...d.tags].join(' ').toLowerCase();

export function filterDecks(decks: Deck[], f: Filter): Deck[] {
  const q = f.q.trim().toLowerCase();
  return decks.filter((d) => (!q || hay(d).includes(q)) && (!f.audience || d.audience === f.audience) && (!f.folder || d.folder === f.folder)
    && (!f.periodKind || d.periodKind === f.periodKind) && (f.showCopies || !d.frozenFrom));
}

/** Pinned decks first, then the most recently changed. */
export const sortDecks = (decks: Deck[]): Deck[] => decks.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedOn.localeCompare(a.updatedOn) || a.name.localeCompare(b.name));

export const recentDecks = (decks: Deck[], n = 5): Deck[] => decks.filter((d) => d.lastOpened).sort((a, b) => b.lastOpened.localeCompare(a.lastOpened)).slice(0, n);

export const folders = (decks: Deck[]): string[] => [...new Set(decks.map((d) => d.folder).filter(Boolean))].sort();
export const audiences = (decks: Deck[]): string[] => [...new Set(decks.map((d) => d.audience).filter(Boolean))].sort();
