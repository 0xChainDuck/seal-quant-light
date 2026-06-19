import assert from 'node:assert/strict';
import test from 'node:test';
import { floorTime, timeframeToMs } from '../src/index.js';

test('converts timeframe to milliseconds', () => {
  assert.equal(timeframeToMs('1m'), 60_000);
  assert.equal(timeframeToMs('1h'), 3_600_000);
});

test('floors timestamps into buckets', () => {
  assert.equal(floorTime(125_000, '1m'), 120_000);
  assert.equal(floorTime(125_000, '5m'), 0);
});
