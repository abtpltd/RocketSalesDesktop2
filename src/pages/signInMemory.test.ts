import { describe, expect, it } from 'vitest';
import { firstName, greeting, lastUser, saveBrand, saveLastUser, savedBrand } from './signInMemory';

const store = new Map<string, string>();
globalThis.localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } } as Storage;

describe('sign-in memory', () => {
  it('greets by the time of day on this computer', () => {
    const at = (h: number) => new Date(2026, 9, 24, h, 30);
    expect(greeting(at(6))).toBe('Good morning');
    expect(greeting(at(11))).toBe('Good morning');
    expect(greeting(at(12))).toBe('Good afternoon');
    expect(greeting(at(16))).toBe('Good afternoon');
    expect(greeting(at(17))).toBe('Good evening');
    expect(greeting(at(23))).toBe('Good evening');
  });
  it('uses the first name', () => {
    expect(firstName('  Hemant  Patel ')).toBe('Hemant');
    expect(firstName('')).toBe('');
  });
  it('remembers the last user and logo only for the same company', () => {
    saveLastUser(' MaxPro ', 'Hemant Patel', 'h@x.com');
    expect(lastUser('maxpro')?.name).toBe('Hemant Patel');
    expect(lastUser('kas')).toBeNull();
    saveBrand('maxpro', { company: 'Maxpro', logo: 'data:image/png;base64,AA==' });
    expect(savedBrand('MAXPRO')?.logo).toBe('data:image/png;base64,AA==');
    expect(savedBrand('kas')).toBeNull();
  });
});
