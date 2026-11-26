import { describe, expect, it } from 'vitest';
import { addReminder, dueReminders, parseReminder, removeReminder, wantsReminders } from './reminders';
import { bump, topAsked } from './asked';
import { answerHtml } from './print';

const WED = new Date(2026, 9, 28); // Wed 28 Oct 2026
describe('reminders', () => {
  it('reads the day words', () => {
    expect(parseReminder('Remind me to chase Lakeview on Friday', WED)).toEqual({ text: 'chase Lakeview', due: '2026-10-30' });
    expect(parseReminder('remind me to call Ann tomorrow', WED)).toEqual({ text: 'call Ann', due: '2026-10-29' });
    expect(parseReminder('remind me to pay in 3 days', WED)).toEqual({ text: 'pay', due: '2026-10-31' });
    expect(parseReminder('remind me to check stock', WED)).toEqual({ text: 'check stock', due: '' });
    expect(parseReminder('remind me on wednesday to x', WED)?.due).toBe('2026-11-04');
    expect(parseReminder('who is late', WED)).toBeNull();
    expect(wantsReminders('show my reminders')).toBe(true);
  });
  it('keeps, lists due and removes', () => {
    let l = addReminder([], 'a', '2026-10-28'); l = addReminder(l, 'b', '2026-10-30'); l = addReminder(l, 'c', '');
    expect(dueReminders(l, WED).map((r) => r.text)).toEqual(['c', 'a']);
    expect(removeReminder(l, 1).length).toBe(2);
  });
});
describe('most asked', () => {
  it('offers only questions asked twice or more, most first', () => {
    let c = {}; for (const q of ['a', 'b', 'b', 'c', 'c', 'c']) c = bump(c, q);
    expect(topAsked(c)).toEqual(['c', 'b']);
    expect(topAsked(c, ['c'])).toEqual(['b']);
  });
});
describe('printing', () => {
  it('escapes text', () => {
    const h = answerHtml({ text: '<b>x</b>', actions: [], notes: [], copy: '' });
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(h).not.toContain('<b>x');
  });
});
