import type { BarSeries } from '@seal-quant/core';
import type { IndicatorResult } from '@seal-quant/indicators';

export type LightweightTime = number;

export type CandlePoint = {
  time: LightweightTime;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type HistogramPoint = {
  time: LightweightTime;
  value: number;
  color?: string;
};

export type LinePoint = {
  time: LightweightTime;
  value: number;
};

export type ChartSeries =
  | {
      id: string;
      name: string;
      pane: 'price' | 'oscillator';
      type: 'line' | 'histogram';
      color?: string;
      data: Array<LinePoint | HistogramPoint>;
    };

function toChartTime(ts: number): LightweightTime {
  return Math.floor(ts / 1000);
}

export function toCandles(series: BarSeries): CandlePoint[] {
  return series.ts.map((ts, index) => ({
    time: toChartTime(ts),
    open: series.open[index] ?? 0,
    high: series.high[index] ?? 0,
    low: series.low[index] ?? 0,
    close: series.close[index] ?? 0
  }));
}

export function toVolume(series: BarSeries): HistogramPoint[] {
  return series.ts.map((ts, index) => {
    const open = series.open[index] ?? 0;
    const close = series.close[index] ?? 0;
    return {
      time: toChartTime(ts),
      value: series.volume[index] ?? 0,
      color: close >= open ? 'rgba(0, 194, 168, 0.38)' : 'rgba(255, 92, 122, 0.38)'
    };
  });
}

function toLineData(series: BarSeries, values: Array<number | null>): LinePoint[] {
  return values.flatMap((value, index) => {
    if (value === null) {
      return [];
    }

    return [
      {
        time: toChartTime(series.ts[index] ?? 0),
        value
      }
    ];
  });
}

export function toIndicatorSeries(series: BarSeries, results: IndicatorResult[]): ChartSeries[] {
  return results.flatMap((result) =>
    result.plots.flatMap((plot) => {
      if (plot.style === 'band') {
        return [
          {
            id: `${plot.id}-upper`,
            name: `${plot.name} Upper`,
            pane: plot.pane,
            type: 'line' as const,
            ...(plot.color ? { color: plot.color } : {}),
            data: toLineData(series, plot.upper)
          },
          {
            id: `${plot.id}-middle`,
            name: `${plot.name} Middle`,
            pane: plot.pane,
            type: 'line' as const,
            color: '#94a3b8',
            data: toLineData(series, plot.middle)
          },
          {
            id: `${plot.id}-lower`,
            name: `${plot.name} Lower`,
            pane: plot.pane,
            type: 'line' as const,
            ...(plot.color ? { color: plot.color } : {}),
            data: toLineData(series, plot.lower)
          }
        ];
      }

      return [
        {
          id: plot.id,
          name: plot.name,
          pane: plot.pane,
          type: plot.style,
          ...(plot.color ? { color: plot.color } : {}),
          data: toLineData(series, plot.values)
        }
      ];
    })
  );
}
