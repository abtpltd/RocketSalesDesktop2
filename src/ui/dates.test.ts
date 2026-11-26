import { describe, expect, it } from 'vitest';
import { showDate } from './dates';

describe('showDate', () => {
  it('shows every ISO shape as DD-MM-YYYY and leaves other values alone', () => {
    expect(showDate('2026-10-05')).toBe('05-10-2026');
    expect(showDate('2026-10-05 13:44:02')).toBe('05-10-2026 13:44');
    expect(showDate('2026-10-05T13:44:02Z')).toBe('05-10-2026 13:44');
    expect(showDate('2026-10-05 13:44 UTC')).toBe('05-10-2026 13:44');
    expect(showDate('2026/10/05')).toBe('05-10-2026');
    expect(showDate('05-10-2026')).toBe('05-10-2026');
    expect(showDate('Panadol 2026-10-05')).toBe('Panadol 2026-10-05');
    expect(showDate(12)).toBe(12);
  });
});
