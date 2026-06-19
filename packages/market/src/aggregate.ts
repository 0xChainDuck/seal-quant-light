import { floorTime } from '@seal-quant/core';
import type { Bar, Timeframe } from '@seal-quant/core';

export function aggregateBars(bars: Bar[], timeframe: Timeframe): Bar[] {
  const sorted = [...bars].sort((a, b) => a.ts - b.ts);
  const buckets = new Map<number, Bar>();

  for (const bar of sorted) {
    const bucketTs = floorTime(bar.ts, timeframe);
    const current = buckets.get(bucketTs);

    if (!current) {
      buckets.set(bucketTs, {
        ts: bucketTs,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume
      });
      continue;
    }

    current.high = Math.max(current.high, bar.high);
    current.low = Math.min(current.low, bar.low);
    current.close = bar.close;
    current.volume += bar.volume;
  }

  return [...buckets.values()].sort((a, b) => a.ts - b.ts);
}
