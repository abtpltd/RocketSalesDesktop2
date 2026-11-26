import { describe, expect, it } from 'vitest';
import type { PipelineBoard, PipelineBoardCard } from '../api/types';
import { convertPresets, filterCards, filterChoices, moveCard, shift, stageProblem } from './pipeline';

const card = (key: string, over: Partial<PipelineBoardCard> = {}): PipelineBoardCard => ({
  key, name: key, stage: 'Lead', rep: 'Ann', contactPerson: 'J', phone: '07', email: 'a@b.c', linkedIn: '', reminderDateStr: '',
  website: '', category: 'Retail, Chain', border: '', kind: '', converted_code: '', converted_kind: '', ...over });
const board = (): PipelineBoard => ({
  report: 'pipeline', title: 'Pipeline Dashboard', path: '/PipelineDashbord', columns: [], rows: [], total: 2, page: 1, size: 2, from: '', to: '',
  hidden: 0, stages: [{ stage: 'Lead', color: '', cards: [card('A', { kind: 'customer' }), card('B', { rep: 'Bo', category: 'Lab' })] },
    { stage: 'Won', color: '', cards: [] }],
  stage_names: ['Lead', 'Won'], stage_counts: { Lead: 2, Won: 0 }, orphans: [], activities: {}, won_stage: 'Won',
  can: { move: true, stages: true, create: true, customer: true, doctor: true } } as unknown as PipelineBoard);

describe('pipeline board helpers', () => {
  it('filters by rep, type and category', () => {
    const cards = board().stages[0].cards;
    expect(filterCards(cards, { rep: 'Bo', kind: 'any', category: '' }).map((c) => c.key)).toEqual(['B']);
    expect(filterCards(cards, { rep: '', kind: 'customer', category: '' }).map((c) => c.key)).toEqual(['A']);
    expect(filterCards(cards, { rep: '', kind: 'none', category: '' }).map((c) => c.key)).toEqual(['B']);
    expect(filterCards(cards, { rep: '', kind: 'any', category: 'Chain' }).map((c) => c.key)).toEqual(['A']);
    expect(filterChoices(board())).toEqual({ reps: ['Ann', 'Bo'], categories: ['Chain', 'Lab', 'Retail'] });
  });

  it('moves a card at once', () => {
    const b = moveCard(board(), 'A', 'Won');
    expect(b.stages[0].cards.map((c) => c.key)).toEqual(['B']);
    expect(b.stages[1].cards[0]).toMatchObject({ key: 'A', stage: 'Won' });
    expect(moveCard(board(), 'nobody', 'Won')).toEqual(board());
  });

  it('checks stage names like the server', () => {
    expect(stageProblem('Demo #1', ['Lead'], ['Lead'])).toMatch(/letters/);
    expect(stageProblem('lead', ['Lead'], ['Lead'])).toMatch(/already/);
    expect(stageProblem('Visit_done', ['Visit done'], [])).toMatch(/already/);
    expect(stageProblem('  Demo   day ', ['Lead'], ['Lead'])).toBeNull();
    expect(shift(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(shift(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('copies the prospect into the new record', () => {
    expect(convertPresets('customer', card('A'))).toEqual({ name: 'A', person: 'J', phone: '07', email: 'a@b.c' });
    expect(convertPresets('doctor', card('A'))).toEqual({ name: 'A', contact_person: 'J', mobile: '07', email: 'a@b.c' });
  });
});
