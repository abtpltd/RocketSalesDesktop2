import { describe, expect, it } from 'vitest';
import { partsFromTable } from './spareMath';

describe('spare parts file', () => {
  it('reads rows under the PRODUCTCODE header like the web page', () => {
    const { rows, problems } = partsFromTable([
      ['Spare parts list'],
      ['ProductCode', 'PartCode', 'Part  Name', 'uom', 'Price'],
      ['me01', 'P1', 'Pump', 'pcs', '1,200'],
      ['me01', 'P1', 'Pump again', 'pcs', 5],
      ['me02', 'P2', 'Lens', 'box', 'ten'],
      ['', 'P3', 'No code', '', ''],
      ['me03', 'P4', 'Belt', '', ''],
    ]);
    expect(rows).toEqual([{ c: 'ME01', pc: 'P1', pn: 'Pump', uom: 'PCS', pr: 1200 }, { c: 'ME03', pc: 'P4', pn: 'Belt', uom: '', pr: '' }]);
    expect(problems).toHaveLength(2);
  });
  it('needs the PRODUCTCODE column', () => {
    expect(partsFromTable([['Code', 'Name']]).problems[0]).toContain('PRODUCTCODE');
  });
});
