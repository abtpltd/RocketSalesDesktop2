import { describe, expect, it } from 'vitest';
import type { FieldItems } from '../api/types';
import { applyView, newFieldItems, viewOf } from './surveyFields';

// as saved on the web: fresh web field, then a field that was re-saved on the web ("None" for empty values)
const fresh: FieldItems = [['title', 'Shop'], ['type', 'text'], ['mandatory', 'on'], ['defaultvalue', ''], ['subform', ''],
  ['formlayout', 'VERTICAL'], ['min', '0'], ['max', '100'], ['prefix', ''], ['sufix', ''], ['option', ''], ['option', ''], ['defaultoption', '']];
const resaved: FieldItems = [['title', 'Stock'], ['type', 'dropdown'], ['defaultvalue', 'None'], ['formlayout', 'VERTICAL'],
  ['min', 'None'], ['option', ''], ['option', 'Low'], ['option', 'High'], ['extra', 'kept']];

describe('survey fields', () => {
  it('reads a field the way the web shows it', () => {
    expect(viewOf(resaved)).toMatchObject({ title: 'Stock', mandatory: false, defaultvalue: '', options: ['Low', 'High'] });
  });
  it('changes only what was edited', () => {
    expect(applyView(resaved, viewOf(resaved))).toEqual(resaved);
    const out = applyView(resaved, { ...viewOf(resaved), title: 'Stock level' });
    expect(out).toEqual(resaved.map(([n, v]) => [n, n === 'title' ? 'Stock level' : v]));
  });
  it('keeps the blank option the web writes first and unknown elements', () => {
    const out = applyView(resaved, { ...viewOf(resaved), options: ['Low', 'Medium', 'High'] });
    expect(out).toEqual([['title', 'Stock'], ['type', 'dropdown'], ['defaultvalue', 'None'], ['formlayout', 'VERTICAL'], ['min', 'None'],
      ['option', ''], ['option', 'Low'], ['option', 'Medium'], ['option', 'High'], ['extra', 'kept']]);
  });
  it('a new choice field saves like a new web field with typed options', () => {
    const out = applyView(fresh, { ...viewOf(fresh), type: 'radio', options: ['Yes', 'No'] });
    expect(out.filter(([n]) => n === 'option').map(([, v]) => v)).toEqual(['', 'Yes', 'No']);
    expect(out[out.length - 1]).toEqual(['defaultoption', '']);
    expect(newFieldItems()).toEqual(fresh.map(([n, v]) => [n, n === 'title' ? '' : v]));
  });
  it('mandatory is written as "on" right after the type, or removed', () => {
    const on = applyView(resaved, { ...viewOf(resaved), mandatory: true });
    expect(on.slice(0, 3)).toEqual([['title', 'Stock'], ['type', 'dropdown'], ['mandatory', 'on']]);
    expect(applyView(fresh, { ...viewOf(fresh), mandatory: false }).some(([n]) => n === 'mandatory')).toBe(false);
  });
});
