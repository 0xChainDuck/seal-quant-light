import type { BarSeries, NumericSeries } from '@seal-quant/core';

export type IndicatorPane = 'price' | 'oscillator';

export type IndicatorPlotStyle = 'line' | 'histogram' | 'band';

export type IndicatorPlot =
  | {
      id: string;
      name: string;
      pane: IndicatorPane;
      paneId?: string;
      paneName?: string;
      style: 'line' | 'histogram';
      color?: string;
      values: NumericSeries;
    }
  | {
      id: string;
      name: string;
      pane: IndicatorPane;
      paneId?: string;
      paneName?: string;
      style: 'band';
      color?: string;
      upper: NumericSeries;
      middle: NumericSeries;
      lower: NumericSeries;
    };

export type IndicatorInput<TParams> = {
  series: BarSeries;
  params: TParams;
};

export type IndicatorResult = {
  id: string;
  name: string;
  warmup: number;
  plots: IndicatorPlot[];
};

export type IndicatorDefinition<TParams extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  name: string;
  defaultParams: TParams;
  normalizeParams?: (params?: Partial<TParams>) => TParams;
  warmup: (params: TParams) => number;
  compute: (input: IndicatorInput<TParams>) => IndicatorResult;
};

export type IndicatorConfig<TParams extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  enabled?: boolean;
  params?: Partial<TParams>;
};
