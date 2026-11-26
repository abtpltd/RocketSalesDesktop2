import { Segmented } from 'antd';
import { BulbOutlined, DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { THEMES, useTheme, type Mode, type TextSize } from '../theme';

/** Seven colour swatches and light / dark / system. Used in the top bar menu and in App settings. */
export default function ThemePicker({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, mode, setMode, textSize, setTextSize } = useTheme();
  return (
    <div className="theme-picker">
      {!compact && <div className="muted" style={{ marginBottom: 8 }}>Colour theme</div>}
      <div className="swatches" role="radiogroup" aria-label="Colour theme">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={t.id === theme.id} title={t.name}
            className={`swatch${t.id === theme.id ? ' on' : ''}`} onClick={() => setTheme(t.id)}>
            <i style={{ background: `linear-gradient(135deg, ${t.primary}, ${t.deep})` }} />
            <span>{t.name}</span>
          </button>
        ))}
      </div>
      <div className="muted" style={{ margin: '14px 0 8px' }}>Appearance</div>
      <Segmented block value={mode} onChange={(v) => setMode(v as Mode)}
        options={[{ value: 'light', label: 'Light', icon: <SunOutlined /> }, { value: 'dark', label: 'Dark', icon: <MoonOutlined /> },
          { value: 'system', label: 'System', icon: <DesktopOutlined /> }]} />
      <div className="muted" style={{ margin: '14px 0 8px' }}>Text size</div>
      <Segmented block value={textSize} onChange={(v) => setTextSize(v as TextSize)} aria-label="Text size"
        options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: <span style={{ fontSize: 15 }}>Large</span> }, { value: 'larger', label: <span style={{ fontSize: 16 }}>Larger</span> }]} />
    </div>
  );
}

export { BulbOutlined };
