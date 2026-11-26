import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, SunburstChart, TreemapChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, MarkPointComponent, RadarComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useTheme } from '../theme';

echarts.use([BarChart, FunnelChart, HeatmapChart, LineChart, PieChart, RadarChart, ScatterChart, SunburstChart, TreemapChart, GridComponent, LegendComponent,
  MarkLineComponent, MarkPointComponent, RadarComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const ACCENTS = ['#e08a1e', '#94a3b8', '#1e9e57', '#6f5bd6', '#d64545', '#2aa5b8', '#8d6e63', '#d4a017', '#c2569b'];
const nf = (n: unknown) => (n === null || n === undefined || n === '' ? '-' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 }));
/** Axis numbers kept short: 1.2k, 3.4M. */
const short = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return String(n);
};

export type PairKind = 'hbar' | 'bar' | 'pie' | 'doughnut' | 'treemap' | 'rose' | 'lollipop' | 'funnel' | 'radar' | 'sunburst';
/** How a day-by-day chart is drawn besides plain columns, lines and stacked columns. */
export type SeriesMode = 'area' | 'stackedarea' | 'smooth' | 'step' | 'percent' | 'heat';
/** Extras any chart can have: numbers on the chart, an average line, a colour set. */
export interface ChartOpts { values?: boolean; avg?: boolean; colors?: string }
export interface SeriesPart { name: string; values: (number | null)[]; /** last period, drawn dotted behind (set by the dashboard, shown on request) */ prior?: (number | null)[]; dashed?: boolean }
export type KasSpec =
  | { kind: 'line' | 'column'; title: string; labels: string[]; values: (number | null)[]; prior?: (number | null)[]; opts?: ChartOpts }
  | { kind: 'multi'; title: string; labels: string[]; series: SeriesPart[]; stacked?: boolean; lines?: boolean; mode?: SeriesMode; opts?: ChartOpts }
  | { kind: PairKind; title: string; pairs: [string, number][]; opts?: ChartOpts };

/** Colour sets the person can pick; null follows the theme colour. */
export const PALETTES: { id: string; label: string; colors: string[] | null }[] = [
  { id: 'brand', label: 'Theme colour', colors: null },
  { id: 'ocean', label: 'Ocean', colors: ['#1370b6', '#2aa5b8', '#6bb8e8', '#0b4f86', '#7dd3c0', '#a3c9ea', '#3b5b92', '#5ec2d9'] },
  { id: 'sunset', label: 'Sunset', colors: ['#e8590c', '#f59f00', '#d6336c', '#862e9c', '#ff8787', '#ffd43b', '#c92a2a', '#fd7e14'] },
  { id: 'forest', label: 'Forest', colors: ['#2b8a3e', '#82c91e', '#087f5b', '#5c940d', '#63e6be', '#b2f2bb', '#37b24d', '#a9e34b'] },
  { id: 'vivid', label: 'Vivid', colors: ['#4263eb', '#f03e3e', '#37b24d', '#f59f00', '#ae3ec9', '#1098ad', '#e64980', '#74b816'] },
  { id: 'mono', label: 'Greys', colors: ['#343a40', '#6c757d', '#adb5bd', '#495057', '#ced4da', '#868e96', '#212529', '#dee2e6'] },
];
const chosen = (opts?: ChartOpts) => PALETTES.find((p) => p.id === opts?.colors)?.colors ?? null;

function hex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const v = m ? parseInt(m[1], 16) : 0x1370b6;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
/** `a` blended toward `b` by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a); const y = hex(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}
/** Shades of the theme colour first, then a few accents, so the dashboard reads as one family. */
export function palette(brand: string, dark: boolean): string[] {
  const card = dark ? '#13212f' : '#ffffff';
  return [brand, mix(brand, card, 0.3), mix(brand, card, 0.5), mix(brand, card, 0.7), ...ACCENTS];
}

