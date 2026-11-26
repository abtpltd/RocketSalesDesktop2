import type { Answer } from './types';

export type Mood = 'idle' | 'greet' | 'listen' | 'think' | 'speak' | 'good' | 'concerned' | 'alert' | 'celebrate' | 'sleep';
/** Which picture of RocketPilot goes with each mood; more than one means he swaps between them while speaking. */
export const FRAMES: Record<Mood, string[]> = {
  idle: ['idle'], greet: ['greet'], listen: ['listen'], think: ['think'], speak: ['speak1', 'speak2'], good: ['good'], concerned: ['concerned'], alert: ['alert'], celebrate: ['celebrate'], sleep: ['sleep'],
};
export const SPRITES = [...new Set(Object.values(FRAMES).flat())];
/** The order the moods go through, one for each touch of his picture. */
export const CYCLE: Mood[] = ['greet', 'listen', 'think', 'speak', 'good', 'concerned', 'alert', 'celebrate', 'sleep'];

const CLEAR = /\ball clear\b|nothing stands out|everyone is on pace|no customer is overdue|no customer has amounts|every customer .* was visited|nobody is overdue/i;
/** How RocketPilot looks once he has finished giving this answer. */
export function answerMood(a: Answer): Mood {
  if (a.unknown) return 'concerned';
  const tones = [...(a.table?.allTones ?? []), ...(a.lines ?? []).map((l) => l.tone), ...(a.bars ?? []).map((b) => b.tone)];
  if (tones.includes('bad')) return 'alert';
  if (CLEAR.test(a.text)) return 'good';
  return 'idle';
}
export const SAYS: Record<Mood, string> = {
  idle: 'Ask me about visits, sales or customers.', listen: 'I am listening. Go ahead and ask.', greet: 'Hello! How can I help today?', think: 'Looking through your saved reports…',
  speak: 'Here is what I found.', good: 'All clear. Nicely done.', concerned: 'I did not catch that one. Try one of these.',
  alert: 'Please look at the red items first.', celebrate: 'Something new for you!', sleep: 'Resting. Open a report while online to wake me.',
};
/** How long he "speaks" for: roughly as long as the answer takes to read, never long. */
export const speakMs = (text: string): number => Math.min(4500, 900 + text.length * 22);
