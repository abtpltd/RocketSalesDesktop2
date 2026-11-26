// When the app looks for a new version while it stays open: at these clock times (this computer's time), plus once on opening.
export const CHECK_HOURS = [10, 12, 14, 16];

/** Milliseconds from `now` until the next check time (today's next one, or 10:00 tomorrow after the last). */
export function msUntilNextCheck(now: Date = new Date(), hours: number[] = CHECK_HOURS): number {
  for (const h of [...hours].sort((a, b) => a - b)) {
    const t = new Date(now); t.setHours(h, 0, 0, 0);
    if (t.getTime() > now.getTime()) return t.getTime() - now.getTime();
  }
  const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(Math.min(...hours), 0, 0, 0);
  return t.getTime() - now.getTime();
}

/** Runs `fn` at each check time until stopped. Returns the stop function. */
export function atCheckTimes(fn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => { timer = setTimeout(() => { fn(); arm(); }, msUntilNextCheck() + 1000); };
  arm();
  return () => clearTimeout(timer);
}
