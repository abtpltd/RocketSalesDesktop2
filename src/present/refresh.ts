// Live pictures: when a presentation is played, each live picture is taken again from its page. The person never sees
// this (the full-screen show covers the app). A card that cannot be found keeps its old picture and is marked.
import { applyRefresh, liveBlocks, today, type Deck, type LiveRef } from './model';

export interface RefreshDeps {
  goto(page: string): void;
  take(ref: LiveRef): Promise<string | null>; // a picture of the card, or null when it was not found
  settle?(): Promise<void>; // a short wait after changing page
  on?: string;
  progress?(done: number, total: number): void;
}

/** Retakes every live picture. Pages are visited one at a time; `back` is the page to return to at the end. */
export async function refreshDeck(deck: Deck, back: string, deps: RefreshDeps): Promise<{ deck: Deck; refreshed: number; failed: number; failedTitles: string[] }> {
  const items = liveBlocks(deck);
  const pages = [...new Set(items.map((i) => i.block.live!.page))];
  let out = deck; let refreshed = 0; let failed = 0; let done = 0; const failedTitles: string[] = [];
  try {
    for (const page of pages) {
      deps.goto(page);
      await deps.settle?.();
      for (const it of items.filter((i) => i.block.live!.page === page)) {
        let src: string | null = null;
        try { src = await deps.take(it.block.live!); } catch { src = null; }
        out = applyRefresh(out, it.block.id, src, deps.on ?? today());
        if (src) refreshed++; else { failed++; failedTitles.push(it.block.live!.title); }
        deps.progress?.(++done, items.length);
      }
    }
  } finally { deps.goto(back); }
  return { deck: out, refreshed, failed, failedTitles };
}
