import { useState } from 'react';
import { Alert, Button, Form, Input, Result, Steps } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import type { ResetPayload } from '../../api/types';
import { Panel } from '../../ui/parts';
import SetupFrame from './SetupFrame';
import { useSetup } from './useSetup';

type Props = { classicPath: string; openClassic: (p: string) => void };

/** Reset Password: an OTP is emailed, then the OTP and the new password change it (for here and the web site). */
export default function ResetPasswordPage({ classicPath, openClassic }: Props) {
  const { q, save, busy } = useSetup<ResetPayload>('reset_password');
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [form] = Form.useForm();
  const send = async () => { const r = await save('send_otp', {}, { reload: false }); if (r?.ok) setStep(1); };
  const reset = async (v: { otp: string; password: string; confirm: string }) => {
    const r = await save('reset', v, { reload: false });
    if (r?.ok) { setStep(2); form.resetFields(); }
  };
  return (
    <SetupFrame q={q} title="Reset Password" classicPath={classicPath} openClassic={openClassic}>
      {(d) => (
        <Panel>
          <div className="reset">
            <Steps current={step} size="small" items={[{ title: 'Get an OTP' }, { title: 'New password' }, { title: 'Done' }]} />
            {step === 0 && (
              <div className="reset-body">
                <MailOutlined className="reset-icon" />
                <p>We will email a 6-digit OTP to <b>{d.email}</b>.</p>
                <Button type="primary" size="large" loading={busy === 'send_otp'} onClick={() => void send()}>Email me an OTP</Button>
              </div>
            )}
            {step === 1 && (
              <Form form={form} layout="vertical" className="reset-body" onFinish={(v) => void reset(v)} requiredMark={false}>
                <Alert type="info" showIcon style={{ marginBottom: 16 }} title={`Check ${d.email} for the OTP.`}
                  description={d.case_insensitive ? 'Passwords are not case-sensitive, the same as on the web site.' : undefined} />
                <Form.Item name="otp" label="OTP" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Enter the 6 digits from the email' }]}>
                  <Input inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" />
                </Form.Item>
                <Form.Item name="password" label="New password" rules={[{ required: true, min: 6, message: 'Use at least 6 characters' }]}>
                  <Input.Password prefix={<LockOutlined />} autoComplete="new-password" maxLength={100} />
                </Form.Item>
                <Form.Item name="confirm" label="New password again" dependencies={['password']} rules={[{ required: true, message: 'Enter the password again' },
                  ({ getFieldValue }) => ({ validator: (_, v) => (!v || String(v).toLowerCase() === String(getFieldValue('password') ?? '').toLowerCase()
                    ? Promise.resolve() : Promise.reject(new Error('The two passwords are not the same'))) })]}>
                  <Input.Password prefix={<LockOutlined />} autoComplete="new-password" maxLength={100} />
                </Form.Item>
                <div className="admin-row">
                  <Button onClick={() => void send()} loading={busy === 'send_otp'}>Send a new OTP</Button>
                  <span className="grow" />
                  <Button type="primary" htmlType="submit" loading={busy === 'reset'}>Change password</Button>
                </div>
              </Form>
            )}
            {step === 2 && (
              <Result status="success" title="Password changed" subTitle="Use the new password next time you sign in, here and on the web site."
                extra={<Button onClick={() => setStep(0)}>Done</Button>} />
            )}
          </div>
        </Panel>
      )}
    </SetupFrame>
  );
}
