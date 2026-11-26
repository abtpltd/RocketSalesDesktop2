import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntApp, AutoComplete, Button, Checkbox, Empty, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Switch, Tag, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CloudDownloadOutlined, CopyOutlined, DeleteOutlined, FilePdfOutlined, FileImageOutlined, FilePptOutlined, FontSizeOutlined, LockOutlined, PictureOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, ShareAltOutlined, StarFilled, StarOutlined, SnippetsOutlined, UploadOutlined } from '@ant-design/icons';
import { toJpeg } from 'html-to-image';
import { useSession } from '../session';
import type { SessionInfo } from '../api/types';
import SlideView from './SlideView';
import StyleEditor from './StyleEditor';
import { BackupError, backupName, isLocked, packDecks, planImport, textToBase64, unpackDecks } from './backup';
import { deckToPdf, fileName } from './exportPdf';
import { deckToPptx } from './exportPptx';
import { usePresent } from './PresentProvider';
import { AUDIENCES, LAYOUTS, TEMPLATES, bodyStyle, capacity, changeLayout, clampSeconds, deckFromTemplate, duplicateDeck, duplicateSlide, hiddenCount, moveSlide, newDeck, newId, newSlide,
  removeSlide, today, type Brand, type Deck, type LayoutId, type Slide, type TextStyle } from './model';
import { logoFromFile } from './brand';
import { browserLast, runAutoBackup, secretName } from './autobackup';
import { asStatic, copiesOf, deckBadge, fillAgenda, freezeCopy, resolveCompare } from './modes';
import { audiences, filterDecks, folders, noFilter, recentDecks, sortDecks, type Filter } from './organise';
import { useDeckStore } from './useDeckStore';


/** My presentations: make decks, edit slides (titles, text, fonts, layouts, pictures), play full screen, save as PDF or picture. */
/** A password question for saving or opening a presentations file. `optional`: saving may be left unlocked. */
function PasswordModal({ open, title, intro, optional, onCancel, onOk, staticChoice }: {
  open: boolean; title: string; intro: string; optional: boolean; onCancel: () => void; onOk: (password: string, asStatic: boolean) => void; staticChoice?: boolean;
}) {
  const [lock, setLock] = useState(!optional);
  const [pw, setPw] = useState('');
  const [asStaticFile, setAsStaticFile] = useState(true);
  useEffect(() => { if (open) { setLock(!optional); setPw(''); setAsStaticFile(true); } }, [open, optional]);
  return (
    <Modal open={open} title={title} onCancel={onCancel} className="present-ui" okText="Continue" okButtonProps={{ disabled: lock && pw.length < 4 }}
      onOk={() => onOk(lock ? pw : '', asStaticFile)}>
      <p>{intro}</p>
      {staticChoice && <Checkbox checked={asStaticFile} onChange={(e) => setAsStaticFile(e.target.checked)} style={{ marginBottom: 10, display: 'block' }}>Share as static: the pictures stay as they are today and never refresh for the person who opens it (recommended)</Checkbox>}
      {optional && <Checkbox checked={lock} onChange={(e) => setLock(e.target.checked)} style={{ marginBottom: 8 }}>Lock the file with a password</Checkbox>}
      {lock && <>
        <Input.Password aria-label="Password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password (at least 4 characters)" autoFocus />
        {optional && <p className="muted" style={{ marginTop: 8 }}>Write the password down. Nobody, including RocketSales, can open the file without it.</p>}
      </>}
    </Modal>
  );
}

