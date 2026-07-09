import ccxt from 'ccxt';
import type { Bar, ExchangeId, MarketType, Timeframe } from '@seal-quant/core';
import { SUPPORTED_EXCHANGES } from './exchanges.js';
import { resolveCcxtProxyConfig } from './proxy.js';

type CcxtMarket = {
  symbol: string;
  type?: string;
  active?: boolean;
  spot?: boolean;
  swap?: boolean;
  future?: boolean;
  contract?: boolean;
};

type CcxtExchange = {
  has?: Record<string, unknown>;
  loadMarkets: () => Promise<Record<string, CcxtMarket>>;
  fetchOHLCV: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number
  ) => Promise<number[][]>;
  fetchOpenInterestHistory?: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>
  ) => Promise<CcxtOpenInterest[]>;
  fetchOpenInterest?: (
    symbol: string,
    params?: Record<string, unknown>
  ) => Promise<CcxtOpenInterest | undefined>;
  loadProxyModules?: () => Promise<void>;
  close?: () => Promise<void>;
};

type CcxtConstructor = new (config: Record<string, unknown>) => CcxtExchange;

export type CcxtTrade = {
  id?: string;
  timestamp?: number;
  datetime?: string;
  price?: number;
  amount?: number;
  side?: string;
};

export type CcxtOrderBook = {
  bids?: number[][];
  asks?: number[][];
  timestamp?: number;
  nonce?: number;
};

type CcxtOpenInterest = {
  timestamp?: number | string;
  datetime?: string;
  openInterestAmount?: number | string;
  openInterestValue?: number | string;
  baseVolume?: number | string;
  quoteVolume?: number | string;
};

export type CcxtProExchange = CcxtExchange & {
  watchOHLCV: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>
  ) => Promise<number[][]>;
  watchTrades: (
    symbol: string,
    since?: number,
    limit?: number,
    params?: Record<string, unknown>
  ) => Promise<CcxtTrade[]>;
  watchOrderBook: (
    symbol: string,
    limit?: number,
    params?: Record<string, unknown>
  ) => Promise<CcxtOrderBook>;
};

type CcxtProConstructor = new (config: Record<string, unknown>) => CcxtProExchange;
type MarketSymbolCacheEntry = {
  symbols: string[];
  expiresAt: number;
};

export type FetchOhlcvRequest = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
  since?: number;
};

export type OpenInterestPoint = {
  ts: number;
  amount: number | null;
  value: number | null;
};

export type FetchOpenInterestHistoryRequest = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
  since?: number;
};

export type OpenInterestHistory = {
  sourceTimeframe: Timeframe;
  points: OpenInterestPoint[];
};

export type OpenInterestSnapshot = {
  sourceTimeframe: Timeframe;
  point: OpenInterestPoint | null;
};

const MARKET_SYMBOL_CACHE_TTL_MS = 6 * 60 * 60_000;
const marketSymbolCache = new Map<string, MarketSymbolCacheEntry>();

function marketSymbolCacheKey(exchangeId: ExchangeId, marketType: MarketType): string {
  return `${exchangeId}:${marketType}`;
}

function resolveDefaultType(exchange: ExchangeId, marketType: MarketType): string {
  if (marketType === 'spot') {
    return 'spot';
  }

  if (exchange === 'binance') {
    return 'future';
  }

  return 'swap';
}

function resolveExchangeOptions(exchange: ExchangeId, marketType: MarketType): Record<string, unknown> {
  const options: Record<string, unknown> = {
    defaultType: resolveDefaultType(exchange, marketType)
  };

  if (exchange === 'binance') {
    options.fetchMarkets = {
      types: marketType === 'spot' ? ['spot'] : ['linear']
    };
  }

  return options;
}

