import { describe, expect, it } from 'vitest';
import { MAX_MISSED, addMissed, missedText, okMissed, removeMissed, sortMissed } from './unanswered';
import { ask } from './engine';
import type { AssistantSettings } from '../api/types';

const S = { enabled: true, roles: [], pinned: [], lo: 50, hi: 80, late: '09:30', stale_days: 30, bad_days: 60, expiry_months: 3, morning_summary: true, voice: false, ai_mode: 'off' } as AssistantSettings;

describe('questions it could not answer', () => {
  it('counts the same question once, however it is typed', () => {
    let l = addMissed([], 'Show me the Price Lists!', 1);
    l = addMissed(l, '  show me the price lists ', 2);
    l = addMissed(l, 'gift stock balance', 3);
    expect(l).toHaveLength(2);
    expect(sortMissed(l)[0]).toMatchObject({ count: 2, last: 2 });
    expect(missedText(l)).toBe('2x  show me the price lists\n1x  gift stock balance');
  });
  it('ignores an empty question, trims long ones, and stays within its limit', () => {
    expect(addMissed([], '   ', 1)).toEqual([]);
    expect(addMissed([], 'x'.repeat(500), 1)[0].q).toHaveLength(160);
    let l: ReturnType<typeof addMissed> = [];
    for (let i = 0; i < MAX_MISSED + 20; i++) l = addMissed(l, `question number ${i}`, i);
    expect(l).toHaveLength(MAX_MISSED);
    expect(l.some((m) => m.q === 'question number 0')).toBe(false); // the oldest went
    expect(l.some((m) => m.q === `question number ${MAX_MISSED + 19}`)).toBe(true);
  });
  it('removes one and checks what was stored', () => {
    const l = addMissed(addMissed([], 'a b c', 1), 'd e f', 2);
    expect(removeMissed(l, l[0].key)).toHaveLength(1);
    expect(okMissed(l)).toBe(true);
    expect(okMissed([{ q: 1 }])).toBe(false);
    expect(okMissed('x')).toBe(false);
  });
  it('the assistant marks only the questions it did not understand', async () => {
    const load = async () => [];
    expect((await ask({ question: 'banana smoothie recipe', settings: S, load })).unknown).toBe(true);
    expect((await ask({ question: 'gift stock balance', settings: S, load })).unknown).toBe(true); // 'balance' alone is not an ageing question
    expect((await ask({ question: 'late starters', settings: S, load })).unknown).toBeFalsy(); // no data is not "not understood"
  });
});
