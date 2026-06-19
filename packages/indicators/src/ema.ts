import { clampPeriod, emaValues, mergeParams } from './math.js';
import type { IndicatorDefinition } from './types.js';

export type EmaParams = {
  period: number;
  source: 'close';
};

const defaultParams: EmaParams = {
  period: 20,
  source: 'close'
};

export const ema: IndicatorDefinition<EmaParams> = {
  id: 'ema',
  name: 'EMA',
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
    const values = emaValues(series.close, params.period);

    return {
      id: 'ema',
      name: `EMA ${params.period}`,
      warmup: params.period,
      plots: [
        {
          id: `ema-${params.period}`,
          name: `EMA ${params.period}`,
          pane: 'price',
          style: 'line',
          color: '#f2b84b',
          values
        }
      ]
    };
  }
};
