import { describe, expect, it } from 'vitest';
import { CYCLE, FRAMES, SAYS, SPRITES, answerMood, speakMs } from './pilotMood';
import type { Answer } from './types';
import { readdirSync } from 'node:fs';

const A = (o: Partial<Answer>): Answer => ({ text: 'x', actions: [], notes: [], copy: '', ...o });
describe('RocketPilot moods', () => {
  it('looks concerned when he did not understand, alert on red items, pleased when all is clear', () => {
    expect(answerMood(A({ unknown: true }))).toBe('concerned');
    expect(answerMood(A({ lines: [{ text: 'a', tone: 'bad' }] }))).toBe('alert');
    expect(answerMood(A({ text: 'Nothing stands out in the saved reports. All clear.' }))).toBe('good');
    expect(answerMood(A({ text: '3 rows' }))).toBe('idle');
  });
  it('every picture he needs is in the app', () => {
    const files = readdirSync('src/assets/pilot').map((f) => f.replace('.webp', ''));
    for (const n of SPRITES) expect(files).toContain(n);
    expect(Object.values(FRAMES).every((f) => f.length > 0)).toBe(true);
  });
  it('each touch moves on to the next mood, every mood has a picture and a line', () => {
    expect(CYCLE.length).toBeGreaterThan(5);
    for (const m of CYCLE) { expect(FRAMES[m].length).toBeGreaterThan(0); expect(SAYS[m].length).toBeGreaterThan(5); }
    expect(new Set(CYCLE).size).toBe(CYCLE.length);
  });
  it('speaks for a short, bounded time', () => { expect(speakMs('')).toBe(900); expect(speakMs('x'.repeat(5000))).toBe(4500); });
});
