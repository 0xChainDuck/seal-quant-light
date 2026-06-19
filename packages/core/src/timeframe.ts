import type { Timeframe } from './types.js';

export const TIMEFRAMES: Timeframe[] = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d'
];

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000
};

export function isTimeframe(value: string): value is Timeframe {
  return (TIMEFRAMES as string[]).includes(value);
}

export function timeframeToMs(timeframe: Timeframe): number {
  return TIMEFRAME_MS[timeframe];
}

export function floorTime(ts: number, timeframe: Timeframe): number {
  const bucket = timeframeToMs(timeframe);
  return Math.floor(ts / bucket) * bucket;
}

export function compareTimeframes(a: Timeframe, b: Timeframe): number {
  return timeframeToMs(a) - timeframeToMs(b);
}
