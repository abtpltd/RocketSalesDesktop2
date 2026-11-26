// kas Pipeline Dashboard helpers (html/UI5.3/Prospect/PipelineDashbord.html).
import type { PipelineBoard, PipelineBoardCard, PipelineCard, ProspectKind } from '../api/types';

/** Dark or light text on a stage header colour, so every one of the page's 20 colours stays readable. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 'inherit';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#1a1a1a' : '#ffffff';
}

/** The details the web loads for each prospect (shown on the card's tooltip), skipping empty ones. */
export function cardDetails(c: PipelineCard): [string, string][] {
  const rows: [string, string][] = [['Sales rep', c.rep], ['Contact', c.contactPerson], ['Phone', c.phone], ['Email', c.email],
    ['Category', c.category], ['Reminder', c.reminderDateStr], ['Website', c.website], ['LinkedIn', c.linkedIn]];
  return rows.filter(([, v]) => v && v.trim());
}

// ---- the editable board (server src/desktop_api/pipeline_edit.py) ----

export interface BoardFilter { rep: string; kind: ProspectKind | 'any' | 'none'; category: string }

/** Rep, type and category filters, applied on the cards the server sent. */
export function filterCards(cards: PipelineBoardCard[], f: BoardFilter): PipelineBoardCard[] {
  return cards.filter((c) => (!f.rep || c.rep === f.rep)
    && (f.kind === 'any' || (f.kind === 'none' ? !c.kind : c.kind === f.kind))
    && (!f.category || c.category.split(',').map((x) => x.trim()).includes(f.category)));
}

/** Choices for the filters, from the cards on the board. */
export function filterChoices(board: PipelineBoard): { reps: string[]; categories: string[] } {
  const reps = new Set<string>(); const cats = new Set<string>();
  for (const s of board.stages) for (const c of s.cards) {
    if (c.rep) reps.add(c.rep);
    for (const x of c.category.split(',')) if (x.trim()) cats.add(x.trim());
  }
  return { reps: [...reps].sort(), categories: [...cats].sort() };
}

/** The board with one card moved (shown at once while the server saves it). */
export function moveCard(board: PipelineBoard, key: string, to: string): PipelineBoard {
  let card: PipelineBoardCard | undefined;
  const stages = board.stages.map((s) => {
    const hit = s.cards.find((c) => c.key === key);
    if (hit) card = hit;
    return { ...s, cards: s.cards.filter((c) => c.key !== key) };
  });
  if (!card) return board;
  return { ...board, stages: stages.map((s) => (s.stage === to ? { ...s, cards: [{ ...card!, stage: to }, ...s.cards] } : s)) };
}

/** Same rules as the server for a new stage name, so the person hears it before saving. */
export function stageProblem(name: string, list: string[], saved: string[]): string | null {
  const n = name.split(/\s+/).filter(Boolean).join(' ');
  if (!n) return 'Type a name.';
  if (!saved.includes(n) && !/^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(n)) return 'Up to 40 letters, digits, spaces, "-" or "_".';
  const id = (s: string) => s.replace(/ /g, '_').toLowerCase();
  if (list.some((s) => id(s) === id(n))) return `"${n}" is already a stage.`;
  if (list.length >= 30) return 'At most 30 stages.';
  return null;
}

/** Moves one item of a list up (-1) or down (+1). */
export function shift<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** What the new customer / doctor form starts with, copied from the prospect. */
export function convertPresets(kind: 'customer' | 'doctor', c: PipelineBoardCard): Record<string, string> {
  return kind === 'customer'
    ? { name: c.name, person: c.contactPerson, phone: c.phone, email: c.email }
    : { name: c.name, contact_person: c.contactPerson, mobile: c.phone, email: c.email };
}
