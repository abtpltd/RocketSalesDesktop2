import { describe, expect, it } from 'vitest';
import { countRows, formatCheck, mapFileRows, uploadRows } from './hospitalMapRows';

const table = [
  ['Hospital list'],
  ['Hospital  Code', 'doctor code', 'Attended', 'Rep'],
  ['h1', 'd1', 'Yes', ''],
  ['h1', 'd2', '', ''],
  ['', '', '', ''],
  ['h1', 'd1', '', ''],
  ['', 'd3', '', ''],
];

describe('mapFileRows', () => {
  it('finds the header below a title line and numbers rows as in the file', () => {
    const { rows, error } = mapFileRows(table);
    expect(error).toBe('');
    expect(rows.map((r) => r.row)).toEqual([3, 4, 6, 7]); // the empty line 5 is skipped
    expect(rows[0]).toMatchObject({ hospital_code: 'h1', doctor_code: 'd1', rep: '' });
    expect(rows[0]).not.toHaveProperty('attended'); // an ATTENDED column in an old file is ignored
  });
  it('refuses a file with no mapping header or no rows', () => {
    expect(mapFileRows([['A', 'B'], ['1', '2']]).error).toMatch(/HOSPITAL CODE/);
    expect(mapFileRows([['HOSPITAL CODE', 'DOCTOR CODE']]).error).toMatch(/no data rows/);
  });
  it('optional columns may be missing', () => {
    const out = mapFileRows([['HOSPITAL CODE', 'DOCTOR CODE'], ['H1', 'D1']]);
    expect(out.rows[0]).toMatchObject({ rep: '' });
  });
});

describe('formatCheck', () => {
  it('names each wrong row with its number and keeps the good ones', () => {
    const out = formatCheck(mapFileRows(table).rows);
    expect(out.map((r) => r.status)).toEqual(['pending', 'pending', 'error', 'error']);
    expect(out[2].message).toBe('Same hospital and doctor as row 3.');
    expect(out[3].message).toBe('Hospital code is empty.');
    expect(countRows(out)).toMatchObject({ all: 4, bad: 2, pending: 2 });
  });
  it('sends only the correct rows, codes in capitals', () => {
    const out = formatCheck(mapFileRows(table).rows).map((r) => (r.status === 'pending' ? { ...r, status: 'new' as const } : r));
    expect(uploadRows(out)).toEqual([
      { row: 3, hospital_code: 'H1', doctor_code: 'D1', rep: '' },
      { row: 4, hospital_code: 'H1', doctor_code: 'D2', rep: '' },
    ]);
  });
});
