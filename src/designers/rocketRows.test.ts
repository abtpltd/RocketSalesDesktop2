import { describe, expect, it } from 'vitest';
import { changedRows } from './rocketRows';

describe('rocket form masters', () => {
  const saved = [{ k: 'R1', shortname: 'JC', title: 'Job card', design: 'BaylemJobCard', sendByMail: false },
    { k: 'R2', shortname: 'SC', title: 'Service', design: 'KasServiceCard', sendByMail: true }];
  it('sends new and changed rows only, in the web shape', () => {
    const rows = [{ ...saved[0], id: 'R1', sendByMail: true }, { ...saved[1], id: 'R2' },
      { id: 'n1', k: '', shortname: 'NW', title: 'New', design: 'KasServiceCard', sendByMail: false }];
    expect(changedRows(saved, rows)).toEqual([{ st: 'JC', t: 'Job card', d: 'BaylemJobCard', k: 'R1', is: true },
      { st: 'NW', t: 'New', d: 'KasServiceCard', k: '', is: false }]);
    expect(changedRows(saved, saved.map((r) => ({ ...r, id: r.k })))).toEqual([]);
  });
});
