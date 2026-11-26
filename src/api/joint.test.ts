import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createMockApi } from './mock';

describe('joint calls (mock server)', () => {
  beforeAll(() => { vi.stubGlobal('location', { search: '' }); }); // the mock reads ?scenario= from the address bar
  it('reads and saves the company settings', async () => {
    const api = createMockApi();
    const first = await api.fetchJoint();
    expect(first.invite_scope).toBe('hierarchy');
    const saved = await api.saveJoint({ ...first, confirm: 'app_distance', distance_rule: 'block' });
    expect(saved.message).toMatch(/saved/i);
    expect((await api.fetchJoint()).distance_rule).toBe('block');
  });

  it('lists joint calls with every person on each', async () => {
    const api = createMockApi();
    const r = await api.fetchReport('joint_calls', {});
    expect(r.data.report).toBe('joint_calls');
    expect(r.data.rows.length).toBe(2);
    expect(String(r.data.rows[0].members)).toContain(',');
    expect(r.data.columns.map((c) => c.key)).toEqual(expect.arrayContaining(['members', 'key_points', 'improve', 'actions']));
    const none = await api.fetchReport('joint_calls', { search: 'zzzz' });
    expect(none.data.total).toBe(0);
  });

  it('shows a shared visit as one row naming everyone, with a People column', async () => {
    const api = createMockApi();
    const r = await api.fetchReport('visits', {});
    const shared = r.data.rows.find((x) => x.joint === 2)!;
    expect(String(shared.rep)).toBe('Asha Rep, Brian Otieno');
    expect(r.data.columns.some((c) => c.key === 'joint' && c.title === 'People')).toBe(true);
    expect(r.data.rows.filter((x) => x.joint).length).toBe(1);
  });
});