export function kasOption(spec: KasSpec, brand: string, dark: boolean): echarts.EChartsCoreOption {
  const own = chosen(spec.opts);
  const PALETTE = own ?? palette(brand, dark);
  const text = dark ? '#8da0b5' : '#6b7a8c';
  const ink = dark ? '#c9d6e3' : '#3a4a5c';
  const line = dark ? '#1f3144' : '#edf1f6';
  const card = dark ? '#13212f' : '#ffffff';
  const main = own ? own[0] : brand;
  const axis = { axisLabel: { color: text, fontSize: 11 }, axisLine: { lineStyle: { color: line } }, splitLine: { lineStyle: { color: line } }, axisTick: { show: false } };
  const valueAxis = { type: 'value', ...axis, axisLine: { show: false }, axisLabel: { color: text, fontSize: 11, formatter: short } };
  const tip = { backgroundColor: dark ? '#13212f' : '#ffffff', borderColor: line, textStyle: { color: dark ? '#e8eef5' : '#14202e' }, extraCssText: 'box-shadow:0 6px 20px rgba(16,40,70,.12);border-radius:8px;' };
  const showValues = !!spec.opts?.values;
  const wantAvg = !!spec.opts?.avg;
  /** the average line and the highest / lowest marks, put on the first series only */
  const marks = (first: boolean, unit = '') => (first && wantAvg ? {
    markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dotted', color: text }, label: { color: text, fontSize: 10, position: 'insideEndTop', formatter: (p: { value: number }) => `Avg ${nf(p.value)}${unit}` }, data: [{ type: 'average' }] },
    markPoint: { symbolSize: 34, itemStyle: { color: main }, label: { color: '#fff', fontSize: 9, formatter: (p: { value: number }) => nf(p.value) }, data: [{ type: 'max' }, { type: 'min' }] },
  } : {});
  const dayLabel = (unit: string, position: string) => (showValues ? { label: { show: true, position, fontSize: 9.5, color: text, formatter: (p: { value: number | null }) => (p.value ? `${nf(p.value)}${unit}` : '') } } : {});
  if ('series' in spec) {
    const mode = spec.mode;
    const names = spec.series.filter((x) => !x.dashed).map((x) => x.name);
    if (mode === 'heat') {
      // rows are the series, columns the days; a deeper colour is a busier day
      const data: [number, number, number][] = [];
      spec.series.forEach((x, yi) => x.values.forEach((val, xi) => { if (val !== null && val !== undefined) data.push([xi, yi, val]); }));
      const max = Math.max(1, ...data.map((d) => d[2]));
      return {
        tooltip: { position: 'top', formatter: (p: { value: number[] }) => `${spec.series[p.value[1]].name}, ${spec.labels[p.value[0]]}: ${nf(p.value[2])}`, ...tip },
        grid: { left: 4, right: 12, top: 8, bottom: 46, containLabel: true },
        xAxis: { type: 'category', data: spec.labels, ...axis, splitLine: { show: false } },
        yAxis: { type: 'category', data: spec.series.map((x) => x.name), inverse: true, ...axis, splitLine: { show: false }, axisLabel: { color: ink, fontSize: 12 } },
        visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 12, itemHeight: 110, textStyle: { color: text, fontSize: 10 },
          inRange: { color: [mix(main, card, 0.92), main] } },
        series: [{ type: 'heatmap', data, itemStyle: { borderColor: card, borderWidth: 2, borderRadius: 3 },
          label: { show: showValues, fontSize: 9, color: ink, formatter: (p: { value: number[] }) => nf(p.value[2]) } }],
      };
    }
    const pct = mode === 'percent';
    const unit = pct ? '%' : '';
    const lineMode = mode === 'area' || mode === 'stackedarea' || mode === 'smooth' || mode === 'step' || spec.lines;
    const stacked = spec.stacked || pct || mode === 'stackedarea';
    return {
      color: own ?? [brand, mix(brand, card, 0.55), ...ACCENTS],
      tooltip: { trigger: 'axis', axisPointer: { type: lineMode ? 'line' : 'shadow' }, valueFormatter: (x: unknown) => `${nf(x)}${unit}`, ...tip },
      legend: { top: 0, right: 0, icon: 'rect', itemWidth: 10, itemHeight: 10, textStyle: { color: text, fontSize: 12 }, data: names },
      grid: { left: 4, right: 12, top: 34, bottom: 4 },
      xAxis: { type: 'category', data: spec.labels, boundaryGap: !lineMode, ...axis, splitLine: { show: false } },
      yAxis: pct ? { ...valueAxis, max: 100, axisLabel: { color: text, fontSize: 11, formatter: (n: number) => `${n}%` } } : valueAxis,
      series: spec.series.map((x, i) => {
        if (x.dashed) {
          return { type: 'line', name: x.name, data: x.values, showSymbol: false, z: 1, lineStyle: { width: 1.6, type: 'dashed', color: text }, itemStyle: { color: text } };
        }
        if (lineMode) {
          return { type: 'line', name: x.name, data: x.values, showSymbol: false, lineStyle: { width: 2.2 }, smooth: mode === 'smooth',
            ...(mode === 'step' ? { step: 'middle' } : {}), ...(mode === 'area' ? { areaStyle: { opacity: 0.2 } } : {}),
            ...(mode === 'stackedarea' ? { stack: 'all', areaStyle: { opacity: 0.55 } } : {}), ...dayLabel(unit, 'top'), ...marks(i === 0 && !stacked, unit) };
        }
        return { type: 'bar', name: x.name, data: x.values, barMaxWidth: stacked ? 16 : 9, barGap: '15%', ...(stacked ? { stack: 'all' } : {}),
          itemStyle: { borderRadius: stacked ? 0 : [3, 3, 0, 0] }, ...dayLabel(unit, stacked ? 'inside' : 'top'), ...marks(i === 0 && !stacked, unit) };
      }),
    };
  }
  if ('values' in spec) {
    const column = spec.kind === 'column';
    return {
      color: PALETTE, tooltip: { trigger: 'axis', axisPointer: { type: column ? 'shadow' : 'line' }, valueFormatter: nf, ...tip },
      grid: { left: 4, right: 12, top: 14, bottom: 4 },
      xAxis: { type: 'category', data: spec.labels, boundaryGap: column, ...axis, splitLine: { show: false } },
      yAxis: valueAxis,
      series: [column
        ? { type: 'bar', name: spec.title, data: spec.values, barMaxWidth: 12, itemStyle: { borderRadius: [3, 3, 0, 0] }, ...dayLabel('', 'top'), ...marks(true) }
        : { type: 'line', name: spec.title, data: spec.values, smooth: false, showSymbol: false, symbolSize: 6, lineStyle: { width: 2.2 },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: mix(main, card, 0.75) }, { offset: 1, color: mix(main, card, 0.97) }] } },
          ...dayLabel('', 'top'), ...marks(true) }],
    };
  }
  const total = spec.pairs.reduce((a, [, v]) => a + v, 0);
  const share = (v: number) => (total ? ` (${((v / total) * 100).toFixed(1)}%)` : '');
  const itemTip = { trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}: ${nf(p.value)}${share(p.value)}`, ...tip };
  const sliceLabel = showValues ? { show: true, color: ink, fontSize: 11, formatter: (p: { name: string; value: number }) => `${nf(p.value)}` } : { show: false };
  if (spec.kind === 'pie' || spec.kind === 'doughnut' || spec.kind === 'rose') {
    // every slice keeps its legend entry: the legend wraps under the ring instead of paging
    const rows = Math.ceil(spec.pairs.length / 2);
    const legendH = rows * 20;
    return {
      color: PALETTE, tooltip: itemTip,
      legend: { bottom: 0, left: 'center', type: 'plain', icon: 'rect', itemWidth: 10, itemHeight: 10, itemGap: 10,
        textStyle: { color: text, fontSize: 11.5, width: 82, overflow: 'truncate' } },
      series: [{ type: 'pie', radius: spec.kind === 'doughnut' ? ['50%', '72%'] : spec.kind === 'rose' ? ['12%', '72%'] : ['0%', '72%'], center: ['50%', '50%'], top: 4,
        ...(spec.kind === 'rose' ? { roseType: 'area' } : {}),
        bottom: legendH + 8, label: sliceLabel,
        emphasis: { scale: true, scaleSize: 4 },
        itemStyle: { borderColor: card, borderWidth: 2, ...(spec.kind === 'rose' ? { borderRadius: 4 } : {}) },
        data: spec.pairs.map(([name, value]) => ({ name, value })) }],
    };
  }
  if (spec.kind === 'treemap') {
    return {
      color: PALETTE, tooltip: { formatter: (p: { name: string; value: number }) => `${p.name}: ${nf(p.value)}`, ...tip },
      series: [{ type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false }, top: 4, left: 0, right: 0, bottom: 4,
        label: { formatter: (p: { name: string; value: number }) => `${p.name}\n${nf(p.value)}`, color: '#fff', fontWeight: 600 },
        itemStyle: { borderColor: card, borderWidth: 2, gapWidth: 2, borderRadius: 6 },
        levels: [{ colorMappingBy: 'index' }],
        data: spec.pairs.map(([name, value]) => ({ name, value })) }],
    };
  }
  if (spec.kind === 'funnel') {
    return {
      color: PALETTE, tooltip: itemTip,
      series: [{ type: 'funnel', left: '6%', width: '88%', top: 4, bottom: 4, sort: 'descending', gap: 2, minSize: '30%',
        label: { show: true, position: 'inside', color: '#fff', fontSize: 11, formatter: (p: { name: string; value: number }) => `${p.name}: ${nf(p.value)}` },
        itemStyle: { borderColor: card, borderWidth: 1 }, data: spec.pairs.map(([name, value]) => ({ name, value })) }],
    };
  }
  if (spec.kind === 'sunburst') {
    // inner ring: the leaders, the next group and the rest; outer ring: the items themselves
    const cut = [['Top 3', 0, 3], ['Next 7', 3, 10], ['Others', 10, spec.pairs.length]] as [string, number, number][];
    const data = cut.filter(([, a, b]) => spec.pairs.slice(a, b).length)
      .map(([name, a, b]) => ({ name, children: spec.pairs.slice(a, b).map(([n, v]) => ({ name: n, value: v })) }));
    return {
      color: PALETTE, tooltip: { trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}: ${nf(p.value)}`, ...tip },
      series: [{ type: 'sunburst', radius: ['10%', '92%'], center: ['50%', '50%'], sort: undefined, data,
        itemStyle: { borderColor: card, borderWidth: 2 },
        label: { color: '#fff', fontSize: 10, rotate: 'radial', minAngle: 9, ...(showValues ? { formatter: (p: { name: string; value: number }) => `${p.name} ${nf(p.value)}` } : {}) },
        levels: [{}, { r0: '10%', r: '38%', label: { fontSize: 11, rotate: 0 } }, { r0: '40%', r: '92%' }] }],
    };
  }
  const names = spec.pairs.map((p) => p[0]);
  const values = spec.pairs.map((p) => p[1]);
  if (spec.kind === 'radar' && spec.pairs.length >= 3) {
    const max = Math.max(1, ...values) * 1.1;
    return {
      color: PALETTE, tooltip: { trigger: 'item', ...tip },
      radar: { indicator: names.map((name) => ({ name, max })), radius: '50%', center: ['50%', '54%'], axisName: { color: ink, fontSize: 10, width: 70, overflow: 'truncate' },
        splitLine: { lineStyle: { color: line } }, splitArea: { show: false }, axisLine: { lineStyle: { color: line } } },
      series: [{ type: 'radar', data: [{ value: values, name: spec.title }], symbolSize: 5, lineStyle: { width: 2 }, areaStyle: { opacity: 0.22 },
        label: showValues ? { show: true, fontSize: 10, color: text, formatter: (p: { value: number }) => nf(p.value) } : { show: false } }],
    };
  }
  const avgMark = wantAvg ? { markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dotted', color: text }, label: { color: text, fontSize: 10, position: 'insideEndTop', formatter: (p: { value: number }) => `Avg ${nf(p.value)}` }, data: [{ type: 'average' }] } } : {};
  if (spec.kind === 'lollipop') {
    return {
      color: PALETTE,
      tooltip: { trigger: 'axis', axisPointer: { type: 'none' }, formatter: (ps: { name: string; value: number | number[] }[]) => { const v = ps[0].value; const n = Array.isArray(v) ? v[0] : v; return `${ps[0].name}: ${nf(n)}${share(Number(n))}`; }, ...tip },
      grid: { left: 4, right: 56, top: 4, bottom: 4 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: names, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { width: 120, overflow: 'truncate', color: ink, fontSize: 12 } },
      series: [
        { type: 'bar', data: values, barWidth: 2, itemStyle: { color: mix(main, card, 0.35) }, z: 1, silent: true, ...avgMark },
        { type: 'scatter', data: values.map((v, i) => [v, names[i]]), symbolSize: 13, itemStyle: { color: main, borderColor: card, borderWidth: 2 }, z: 2,
          label: { show: true, position: 'right', color: text, fontSize: 11.5, formatter: (p: { value: number[] }) => nf(p.value[0]) } },
      ],
    };
  }
  // a handful of categories reads best as labelled horizontal bars; a long list stays as columns
  if (spec.kind === 'hbar' || spec.pairs.length <= 10) {
    return {
      color: PALETTE,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: { name: string; value: number }[]) => `${ps[0].name}: ${nf(ps[0].value)}${share(ps[0].value)}`, ...tip },
      grid: { left: 4, right: 56, top: 4, bottom: 4 },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', inverse: true, data: names, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { width: 120, overflow: 'truncate', color: ink, fontSize: 12 } },
      series: [{ type: 'bar', data: values, barMaxWidth: 14, barCategoryGap: '45%', itemStyle: { borderRadius: [0, 4, 4, 0], color: mix(main, card, 0.1) },
        label: { show: true, position: 'right', color: text, fontSize: 11.5, formatter: (p: { value: number }) => nf(p.value) }, ...avgMark }],
    };
  }
  return {
    color: PALETTE,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: nf, ...tip },
    grid: { left: 4, right: 12, top: 22, bottom: 4 },
    xAxis: { type: 'category', data: names, ...axis, splitLine: { show: false }, axisLabel: { color: text, fontSize: 11, interval: 0, rotate: 30 } },
    yAxis: valueAxis,
    series: [{ type: 'bar', data: values, barMaxWidth: 26, itemStyle: { borderRadius: [4, 4, 0, 0] },
      ...(showValues ? { label: { show: true, position: 'top', color: text, fontSize: 10.5, formatter: (p: { value: number }) => nf(p.value) } } : {}), ...avgMark }],
  };
}

