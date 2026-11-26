// Lets any screen (the dashboard card, a button) open the Ask panel, optionally with a question already typed.
type Listener = (question?: string) => void;
const listeners = new Set<Listener>();
export const openAsk = (question?: string) => listeners.forEach((l) => l(question));
export const onOpenAsk = (l: Listener): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
