import type { RocketFormRow } from '../api/types';

export type EditRow = RocketFormRow & { id: string };
/** One row as the web page posts it in designDta. */
export interface PostedRow { st: string; t: string; d: string; k: string; is: boolean }

/** New rows and changed rows only: the web handler saves just the rows it is sent, so untouched rows are left alone. */
export function changedRows(saved: RocketFormRow[], rows: EditRow[]): PostedRow[] {
  const byKey = new Map(saved.map((r) => [r.k, r]));
  return rows.filter((r) => {
    if (!r.k) return true;
    const s = byKey.get(r.k);
    return !s || s.shortname !== r.shortname || s.title !== r.title || s.design !== r.design || s.sendByMail !== r.sendByMail;
  }).map((r) => ({ st: r.shortname, t: r.title, d: r.design, k: r.k, is: r.sendByMail }));
}
