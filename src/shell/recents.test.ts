import { describe, expect, it } from 'vitest';
import { flatten, pushRecent, searchPages } from './recents';
import { sampleMenu } from '../api/mock';

describe('recents', () => {
  it('puts the newest first, drops repeats and caps the list', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b'], 'z', 2)).toEqual(['z', 'a']);
  });
});

describe('searchPages', () => {
  const pages = flatten(sampleMenu.sections);
  it('finds by title and by section, all words must match', () => {
    expect(searchPages(pages, 'stock').map((p) => p.id)).toEqual(expect.arrayContaining(['stock', 'transfer']));
    expect(searchPages(pages, 'inventory transfer').map((p) => p.id)).toEqual(['transfer']);
    expect(searchPages(pages, 'zzzz')).toEqual([]);
  });
  it('lists the first pages for an empty query', () => {
    expect(searchPages(pages, '  ', 3)).toHaveLength(3);
  });
});
