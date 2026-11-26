import { describe, expect, it } from 'vitest';
import { contactRows, expenseRows, invoiceRows, webInt } from './fileRows';

describe('upload files', () => {
  it('reads expenses like the web script, leaving out unknown heads, types and zero amounts', () => {
    const t = [['Title row'], ['Code', 'Expense Type', 'Expense Head', 'Expense Amount'],
      ['R1', 'daily', 'fuel', '300.7'], ['R1', 'weekly', 'hotel', 50], ['R2', 'DAILY', 'FUEL', 0], [null, 'DAILY', 'FUEL', 9]];
    const out = expenseRows(t, ['FUEL'], ['DAILY', 'WEEKLY', 'MONTHLY']);
    expect(out.rows).toEqual({ R1: [{ EXPENSE_TYPE: 'DAILY', EXPENSE_HEAD: 'FUEL', EXPENSE_AMOUNT: 300 }] });
    expect(out.skipped.length).toBe(2);
    expect(expenseRows([['CODE', 'EXPENSE_HEAD']], [], []).error).toMatch(/EXPENSE_TYPE/);
    expect(webInt('12abc')).toBe(12);
  });
  it('needs the exact invoice headers and puts values in capitals', () => {
    const out = invoiceRows([['Date', 'InvoiceNo', 'Amount', 'CustomerCode', 'Salesmen'], ['26-04-2024', 'in1 ', '12', 'c1', 'ravi'], ['', '', '', '', '']]);
    expect(out.rows).toEqual([{ Date: '26-04-2024', InvoiceNo: 'IN1', Amount: '12', CustomerCode: 'C1', Salesmen: 'RAVI' }]);
    expect(invoiceRows([['date', 'InvoiceNo']]).error).toMatch(/Date/);
  });
  it('builds contacts and tags with the web field names', () => {
    const out = contactRows([['Customer Code', 'Contact Name', 'Phone', 'Location Name', 'Location Tag'], ['c001', 'Simon', 2547, 'LAB1', '0.1,0.2']]);
    expect(out.data).toEqual({ C001: [{ name: 'Simon', phone: '2547', location: '0.1,0.2' }] });
    expect(out.tags).toEqual({ C001: [{ t: 'LAB1', g: '0.1,0.2' }] });
  });
});