export default function KasChart({ spec, height, onPick, onReady }: {
  spec: KasSpec; height?: number | string;
  /** a bar, slice, box or day was clicked: its name (the label) and series */
  onPick?: (name: string, series: string) => void;
  /** the chart, for saving it as a picture */
  onReady?: (chart: echarts.ECharts | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const { primary, dark } = useTheme();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption(kasOption(spec, primary, dark));
    chart.on('click', (p: { name?: string; seriesName?: string }) => { if (p.name && pick.current) pick.current(String(p.name), String(p.seriesName ?? '')); });
    // clicks on the empty space of a day column count too
    chart.getZr().on('click', (e: { offsetX: number; offsetY: number; target?: unknown }) => {
      if (e.target || !pick.current || !('labels' in spec)) return;
      const at = chart.convertFromPixel({ seriesIndex: 0 }, [e.offsetX, e.offsetY]) as number[] | undefined;
      const i = Array.isArray(at) ? Math.round(at[0]) : -1;
      if (i >= 0 && i < spec.labels.length) pick.current(spec.labels[i], '');
    });
    onReady?.(chart);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => { observer.disconnect(); onReady?.(null); chart.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, primary, dark]);
  return <div ref={ref} className={`chart-box${onPick ? ' can-drill' : ''}`} style={height ? { height } : undefined} role="img" aria-label={spec.title} />;
}
