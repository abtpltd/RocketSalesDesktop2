// Survey form fields as html/mt_form.html + js/formLogic.js save them: each field is the list of its inputs
// (serializeArray order), which the web handler turns into XML elements in the same order. The editor shows a
// simple view of a field; applyView() writes only what changed back into the saved list, so everything else (element
// order, empty and "None" values, elements the editor does not know) stays exactly as saved.
import type { FieldItems } from '../api/types';

export const CANON = ['title', 'type', 'mandatory', 'defaultvalue', 'subform', 'formlayout', 'min', 'max', 'prefix', 'sufix', 'option', 'defaultoption'];
const SCALARS = ['title', 'type', 'defaultvalue', 'formlayout', 'min', 'max', 'prefix', 'sufix'] as const;
type Scalar = (typeof SCALARS)[number];

export interface FieldView {
  title: string; type: string; mandatory: boolean; defaultvalue: string; formlayout: string;
  min: string; max: string; prefix: string; sufix: string; options: string[]; defaultoptions: string[];
}

/** Which extra settings the web shows for a type (formApp.feildTypeOnChange). */
export const CHOICE_TYPES = ['multichoice', 'radio', 'dropdown', 'filtereddropdown', 'searchdropdown'];
export function settingsFor(type: string): { options: boolean; other: boolean; number: boolean; phone: boolean; subform: boolean } {
  return {
    options: CHOICE_TYPES.includes(type), other: type === 'multichoiceother', number: type === 'number',
    phone: type === 'phone', subform: type === 'subform',
  };
}

/** A field as a new web field box posts it (all its inputs, hidden ones included; Mandatory starts ticked). */
export function newFieldItems(title = '', type = 'text'): FieldItems {
  return [['title', title], ['type', type], ['mandatory', 'on'], ['defaultvalue', ''], ['subform', ''], ['formlayout', 'VERTICAL'],
    ['min', '0'], ['max', '100'], ['prefix', ''], ['sufix', ''], ['option', ''], ['option', ''], ['defaultoption', '']];
}

/** "None" is what the web writes back for an empty element after a re-save; show it as empty. */
const shown = (v: string | undefined) => (v === undefined || v === 'None' ? '' : v);
const first = (items: FieldItems, name: string) => items.find(([n]) => n === name)?.[1];

export function viewOf(items: FieldItems): FieldView {
  const v = Object.fromEntries(SCALARS.map((k) => [k, shown(first(items, k))])) as Record<Scalar, string>;
  return {
    ...v, mandatory: items.some(([n, val]) => n === 'mandatory' && val === 'on'),
    options: items.filter(([n, val]) => n === 'option' && val.trim() !== '').map(([, val]) => val),
    defaultoptions: items.filter(([n, val]) => n === 'defaultoption' && val.trim() !== '').map(([, val]) => val),
  };
}

/** Index to insert a new element so the field keeps the web's element order. */
function insertAt(items: FieldItems, name: string): number {
  const rank = CANON.indexOf(name);
  let at = 0;
  items.forEach(([n], i) => { const r = CANON.indexOf(n); if (r !== -1 && r <= rank) at = i + 1; });
  return at;
}

/** A list element (option / defaultoption): keep the blank entries the web wrote around the real ones. */
function replaceList(items: FieldItems, name: string, values: string[]): FieldItems {
  const old = items.filter(([n]) => n === name).map(([, v]) => v);
  const real = old.map((v) => v.trim() !== '');
  const firstReal = real.indexOf(true);
  let seq: string[];
  if (firstReal === -1) {
    // only blanks were saved (a fresh web field): the web keeps one blank before the typed values
    seq = values.length ? [...old.slice(0, Math.min(1, old.length)), ...values] : old;
  } else {
    const lastReal = real.lastIndexOf(true);
    seq = [...old.slice(0, firstReal), ...values, ...old.slice(lastReal + 1)];
  }
  const pos = items.findIndex(([n]) => n === name);
  const rest = items.filter(([n]) => n !== name);
  const at = pos === -1 ? insertAt(rest, name) : items.slice(0, pos).filter(([n]) => n !== name).length;
  return [...rest.slice(0, at), ...seq.map((v): [string, string] => [name, v]), ...rest.slice(at)];
}

/** Writes the edited view back, changing only what differs from the saved field. */
export function applyView(items: FieldItems, view: FieldView): FieldItems {
  const before = viewOf(items);
  let out: FieldItems = items.map(([n, v]) => [n, v]);
  for (const k of SCALARS) {
    if (view[k] === before[k]) continue;
    const i = out.findIndex(([n]) => n === k);
    if (i >= 0) out[i] = [k, view[k]];
    else { const at = insertAt(out, k); out.splice(at, 0, [k, view[k]]); }
  }
  if (view.mandatory !== before.mandatory) {
    if (view.mandatory) {
      const i = out.findIndex(([n]) => n === 'mandatory');
      if (i >= 0) out[i] = ['mandatory', 'on'];
      else out.splice(insertAt(out, 'mandatory'), 0, ['mandatory', 'on']);
    } else out = out.filter(([n]) => n !== 'mandatory');
  }
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(view.options, before.options)) out = replaceList(out, 'option', view.options.filter((o) => o.trim() !== ''));
  if (!same(view.defaultoptions, before.defaultoptions)) out = replaceList(out, 'defaultoption', view.defaultoptions.filter((o) => o.trim() !== ''));
  return out;
}

/** The web's own checks on save (title, description), plus a title on every field (the field app needs one). */
export function problemsOf(title: string, description: string, fields: FieldItems[]): string | null {
  if (!title.trim()) return 'Form title missing';
  if (!description.trim()) return 'Form description missing';
  for (let i = 0; i < fields.length; i++) {
    const v = viewOf(fields[i]);
    if (!v.title.trim()) return `Field ${i + 1} needs a title`;
  }
  return null;
}