/** My presentations: make decks, edit slides (titles, text, fonts, layouts, pictures), play full screen, save as PDF, PowerPoint or picture. */
export default function PresentationsPage({ info }: { info: SessionInfo }) {
  const { api } = useSession();
  const { message } = AntApp.useApp();
  const store = useDeckStore(info);
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(lastOpened.get(info.user.email) ?? null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');
  const [filter, setFilter] = useState<Filter>(noFilter());
  const [save, setSave] = useState<{ title: string; decks: Deck[]; file: string; single: boolean } | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const secret = secretName(info.company.domain, info.user.email);
  const last = useMemo(() => browserLast(`present-autobackup|${info.company.domain}|${info.user.email}`.toLowerCase()), [info.company.domain, info.user.email]);
  const reload = useCallback(() => { void store.list().then(setDecks).catch(() => setDecks([])); }, [store]);
  useEffect(reload, [reload]);
  useEffect(() => { const on = () => reload(); window.addEventListener('present-deck', on); return () => window.removeEventListener('present-deck', on); }, [reload]); // a show updated a deck
  const { play: playDeck } = usePresent();
  const choose = async (id: string | null) => {
    setOpenId(id);
    if (id) {
      lastOpened.set(info.user.email, id);
      const d = decks?.find((x) => x.id === id);
      if (d) await store.save({ ...d, lastOpened: new Date().toISOString() }).catch(() => undefined);
    } else lastOpened.delete(info.user.email);
  };
  const closed = () => { void choose(null); reload(); void runAutoBackup(api, store, secret, last).then((o) => { if (o.kind === 'failed') message.warning(`The automatic backup could not be saved: ${o.error}`); }); };

  const open = decks?.find((d) => d.id === openId);
  if (open) return <Editor key={open.id} deck={open} store={store} api={api} folderNames={folders(decks ?? [])} onBack={closed} />;

  const create = async () => {
    const t = TEMPLATES.find((x) => x.id === template);
    let d = t ? deckFromTemplate(t, name || undefined) : newDeck(name);
    for (const sl of d.slides) if (sl.layout === 'agenda') d = fillAgenda(d, sl.id);
    await store.save(d); setName(''); setDecks(await store.list()); void choose(d.id);
  };
  const writeFile = async (password: string, asStaticFile: boolean) => {
    if (!save) return;
    try {
      const out = save.single && asStaticFile ? save.decks.map((d) => asStatic(d)) : save.decks;
      const where = await api.saveDownload(backupName(save.file), textToBase64(await packDecks(out, password)));
      message.success(`Saved: ${where}`); setSave(null);
    } catch { message.error('Could not save the file.'); }
  };
  /** Adds the decks in a file text. Returns false when it failed for good, 'retry' when only the password was wrong. */
  const importText = async (text: string, password: string): Promise<boolean | 'retry'> => {
    try {
      const incoming = await unpackDecks(text, password);
      const { add, skipped } = planImport(decks ?? [], incoming);
      for (const d of add) await store.save(d);
      reload();
      message.success(`${add.length} presentation${add.length === 1 ? '' : 's'} added${skipped ? `, ${skipped} already here` : ''}.`);
      return true;
    } catch (e) {
      message.error(e instanceof BackupError ? e.message : 'Could not open this file.');
      return e instanceof BackupError && e.code === 'wrong_password' ? 'retry' : false;
    }
  };
  const readFile = async (password: string) => { if (fileText !== null && (await importText(fileText, password)) !== 'retry') setFileText(null); };
  const picked = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    if (isLocked(text)) setFileText(text); else await importText(text, '');
  };
  const pin = async (d: Deck) => { await store.save({ ...d, pinned: !d.pinned }); reload(); };

  const all = decks ?? [];
  const shown = sortDecks(filterDecks(all, filter));
  const recent = recentDecks(all.filter((d) => !d.frozenFrom));
  const filtering = !!(filter.q || filter.audience || filter.folder || filter.periodKind || filter.showCopies);
  const audienceOptions = [...new Set([...AUDIENCES, ...audiences(all)])].map((a) => ({ value: a, label: a }));

  return (
    <div className="present-ui" style={{ maxWidth: 980 }}>
      <h2 style={{ marginTop: 0 }}>Presentations</h2>
      <p className="muted">Build your own slides from your dashboard cards, charts, tables and grids. Use <b>Add to presentation</b> in the top bar on any page to pick what goes in.
        A <b>Latest</b> presentation retakes its pictures from their pages when you present, so the numbers are current. A <b>Static</b> one never changes. Presentations are kept on this computer, for you only.</p>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select aria-label="Start from" value={template} onChange={setTemplate} style={{ width: 240 }}
          options={[{ value: 'blank', label: 'Blank presentation' }, ...TEMPLATES.map((t) => ({ value: t.id, label: t.name }))]} />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" maxLength={80} onPressEnter={() => void create()} style={{ width: 240 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => void create()}>Create</Button>
        <span style={{ width: 12 }} />
        <Button icon={<UploadOutlined />} onClick={() => fileInput.current?.click()}>Open a file</Button>
        <Button icon={<CloudDownloadOutlined />} disabled={!all.length} onClick={() => setSave({ title: 'Back up all presentations', decks: all, file: `RocketSales-presentations-${today()}`, single: false })}>Back up all</Button>
        <Button icon={<SettingOutlined />} onClick={() => setBackupOpen(true)}>Automatic backup</Button>
        <input ref={fileInput} type="file" accept=".rspres,.json,application/json" style={{ display: 'none' }} aria-label="Presentations file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void picked(f); }} />
      </Space>
      {template !== 'blank' && <p className="muted" style={{ marginTop: -4 }}>{TEMPLATES.find((t) => t.id === template)?.about} Add your own cards and charts with <b>Add to presentation</b>.</p>}

      {all.length > 0 && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Input.Search aria-label="Search presentations" allowClear placeholder="Search name, audience, period, folder or tag" style={{ width: 320 }}
            value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <Select aria-label="Audience" allowClear placeholder="Audience" style={{ width: 170 }} value={filter.audience || undefined} onChange={(v) => setFilter({ ...filter, audience: v ?? '' })} options={audienceOptions} />
          <Select aria-label="Folder" allowClear placeholder="Folder" style={{ width: 170 }} value={filter.folder || undefined} onChange={(v) => setFilter({ ...filter, folder: v ?? '' })}
            options={folders(all).map((f) => ({ value: f, label: f }))} />
          <Select aria-label="Period" allowClear placeholder="Weekly or monthly" style={{ width: 170 }} value={filter.periodKind || undefined} onChange={(v) => setFilter({ ...filter, periodKind: v ?? '' })}
            options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
          <Checkbox checked={filter.showCopies} onChange={(e) => setFilter({ ...filter, showCopies: e.target.checked })}>Show frozen copies</Checkbox>
        </Space>
      )}
      {!filtering && recent.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span className="muted" style={{ marginRight: 8 }}>Recent</span>
          <Space wrap>{recent.map((d) => <Button key={d.id} size="small" onClick={() => void choose(d.id)}>{d.name}</Button>)}</Space>
        </div>
      )}
      {decks === null ? <p className="muted">Loading…</p> : all.length === 0 ? <Empty description="No presentations yet" /> : shown.length === 0 ? <Empty description="No presentation matches" /> : (
        <div className="panel flush">
          {shown.map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
              <Tooltip title={d.pinned ? 'Unpin' : 'Pin to the top'}>
                <Button type="text" aria-label={`${d.pinned ? 'Unpin' : 'Pin'} ${d.name}`} aria-pressed={d.pinned} icon={d.pinned ? <StarFilled style={{ color: '#e0a100' }} /> : <StarOutlined />} onClick={() => void pin(d)} />
              </Tooltip>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{d.name}</b>
                <div style={{ margin: '2px 0' }}>
                  <Tag color={d.mode === 'static' ? 'gold' : 'blue'}>{d.mode === 'static' ? 'STATIC' : 'LATEST'}</Tag>
                  {d.frozenFrom && <Tag>{d.auto ? 'Automatic copy' : 'Frozen copy'} · {d.frozenOn}</Tag>}
                  {d.audience && <Tag>{d.audience}</Tag>}
                  {d.period && <Tag>{d.period}</Tag>}
                  {d.folder && <Tag icon={<SnippetsOutlined />}>{d.folder}</Tag>}
                  {d.tags.map((t) => <Tag key={t}>{t}</Tag>)}
                </div>
                <div className="muted">{d.slides.length} slide{d.slides.length === 1 ? '' : 's'} · changed {d.updatedOn}</div>
              </div>
              <Button type="primary" icon={<PlayCircleOutlined />} disabled={d.slides.length === 0} aria-label={`Present ${d.name}`} onClick={() => playDeck(d, 0)}>Present</Button>
              <Button onClick={() => void choose(d.id)}>Edit</Button>
              <Button icon={<ShareAltOutlined />} aria-label={`Share ${d.name} as a file`} title="Share as a file" onClick={() => setSave({ title: `Share “${d.name}” as a file`, decks: [d], file: d.name, single: true })} />
              <Button icon={<CopyOutlined />} aria-label={`Copy ${d.name}`} onClick={async () => { await store.save(duplicateDeck(d)); reload(); }} />
              <Popconfirm title="Delete this presentation?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={async () => { await store.remove(d.id); reload(); message.success('Deleted'); }}>
                <Button danger icon={<DeleteOutlined />} aria-label={`Delete ${d.name}`} />
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
      <PasswordModal open={!!save} title={save?.title ?? ''} optional staticChoice={!!save?.single} onCancel={() => setSave(null)} onOk={(pw, st) => void writeFile(pw, st)}
        intro={save?.single
          ? 'This saves a file you can send to a colleague. They open it with “Open a file” and get their own copy. A file cannot stop them changing their copy, and it holds the pictures as they are now, so share it only with people who may see these figures.'
          : 'This saves all your presentations in one file. Keep it somewhere safe: it lets you restore them after a reinstall or on another computer.'} />
      <PasswordModal open={fileText !== null && isLocked(fileText)} title="This file is locked" optional={false} intro="Enter the password it was saved with."
        onCancel={() => setFileText(null)} onOk={(pw) => void readFile(pw)} />
      <BackupPanel open={backupOpen} onClose={() => setBackupOpen(false)} secret={secret} store={store} last={last} />
    </div>
  );
}

/** Automatic local backup: set the password once; a locked copy is saved when a presentation is closed (at most once a day). */
function BackupPanel({ open, onClose, secret, store, last }: { open: boolean; onClose: () => void; secret: string; store: ReturnType<typeof useDeckStore>; last: ReturnType<typeof browserLast> }) {
  const { api } = useSession();
  const { message } = AntApp.useApp();
  const [has, setHas] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [where, setWhere] = useState('');
  useEffect(() => { if (open) { setPw(''); setHas(null); void api.backupSecret(secret).then((v) => setHas(!!v)).catch(() => setHas(false)); } }, [open, api, secret]);
  return (
    <Modal open={open} title="Automatic backup" onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} className="present-ui">
      <p>When you close a presentation, the app saves all your presentations to a <b>locked file</b> in your Documents folder (<code>RocketSales\Presentations</code>), at most once a day. The newest 5 files are kept.
        The folder is outside the app, so a reinstall does not remove it. To restore, use <b>Open a file</b> and enter the password.</p>
      <p className="muted">{has === null ? 'Checking…' : has ? 'A password is set. Last saved: ' + (last.get() || 'not yet') + '.' : 'No password is set, so no automatic backup is made.'}</p>
      <Space.Compact style={{ width: '100%' }}>
        <Input.Password aria-label="Backup password" value={pw} onChange={(e) => setPw(e.target.value)} prefix={<LockOutlined />} placeholder={has ? 'New password (to change it)' : 'Choose a password (at least 4 characters)'} />
        <Button type="primary" disabled={pw.length < 4} onClick={async () => { await api.setBackupSecret(secret, pw); setPw(''); setHas(true); message.success('Password saved on this computer.'); }}>{has ? 'Change' : 'Turn on'}</Button>
      </Space.Compact>
      <p className="muted" style={{ marginTop: 8 }}>Write the password down. It is kept in Windows Credential Manager on this computer. Without it a backup cannot be opened, and nobody, including RocketSales, can recover it.</p>
      <Space>
        <Button disabled={!has} onClick={async () => {
          const o = await runAutoBackup(api, store, secret, last, { force: true });
          if (o.kind === 'saved') { setWhere(o.path); message.success('Backup saved.'); } else if (o.kind === 'failed') message.error(o.error); else message.info('There is nothing to back up yet.');
        }}>Back up now</Button>
        {has && <Button danger onClick={async () => { await api.setBackupSecret(secret, null); setHas(false); message.success('Automatic backup turned off.'); }}>Turn off</Button>}
      </Space>
      {where && <p className="muted" style={{ marginTop: 8 }}>Saved: {where}</p>}
    </Modal>
  );
}

