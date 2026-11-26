import { useEffect, useState } from 'react';
import { LogoImage, readLogoLook } from '../ui/LogoImage';
import { Alert, Button, Form, Input } from 'antd';
import { describeError, type Described } from '../api/messages';
import { asAppError, useSession } from '../session';
import AppLogo from '../ui/AppLogo';
import VersionStatus from '../shell/VersionStatus';
import { Copyright, SolutionInfographic, ThoughtOfTheDay } from './LoginExtras';
import { firstName, greeting, lastUser, saveBrand, savedBrand } from './signInMemory';

const LAST_COMPANY = 'last-company';
const readCompany = () => { try { return localStorage.getItem(LAST_COMPANY) ?? ''; } catch { return ''; } };

export default function Login({ notice }: { notice?: Described }) {
  const { api, login } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Described | undefined>(notice);
  const [form] = Form.useForm();
  const typed: string = Form.useWatch('company', form) ?? readCompany();
  const [company, setCompany] = useState(readCompany);
  const [hello, setHello] = useState(() => greeting());
  const [companyLogo, setLogo] = useState(() => savedBrand(readCompany())?.logo ?? '');
  const known = lastUser(company);

  // the greeting follows this computer's clock, even if the screen is left open
  useEffect(() => { const t = setInterval(() => setHello(greeting()), 60_000); return () => clearInterval(t); }, []);
  // wait until typing stops before asking for that company's logo
  useEffect(() => { const t = setTimeout(() => setCompany(typed.trim().toLowerCase()), 600); return () => clearTimeout(t); }, [typed]);
  useEffect(() => {
    let live = true;
    setLogo(savedBrand(company)?.logo ?? '');
    if (!company) return;
    api.fetchBrand(company).then((b) => { if (live && b) { setLogo(b.logo || ''); saveBrand(company, b); } }).catch(() => { /* keep the saved one */ });
    return () => { live = false; };
  }, [api, company]);

  const submit = async (v: { company: string; email: string; password: string }) => {
    setBusy(true);
    setProblem(undefined);
    try {
      await login(v.company, v.email, v.password);
      try { localStorage.setItem(LAST_COMPANY, v.company.trim().toLowerCase()); } catch { /* optional */ }
    } catch (e) {
      const err = asAppError(e);
      const d = describeError(err);
      // at sign-in there is no saved copy to talk about; say what to check instead
      setProblem(err.code === 'offline' ? {
        ...d, title: 'Cannot reach the server',
        text: 'The app could not connect to the server for this company. Check the internet connection and the company name. ' +
          'If other websites work, a firewall or proxy may be blocking the app, or this company may use a different address.',
      } : d);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <AppLogo className="login-mark" />
        <div className="login-story">
          <h2>RocketSales Pharma AI Powered SFA Solution</h2>
          <SolutionInfographic />
        </div>
        <VersionStatus />
      </div>
      <div className="login-pane"><div className="login-card">
        {companyLogo && <div className="login-logo"><LogoImage src={companyLogo} look={readLogoLook(company)} /></div>}
        <h1>{hello}</h1>
        <div className="welcome">{known?.name ? <>Welcome back, <b>{firstName(known.name)}</b></> : 'Welcome back'}</div>
        <div className="sub">Use the same email and password as the RocketSales web site.</div>
        {problem && (
          <Alert type={problem.tone === 'warning' ? 'warning' : 'error'} showIcon style={{ marginBottom: 14 }} title={problem.title}
          description={<>{problem.text}{problem.detail && <div className="muted" style={{ marginTop: 8, wordBreak: 'break-all' }}>Details: {problem.detail}</div>}</>} />
        )}
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}
          initialValues={{ company: readCompany(), email: lastUser(readCompany())?.email ?? '' }}>
          <Form.Item label="Company" name="company" rules={[{ required: true, message: 'Enter the company name' }]}
            extra="Domain company name">
            <Input autoFocus={!readCompany()} autoCapitalize="off" autoComplete="organization" />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Enter your email' }]}>
            <Input type="email" autoComplete="username" />
          </Form.Item>
          <Form.Item label="Password" name="password" rules={[{ required: true, message: 'Enter your password' }]}>
            <Input.Password autoFocus={!!readCompany() && !!lastUser(readCompany())} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>Sign in</Button>
        </Form>
        <ThoughtOfTheDay company={readCompany()} />
        <Copyright />
      </div></div>
    </div>
  );
}
