import { describe, expect, it } from 'vitest';
import type { InsightPayload } from '../../api/types';
import { INSIGHTS, filterRows, hasBody } from './insightList';

const rows = [{ rep: 'Ann', tier: 'A', note: 'Karen' }, { rep: 'Ben', tier: 'B', note: 'Mater' }, { rep: 'Cy', tier: 'A', note: 'Karen' }];

describe('insights', () => {
  it('lists ten insights with unique ids and a question each', () => {
    expect(INSIGHTS).toHaveLength(10);
    expect(new Set(INSIGHTS.map((i) => i.id)).size).toBe(10);
    expect(INSIGHTS.every((i) => i.question.endsWith('?'))).toBe(true);
  });
  it('filters by words and by a clicked bar', () => {
    expect(filterRows(rows, 'karen').map((r) => r.rep)).toEqual(['Ann', 'Cy']);
    expect(filterRows(rows, 'karen a').map((r) => r.rep)).toEqual(['Ann', 'Cy']);
    expect(filterRows(rows, '', 'tier', 'B').map((r) => r.rep)).toEqual(['Ben']);
    expect(filterRows(rows, 'zzz')).toEqual([]);
    expect(filterRows(rows, '  ')).toHaveLength(3);
  });
  it('shows a body unless it has nothing at all', () => {
    const base = { availability: 'needs_data', kpis: [], rows: [] } as unknown as InsightPayload;
    expect(hasBody(base)).toBe(false);
    expect(hasBody({ ...base, kpis: [{ label: 'a', value: '1' }] })).toBe(true);
    expect(hasBody({ ...base, availability: 'ready' })).toBe(true);
  });
});
