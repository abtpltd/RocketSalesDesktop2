import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartSpec } from './kpi';
import { useTheme } from '../theme';

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const OTHERS = ['#e08a1e', '#1e9e57', '#6f5bd6', '#d64545', '#2aa5b8', '#8d6e63', '#d4a017', '#546e7a', '#c2569b'];
export interface Look { brand: string; dark: boolean }

const nf = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

export function optionFor(spec: ChartSpec, look: Look = { brand: '#1370b6', dark: false }): echarts.EChartsCoreOption {
  const PALETTE = [look.brand, ...OTHERS];
  const text = look.dark ? '#8da0b5' : '#6b7a8c';
  const line = look.dark ? '#1f3144' : '#edf1f6';
  const axis = { axisLabel: { color: text }, axisLine: { lineStyle: { color: line } }, splitLine: { lineStyle: { color: line } }, axisTick: { show: false } };
  const tip = { backgroundColor: look.dark ? '#13212f' : '#ffffff', borderColor: line, textStyle: { color: look.dark ? '#e8eef5' : '#14202e' } };
  const names = spec.pairs.map((p) => p[0]);
  const values = spec.pairs.map((p) => p[1]);
  const tooltipValue = (v: unknown) => nf(Number(v));
  if (spec.kind === 'pie') {
    return {
      color: PALETTE, tooltip: { trigger: 'item', valueFormatter: tooltipValue, ...tip },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: text } },
      series: [{ type: 'pie', radius: ['38%', '66%'], center: ['50%', '45%'], label: { formatter: '{b}: {d}%', color: text }, itemStyle: { borderRadius: 6, borderColor: look.dark ? '#13212f' : '#fff', borderWidth: 2 },
        data: spec.pairs.map(([name, value]) => ({ name, value })) }],
    };
  }
  if (spec.kind === 'hbar') {
    return {
      color: PALETTE, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: tooltipValue, ...tip },
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', ...axis },
      yAxis: { type: 'category', inverse: true, data: names, ...axis, splitLine: { show: false }, axisLabel: { width: 130, overflow: 'truncate', color: text } },
      series: [{ type: 'bar', data: values, barMaxWidth: 16, itemStyle: { borderRadius: [0, 6, 6, 0] } }],
    };
  }
  return {
    color: PALETTE, tooltip: { trigger: 'axis', valueFormatter: tooltipValue, ...tip },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: names, boundaryGap: spec.kind === 'bar', ...axis, splitLine: { show: false } },
    yAxis: { type: 'value', ...axis },
    series: [spec.kind === 'line'
      ? { type: 'line', data: values, smooth: true, lineStyle: { width: 2.6 }, areaStyle: { opacity: 0.16 }, symbol: 'none' }
      : { type: 'bar', data: values, barMaxWidth: 34, itemStyle: { borderRadius: [6, 6, 0, 0] } }],
  };
}

export default function EChart({ spec }: { spec: ChartSpec }) {
  const ref = useRef<HTMLDivElement>(null);
  const { primary, dark } = useTheme();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption(optionFor(spec, { brand: primary, dark }));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [spec, primary, dark]);
  return <div ref={ref} className="chart-box" role="img" aria-label={spec.title} />;
}
