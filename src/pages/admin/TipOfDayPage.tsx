import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { BulbOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import type { TipPayload } from '../../api/types';
import { Panel } from '../../ui/parts';
import SetupFrame from './SetupFrame';
import { useSetup } from './useSetup';

type Props = { classicPath: string; openClassic: (p: string) => void };

/** Tip Of The Day: the field app's start-of-day lines and tip, plus the help contacts shown in the app. */
export default function TipOfDayPage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<TipPayload>('tip_of_day');
  return (
    <SetupFrame q={q} title="Tip Of The Day" meta="Shown to reps when they start the day, and on the desktop sign-in screen"
      classicPath={classicPath} openClassic={openClassic}>
      {(d) => <TipBody d={d} save={save} busy={busy} />}
    </SetupFrame>
  );
}

function TipBody({ d, save, busy }: { d: TipPayload; save: ReturnType<typeof useSetup<TipPayload>>['save']; busy: string | null }) {
  const [tip, setTip] = useState({ line1: d.line1, line2: d.line2, line3: d.line3, tip: d.tip });
  const [help, setHelp] = useState({ play_services: d.play_services, google_map: d.google_map, whatsapp: d.whatsapp, group_link: d.group_link, notes: d.notes });
  useEffect(() => {
    setTip({ line1: d.line1, line2: d.line2, line3: d.line3, tip: d.tip });
    setHelp({ play_services: d.play_services, google_map: d.google_map, whatsapp: d.whatsapp, group_link: d.group_link, notes: d.notes });
  }, [d]);
  const tipDirty = tip.line1 !== d.line1 || tip.line2 !== d.line2 || tip.line3 !== d.line3 || tip.tip !== d.tip;
  const helpDirty = JSON.stringify(help) !== JSON.stringify({ play_services: d.play_services, google_map: d.google_map, whatsapp: d.whatsapp, group_link: d.group_link, notes: d.notes });
  const linkBad = !!help.group_link.trim() && !help.group_link.trim().startsWith('https://');
  const setNote = (i: number, k: 'h' | 'p', v: string) => setHelp({ ...help, notes: help.notes.map((n, j) => (j === i ? { ...n, [k]: v } : n)) });
  return (
    <div className="admin-grid two">
      <Panel title="Tip of the day" sub="These lines are the same for every company on RocketSales.">
        <Alert type="info" showIcon style={{ marginBottom: 14 }} title="Use {Name} in line 1 to greet each rep by name." />
        <Form layout="vertical">
          <Form.Item label="Line 1"><Input value={tip.line1} maxLength={200} onChange={(e) => setTip({ ...tip, line1: e.target.value })} placeholder="Good morning {Name}" /></Form.Item>
          <Form.Item label="Line 2"><Input value={tip.line2} maxLength={200} onChange={(e) => setTip({ ...tip, line2: e.target.value })} /></Form.Item>
          <Form.Item label="Line 3"><Input value={tip.line3} maxLength={200} onChange={(e) => setTip({ ...tip, line3: e.target.value })} /></Form.Item>
          <Form.Item label="Tip"><Input.TextArea value={tip.tip} autoSize={{ minRows: 4, maxRows: 10 }} maxLength={5000} onChange={(e) => setTip({ ...tip, tip: e.target.value })} /></Form.Item>
        </Form>
        <div className="tip-preview">
          <span className="tip-preview-icon"><BulbOutlined /></span>
          <div>
            {tip.line1 && <b>{tip.line1.replace('{Name}', 'Asha')}</b>}
            {tip.tip && <p>{tip.tip}</p>}
            {[tip.line2, tip.line3].filter(Boolean).map((l, i) => <small key={i}>{l}</small>)}
          </div>
        </div>
        <div className="admin-row"><span className="grow" />
          <Button type="primary" icon={<SaveOutlined />} disabled={!tipDirty} loading={busy === 'tip'}
            onClick={() => void save('tip', { ...tip, base: d.base })}>Save tip</Button>
        </div>
      </Panel>

      <Panel title="Help in the field app" sub="Contacts and short help notes the app shows. The WhatsApp group link is only for this company.">
        <Form layout="vertical">
          <div className="form-two">
            <Form.Item label="WhatsApp contact"><Input value={help.whatsapp} maxLength={100} onChange={(e) => setHelp({ ...help, whatsapp: e.target.value })} /></Form.Item>
            <Form.Item label="This company's WhatsApp group link" validateStatus={linkBad ? 'error' : ''} help={linkBad ? 'Start the link with https://' : undefined}>
              <Input value={help.group_link} maxLength={500} onChange={(e) => setHelp({ ...help, group_link: e.target.value })} placeholder="https://chat.whatsapp.com/..." />
            </Form.Item>
            <Form.Item label="Google Play services"><Input value={help.play_services} maxLength={500} onChange={(e) => setHelp({ ...help, play_services: e.target.value })} /></Form.Item>
            <Form.Item label="Google Maps"><Input value={help.google_map} maxLength={500} onChange={(e) => setHelp({ ...help, google_map: e.target.value })} /></Form.Item>
          </div>
        </Form>
        <div className="notes-head"><b>Help notes</b><Button size="small" icon={<PlusOutlined />} onClick={() => setHelp({ ...help, notes: [...help.notes, { h: '', p: '' }] })}>Note</Button></div>
        {help.notes.map((n, i) => (
          <div key={i} className="note-edit">
            <Input placeholder="Heading" value={n.h} maxLength={200} onChange={(e) => setNote(i, 'h', e.target.value)} />
            <Input.TextArea placeholder="Help text" value={n.p} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} onChange={(e) => setNote(i, 'p', e.target.value)} />
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove note" onClick={() => setHelp({ ...help, notes: help.notes.filter((_, j) => j !== i) })} />
          </div>
        ))}
        {!help.notes.length && <div className="muted">No help notes.</div>}
        <div className="admin-row"><span className="muted">Notes without a heading and text are not saved.</span><span className="grow" />
          <Button type="primary" icon={<SaveOutlined />} disabled={!helpDirty || linkBad} loading={busy === 'help'}
            onClick={() => void save('help', { ...help, base: d.base })}>Save help</Button>
        </div>
      </Panel>
    </div>
  );
}
