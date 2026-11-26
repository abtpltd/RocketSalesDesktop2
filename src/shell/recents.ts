import type { MenuSection } from '../api/types';

export interface PageRef { id: string; title: string; path: string; section: string }

export const MAX_RECENTS = 6;

export function flatten(sections: MenuSection[]): PageRef[] {
  return sections.flatMap((s) => s.items.map((i) => ({ id: i.id, title: i.title, path: i.path, section: s.title })));
}

export function pushRecent(list: string[], id: string, max = MAX_RECENTS): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/** Words typed in the finder must all appear (case-insensitive) in the title or the section. */
export function searchPages(pages: PageRef[], query: string, limit = 12): PageRef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return pages.slice(0, limit);
  return pages
    .filter((p) => { const hay = `${p.title} ${p.section}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
    .sort((a, b) => Number(b.title.toLowerCase().startsWith(words[0])) - Number(a.title.toLowerCase().startsWith(words[0])))
    .slice(0, limit);
}

/** Recents are stored per person so one person's pages do not show for another on a shared computer. */
export const recentsKey = (company: string, email: string) => `recents:${company}:${email}`;

export function loadRecents(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

export function saveRecents(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage may be blocked; recents are optional */ }
}
