import { describe, expect, it } from 'vitest';
import { msUntilNextCheck } from './updateTimes';

const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m, 0, 0);
const mins = (ms: number) => Math.round(ms / 60000);

describe('update check times', () => {
  it('waits for the next of 10, 12, 2 and 4', () => {
    expect(mins(msUntilNextCheck(at(8)))).toBe(120);
    expect(mins(msUntilNextCheck(at(10, 30)))).toBe(90);
    expect(mins(msUntilNextCheck(at(13)))).toBe(60);
    expect(mins(msUntilNextCheck(at(15, 59)))).toBe(1);
  });
  it('after 4 pm waits for 10 am tomorrow', () => {
    expect(mins(msUntilNextCheck(at(16)))).toBe(18 * 60);
    expect(mins(msUntilNextCheck(at(22)))).toBe(12 * 60);
  });
});
