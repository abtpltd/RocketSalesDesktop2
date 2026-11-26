import { expect, it } from 'vitest';
import { noteLines } from './UpdateNotice';
it('turns release notes into short lines', () => {
  expect(noteLines('- One\n* Two\r\n\n• Three')).toEqual(['One', 'Two', 'Three']);
  expect(noteLines(null)).toEqual([]);
});
