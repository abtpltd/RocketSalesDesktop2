import { describe, expect, it } from 'vitest';
import { EMPTY_VIEW, arranged, panelList, parseView, savedViewFor, viewKey } from './savedView';

const view = { view: 'line', top: 0, sort: 'value', byWeek: true, running: false, hidden: [] };

describe('saved dashboard view', () => {
  it('shows only what the role allows, in the saved order, new items last', () => {
    const a = { order: ['OTS', 'GONE', 'CDV'], hidden: ['T10P'] };
    expect(arranged(['CDV', 'T10P', 'OTS', 'NEW'], a)).toEqual(['OTS', 'CDV', 'NEW']);
    expect(panelList(['CDV', 'T10P', 'OTS'], a)).toEqual([{ key: 'OTS', shown: true }, { key: 'CDV', shown: true }, { key: 'T10P', shown: false }]);
    expect(arranged(['A', 'B'], EMPTY_VIEW.charts)).toEqual(['A', 'B']);
  });

  it('reads stored views safely', () => {
    expect(parseView(null)).toEqual(EMPTY_VIEW);
    expect(parseView({ v: 2 })).toEqual(EMPTY_VIEW);
    const p = parseView({ v: 1, charts: { order: ['X'], hidden: 'bad' }, cards: { order: [], hidden: ['visits'] }, views: { OTS: view, BAD: { view: 'pie3d' } }, days: 'custom' });
    expect(p.charts).toEqual(EMPTY_VIEW.charts);
    expect(p.cards.hidden).toEqual(['visits']);
    expect(Object.keys(p.views)).toEqual(['OTS']);
    expect(p.days).toBeUndefined();
    expect(viewKey('ACME', 'Boss@Acme.com', 'home')).toBe('dash-view|acme|boss@acme.com|home');
  });

  it('keeps a chart view only when it suits the chart', () => {
    expect(savedViewFor(view as never, false)).toEqual(view);
    expect(savedViewFor(view as never, true)).toBeUndefined();
    expect(savedViewFor({ ...view, view: 'treemap' } as never, true)?.view).toBe('treemap');
  });
});
