// SMS length rules: plain (GSM 7-bit) text fits 160 characters in one SMS and 153 per part when longer; any other
// character (emoji, curly quotes, most non-Latin letters) makes it Unicode: 70, then 67 per part.

const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€'; // count as two

export interface SmsSize { chars: number; parts: number; unicode: boolean; perPart: number }

export function smsSize(text: string): SmsSize {
  const chars = [...text];
  const unicode = chars.some((c) => !GSM.includes(c) && !GSM_EXT.includes(c));
  const len = unicode ? chars.length : chars.reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160, multi = unicode ? 67 : 153;
  const parts = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi);
  return { chars: len, parts, unicode, perPart: parts > 1 ? multi : single };
}

/** The message one customer gets: the placeholder replaced by their name, as the web's sender does. */
export const personal = (text: string, placeholder: string, name: string) => text.split(placeholder).join(name);

/** The longest a message gets once a name goes in (names are cut at 30 characters for the estimate). */
export const withLongName = (text: string, placeholder: string) => personal(text, placeholder, 'X'.repeat(30));