const lastOpened = new Map<string, string>(); // the deck open when the page was left (the show visits other pages), per person

function Editor({ deck: initial, store, api, folderNames, onBack }: { deck: Deck; store: ReturnType<typeof useDeckStore>; api: ReturnType<typeof useSession>['api']; folderNames: string[]; onBack: () => void }) {
  const { message } = AntApp.useApp();
  const [deck, setDeck] = useState(initial);
  const [at, setAt] = useState(0);
  const [sel, setSel] = useState<string>('title');
  const { play, refreshNow } = usePresent();
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(640);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = stage.current; if (!el) return;
    const ro = new ResizeObserver(() => setStageW(Math.max(320, Math.min(900, el.clientWidth - 8))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const change = (next: Deck) => {
    const d = { ...next, updatedOn: today() };
    setDeck(d);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void store.save(d).catch(() => message.error('Could not save this presentation on this computer.')), 400);
  };
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);
  // a show that retook the live pictures saved the deck: take its pictures in, so the next edit does not bring the old ones back
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<Deck>).detail; if (d && d.id === initial.id) setDeck(d); };
    window.addEventListener('present-deck', on);
    return () => window.removeEventListener('present-deck', on);
  }, [initial.id]);

  const slide = deck.slides[Math.min(at, deck.slides.length - 1)];
  const setSlide = (s: Slide) => change({ ...deck, slides: deck.slides.map((x) => (x.id === s.id ? s : x)) });
  const block = slide.blocks.find((b) => b.id === sel);
  const L = LAYOUTS.find((l) => l.id === slide.layout)!;

  const exportPdf = async () => {
    setBusy(true);
    try {
      const nodes = [...(hidden.current?.querySelectorAll<HTMLElement>('.slide-view') ?? [])];
      const b64 = await deckToPdf(nodes);
      const where = await api.saveDownload(fileName(deck.name, 'pdf'), b64);
      message.success(`Saved: ${where}`);
    } catch { message.error('Could not make the PDF.'); } finally { setBusy(false); }
  };
  const freeze = async () => {
    const copy = freezeCopy(deck);
    try { await store.save(copy); message.success(`Saved a static copy: “${copy.name}”. It is in My presentations (tick “Show frozen copies”).`); }
    catch { message.error('Could not save the copy on this computer.'); }
  };
  const refreshHere = async () => { await store.save(deck).catch(() => undefined); await refreshNow(deck); };
  const updateComparison = async () => {
    const all = await store.list();
    const next = resolveCompare(deck, all);
    if (next === deck || JSON.stringify(next.slides) === JSON.stringify(deck.slides)) message.info(copiesOf(deck, all).length ? 'The last frozen copy has no matching picture.' : 'There is no frozen copy yet. Press “Freeze a copy” first.');
    else { change(next); message.success('Comparison updated from the last frozen copy.'); }
  };
  const exportPpt = async () => {
    setBusy(true);
    try {
      const where = await api.saveDownload(fileName(deck.name, 'pptx'), await deckToPptx(deck));
      message.success(`Saved: ${where}`);
    } catch { message.error('Could not make the PowerPoint file.'); } finally { setBusy(false); }
  };
  const exportPng = async () => {
    setBusy(true);
    try {
      const node = hidden.current?.querySelectorAll<HTMLElement>('.slide-view')[at];
      if (!node) return;
      const img = await toJpeg(node, { quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff' });
      const where = await api.saveDownload(fileName(`${deck.name}-${at + 1}`, 'jpg'), img.split(',', 2)[1] ?? '');
      message.success(`Saved: ${where}`);
    } catch { message.error('Could not save the picture.'); } finally { setBusy(false); }
  };
  const addSlide = (layout: LayoutId) => {
    const s = newSlide(layout);
    let next: Deck = { ...deck, slides: [...deck.slides.slice(0, at + 1), s, ...deck.slides.slice(at + 1)] };
    if (layout === 'agenda') next = fillAgenda(next, s.id);
    change(next); setAt(at + 1); setSel('title');
  };
  const addText = () => {
    if (slide.blocks.length >= capacity(slide.layout)) { message.info('This layout has no free place. Choose another layout, or one with more places.'); return; }
    const b = { id: newId('b'), kind: 'text' as const, text: 'Type your text here', style: bodyStyle() };
    setSlide({ ...slide, blocks: [...slide.blocks, b] }); setSel(b.id);
  };
  const styleOf = (): TextStyle | null => (sel === 'title' ? slide.titleStyle : block?.kind === 'text' ? block.style! : null);
  const setStyle = (s: TextStyle) => (sel === 'title' ? setSlide({ ...slide, titleStyle: s }) : setSlide({ ...slide, blocks: slide.blocks.map((b) => (b.id === sel ? { ...b, style: s } : b)) }));

  return (
    <div className="present-ui">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <Button onClick={onBack}>← All presentations</Button>
        <Input aria-label="Presentation name" value={deck.name} maxLength={80} style={{ width: 260 }} onChange={(e) => change({ ...deck, name: e.target.value })} />
        <span className="muted">Move on by itself every</span>
        <InputNumber aria-label="Seconds per slide" min={0} max={120} value={deck.seconds} suffix="s" style={{ width: 96 }} onChange={(n) => change({ ...deck, seconds: clampSeconds(Number(n)) })} />
        <span className="muted">(0 = by keys)</span>
        <span style={{ flex: 1 }} />
        <Button icon={<FileImageOutlined />} loading={busy} onClick={() => void exportPng()}>Save slide as picture</Button>
        <Tooltip title="Latest: live pictures are retaken from their pages when you present. Static: nothing ever changes.">
          <Segmented aria-label="Mode" value={deck.mode} onChange={(m) => change({ ...deck, mode: m as Deck['mode'] })}
            options={[{ value: 'latest', label: 'Latest' }, { value: 'static', label: 'Static' }]} />
        </Tooltip>
        <Button icon={<SettingOutlined />} onClick={() => setDetailsOpen(true)}>Details</Button>
        <Tooltip title="Saves a static copy with today's numbers. This presentation is not changed.">
          <Button icon={<SnippetsOutlined />} onClick={() => void freeze()}>Freeze a copy</Button>
        </Tooltip>
        {deck.mode === 'latest' && <Button icon={<ReloadOutlined />} onClick={() => void refreshHere()}>Refresh now</Button>}
        <Button icon={<PictureOutlined />} onClick={() => setBrandOpen(true)}>Logo and footer</Button>
        <Button icon={<FilePptOutlined />} loading={busy} onClick={() => void exportPpt()}>Save as PowerPoint</Button>
        <Button icon={<FilePdfOutlined />} loading={busy} onClick={() => void exportPdf()}>Save as PDF</Button>
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => play(deck, at)}>Present</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '176px minmax(0,1fr) 260px', gap: 14, alignItems: 'start' }}>
        <div className="panel" style={{ padding: 8, maxHeight: 'calc(100vh - 220px)', overflow: 'auto' }}>
          {deck.slides.map((s, i) => (
            <div key={s.id} role="button" tabIndex={0} aria-label={`Slide ${i + 1}`} onClick={() => { setAt(i); setSel('title'); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { setAt(i); setSel('title'); } }}
              style={{ marginBottom: 8, cursor: 'pointer', borderRadius: 6, padding: 3, border: i === at ? '2px solid var(--brand)' : '2px solid transparent' }}>
              <SlideView slide={s} width={150} deck={deck} />
              <div className="muted" style={{ textAlign: 'center' }}>{i + 1}</div>
            </div>
          ))}
          <Select placeholder="+ Add slide" aria-label="Add a slide" value={null as unknown as string} style={{ width: '100%' }} onChange={(v) => addSlide(v as LayoutId)}
            options={LAYOUTS.map((l) => ({ value: l.id, label: l.name }))} />
        </div>
        <div ref={stage} style={{ display: 'grid', justifyItems: 'center' }}>
          <div style={{ boxShadow: '0 6px 24px rgba(0,0,0,.18)', borderRadius: 4, overflow: 'hidden' }}>
            <SlideView slide={slide} width={stageW} selected={sel} onSelect={setSel} deck={deck} />
          </div>
          {hiddenCount(slide) > 0 && <p className="muted" style={{ marginTop: 8 }}>{hiddenCount(slide)} item(s) do not fit this layout and are not shown. Choose a layout with more places.</p>}
        </div>
        <div className="panel" style={{ padding: 12 }}>
          <div className="muted" style={{ marginBottom: 6 }}>Slide layout</div>
          <Select aria-label="Layout" value={slide.layout} style={{ width: '100%' }} onChange={(v) => setSlide(changeLayout(slide, v as LayoutId))} options={LAYOUTS.map((l) => ({ value: l.id, label: l.name }))} />
          {slide.layout === 'agenda' && <Button size="small" style={{ marginBottom: 8 }} onClick={() => change(fillAgenda(deck, slide.id))}>Fill from slide titles</Button>}
          {slide.layout === 'compare' && <Button size="small" style={{ marginBottom: 8 }} onClick={() => void updateComparison()}>Update comparison</Button>}
          <Space style={{ margin: '10px 0' }} wrap>
            <label className="muted">Background <input aria-label="Slide background" type="color" value={slide.bg} onChange={(e) => setSlide({ ...slide, bg: e.target.value })}
              style={{ width: 34, height: 26, padding: 1, verticalAlign: 'middle' }} /></label>
          </Space>
          <Space wrap style={{ marginBottom: 12 }}>
            <Button size="small" icon={<ArrowUpOutlined />} aria-label="Move slide up" disabled={at === 0} onClick={() => { change(moveSlide(deck, at, -1)); setAt(at - 1); }} />
            <Button size="small" icon={<ArrowDownOutlined />} aria-label="Move slide down" disabled={at >= deck.slides.length - 1} onClick={() => { change(moveSlide(deck, at, 1)); setAt(at + 1); }} />
            <Button size="small" icon={<CopyOutlined />} aria-label="Copy slide" onClick={() => { change(duplicateSlide(deck, at)); setAt(at + 1); }} />
            <Button size="small" danger icon={<DeleteOutlined />} aria-label="Delete slide" disabled={deck.slides.length <= 1} onClick={() => { change(removeSlide(deck, at)); setAt(Math.max(0, at - 1)); setSel('title'); }} />
          </Space>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div className="muted" style={{ marginBottom: 6 }}>{sel === 'title' ? 'Slide title' : block?.kind === 'text' ? 'Text' : block ? 'Picture' : 'Select something on the slide'}</div>
            {sel === 'title' && L.title && <Input aria-label="Slide title" value={slide.title} maxLength={120} onChange={(e) => setSlide({ ...slide, title: e.target.value })} style={{ marginBottom: 10 }} />}
            {block?.kind === 'text' && <Input.TextArea aria-label="Text" value={block.text} rows={4} maxLength={2000} style={{ marginBottom: 10 }}
              onChange={(e) => setSlide({ ...slide, blocks: slide.blocks.map((b) => (b.id === block.id ? { ...b, text: e.target.value } : b)) })} />}
            {block?.kind === 'image' && (
              <div style={{ marginBottom: 10 }}>
                <p className="muted" style={{ margin: '0 0 6px' }}>{block.capturedOn ? `Numbers as of ${block.capturedOn}.` : ''}</p>
                {block.live ? <>
                  <Tag color={block.frozen ? 'default' : 'blue'}>{block.frozen ? 'Kept as it is' : 'Live: refreshes when you present'}</Tag>
                  <Checkbox checked={!!block.frozen} onChange={(e) => setSlide({ ...slide, blocks: slide.blocks.map((b) => (b.id === block.id ? { ...b, frozen: e.target.checked || undefined } : b)) })}
                    style={{ display: 'block', marginTop: 6 }}>Keep this picture as it is</Checkbox>
                  <p className="muted" style={{ margin: '6px 0 0' }}>Taken again from the page “{block.live.page.replace(/^[a-z]+:/, '')}”, from the card headed “{block.live.title}”.</p>
                  {block.refreshFailedOn && <p style={{ color: '#b45309', margin: '6px 0 0' }}>On {block.refreshFailedOn} that card was not found, so this picture shows older numbers.</p>}
                </> : <Tag>Fixed picture</Tag>}
              </div>
            )}
            {styleOf() && <StyleEditor value={styleOf()!} onChange={setStyle} />}
            {block && <Button danger size="small" style={{ marginTop: 10 }} icon={<DeleteOutlined />} onClick={() => { setSlide({ ...slide, blocks: slide.blocks.filter((b) => b.id !== block.id) }); setSel('title'); }}>Remove this</Button>}
          </div>
          <Button icon={<FontSizeOutlined />} style={{ marginTop: 12, width: '100%' }} onClick={addText}>Add a text box</Button>
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 10 }}>
            <div className="muted" style={{ marginBottom: 6 }}>Speaker notes (press N while presenting)</div>
            <Input.TextArea aria-label="Speaker notes" rows={4} maxLength={5000} value={slide.notes} placeholder="What to say on this slide"
              onChange={(e) => setSlide({ ...slide, notes: e.target.value })} />
          </div>
        </div>
      </div>
      {/* every slide at full size, off screen, for the PDF and the picture */}
      <div ref={hidden} aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 960 }}>
        {deck.slides.map((s) => <SlideView key={s.id} slide={s} width={960} deck={deck} />)}
      </div>
      <DetailsModal open={detailsOpen} deck={deck} folderNames={folderNames} onClose={() => setDetailsOpen(false)} onChange={change} />
      <BrandModal open={brandOpen} brand={deck.brand} onClose={() => setBrandOpen(false)} onChange={(b) => change({ ...deck, brand: b })} />
    </div>
  );
}

