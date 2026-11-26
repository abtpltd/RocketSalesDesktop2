import { describe, expect, it } from 'vitest';
import { cardDetails, textOn } from './pipeline';

describe('pipeline dashboard', () => {
  it('picks readable header text', () => {
    expect(textOn('#FFD700')).toBe('#1a1a1a');
    expect(textOn('#000080')).toBe('#ffffff');
    expect(textOn('')).toBe('inherit');
  });
  it('lists only the details a prospect has', () => {
    const c = { key: 'K', name: 'A', stage: 'S', rep: 'Ann', contactPerson: '', phone: '0700', email: ' ', linkedIn: '',
      reminderDateStr: '', website: '', category: 'Lab', border: '' };
    expect(cardDetails(c)).toEqual([['Sales rep', 'Ann'], ['Phone', '0700'], ['Category', 'Lab']]);
  });
});
