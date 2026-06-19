import {
  clampPeriod,
  createEmptySeries,
  emaNullableValues,
  emaValues,
  mergeParams
} from './math.js';
import type { IndicatorDefinition } from './types.js';

export type MacdParams = {
  fast: number;
  slow: number;
  signal: number;
  source: 'close';
};

const defaultParams: MacdParams = {
  fast: 12,
  slow: 26,
  signal: 9,
  source: 'close'
};

export const macd: IndicatorDefinition<MacdParams> = {
  id: 'macd',
  name: 'MACD',
  defaultParams,
  normalizeParams(params) {
    const merged = mergeParams(defaultParams, params);
    const fast = clampPeriod(merged.fast, defaultParams.fast);
    const slow = Math.max(clampPeriod(merged.slow, defaultParams.slow), fast + 1);

    return {
      fast,
      slow,
      signal: clampPeriod(merged.signal, defaultParams.signal),
      source: 'close'
    };
  },
  warmup(params) {
    return params.slow + params.signal;
  },
  compute({ series, params }) {
    const fast = emaValues(series.close, params.fast);
    const slow = emaValues(series.close, params.slow);
    const line = createEmptySeries(series.close.length);

    for (let index = 0; index < series.close.length; index += 1) {
      if (fast[index] !== null && slow[index] !== null) {
        line[index] = (fast[index] ?? 0) - (slow[index] ?? 0);
      }
    }

    const signal = emaNullableValues(line, params.signal);
    const histogram = createEmptySeries(series.close.length);

    for (let index = 0; index < series.close.length; index += 1) {
      if (line[index] !== null && signal[index] !== null) {
        histogram[index] = (line[index] ?? 0) - (signal[index] ?? 0);
      }
    }

    return {
      id: 'macd',
      name: `MACD ${params.fast} ${params.slow} ${params.signal}`,
      warmup: params.slow + params.signal,
      plots: [
        {
          id: `macd-${params.fast}-${params.slow}`,
          name: 'MACD',
          pane: 'oscillator',
          style: 'line',
          color: '#00c2a8',
          values: line
        },
        {
          id: `macd-signal-${params.signal}`,
          name: 'Signal',
          pane: 'oscillator',
          style: 'line',
          color: '#ffbf69',
          values: signal
        },
        {
          id: `macd-histogram-${params.fast}-${params.slow}-${params.signal}`,
          name: 'Histogram',
          pane: 'oscillator',
          style: 'histogram',
          color: '#6ee7b7',
          values: histogram
        }
      ]
    };
  }
};
