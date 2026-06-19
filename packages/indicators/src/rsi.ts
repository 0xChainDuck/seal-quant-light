import { clampPeriod, createEmptySeries, mergeParams } from './math.js';
import type { IndicatorDefinition } from './types.js';

export type RsiParams = {
  period: number;
  source: 'close';
};

const defaultParams: RsiParams = {
  period: 14,
  source: 'close'
};

function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export const rsi: IndicatorDefinition<RsiParams> = {
  id: 'rsi',
  name: 'RSI',
  defaultParams,
  normalizeParams(params) {
    const merged = mergeParams(defaultParams, params);
    return {
      period: clampPeriod(merged.period, defaultParams.period),
      source: 'close'
    };
  },
  warmup(params) {
    return params.period + 1;
  },
  compute({ series, params }) {
    const values = createEmptySeries(series.close.length);
    let gainSum = 0;
    let lossSum = 0;

    for (let index = 1; index <= params.period; index += 1) {
      const change = (series.close[index] ?? 0) - (series.close[index - 1] ?? 0);
      if (change >= 0) {
        gainSum += change;
      } else {
        lossSum += Math.abs(change);
      }
    }

    let avgGain = gainSum / params.period;
    let avgLoss = lossSum / params.period;
    values[params.period] = toRsi(avgGain, avgLoss);

    for (let index = params.period + 1; index < series.close.length; index += 1) {
      const change = (series.close[index] ?? 0) - (series.close[index - 1] ?? 0);
      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);
      avgGain = (avgGain * (params.period - 1) + gain) / params.period;
      avgLoss = (avgLoss * (params.period - 1) + loss) / params.period;
      values[index] = toRsi(avgGain, avgLoss);
    }

    return {
      id: 'rsi',
      name: `RSI ${params.period}`,
      warmup: params.period + 1,
      plots: [
        {
          id: `rsi-${params.period}`,
          name: `RSI ${params.period}`,
          pane: 'oscillator',
          style: 'line',
          color: '#a78bfa',
          values
        }
      ]
    };
  }
};
