import { describe, expect, it } from 'vitest';
import { personal, smsSize } from './smsMath';

describe('sms size', () => {
  it('counts plain text in 160 / 153 parts', () => {
    expect(smsSize('')).toMatchObject({ chars: 0, parts: 0 });
    expect(smsSize('a'.repeat(160))).toMatchObject({ parts: 1, unicode: false });
    expect(smsSize('a'.repeat(161))).toMatchObject({ parts: 2, perPart: 153 });
    expect(smsSize('a'.repeat(307)).parts).toBe(3);
  });
  it('counts € and brackets as two characters', () => {
    expect(smsSize('€[]').chars).toBe(6);
  });
  it('switches to Unicode for emoji and curly quotes', () => {
    expect(smsSize('Hi 😀')).toMatchObject({ unicode: true, parts: 1 });
    expect(smsSize('’'.repeat(71))).toMatchObject({ unicode: true, parts: 2, perPart: 67 });
  });
  it('puts the customer name in every place', () => {
    expect(personal('Hi [CustomerName], [CustomerName]!', '[CustomerName]', 'Ann')).toBe('Hi Ann, Ann!');
  });
});