/** Logo and footer line for every slide of the deck. */
function BrandModal({ open, brand, onChange, onClose }: { open: boolean; brand: Brand; onChange: (b: Brand) => void; onClose: () => void }) {
  const { message } = AntApp.useApp();
  const input = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Brand>) => onChange({ ...brand, ...p });
  return (
    <Modal open={open} title="Logo and footer" onCancel={onClose} onOk={onClose} cancelButtonProps={{ style: { display: 'none' } }} okText="Done" className="present-ui">
      <div className="muted" style={{ marginBottom: 4 }}>Footer line (left, bottom of every slide)</div>
      <Input aria-label="Footer line" value={brand.footer} maxLength={120} placeholder="Company name · Confidential" onChange={(e) => set({ footer: e.target.value })} />
      <Checkbox checked={brand.showFooter} onChange={(e) => set({ showFooter: e.target.checked })} style={{ margin: '6px 0 14px', display: 'block' }}>Show the footer</Checkbox>
      <div className="muted" style={{ marginBottom: 4 }}>Logo (right, bottom of every slide)</div>
      {brand.logo && <img src={brand.logo} alt="Logo" style={{ maxHeight: 48, maxWidth: 200, display: 'block', marginBottom: 8, border: '1px solid var(--line)', padding: 4, borderRadius: 6 }} />}
      <Space>
        <Button onClick={() => input.current?.click()}>{brand.logo ? 'Change logo' : 'Choose a logo'}</Button>
        {brand.logo && <Button danger onClick={() => set({ logo: '' })}>Remove logo</Button>}
      </Space>
      <input ref={input} type="file" accept="image/*" aria-label="Logo file" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void logoFromFile(f).then((logo) => set({ logo, showLogo: true })).catch((x: Error) => message.error(x.message)); }} />
      <Checkbox checked={brand.showLogo} onChange={(e) => set({ showLogo: e.target.checked })} style={{ marginTop: 8, display: 'block' }}>Show the logo</Checkbox>
    </Modal>
  );
}

