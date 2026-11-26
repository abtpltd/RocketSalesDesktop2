import { describe, expect, it } from 'vitest';
import { joinPicks, keepUsers, splitPicks, usersFor } from './gridPicks';

const U = [{ code: 'R1', name: 'Ann', manager: 'P' }, { code: 'R2', name: 'Ben', manager: 'G' }, { code: '', name: 'Cate', manager: 'G' }];
describe('grid picks', () => {
  it('joins and splits', () => {
    expect(joinPicks(['A', 'B'])).toBe('A|B');
    expect(splitPicks('A|B')).toEqual(['A', 'B']);
    expect(splitPicks('')).toEqual([]);
    expect(splitPicks('Solo')).toEqual(['Solo']);
  });
  it('offers the users of the chosen managers', () => {
    expect(usersFor(U, []).length).toBe(3);
    expect(usersFor(U, ['G']).map((u) => u.name)).toEqual(['Ben', 'Cate']);
    expect(usersFor(U, ['P', 'G']).length).toBe(3);
  });
  it('drops chosen users outside the chosen managers', () => {
    expect(keepUsers(['R1', 'R2'], U, ['G'])).toEqual(['R2']);
    expect(keepUsers(['R1', 'Cate'], U, ['P', 'G'])).toEqual(['R1', 'Cate']);
    expect(keepUsers(['R1'], U, [])).toEqual(['R1']);
  });
});
