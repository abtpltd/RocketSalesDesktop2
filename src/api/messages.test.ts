import { describe, expect, it } from 'vitest';
import { describeError, syncedAgo } from './messages';

const CODES = ['offline', 'offline_expired', 'timeout', 'bad_credentials', 'bad_company', 'company_not_enabled',
  'device_revoked', 'device_pending', 'device_limit', 'device_key_invalid', 'rate_limited', 'session_expired', 'token_expired', 'token_invalid', 'account_blocked',
  'wrong_company', 'network_error', 'unsupported', 'not_configured', 'not_allowed', 'server_error', 'unknown'];

describe('describeError', () => {
  it('has a title and plain text for every code, never a raw code', () => {
    for (const code of CODES) {
      const d = describeError({ code, message: '' });
      expect(d.title.length).toBeGreaterThan(3);
      expect(d.text.length).toBeGreaterThan(10);
      expect(d.text).not.toContain(code.includes('_') ? code : '@@');
    }
  });
  it('forces sign-in only when the session is really over', () => {
    expect(describeError({ code: 'device_revoked', message: '' }).needsLogin).toBe(true);
    expect(describeError({ code: 'session_expired', message: '' }).needsLogin).toBe(true);
    expect(describeError({ code: 'offline', message: '' }).needsLogin).toBe(false);
    expect(describeError({ code: 'timeout', message: '' }).needsLogin).toBe(false);
  });
  it('shows waiting for approval as a warning, not an error', () => {
    const d = describeError({ code: 'device_pending', message: '' });
    expect(d.tone).toBe('warning');
    expect(d.needsLogin).toBe(false);
    expect(d.text).toContain('approve');
  });
  it('rounds the lock time up to whole minutes', () => {
    expect(describeError({ code: 'rate_limited', message: '', retry_after_seconds: 61 }).text).toContain('2 minutes');
    expect(describeError({ code: 'rate_limited', message: '', retry_after_seconds: 30 }).text).toContain('1 minute.');
  });
  it('keeps the server text for unsupported servers', () => {
    expect(describeError({ code: 'unsupported', message: '404 Not Found - older version' }).text).toContain('404');
  });
  it('keeps the technical reason for connection problems so it can be reported', () => {
    const d = describeError({ code: 'offline', message: 'error sending request for url (https://x.rocketorder.net/)' });
    expect(d.detail).toContain('x.rocketorder.net');
    expect(describeError({ code: 'bad_credentials', message: 'Check the email and password.' }).detail).toBeUndefined();
  });
  it('asks for an update when the provider requires a newer version', () => {
    const d = describeError({ code: 'update_required', message: 'Update the RocketSales desktop app to version 0.3.0 or later.' });
    expect(d.title).toBe('Update needed');
    expect(d.text).toContain('0.3.0');
    expect(d.needsLogin).toBe(false);
  });
  it('copes with a missing error', () => {
    expect(describeError(undefined).title).toBeTruthy();
  });
});

describe('syncedAgo', () => {
  it('formats ages', () => {
    expect(syncedAgo(1000, 1030)).toBe('just now');
    expect(syncedAgo(1000, 1000 + 60)).toBe('1 minute ago');
    expect(syncedAgo(1000, 1000 + 5 * 60)).toBe('5 minutes ago');
    expect(syncedAgo(1000, 1000 + 3600)).toBe('1 hour ago');
    expect(syncedAgo(1000, 1000 + 3 * 3600)).toBe('3 hours ago');
    expect(syncedAgo(1000, 1000 + 2 * 86400)).toBe('2 days ago');
    expect(syncedAgo(2000, 1000)).toBe('just now');
  });
});

describe('switched-off reason', () => {
  it('shows the reason the server sends', () => {
    const d = describeError({ code: 'device_revoked', message: 'This computer has been switched off by your administrator. Reason: a remote-sharing or screen-recording tool was still running.' });
    expect(d.text).toContain('Reason: a remote-sharing or screen-recording tool was still running.');
    expect(d.needsLogin).toBe(true);
  });
  it('keeps the plain text when no reason is sent', () => {
    expect(describeError({ code: 'device_revoked', message: '' }).text).not.toContain('Reason:');
  });
});
