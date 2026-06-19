import type { NumericSeries } from '@seal-quant/core';

export function createEmptySeries(length: number): NumericSeries {
  return Array.from({ length }, () => null);
}

export function smaValues(values: number[], period: number): NumericSeries {
  const output = createEmptySeries(values.length);
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] ?? 0;

    if (index >= period) {
      sum -= values[index - period] ?? 0;
    }

    if (index >= period - 1) {
      output[index] = sum / period;
    }
  }

  return output;
}

export function emaValues(values: number[], period: number): NumericSeries {
  const output = createEmptySeries(values.length);
  const multiplier = 2 / (period + 1);
  let seed = 0;
  let previous: number | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;

    if (index < period) {
      seed += value;
    }

    if (index === period - 1) {
      previous = seed / period;
      output[index] = previous;
      continue;
    }

    if (index >= period && previous !== null) {
      previous = (value - previous) * multiplier + previous;
      output[index] = previous;
    }
  }

  return output;
}

export function emaNullableValues(values: NumericSeries, period: number): NumericSeries {
  const output = createEmptySeries(values.length);
  const multiplier = 2 / (period + 1);
  let validCount = 0;
  let seed = 0;
  let previous: number | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value == null) {
      continue;
    }

    if (validCount < period) {
      seed += value;
      validCount += 1;
    }

    if (validCount === period && previous === null) {
      previous = seed / period;
      output[index] = previous;
      continue;
    }

    if (previous !== null) {
      previous = (value - previous) * multiplier + previous;
      output[index] = previous;
    }
  }

  return output;
}

export function mergeParams<T extends Record<string, unknown>>(
  defaults: T,
  params?: Partial<T>
): T {
  return {
    ...defaults,
    ...(params ?? {})
  };
}

export function clampPeriod(period: number, fallback: number): number {
  if (!Number.isFinite(period) || period < 1) {
    return fallback;
  }

  return Math.floor(period);
}
