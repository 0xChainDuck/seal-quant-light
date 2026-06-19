import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateBars } from '../src/index.js';

test('aggregates lower timeframe bars into higher buckets', () => {
  const bars = [
    { ts: 0, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
    { ts: 60_000, open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
    { ts: 300_000, open: 2.5, high: 4, low: 2, close: 3.5, volume: 30 }
  ];

  assert.deepEqual(aggregateBars(bars, '5m'), [
    { ts: 0, open: 1, high: 3, low: 0.5, close: 2.5, volume: 30 },
    { ts: 300_000, open: 2.5, high: 4, low: 2, close: 3.5, volume: 30 }
  ]);
});
