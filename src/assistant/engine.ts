// Turns a typed question into an answer: pick the skill by its words, read the wording for days / top N / period,
// remember what was asked so a short follow-up ("and last month", "only Kisumu", "top 3") adjusts the last answer.
import type { AssistantSettings } from '../api/types';
import { findValue, merge } from './data';
import { SKILLS, customerDetail, repDetail, type Env } from './skills';
import { hasAny, normalise, numberFrom, tokens } from './text';
import type { Answer, Ctx, Loader, Mods, Period } from './types';

const PERIODS: [RegExp, Period][] = [
  [/\blast week\b|\bprevious week\b/, 'lastweek'], [/\blast month\b|\bprevious month\b|\bprior month\b/, 'lastmonth'],
  [/\bthis week\b|\bweek to date\b|\bthis wk\b/, 'week'], [/\bthis month\b|\bmonth to date\b|\bmtd\b/, 'month'],
  [/\byesterday\b/, 'yesterday'], [/\btoday\b|\bright now\b|\bnow\b/, 'today'],
];

/** The numbers and periods a question mentions (nothing here needs the saved data). */
export function readMods(question: string): Mods {
  const q = normalise(question);
  const mods: Mods = {};
  for (const [re, p] of PERIODS) if (re.test(q)) { mods.period = p; break; }
  const days = /(\d+|\w+)\s*days?\b/.exec(q);
  if (days) { const n = numberFrom(days[1]); if (n) mods.days = n; }
  const months = /(\d+|\w+)\s*months?\b/.exec(q);
  if (months && !/(this|last|previous|prior)\s+months?/.test(q)) { const n = numberFrom(months[1]); if (n) { mods.months = n; if (!mods.days) mods.days = n * 30; } }
  const top = /\btop\s*(\d+|\w+)\b|\b(\d+)\s*(?:best|top)\b/.exec(q);
  if (top) { const n = numberFrom(top[1] ?? top[2]); if (n) mods.top = Math.min(n, 25); }
  const share = /(\d{1,3})\s*%/.exec(q);
  if (share) mods.pct = Math.min(+share[1], 200);
  return mods;
}

const FOLLOW_WORDS = ['and', 'also', 'what', 'how', 'only', 'just', 'same', 'those', 'them', 'again', 'instead', 'but', 'now'];
const isFollowUp = (toks: string[], mods: Mods, q: string): boolean =>
  toks.length <= 6 && (Object.keys(mods).length > 0 || hasAny(toks, FOLLOW_WORDS) || /^(in|for|at)\s/.test(normalise(q)));

export interface AskInput { question: string; settings: AssistantSettings; load: Loader; today?: Date; ctx?: Ctx | null }

export async function ask(input: AskInput): Promise<Answer> {
  const q = input.question.trim();
  const today = input.today ?? new Date();
  const toks = tokens(q);
  const env: Env = { q, toks, mods: readMods(q), s: input.settings, today, load: input.load };

  const ranked = SKILLS.map((s) => ({ s, n: s.score(toks) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  if (ranked.length) {
    // failsafe: a fault in one answer must never break the panel
    try { return await ranked[0].s.run(env); } catch {
      return { text: 'I could not work that one out from the saved reports. Open the report itself, or try again after refreshing it.', actions: [], notes: [], copy: '' };
    }
  }

  // a person's name on its own: how are they doing
  const names = [...(await input.load('attendance')), ...(await input.load('target_vs_sales'))];
  if (names.length) {
    const hit = findValue(q, merge(names).rows, ['rep']);
    if (hit) return repDetail(env, hit.value);
  }

  // a customer's name: what the saved reports say about them
  try {
    const [la, ag] = [await input.load('last_activity'), await input.load('customer_ageing')];
    const cust = findValue(q, merge([...la, ...ag]).rows, ['name']);
    if (cust) return await customerDetail(env, cust.value);
    const ex = await input.load('expiry');
    const byStock = ex.length ? findValue(q, merge(ex).rows, ['customer']) : null;
    if (byStock) return await customerDetail(env, byStock.value);
  } catch { /* fall through to the follow-up and the "did not understand" answer */ }

  // a short follow-up: the last question again, with what is new
  if (input.ctx && isFollowUp(toks, env.mods, q)) {
    const skill = SKILLS.find((s) => s.id === input.ctx!.skill);
    if (skill) {
      const mods: Mods = { ...input.ctx.mods, ...env.mods };
      return skill.run({ ...env, mods });
    }
    if (input.ctx.skill === 'rep_detail' && input.ctx.mods.rep) return repDetail({ ...env, mods: { ...input.ctx.mods, ...env.mods } }, input.ctx.mods.rep);
  }

  return {
    text: 'I did not understand that one. I can answer questions about visits, attendance, late starters, customers not visited, expiry, overdue ageing and sales against target. Try one of these:',
    lines: SKILLS.filter((s) => s.id !== 'help').map((s) => ({ text: s.examples[0], question: s.examples[0] })),
    actions: [], notes: ['Noted. Your administrator can see which questions could not be answered, so they can be added.'], unknown: true, copy: '',
  };
}
