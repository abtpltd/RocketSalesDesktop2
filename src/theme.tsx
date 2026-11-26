import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider, theme as antTheme } from 'antd';
import enUSModule from 'antd/locale/en_US';
import pickerEnUS from 'antd/es/date-picker/locale/en_US';

// the locale module can arrive wrapped ({ default }) depending on how it is bundled; unwrap it so the date setting is never lost
const unwrap = <T,>(m: T): T => ((m as unknown as { default?: T }).default ?? m);
const enUS = unwrap(enUSModule);
const pickerBase = unwrap(pickerEnUS);

/** Every date picker in the app shows and accepts DD-MM-YYYY (month pickers MM-YYYY). */
const LOCALE = {
  ...enUS,
  DatePicker: {
    ...(enUS.DatePicker ?? pickerBase),
    lang: { ...(enUS.DatePicker ?? pickerBase).lang, fieldDateFormat: 'DD-MM-YYYY', fieldDateTimeFormat: 'DD-MM-YYYY HH:mm:ss', fieldMonthFormat: 'MM-YYYY' },
  },
};

export interface ThemeDef {
  id: string; name: string; primary: string; primaryDark: string; deep: string; side: string;
  /** text on primary buttons in light mode, when white is too faint on the colour */
  onPrimary?: string;
  /** links and coloured text in light mode, when the primary itself is too light to read on white */
  link?: string;
}
/** Text on primary buttons in dark mode: the bright dark-mode colours need dark text to stay readable. */
export const DARK_ON_PRIMARY = '#0d1722';
export type TextSize = 'normal' | 'large' | 'larger';
export const TEXT_ZOOM: Record<TextSize, number> = { normal: 1, large: 1.1, larger: 1.2 };
/** Seven colour themes. Ocean is the RocketSales logo blue; Lagoon is a teal close to the MAXPRO logo. Each works in light and in dark mode. */
export const THEMES: ThemeDef[] = [
  { id: 'ocean', name: 'Ocean', primary: '#1370b6', primaryDark: '#3d9be0', deep: '#0c4a7c', side: '#0b2a45' },
  { id: 'emerald', name: 'Emerald', primary: '#0d7e5d', primaryDark: '#34c79a', deep: '#0a5c45', side: '#072e26' },
  { id: 'violet', name: 'Violet', primary: '#6a4fd6', primaryDark: '#9a86f0', deep: '#4430a3', side: '#1a1340' },
  { id: 'sunset', name: 'Sunset', primary: '#d97a0b', primaryDark: '#f0a03c', deep: '#9a5206', side: '#2e1b08', onPrimary: '#14202e', link: '#a55d08' },
  { id: 'rose', name: 'Rose', primary: '#c53c65', primaryDark: '#f0789a', deep: '#9a2349', side: '#34101d' },
  { id: 'lagoon', name: 'Lagoon', primary: '#0d7991', primaryDark: '#3cc3dc', deep: '#075a6d', side: '#062a33' },
  { id: 'graphite', name: 'Graphite', primary: '#3b4a5c', primaryDark: '#8fa3b8', deep: '#1f2a37', side: '#11161d' },
];
export type Mode = 'light' | 'dark' | 'system';

interface Ctx { theme: ThemeDef; setTheme: (id: string) => void; mode: Mode; setMode: (m: Mode) => void; dark: boolean; primary: string; textSize: TextSize; setTextSize: (t: TextSize) => void }
const ThemeContext = createContext<Ctx | null>(null);
export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error('ThemeProvider is missing');
  return c;
}

const KEY_THEME = 'ui-theme';
const KEY_MODE = 'ui-mode';
const KEY_TEXT = 'ui-text';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* optional */ } };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState(() => (THEMES.some((t) => t.id === read(KEY_THEME)) ? read(KEY_THEME)! : 'ocean'));
  const [mode, setModeState] = useState<Mode>(() => (['light', 'dark', 'system'].includes(read(KEY_MODE) ?? '') ? (read(KEY_MODE) as Mode) : 'light'));
  const [textSize, setTextSizeState] = useState<TextSize>(() => ((['normal', 'large', 'larger'] as string[]).includes(read(KEY_TEXT) ?? '') ? (read(KEY_TEXT) as TextSize) : 'normal'));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  const primary = dark ? theme.primaryDark : theme.primary;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = dark ? 'dark' : 'light';
    root.style.setProperty('--brand', dark ? primary : theme.link ?? primary);
    root.style.setProperty('--on-brand', dark ? DARK_ON_PRIMARY : '#ffffff'); // --brand in light mode is the link colour, which white reads well on
    (root.style as CSSStyleDeclaration & { zoom: string }).zoom = String(TEXT_ZOOM[textSize]);
    root.style.setProperty('--brand-d', dark ? '#b9d9f5' : theme.deep);
    root.style.setProperty('--side', theme.side);
  }, [dark, primary, theme, textSize]);

  const setTheme = useCallback((id: string) => { setThemeId(id); write(KEY_THEME, id); }, []);
  const setMode = useCallback((m: Mode) => { setModeState(m); write(KEY_MODE, m); }, []);
  const setTextSize = useCallback((t: TextSize) => { setTextSizeState(t); write(KEY_TEXT, t); }, []);

  const antd = useMemo(() => ({
    algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: primary, borderRadius: 10, controlHeight: 36,
      colorTextLightSolid: dark ? DARK_ON_PRIMARY : theme.onPrimary ?? '#ffffff',
      colorLink: dark ? primary : theme.link ?? primary,
      colorTextDescription: dark ? '#8da0b5' : '#627081',
      fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
      colorBgLayout: dark ? '#0d1722' : '#f3f6fa', colorBgContainer: dark ? '#13212f' : '#ffffff',
      colorBorderSecondary: dark ? '#1f3144' : '#e4eaf1', colorBorder: dark ? '#2a3f55' : '#d8e0ea',
    },
    components: {
      Table: {
        headerBg: dark ? '#162636' : '#f8fafc', headerColor: dark ? '#8da0b5' : '#627081', headerSplitColor: 'transparent',
        rowHoverBg: dark ? '#17293b' : '#f1f6fb', borderColor: dark ? '#1f3144' : '#e4eaf1',
      },
      Segmented: { trackBg: dark ? '#1a2b3c' : '#edf1f6' },
      Card: { headerFontSize: 15 },
    },
  }), [dark, primary, theme]);

  const value = useMemo(() => ({ theme, setTheme, mode, setMode, dark, primary, textSize, setTextSize }), [theme, setTheme, mode, setMode, dark, primary, textSize, setTextSize]);
  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={antd} locale={LOCALE}>{children}</ConfigProvider>
    </ThemeContext.Provider>
  );
}
