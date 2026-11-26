import { Button, InputNumber, Segmented, Select, Space } from 'antd';
import { AlignCenterOutlined, AlignLeftOutlined, AlignRightOutlined, BoldOutlined, ItalicOutlined } from '@ant-design/icons';
import { FONTS, SIZE_MAX, SIZE_MIN, clampSize, type TextStyle } from './model';

/** Font, size, bold, italic, colour and alignment. Every change shows on the slide at once. */
export default function StyleEditor({ value, onChange }: { value: TextStyle; onChange: (s: TextStyle) => void }) {
  const set = (p: Partial<TextStyle>) => onChange({ ...value, ...p });
  return (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      <Select aria-label="Font" value={value.font} onChange={(font) => set({ font })} style={{ width: '100%' }}
        options={FONTS.map((f) => ({ value: f, label: <span style={{ fontFamily: `"${f}"` }}>{f}</span> }))} />
      <Space.Compact>
        <Button aria-label="Smaller" onClick={() => set({ size: clampSize(value.size - 2) })}>A−</Button>
        <InputNumber aria-label="Font size" min={SIZE_MIN} max={SIZE_MAX} value={value.size} onChange={(n) => set({ size: clampSize(Number(n)) })} style={{ width: 74 }} />
        <Button aria-label="Larger" onClick={() => set({ size: clampSize(value.size + 2) })}>A+</Button>
      </Space.Compact>
      <Space wrap>
        <Button aria-label="Bold" aria-pressed={value.bold} type={value.bold ? 'primary' : 'default'} icon={<BoldOutlined />} onClick={() => set({ bold: !value.bold })} />
        <Button aria-label="Italic" aria-pressed={value.italic} type={value.italic ? 'primary' : 'default'} icon={<ItalicOutlined />} onClick={() => set({ italic: !value.italic })} />
        <input aria-label="Text colour" type="color" value={value.color} onChange={(e) => set({ color: e.target.value })}
          style={{ width: 38, height: 32, padding: 2, border: '1px solid var(--line)', borderRadius: 6, background: 'transparent' }} />
        <Segmented aria-label="Alignment" value={value.align} onChange={(a) => set({ align: a as TextStyle['align'] })}
          options={[{ value: 'left', icon: <AlignLeftOutlined /> }, { value: 'center', icon: <AlignCenterOutlined /> }, { value: 'right', icon: <AlignRightOutlined /> }]} />
      </Space>
    </Space>
  );
}
