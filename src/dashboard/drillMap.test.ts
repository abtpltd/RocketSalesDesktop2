import { describe, expect, it } from 'vitest';
import { cardTarget, chartTarget, daysOf, monthOf, monthRange, personTarget } from './drillMap';

describe('drill map', () => {
  it('reads the month in any shape, and falls back safely', () => {
    expect(monthOf('Oct-2026')).toEqual([2026, 10]);
    expect(monthOf('2026-02')).toEqual([2026, 2]);
    expect(monthOf('September 2026')).toEqual([2026, 9]);
    expect(monthOf('', '2026-07-14')).toEqual([2026, 7]);
    expect(monthOf(undefined, null)).toHaveLength(2);
    expect(monthRange('Feb-2026')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('turns day and week labels into ranges', () => {
    expect(daysOf('7', 'Oct-2026')).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    expect(daysOf('07-Oct', 'Oct-2026')).toEqual({ from: '2026-10-07', to: '2026-10-07' });
    expect(daysOf('29-31', 'Feb-2026')).toEqual({ from: '2026-02-28', to: '2026-02-28' });
    expect(daysOf('8-14', 'Oct-2026')).toEqual({ from: '2026-10-08', to: '2026-10-14' });
    expect(daysOf('Panadol', 'Oct-2026')).toBeNull();
  });
  it('maps charts, cards and people; unknown ones give null', () => {
    expect(chartTarget('OTS', '3', 'Oct-2026')).toMatchObject({ path: '/OrderGrid', from: '2026-10-03', to: '2026-10-03' });
    expect(chartTarget('T10C', 'City Lab', 'Oct-2026')).toMatchObject({ path: '/OrderGrid', search: 'City Lab', from: '2026-10-01', to: '2026-10-31' });
    expect(chartTarget('T10C', 'Others (4)', 'Oct-2026')).toBeNull();
    expect(chartTarget('XYZ', 'a')).toBeNull();
    expect(chartTarget('CV', '')).toBeNull();
    expect(cardTarget('orders', '2026-10-25')).toMatchObject({ path: '/OrderGrid', from: '2026-10-25' });
    expect(cardTarget('nope')).toBeNull();
    expect(personTarget(' ')).toBeNull();
  });
});
