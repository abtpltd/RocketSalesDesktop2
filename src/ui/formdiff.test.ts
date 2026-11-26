import { describe, expect, it } from 'vitest';
import { changedValues } from './RecordForm';

describe('changedValues', () => {
  it('sends only what the person changed', () => {
    const saved = { name: 'A', price: 120, status: true, tags: ['x'], note: '' };
    expect(changedValues(saved, { name: 'A', price: 120, status: true, tags: ['x'], note: undefined as unknown as string })).toEqual({});
    expect(changedValues(saved, { name: 'B', price: 130, status: false, tags: ['x', 'y'], note: '' }))
      .toEqual({ name: 'B', price: 130, status: false, tags: ['x', 'y'] });
  });
});