/** Who the presentation is for, which week or month, where it is filed, and what happens to older numbers. */
function DetailsModal({ open, deck, folderNames, onChange, onClose }: { open: boolean; deck: Deck; folderNames: string[]; onChange: (d: Deck) => void; onClose: () => void }) {
  const set = (p: Partial<Deck>) => onChange({ ...deck, ...p });
  return (
    <Modal open={open} title="Details" onCancel={onClose} onOk={onClose} cancelButtonProps={{ style: { display: 'none' } }} okText="Done" className="present-ui">
      <div className="muted" style={{ marginBottom: 4 }}>Audience</div>
      <AutoComplete aria-label="Audience" value={deck.audience} onChange={(v) => set({ audience: v.slice(0, 40) })} style={{ width: '100%', marginBottom: 12 }}
        options={AUDIENCES.map((a) => ({ value: a }))} placeholder="Management, Sales managers, Sales reps, Finance and others, or your own" />
      <div className="muted" style={{ marginBottom: 4 }}>Period</div>
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Select aria-label="Weekly or monthly" value={deck.periodKind} onChange={(v) => set({ periodKind: v })} style={{ width: 150 }}
          options={[{ value: '', label: 'No period' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
        <Input aria-label="Period" value={deck.period} maxLength={40} onChange={(e) => set({ period: e.target.value })}
          placeholder={deck.periodKind === 'week' ? 'Week 43, 2026' : deck.periodKind === 'month' ? 'October 2026' : 'Optional'} />
      </Space.Compact>
      <div className="muted" style={{ marginBottom: 4 }}>Folder</div>
      <AutoComplete aria-label="Folder" value={deck.folder} onChange={(v) => set({ folder: v.slice(0, 40) })} style={{ width: '100%', marginBottom: 12 }}
        options={folderNames.map((f) => ({ value: f }))} placeholder="For example Weekly reviews" />
      <div className="muted" style={{ marginBottom: 4 }}>Tags</div>
      <Select aria-label="Tags" mode="tags" value={deck.tags} onChange={(v) => set({ tags: v.map((t) => t.slice(0, 30)).slice(0, 10) })} style={{ width: '100%', marginBottom: 14 }} open={false} tokenSeparators={[',']} placeholder="Type a tag and press Enter" />
      <div style={{ display: 'grid', gap: 8 }}>
        <label><Switch size="small" checked={deck.showMeta} onChange={(v) => set({ showMeta: v })} /> Show audience and period on the title slide</label>
        <label><Switch size="small" checked={deck.autoCopy} disabled={deck.mode === 'static'} onChange={(v) => set({ autoCopy: v })} /> Before refreshing, save a dated static copy of the older numbers</label>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>{deckBadge(deck)}</p>
    </Modal>
  );
}
