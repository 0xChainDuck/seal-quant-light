import { isTimeframe } from '@seal-quant/core';
import type { ExchangeId, MarketSelection, MarketType, Timeframe } from '@seal-quant/core';
import { isExchangeId, isMarketType } from '@seal-quant/market';

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

export function parsePollMs(value: unknown): number {
  const raw = firstString(value);
  const parsed = raw ? Number.parseInt(raw, 10) : 10_000;

  if (!Number.isFinite(parsed)) {
    return 10_000;
  }

  return Math.min(Math.max(parsed, 3_000), 60_000);
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
