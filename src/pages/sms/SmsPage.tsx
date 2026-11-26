import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Input, Radio, Segmented, Tooltip } from 'antd';
import { EditOutlined, HistoryOutlined, MessageOutlined, SendOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { SmsPayload } from '../../api/types';
import { AccessProvider, useAccess } from '../../access';
import { Panel } from '../../ui/parts';
import { readJson, writeJson } from '../../ui/prefsMath';
import SetupFrame from '../admin/SetupFrame';
import { useSetup } from '../admin/useSetup';
import ReportTable from '../ReportTable';
import { personal, smsSize, withLongName } from './smsMath';

const HISTORY_PATH = '/Utility/PromotionalSMSHistory';
const DRAFT = 'rs:sms-draft';
const MAX = 918; // six parts of plain text
const n = (v: number) => v.toLocaleString();

/**
 * SMSs (the web's Promotional SMS): write a message for all customers or chosen customer groups, see who it reaches
 * and how many SMS that is, and the SMS already sent. Sending is not switched on (the web page does not send either).
 */
export default function SmsPage({ classicPath, openClassic }: { classicPath: string; openClassic: (p: string) => void }) {
  const { q } = useSetup<SmsPayload>('promo_sms');
  const [tab, setTab] = useState<'write' | 'sent'>('write');
  const access = useAccess();
  return (
    <SetupFrame q={q} title="SMSs" meta="Messages to customers by SMS" classicPath={classicPath} openClassic={openClassic}
      actions={<Segmented value={tab} onChange={(v) => setTab(v as 'write' | 'sent')}
        options={[{ value: 'write', label: 'Write', icon: <EditOutlined /> }, { value: 'sent', label: 'Sent SMS', icon: <HistoryOutlined /> }]} />}>
      {(d) => tab === 'write' ? <Write d={d} openClassic={openClassic} classicPath={classicPath} /> : (
        <AccessProvider access={access} path={HISTORY_PATH}>
          <ReportTable name="sms_history" noun="messages" classicPath={HISTORY_PATH} openClassic={openClassic} />
        </AccessProvider>
      )}
    </SetupFrame>
  );
}

interface Draft { text: string; all: boolean; groups: string[] }

function Write({ d, classicPath, openClassic }: { d: SmsPayload; classicPath: string; openClassic: (p: string) => void }) {
  const [draft, setDraftRaw] = useState<Draft>(() => readJson<Draft>(DRAFT, { text: '', all: true, groups: [] },
    (v) => !!v && typeof (v as Draft).text === 'string' && Array.isArray((v as Draft).groups)));
  const setDraft = (x: Draft) => { setDraftRaw(x); writeJson(DRAFT, x); };
  const box = useRef<TextAreaRef>(null);
  const known = new Set(d.groups.map((g) => g.name));
  const chosen = draft.groups.filter((g) => known.has(g));
  const reach = useMemo(() => (draft.all ? d.all : d.groups.filter((g) => chosen.includes(g.name))
    .reduce((a, g) => ({ customers: a.customers + g.customers, with_phone: a.with_phone + g.with_phone }), { customers: 0, with_phone: 0 })), [draft.all, d, chosen]);
  const size = smsSize(draft.text);
  const longest = smsSize(withLongName(draft.text, d.placeholder));
  const preview = personal(draft.text, d.placeholder, d.sample_name || 'Customer name');

  const insertName = () => {
    const el = box.current?.resizableTextArea?.textArea;
    const at = el ? el.selectionStart : draft.text.length;
    const end = el ? el.selectionEnd : at;
    setDraft({ ...draft, text: (draft.text.slice(0, at) + d.placeholder + draft.text.slice(end)).slice(0, MAX) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + d.placeholder.length, at + d.placeholder.length); });
  };

  return (
    <div className="call">
      <div>
        <Panel title="Who gets it" sub="Active customers with a phone number">
          <Radio.Group value={draft.all ? 'all' : 'groups'} onChange={(e) => setDraft({ ...draft, all: e.target.value === 'all' })}
            options={[{ value: 'all', label: `All customers (${n(d.all.with_phone)} with a phone)` }, { value: 'groups', label: 'Customer groups' }]} />
          {!draft.all && (
            !d.groups.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No customer groups yet" /> : (
              <div className="sms-groups">
                {d.groups.map((g) => (
                  <label key={g.name} className={`sms-group${chosen.includes(g.name) ? ' on' : ''}`}>
                    <Checkbox checked={chosen.includes(g.name)}
                      onChange={(e) => setDraft({ ...draft, groups: e.target.checked ? [...chosen, g.name] : chosen.filter((x) => x !== g.name) })} />
                    <span><b>{g.name}</b><small>{n(g.with_phone)} of {n(g.customers)} with a phone</small></span>
                  </label>
                ))}
              </div>
            )
          )}
        </Panel>
        <Panel title="Message" extra={<Tooltip title={`Each customer sees their own name where ${d.placeholder} is`}>
          <Button size="small" icon={<UserAddOutlined />} onClick={insertName}>Insert customer name</Button></Tooltip>}>
          <Input.TextArea ref={box} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} maxLength={MAX}
            autoSize={{ minRows: 5, maxRows: 12 }} placeholder={`For example: Dear ${d.placeholder}, our new stock has arrived. Call us to order.`} />
          <div className="sms-count">
            <span>{n(size.chars)} characters</span>
            <span>{size.parts || 0} SMS per customer{longest.parts > size.parts ? ` (up to ${longest.parts} with a long name)` : ''}</span>
            {size.unicode && <span className="warn">Special characters: {size.perPart} characters per SMS instead of 160</span>}
          </div>
        </Panel>
      </div>
      <aside className="call-card">
        <div className="call-card-head"><MessageOutlined /> SMS</div>
        <div className="sms-phone"><div className={`sms-bubble${draft.text ? '' : ' empty'}`}>{preview || 'Your message shows here'}</div>
          {draft.text.includes(d.placeholder) && d.sample_name && <small className="muted">As {d.sample_name} sees it</small>}</div>
        <dl>
          <dt><TeamOutlined /> Customers</dt>
          <dd>{n(reach.with_phone)}<small>{draft.all ? 'All active customers' : chosen.length ? `${chosen.length} group${chosen.length === 1 ? '' : 's'}` : 'No group chosen'}{reach.customers > reach.with_phone ? `, ${n(reach.customers - reach.with_phone)} without a phone are left out` : ''}</small></dd>
          <dt>SMS to send</dt><dd>{n(reach.with_phone * Math.max(size.parts, 0))}<small>{size.parts ? `${size.parts} per customer` : 'Write a message first'}</small></dd>
        </dl>
        <Tooltip title={d.can_send ? '' : d.send_note}>
          <Button type="primary" block size="large" icon={<SendOutlined />} disabled={!d.can_send}>Send SMS</Button>
        </Tooltip>
        {!d.can_send && <Alert type="info" showIcon style={{ marginTop: 12 }} title="Sending is not switched on yet"
          description={<>Your message and choices are kept on this computer. {d.gateway_ready ? 'The SMS account is set up in company settings.' : 'No SMS account is set up in company settings yet.'}
            {' '}<Button type="link" size="small" style={{ padding: 0 }} onClick={() => openClassic(classicPath)}>Open the web page</Button></>} />}
      </aside>
    </div>
  );
}
