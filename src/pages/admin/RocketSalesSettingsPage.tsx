import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, InputNumber, Select, Switch, Tag, TimePicker } from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { RsField, RsSettingsPayload } from '../../api/types';
import SetupFrame from './SetupFrame';
import { useSetup } from './useSetup';

type Props = { classicPath: string; openClassic: (p: string) => void };
type Value = boolean | string | Record<string, unknown>[];

const initial = (f: RsField): Value => (f.kind === 'checkbox' ? f.checked : f.kind === 'list' || f.kind === 'minutes' ? f.rows as Record<string, unknown>[] : f.value);
const same = (a: Value, b: Value) => JSON.stringify(a) === JSON.stringify(b);

/** RocketSales Settings: the field app's company-wide settings (the "App Setting" window of the web App Users page). */
export default function RocketSalesSettingsPage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<RsSettingsPayload>('rs_settings');
  return (
    <SetupFrame q={q} title="RocketSales Settings" meta="Field app settings for every rep in the company"
      classicPath={classicPath} openClassic={openClassic}>
      {(d) => <Body d={d} save={save} busy={busy} />}
    </SetupFrame>
  );
}

function Body({ d, save, busy }: { d: RsSettingsPayload; save: ReturnType<typeof useSetup<RsSettingsPayload>>['save']; busy: string | null }) {
  const start = useMemo(() => Object.fromEntries(d.sections.flatMap((s) => s.fields.map((f) => [f.id, initial(f)]))), [d]);
  const [values, setValues] = useState<Record<string, Value>>(start);
  const [find, setFind] = useState('');
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => setValues(start), [start]);
  const changed = Object.keys(start).filter((k) => !same(values[k], start[k]));
  const set = (id: string, v: Value) => setValues((x) => ({ ...x, [id]: v }));
  const match = (f: RsField) => !find || f.label.toLowerCase().includes(find.toLowerCase());
  const sections = d.sections.map((s, i) => ({ ...s, i, shown: s.fields.filter((f) => f.kind !== 'hidden' && match(f)) }));

  return (
    <div className="rs">
      <aside className="rs-nav">
        <Input.Search allowClear placeholder="Find a setting" value={find} onChange={(e) => setFind(e.target.value)} />
        {sections.map((s) => (
          <button key={s.i} type="button" className={`rs-nav-item${active === s.i ? ' sel' : ''}`} disabled={!s.shown.length}
            onClick={() => { setActive(s.i); refs.current[s.i]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            <span>{s.title}</span>
            {s.fields.some((f) => changed.includes(f.id)) ? <Tag color="orange" bordered={false}>changed</Tag> : <small>{s.shown.length}</small>}
          </button>
        ))}
      </aside>
      <div className="rs-main">
        {sections.every((s) => !s.shown.length) && <Empty description="No settings match" />}
        {sections.filter((s) => s.shown.length).map((s) => (
          <section key={s.i} className="rs-section" ref={(el) => { refs.current[s.i] = el; }}>
            <h3>{s.title}</h3>
            <div className="rs-fields">
              {s.shown.map((f) => <FieldEdit key={f.id} f={f} v={values[f.id]} changed={changed.includes(f.id)} onChange={(v) => set(f.id, v)} />)}
            </div>
          </section>
        ))}
      </div>
      <footer className="rs-foot">
        <span className="muted">{changed.length ? `${changed.length} setting${changed.length === 1 ? '' : 's'} changed, not saved` : 'No changes'}</span>
        <Button icon={<UndoOutlined />} disabled={!changed.length} onClick={() => setValues(start)}>Discard</Button>
        <Button type="primary" icon={<SaveOutlined />} disabled={!changed.length} loading={busy === 'all'}
          onClick={() => void save('all', { values, base: d.base })}>Save settings</Button>
      </footer>
    </div>
  );
}

function FieldEdit({ f, v, changed, onChange }: { f: RsField; v: Value; changed: boolean; onChange: (v: Value) => void }) {
  const cls = `rs-field ${f.kind}${changed ? ' changed' : ''}`;
  if (f.kind === 'checkbox') {
    return <label className={cls}><Switch size="small" checked={v === true} onChange={onChange} /><span>{f.label}</span></label>;
  }
  if (f.kind === 'list') {
    const rows = (v as Record<string, string>[]) ?? [];
    const blank = Object.fromEntries(f.columns.map((c) => [c.name, '']));
    return (
      <div className={`${cls} wide`}>
        <div className="rs-label">{f.label}</div>
        {rows.map((r, i) => (
          <div key={i} className="rs-list-row">
            {f.columns.map((c) => (
              <Input key={c.name} placeholder={c.label} value={String(r[c.name] ?? '')} type={c.type === 'number' ? 'number' : 'text'} maxLength={300}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.name]: e.target.value } : x)))} />
            ))}
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          </div>
        ))}
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...rows, blank])}>Add</Button>
      </div>
    );
  }
  if (f.kind === 'minutes') {
    const rows = (v as { key: string; label: string; value: number }[]) ?? [];
    return (
      <div className={`${cls} wide`}>
        <div className="rs-label">{f.label}</div>
        <div className="rs-minutes">
          {rows.map((r, i) => (
            <label key={r.key}>{r.label || r.key}
              <InputNumber min={0} value={r.value} suffix="min" onChange={(n) => onChange(rows.map((x, j) => (j === i ? { ...x, value: n ?? 0 } : x)))} />
            </label>
          ))}
        </div>
      </div>
    );
  }
  const text = String(v ?? '');
  let input;
  if (f.kind === 'select') {
    input = <Select value={text} options={f.options} onChange={(x: string) => onChange(x)} showSearch={f.options.length > 8} optionFilterProp="label" />;
  } else if (f.kind === 'textarea') {
    input = <Input.TextArea value={text} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={5000} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.kind === 'time') {
    const t = /^\d{1,2}:\d{2}/.test(text) ? dayjs(`2000-01-01T${text.padStart(5, '0').slice(0, 5)}`) : null;
    input = <TimePicker format="HH:mm" value={t?.isValid() ? t : null} onChange={(x) => onChange(x ? x.format('HH:mm') : '')} />;
  } else if (f.kind === 'number') {
    input = <InputNumber style={{ width: '100%' }} value={text === '' ? null : Number(text)} min={f.min ? Number(f.min) : undefined}
      max={f.max ? Number(f.max) : undefined} step={f.step ? Number(f.step) : undefined} onChange={(n) => onChange(n == null ? '' : String(n))} />;
  } else {
    input = <Input value={text} placeholder={'placeholder' in f ? f.placeholder : undefined} maxLength={5000} onChange={(e) => onChange(e.target.value)} />;
  }
  return <label className={`${cls}${f.kind === 'textarea' ? ' wide' : ''}`}><span className="rs-label">{f.label}</span>{input}</label>;
}
