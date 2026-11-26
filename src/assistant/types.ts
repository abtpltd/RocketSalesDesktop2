import type { DrillTarget } from '../drill';
import type { Tone } from '../ui/rowTone';

export type Row = Record<string, unknown>;
/** One report the computer has saved, for one date range. */
export interface Copy { report: string; rows: Row[]; total: number; from: string; to: string; savedAt: number }
export type Loader = (report: string) => Promise<Copy[]>;

export type Period = 'today' | 'yesterday' | 'week' | 'lastweek' | 'month' | 'lastmonth';
export interface Mods { days?: number; months?: number; top?: number; pct?: number; area?: string; rep?: string; period?: Period }
export interface Ctx { skill: string; mods: Mods }

export interface Table { columns: { key: string; title: string; right?: boolean; /** only in the half and full screen views */ wide?: boolean }[]; rows: Row[]; tones: (Tone | undefined)[]; more: number; /** every row, for Excel and "show all" */ all: Row[]; allTones: (Tone | undefined)[] }
export type Action =
  | { kind: 'open'; label: string; target: DrillTarget }
  | { kind: 'fetch'; label: string; report: string; from: string; to: string }
  | { kind: 'ask'; label: string; question: string };
export interface Answer {
  text: string;
  table?: Table;
  bars?: { label: string; value: number; shown: string; tone?: Tone }[];
  lines?: { text: string; tone?: Tone; question?: string }[];
  actions: Action[];
  /** where the figures came from, e.g. "Attendance, saved 22 Oct, 1–26 Oct" */
  source?: string;
  notes: string[];
  ctx?: Ctx;
  /** true when the question was not understood at all (kept for the administrator's list) */
  unknown?: boolean;
  /** the plain-text copy for pasting into a message */
  copy: string;
}
