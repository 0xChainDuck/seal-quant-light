import { barsToSeries } from '@seal-quant/core';
import assert from 'node:assert/strict';
import test from 'node:test';
import { runIndicators } from '../src/index.js';

const bars = Array.from({ length: 60 }, (_, index) => ({
  ts: index * 60_000,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100 + index,
  volume: 10 + index
}));

test('runs registered indicators with shared output shape', () => {
  const series = barsToSeries({
    bars,
    symbol: 'BTC/USDT',
    timeframe: '1m'
  });

  const results = runIndicators(series, [
    { id: 'sma', params: { period: 5 } },
    { id: 'ema', params: { period: 5 } },
    { id: 'rsi', params: { period: 14 } },
    { id: 'macd' },
    { id: 'bollinger' }
  ]);

  assert.equal(results.length, 5);
  assert.equal(results[0]?.plots[0]?.style, 'line');
  assert.equal(results[2]?.plots[0]?.pane, 'oscillator');
});
