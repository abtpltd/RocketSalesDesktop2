// Takes a picture of any card, chart, table or grid on screen for a presentation.
import { toJpeg } from 'html-to-image';
import type { LiveRef } from './model';

/** The kinds of box a person would want to put on a slide, nearest first. */
export const CAPTURE_SELECTOR = '.panel, .chart-card, .sum-card, .kpi-strip, .kpi-table, .view-table, .ant-table-wrapper, .ant-card, .dash-card';

export function capturable(from: EventTarget | null): HTMLElement | null {
  const el = from instanceof Element ? from : null;
  const box = el?.closest(CAPTURE_SELECTOR) as HTMLElement | null;
  if (!box || box.closest('.present-ui')) return null;
  const r = box.getBoundingClientRect();
  return r.width >= 120 && r.height >= 50 ? box : null;
}

/** A JPEG data address of the element on a solid background (so dark mode stays readable). */
export async function snapshot(el: HTMLElement, background: string): Promise<string> {
  return toJpeg(el, { quality: 0.9, pixelRatio: 1.5, backgroundColor: background, cacheBust: false,
    filter: (n) => !(n instanceof HTMLElement && n.dataset.noCapture === '1') });
}

export function titleOf(el: HTMLElement): string {
  const h = el.querySelector('h1,h2,h3,h4,.ant-card-head-title,.panel-head b');
  const first = (h?.textContent ?? el.innerText?.split('\n').map((t) => t.trim()).find((t) => t.length > 2) ?? '').trim();
  return first.slice(0, 120);
}

// ---- finding the same card again, for live pictures ----
const sized = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return r.width >= 120 && r.height >= 50; };
/** Every card, chart, table or grid on the page now showing, in page order. */
export function allCapturable(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(CAPTURE_SELECTOR)].filter((e) => !e.closest('.present-ui') && sized(e));
}

/** What to remember about a card so it can be found again on that page. */
export function locateLive(el: HTMLElement, page: string): LiveRef | undefined {
  const title = titleOf(el);
  if (!title || !page) return undefined;
  const same = allCapturable().filter((e) => titleOf(e) === title);
  return { page, title, nth: Math.max(0, same.indexOf(el)) };
}

export const cardFor = (ref: LiveRef): HTMLElement | null => allCapturable().filter((e) => titleOf(e) === ref.title)[ref.nth] ?? null;

/** Waits for the card to appear and stop loading (up to `ms`); null when it never shows. */
export async function waitForCard(ref: LiveRef, ms = 12000): Promise<HTMLElement | null> {
  const end = Date.now() + ms;
  let calm = 0;
  while (Date.now() < end) {
    const el = cardFor(ref);
    if (el && !el.querySelector('.ant-spin-spinning, .ant-skeleton-active, [aria-busy="true"]')) { calm++; if (calm >= 3) return el; } else calm = 0;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}
