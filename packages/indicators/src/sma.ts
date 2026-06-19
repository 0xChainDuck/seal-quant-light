import { smaValues, clampPeriod, mergeParams } from './math.js';
import type { IndicatorDefinition } from './types.js';

export type SmaParams = {
  period: number;
  source: 'close';
};

const defaultParams: SmaParams = {
  period: 20,
  source: 'close'
};

export const sma: IndicatorDefinition<SmaParams> = {
  id: 'sma',
  name: 'SMA',
  defaultParams,
  normalizeParams(params) {
    const merged = mergeParams(defaultParams, params);
    return {
      period: clampPeriod(merged.period, defaultParams.period),
      source: 'close'
    };
  },
  warmup(params) {
    return params.period;
  },
  compute({ series, params }) {
    const values = smaValues(series.close, params.period);

    return {
      id: 'sma',
      name: `SMA ${params.period}`,
      warmup: params.period,
      plots: [
        {
          id: `sma-${params.period}`,
          name: `SMA ${params.period}`,
          pane: 'price',
          style: 'line',
          color: '#7dd3fc',
          values
        }
      ]
    };
  }
};
