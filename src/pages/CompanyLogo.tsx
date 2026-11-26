import { useEffect, useRef, useState } from 'react';
import { App as AntApp, Button, Popconfirm, Segmented, Space } from 'antd';
import { DeleteOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { describeError } from '../api/messages';
import { asAppError, useSession } from '../session';
import { saveBrand, savedBrand, shrinkLogo } from './signInMemory';
import { LOOKS, LogoImage, useLogoLook, type LogoLook } from '../ui/LogoImage';

/** The company logo shown on the sign-in screen. Administrators can change or remove it. */
export default function CompanyLogo({ company, admin }: { company: string; admin: boolean }) {
  const { api, report } = useSession();
  const { message } = AntApp.useApp();
  const [logo, setLogo] = useState(() => savedBrand(company)?.logo ?? '');
  const [busy, setBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const [look, setLook] = useLogoLook(company);

  useEffect(() => {
    let live = true;
    api.fetchBrand(company).then((b) => { if (live) { setLogo(b.logo || ''); saveBrand(company, b); } }).catch(() => { /* keep the saved one */ });
    return () => { live = false; };
  }, [api, company]);

  const store = async (data: string) => {
    setBusy(true);
    try {
      const res = await api.saveBrand(data);
      setLogo(res.logo); saveBrand(company, { company, logo: res.logo });
      void message.success(res.message);
    } catch (e) {
      const d = describeError(asAppError(e)); void message.error(`${d.title}. ${d.text}`); report(e);
    } finally { setBusy(false); }
  };
  const chosen = async (file?: File) => {
    if (!file) return;
    try { await store(await shrinkLogo(file)); } catch (e) { void message.error(e instanceof Error ? e.message : 'The image could not be used.'); }
  };

  return (
    <div className="logo-setting">
      <div className="logo-preview">{logo ? <LogoImage src={logo} look={look} /> : <span className="muted"><PictureOutlined /> No logo yet</span>}</div>
      {admin ? (
        <Space wrap>
          <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" hidden
            onChange={(e) => { void chosen(e.target.files?.[0]); e.target.value = ''; }} />
          <Button type="primary" icon={<UploadOutlined />} loading={busy} onClick={() => pick.current?.click()}>{logo ? 'Change logo' : 'Upload logo'}</Button>
          {logo && (
            <Popconfirm title="Remove the company logo?" description="The sign-in screen will show no logo." okText="Remove" onConfirm={() => void store('')}>
              <Button icon={<DeleteOutlined />} disabled={busy}>Remove</Button>
            </Popconfirm>
          )}
          <span className="muted">PNG, JPEG or WebP. It is resized to fit automatically.</span>
        </Space>
      ) : <span className="muted">Only administrators can change the logo.</span>}
      {logo && (
        <div className="logo-look">
          <span className="muted">How the logo looks on this computer (it follows the colour theme you pick):</span>
          <Segmented value={look} onChange={(v) => setLook(v as LogoLook)} options={LOOKS.map((l) => ({ value: l.value, label: <span title={l.hint}>{l.label}</span> }))} />
          <span className="muted" style={{ fontSize: 12 }}>{LOOKS.find((l) => l.value === look)?.hint}</span>
        </div>
      )}
    </div>
  );
}
