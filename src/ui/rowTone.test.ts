import { describe, expect, it } from 'vitest';
import { batteryPct, batteryTone, clockText, attendancePct, clockMinutes, parseDay, toneFor, TONE_DEFAULT } from './rowTone';

const C = TONE_DEFAULT;
const today = new Date(2026, 9, 26);
describe('rowTone', () => {
  it('reads clocks and days', () => {
    expect(clockMinutes('08:05AM(95%)')).toBe(485);
    expect(clockMinutes('1:30 PM')).toBe(810);
    expect(clockMinutes('')).toBeNull();
    expect(parseDay('05 Oct, 2026')).toEqual(new Date(2026, 9, 5));
    expect(parseDay('10-09-2026')).toEqual(new Date(2026, 8, 10));
    expect(parseDay('nope')).toBeNull();
  });
  it('attendance: absent, share of target and late start', () => {
    const base = { ap: 'P', half_day: '', start_day: '08:05AM(95%)', customer_visits: 8, doctor_visits: 2, target: 10 };
    expect(attendancePct(base)).toBe(100);
    expect(toneFor('attendance', base, C).row).toBe('good');
    expect(toneFor('attendance', { ...base, customer_visits: 3, doctor_visits: 1 }, C).row).toBe('bad');
    expect(toneFor('attendance', { ...base, customer_visits: 5, doctor_visits: 1 }, C).row).toBe('warn');
    expect(toneFor('attendance', { ...base, ap: 'A' }, C).row).toBe('bad');
    expect(toneFor('attendance', { ...base, start_day: '10:15AM(80%)' }, C).cells).toEqual({ start_day: 'bad' });
    expect(toneFor('attendance', { ...base, target: 0 }, C).row).toBeUndefined();
    expect(toneFor('attendance', { ...base, ap: 'L', customer_visits: 0, doctor_visits: 0, date: '2026-10-20' }, C, today).row).toBeUndefined(); // approved leave
    expect(toneFor('attendance', { ...base, ap: 'A', date: '2026-10-30' }, C, today).row).toBeUndefined(); // a day still to come
    expect(toneFor('attendance', { ...base, ap: 'A', date: '2026-10-20' }, C, today).row).toBe('bad');
    expect(toneFor('attendance', { ...base, ap: 'A' }, { ...C, on: false })).toEqual({});
  });
  it('battery tag', () => {
    expect(batteryPct('10:45AM(100%)')).toBe(100);
    expect(batteryPct('10:45AM')).toBeNull();
    expect(clockText('10:45AM(100%)')).toBe('10:45AM');
    expect([100, 95, 94, 20, 19, 0].map(batteryTone)).toEqual(['good', 'good', 'warn', 'warn', 'bad', 'bad']);
  });
  it('targets, ageing, last activity, expiry, short visits', () => {
    expect(toneFor('target_vs_sales', { target: '1,000', sales: '400' }, C).row).toBe('bad');
    expect(toneFor('target_itemized', { target_value: '100', sales_value: '90' }, C).row).toBe('good');
    expect(toneFor('customer_ageing', { d60: '1', d61: '2' }, C).cells).toEqual({ d61: 'bad', d60: 'warn' });
    expect(toneFor('last_activity', { last_visit: '05 Aug, 2026' }, C, today).row).toBe('bad');
    expect(toneFor('last_activity', { last_visit: '01 Oct, 2026' }, C, today).row).toBeUndefined();
    expect(toneFor('expiry', { expiry: '12-2026' }, C, today).row).toBe('warn');
    expect(toneFor('expiry', { expiry: '09-2026' }, C, today).row).toBe('bad');
    expect(toneFor('visits', { short_visit: 'Yes' }, C).cells).toEqual({ short_visit: 'warn' });
  });
});