function createExchange<TExchange extends CcxtExchange>(
  ExchangeConstructor: (new (config: Record<string, unknown>) => TExchange) | undefined,
  exchange: ExchangeId,
  marketType: MarketType
): TExchange {
  if (!ExchangeConstructor) {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  return new ExchangeConstructor({
    enableRateLimit: true,
    timeout: 30_000,
    ...resolveCcxtProxyConfig(),
    options: resolveExchangeOptions(exchange, marketType)
  });
}

export async function loadCcxtProxyModules(exchange: CcxtExchange): Promise<void> {
  if (Object.keys(resolveCcxtProxyConfig()).length > 0) {
    await exchange.loadProxyModules?.();
  }
}

export function createCcxtExchange(exchange: ExchangeId, marketType: MarketType): CcxtExchange {
  const exchangeConstructors = ccxt as unknown as Record<string, CcxtConstructor | undefined>;
  return createExchange(exchangeConstructors[exchange], exchange, marketType);
}

export function createCcxtProExchange(exchange: ExchangeId, marketType: MarketType): CcxtProExchange {
  const ccxtWithPro = ccxt as unknown as {
    pro?: Record<string, CcxtProConstructor | undefined>;
  };

  return createExchange(ccxtWithPro.pro?.[exchange], exchange, marketType);
}

export async function fetchOhlcv(request: FetchOhlcvRequest): Promise<Bar[]> {
  const limit = request.limit ?? 500;
  const exchange = createCcxtExchange(request.exchange, request.marketType);

  try {
    const rows = await exchange.fetchOHLCV(request.symbol, request.timeframe, request.since, limit);

    return rows
      .map((row) => ({
        ts: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
      }))
      .filter(
        (bar) =>
          Number.isFinite(bar.ts) &&
          Number.isFinite(bar.open) &&
          Number.isFinite(bar.high) &&
          Number.isFinite(bar.low) &&
          Number.isFinite(bar.close) &&
          Number.isFinite(bar.volume)
      )
      .sort((a, b) => a.ts - b.ts);
  } finally {
    await exchange.close?.();
  }
}

export function resolveOpenInterestTimeframe(exchange: ExchangeId, timeframe: Timeframe): Timeframe {
  if (exchange === 'okx') {
    if (timeframe === '1d') {
      return '1d';
    }

    return timeframe.endsWith('h') ? '1h' : '5m';
  }

  if (timeframe === '1m' || timeframe === '3m' || timeframe === '5m') {
    return '5m';
  }

  if (timeframe === '2h') {
    return '1h';
  }

  if (timeframe === '6h' || timeframe === '12h') {
    return '4h';
  }

  return timeframe;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function openInterestAmount(row: CcxtOpenInterest): number | null {
  return finiteNumber(row.openInterestAmount ?? row.baseVolume);
}

function openInterestValue(row: CcxtOpenInterest): number | null {
  return finiteNumber(row.openInterestValue);
}

function openInterestTimestamp(row: CcxtOpenInterest): number {
  const timestamp = finiteNumber(row.timestamp);
  if (timestamp !== null) {
    return timestamp;
  }

  const parsed = row.datetime ? Date.parse(row.datetime) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toOpenInterestPoint(row: CcxtOpenInterest, fallbackTs?: number): OpenInterestPoint | null {
  const ts = openInterestTimestamp(row);
  const point = {
    ts: Number.isFinite(ts) ? ts : (fallbackTs ?? Number.NaN),
    amount: openInterestAmount(row),
    value: openInterestValue(row)
  };

  return Number.isFinite(point.ts) && (point.amount !== null || point.value !== null) ? point : null;
}

export async function fetchOpenInterestHistory(
  request: FetchOpenInterestHistoryRequest
): Promise<OpenInterestHistory> {
  const sourceTimeframe = resolveOpenInterestTimeframe(request.exchange, request.timeframe);

  if (request.marketType === 'spot') {
    return {
      sourceTimeframe,
      points: []
    };
  }

  const exchange = createCcxtExchange(request.exchange, request.marketType);

  try {
    if (!exchange.fetchOpenInterestHistory || exchange.has?.fetchOpenInterestHistory === false) {
      return {
        sourceTimeframe,
        points: []
      };
    }

    const rows = await exchange.fetchOpenInterestHistory(
      request.symbol,
      sourceTimeframe,
      request.since,
      request.limit ?? 5000,
      { paginate: true }
    );

    return {
      sourceTimeframe,
      points: rows
        .map((row) => toOpenInterestPoint(row))
        .filter((point): point is OpenInterestPoint => point !== null)
        .sort((a, b) => a.ts - b.ts)
    };
  } finally {
    await exchange.close?.();
  }
}

export async function fetchOpenInterestSnapshot(
  request: FetchOpenInterestHistoryRequest
): Promise<OpenInterestSnapshot> {
  const sourceTimeframe = resolveOpenInterestTimeframe(request.exchange, request.timeframe);

  if (request.marketType === 'spot') {
    return {
      sourceTimeframe,
      point: null
    };
  }

  const exchange = createCcxtExchange(request.exchange, request.marketType);

  try {
    if (!exchange.fetchOpenInterest || exchange.has?.fetchOpenInterest === false) {
      return {
        sourceTimeframe,
        point: null
      };
    }

    const params = request.exchange === 'bybit' ? { interval: sourceTimeframe } : {};
    const row = await exchange.fetchOpenInterest(request.symbol, params);

    return {
      sourceTimeframe,
      point: row ? toOpenInterestPoint(row, Date.now()) : null
    };
  } finally {
    await exchange.close?.();
  }
}

function matchesMarketType(market: CcxtMarket, marketType: MarketType): boolean {
  if (marketType === 'spot') {
    return market.spot === true && market.contract !== true && market.swap !== true && market.future !== true;
  }

  if (marketType === 'swap') {
    return market.swap === true || market.type === 'swap';
  }

  return market.contract === true || market.swap === true || market.future === true || market.type === 'swap' || market.type === 'future';
}

export async function fetchMarketSymbols(
  exchangeId: ExchangeId,
  marketType: MarketType,
  options: { refresh?: boolean } = {}
): Promise<string[]> {
  const cacheKey = marketSymbolCacheKey(exchangeId, marketType);
  const cached = marketSymbolCache.get(cacheKey);
  if (!options.refresh && cached && cached.expiresAt > Date.now()) {
    return cached.symbols;
  }

  const exchange = createCcxtExchange(exchangeId, marketType);

  try {
    const markets = await exchange.loadMarkets();
    const symbols = Object.values(markets)
      .filter((market) => market.active !== false)
      .filter((market) => matchesMarketType(market, marketType))
      .map((market) => market.symbol)
      .filter((symbol) => symbol.includes('/'))
      .sort((a, b) => a.localeCompare(b));

    const uniqueSymbols = [...new Set(symbols)];
    marketSymbolCache.set(cacheKey, {
      symbols: uniqueSymbols,
      expiresAt: Date.now() + MARKET_SYMBOL_CACHE_TTL_MS
    });

    return uniqueSymbols;
  } finally {
    await exchange.close?.();
  }
}

export function clearMarketSymbolCache(exchangeId?: ExchangeId, marketType?: MarketType): void {
  if (exchangeId && marketType) {
    marketSymbolCache.delete(marketSymbolCacheKey(exchangeId, marketType));
    return;
  }

  if (exchangeId) {
    for (const key of marketSymbolCache.keys()) {
      if (key.startsWith(`${exchangeId}:`)) {
        marketSymbolCache.delete(key);
      }
    }
    return;
  }

  marketSymbolCache.clear();
}

export function getSupportedExchanges() {
  return SUPPORTED_EXCHANGES;
}
