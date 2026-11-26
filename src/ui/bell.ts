// A short two-note bell, made with the sound card (no sound file). Used when a new app version is found.
// Windows may keep a page silent until the person has clicked or typed in it once; then nothing plays and nothing breaks.

let ctx: AudioContext | null = null;

export function playBell(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    const c = ctx;
    void c.resume().catch(() => undefined);
    const t0 = c.currentTime + 0.02;
    [[880, 0], [1318.5, 0.16]].forEach(([freq, at]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.1);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 1.2);
    });
  } catch { /* no sound available */ }
}
