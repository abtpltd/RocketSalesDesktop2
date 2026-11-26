import { expect, it } from 'vitest';
import { RELEASES, canSeeWhatsNew, isUnread, newestId, notesText } from './releaseNotes';
it('What is new is shown only when the server says so for this person', () => {
  expect(canSeeWhatsNew({ news_allowed: true })).toBe(true);
  expect(canSeeWhatsNew({ news_allowed: false })).toBe(false);
  expect(canSeeWhatsNew({})).toBe(false); // an older server sends nothing
  expect(canSeeWhatsNew(undefined)).toBe(false);
  expect(canSeeWhatsNew(null)).toBe(false);
});
it('the bundled history is well formed, newest first', () => {
  expect(RELEASES.length).toBeGreaterThan(1);
  expect(new Set(RELEASES.map((r) => r.id)).size).toBe(RELEASES.length);
  expect(RELEASES.every((r) => r.notes.length > 0)).toBe(true);
  expect(notesText().startsWith('- ')).toBe(true);
});
it('unread until the newest id has been seen', () => {
  expect(isUnread('')).toBe(true);
  expect(isUnread(newestId())).toBe(false);
  expect(isUnread('r1')).toBe(true);
  expect(isUnread('x', [])).toBe(false);
});
