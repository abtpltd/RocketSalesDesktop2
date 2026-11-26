// Copy, save and share a dashboard chart or table from its full-screen view.
import type { Api } from '../api/types';

function bytesOf(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',', 2)[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The chart as a PNG data address, on the card's own background. */
export function chartPng(chart: { getDataURL: (o: object) => string }, dark: boolean): string {
  return chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: dark ? '#13212f' : '#ffffff' });
}

export async function copyImage(dataUrl: string): Promise<void> {
  const blob = new Blob([bytesOf(dataUrl) as BlobPart], { type: 'image/png' });
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function savePng(api: Api, name: string, dataUrl: string): Promise<string> {
  return api.saveDownload(name.endsWith('.png') ? name : `${name}.png`, dataUrl.split(',', 2)[1] ?? '');
}

/** encodeURIComponent, plus the few characters it leaves that the app's link check does not allow. */
export const encodeStrict = (t: string) => encodeURIComponent(t).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** WhatsApp cannot take a picture from a link: the picture goes on the clipboard and the chat opens with the caption. */
export async function shareWhatsApp(api: Api, caption: string, dataUrl?: string): Promise<void> {
  if (dataUrl) await copyImage(dataUrl);
  await api.openContact(`https://wa.me/?text=${encodeStrict(caption)}`);
}
