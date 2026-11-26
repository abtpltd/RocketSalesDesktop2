import type { AppError } from './types';

export interface Described {
  title: string;
  text: string;
  /** true when the person must sign in again to continue */
  needsLogin: boolean;
  /** 'warning' for things the person only has to wait for, 'error' otherwise */
  tone?: 'error' | 'warning';
  /** technical reason for connection problems (the address that failed), shown small so it can be reported */
  detail?: string;
}

/** Plain-English text for every error code the app can show. Server messages are kept when they say more. */
export function describeError(e: AppError | undefined | null): Described {
  const err = e ?? { code: 'unknown', message: '' };
  const server = (err.message || '').trim();
  const withDetail = (d: Described): Described =>
    ['offline', 'timeout', 'network_error'].includes(err.code) && server ? { ...d, detail: server } : d;
  return withDetail(describeCode(err.code, server, err));
}

function describeCode(code: string, server: string, err: AppError): Described {
  switch (code) {
    case 'network_error':
      return { title: 'Connection problem', needsLogin: false,
        text: 'The app reached the network but could not complete the connection to the server. A firewall, proxy or security program on this computer may be blocking it.' };
    case 'offline':
      return { title: 'No internet connection', needsLogin: false,
        text: 'This computer cannot reach the server, and there is no saved copy of this page yet. Check the connection and try again.' };
    case 'offline_expired':
      return { title: 'Saved copy is too old', needsLogin: false,
        text: 'You have been offline longer than your company allows, so the saved copy was removed. Connect to the internet to continue.' };
    case 'timeout':
      return { title: 'The server took too long', needsLogin: false,
        text: 'The server did not answer in time. Try again in a minute.' };
    case 'bad_credentials':
      return { title: 'Cannot sign in', needsLogin: false, text: 'Check the email and password.' };
    case 'bad_company':
      return { title: 'Company name', needsLogin: false,
        text: server || 'Enter the company name (letters, numbers and dashes), or its full address such as medcure.rocketsalespharma.net.' };
    case 'company_not_enabled':
      return { title: 'Desktop app is not switched on', needsLogin: false,
        text: 'The desktop app is not enabled for this company. Ask your administrator to switch it on in Company settings.' };
    case 'device_pending':
      return { title: 'Waiting for approval', needsLogin: false, tone: 'warning',
        text: 'This computer is new, so your administrator has to approve it first. Ask them to approve it in Company settings, then sign in again.' };
    case 'device_revoked': {
      // the server adds "Reason: ..." in plain words; show it so nobody has to look it up
      const why = /Reason:\s*([^]*?)\.?\s*$/i.exec(server)?.[1]?.trim();
      return { title: 'This computer was switched off', needsLogin: true,
        text: 'This computer was switched off, by your administrator or for security reasons. The saved data was removed. Ask your administrator if you need access.' +
          (why ? ` Reason: ${why}.` : '') };
    }
    case 'device_limit':
      return { title: 'Too many computers', needsLogin: false,
        text: 'This account is already used on the number of computers it is allowed. To move to a new computer, ask RocketSales to switch the old one off, then sign in again.' };
    case 'device_key_invalid':
      return { title: 'This computer is not recognised', needsLogin: true,
        text: 'This computer could not prove it is the one registered for your account. Check that the date and time on this computer are right. If the app was reinstalled or the computer was reset, ask RocketSales to reset this computer.' };
    case 'rate_limited': {
      const minutes = err.retry_after_seconds ? Math.max(1, Math.ceil(err.retry_after_seconds / 60)) : 0;
      return { title: 'Too many attempts', needsLogin: false,
        text: minutes ? `Too many failed attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
          : 'Too many failed attempts. Try again later.' };
    }
    case 'session_expired':
    case 'token_expired':
    case 'token_invalid':
      return { title: 'Please sign in again', needsLogin: true,
        text: 'Your sign-in has expired. Sign in again to continue.' };
    case 'account_blocked':
      return { title: 'Account cannot be used', needsLogin: true,
        text: 'This account cannot use the desktop app. Ask your administrator.' };
    case 'wrong_company':
      return { title: 'Wrong company', needsLogin: false, text: 'The company does not match this server address.' };
    case 'unsupported':
      return { title: 'Server needs an update', needsLogin: false,
        text: server || 'This server does not support the desktop app yet. Ask the person who looks after RocketSales to update it.' };
    case 'not_configured':
      return { title: 'Server is not set up', needsLogin: false,
        text: 'The desktop app is not configured on the server yet. Ask the person who looks after RocketSales.' };
    case 'update_required':
      return { title: 'Update needed', needsLogin: false, tone: 'warning',
        text: server || 'This version of the app is too old for your company. Install the update, then sign in again.' };
    case 'not_allowed':
      return { title: 'Not available here', needsLogin: false,
        text: server || 'This page is not available in the desktop app for your role. Open it in the classic window.' };
    case 'server_error':
      return { title: 'Server problem', needsLogin: false,
        text: server || 'The server had a problem. Try again in a minute.' };
    default:
      return { title: 'Something went wrong', needsLogin: false, text: server || 'Something went wrong. Try again.' };
  }
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago" (a clock that is slightly ahead reads as just now). */
export function syncedAgo(savedAt: number, now: number): string {
  const seconds = Math.max(0, now - savedAt);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
