import { describe, expect, it } from 'vitest';
import { cardValue, homeTrend } from './home';

describe('home dashboard', () => {
  it('prints active - inactive like the web cards', () => {
    expect(cardValue({ customerCount: 64, customerInactive: 3 }, 'customerCount', 'customerInactive')).toBe('64 - 3');
    expect(cardValue({ visitCount: 5 }, 'visitCount', null)).toBe('5');
  });
  it('plots every day of the month, 0 where there is no data', () => {
    const t = homeTrend({ visitDta: '{"2": 7}', doctorVisitDta: '{"2": 3}', orderDta: '{"2": 900}' }, '2026-10-24');
    expect(t.labels.length).toBe(31);
    expect(t.customer.slice(0, 3)).toEqual([0, 7, 0]);
    expect(t.order[1]).toBe(900);
  });
});
