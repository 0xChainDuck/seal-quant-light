import { isTimeframe } from '@seal-quant/core';
import type { ExchangeId, MarketSelection, MarketType, Timeframe } from '@seal-quant/core';
import { isExchangeId, isMarketType } from '@seal-quant/market';
import type { MarketRealtimeChannel } from '@seal-quant/market';

type RawQuery = Partial<Record<string, string>>;

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
}

export function parseLimit(value: unknown, fallback = 500): number {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 50), 1500);
}

export function parseOpenInterestLimit(value: unknown): number {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 10_000;

  if (!Number.isFinite(parsed)) {
    return 10_000;
  }

  return Math.min(Math.max(parsed, 100), 10_000);
}

export function parseOpenInterestSource(value: unknown): 'ccxt' | 'coinglass' {
  const raw = firstString(value);
  return raw === 'coinglass' ? 'coinglass' : 'ccxt';
}

export function parseHistoryDays(value: unknown): number {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 30;

  if (!Number.isFinite(parsed)) {
    return 30;
  }

  return Math.min(Math.max(parsed, 1), 30);
}

export function parseTimestamp(value: unknown): number | undefined {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parsePollMs(value: unknown): number {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 10_000;

  if (!Number.isFinite(parsed)) {
    return 10_000;
  }

  return Math.min(Math.max(parsed, 3_000), 60_000);
}

export function parseTradeLimit(value: unknown): number {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 100;

  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(Math.max(parsed, 20), 200);
}

export function parseOrderBookLimit(value: unknown): number {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 20;

  if (!Number.isFinite(parsed)) {
    return 20;
  }

  return Math.min(Math.max(parsed, 5), 50);
}

export function parseMarketChannels(value: unknown): MarketRealtimeChannel[] {
  const raw = firstString(value);
  if (!raw) {
    return ['ohlcv', 'trades', 'orderbook'];
  }

  const channels = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is MarketRealtimeChannel =>
      item === 'ohlcv' || item === 'trades' || item === 'orderbook'
    );

  return channels.length > 0 ? channels : ['ohlcv', 'trades', 'orderbook'];
}

export function parseMarketSelection(query: RawQuery): MarketSelection {
  const exchangeValue = firstString(query.exchange) ?? 'binance';
  const marketTypeValue = firstString(query.marketType) ?? 'spot';
  const symbol = firstString(query.symbol) ?? 'BTC/USDT';
  const timeframeValue = firstString(query.timeframe) ?? '1m';

  if (!isExchangeId(exchangeValue)) {
    throw new Error(`Unsupported exchange: ${exchangeValue}`);
  }

  if (!isMarketType(marketTypeValue)) {
    throw new Error(`Unsupported market type: ${marketTypeValue}`);
  }

  if (!isTimeframe(timeframeValue)) {
    throw new Error(`Unsupported timeframe: ${timeframeValue}`);
  }

  return {
    exchange: exchangeValue as ExchangeId,
    marketType: marketTypeValue as MarketType,
    symbol,
    timeframe: timeframeValue as Timeframe
  };
}
