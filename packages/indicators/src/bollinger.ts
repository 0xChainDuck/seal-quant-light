import { clampPeriod, createEmptySeries, mergeParams, smaValues } from './math.js';
import type { IndicatorDefinition } from './types.js';

export type BollingerParams = {
  period: number;
  multiplier: number;
  source: 'close';
};

const defaultParams: BollingerParams = {
  period: 20,
  multiplier: 2,
  source: 'close'
};

export const bollinger: IndicatorDefinition<BollingerParams> = {
  id: 'bollinger',
  name: 'Bollinger Bands',
  defaultParams,
  normalizeParams(params) {
    const merged = mergeParams(defaultParams, params);
    return {
      period: clampPeriod(merged.period, defaultParams.period),
      multiplier:
        Number.isFinite(merged.multiplier) && merged.multiplier > 0
          ? merged.multiplier
          : defaultParams.multiplier,
      source: 'close'
    };
  },
  warmup(params) {
    return params.period;
  },
  compute({ series, params }) {
    const middle = smaValues(series.close, params.period);
    const upper = createEmptySeries(series.close.length);
    const lower = createEmptySeries(series.close.length);

    for (let index = params.period - 1; index < series.close.length; index += 1) {
      const start = index - params.period + 1;
      const slice = series.close.slice(start, index + 1);
      const average = middle[index];
      if (average == null) {
        continue;
      }

      const variance =
        slice.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / params.period;
      const deviation = Math.sqrt(variance);
      upper[index] = average + deviation * params.multiplier;
      lower[index] = average - deviation * params.multiplier;
    }

    return {
      id: 'bollinger',
      name: `BOLL ${params.period}`,
      warmup: params.period,
      plots: [
        {
          id: `bollinger-${params.period}`,
          name: `BOLL ${params.period}`,
          pane: 'price',
          style: 'band',
          color: '#60a5fa',
          upper,
          middle,
          lower
        }
      ]
    };
  }
};
