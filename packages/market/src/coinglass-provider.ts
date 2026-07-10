import type { ExchangeId, MarketType, Timeframe } from '@seal-quant/core';
import type {
  FetchOpenInterestHistoryRequest,
  OpenInterestHistory,
  OpenInterestPoint
} from './ccxt-provider.js';
import { fetchWithProxy } from './proxy.js';

export type CoinGlassPayload = {
  data?: unknown;
  code?: string | number;
  success?: boolean;
  msg?: string;
  message?: string;
};

export type CoinGlassConfig = {
  apiKey: string;
  baseUrl: string;
  historyPaths: string[];
  aggregateOpenInterestHistoryPaths: string[];
  aggregateOpenInterestExtraQuery: Record<string, string>;
  timeoutMs: number;
};

export type CoinGlassRequestOptions = {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export type CoinGlassProxyResponse = {
  status: number;
  contentType: string;
  body: unknown;
};

export type CoinGlassCoinMarket = {
  symbol: string;
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  openInterest: number | null;
  openInterestChange24h: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  liquidation24h: number | null;
};

type CacheEntry = {
  expiresAt: number;
  value: OpenInterestHistory;
};
type OhlcCloseField = 'amount' | 'value';

const DEFAULT_BASE_URL = 'http://vip.coinglass.site';
const DEFAULT_HISTORY_PATH = '/api/futures/open-interest/history';
const DEFAULT_AGGREGATE_OPEN_INTEREST_HISTORY_PATHS = [
  '/api/futures/open-interest/aggregated-history',
  '/api/futures/open-interest/aggregated-history-chart'
].join(',');
const DEFAULT_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 55_000;
const historyCache = new Map<string, CacheEntry>();
let coinMarketsCache: { expiresAt: number; value: CoinGlassCoinMarket[] } | null = null;

const EXCHANGE_NAMES: Record<ExchangeId, string> = {
  binance: 'Binance',
  okx: 'OKX',
  bybit: 'Bybit',
  bitget: 'Bitget'
};

export function getCoinGlassConfig(): CoinGlassConfig | null {
  const apiKey = process.env.COINGLASS_API_KEY?.trim();
  if (!apiKey || process.env.COINGLASS_ENABLED === '0') {
    return null;
  }

  const historyPaths = (process.env.COINGLASS_OPEN_INTEREST_HISTORY_PATHS?.trim() ||
    process.env.COINGLASS_OPEN_INTEREST_HISTORY_PATH?.trim() ||
    DEFAULT_HISTORY_PATH)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const aggregateOpenInterestHistoryPaths = (process.env.COINGLASS_AGGREGATE_OPEN_INTEREST_HISTORY_PATHS?.trim() ||
    process.env.COINGLASS_AGGREGATE_OPEN_INTEREST_HISTORY_PATH?.trim() ||
    DEFAULT_AGGREGATE_OPEN_INTEREST_HISTORY_PATHS)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    apiKey,
    baseUrl: process.env.COINGLASS_BASE_URL?.trim() || DEFAULT_BASE_URL,
    historyPaths,
    aggregateOpenInterestHistoryPaths,
    aggregateOpenInterestExtraQuery: parseExtraQuery(process.env.COINGLASS_AGGREGATE_OPEN_INTEREST_QUERY),
    timeoutMs: Number.parseInt(process.env.COINGLASS_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS), 10)
  };
}

function cleanSymbol(symbol: string): string {
  return symbol.split(':')[0]!.replace(/[/_-]/g, '').toUpperCase();
}

function cleanBaseAsset(symbol: string): string {
  return symbol.split(':')[0]!.split('/')[0]!.replace(/[_-]/g, '').toUpperCase();
}

function parseExtraQuery(raw: string | undefined): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw ?? '').entries()) {
    query[key] = value;
  }

  return query;
}

function urlFor(configValue: CoinGlassConfig, path: string): URL {
  const base = configValue.baseUrl.replace(/\/+$/, '');
  const pathname = path.startsWith('/') ? path : `/${path}`;
  return new URL(`${base}${pathname}`);
}

function normalizeCoinGlassPath(path: string): string {
  const cleanPath = path.trim();
  const withLeadingSlash = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

  if (withLeadingSlash.startsWith('/api/')) {
    return withLeadingSlash;
  }

  return `/api${withLeadingSlash}`;
}

function applyQuery(url: URL, query?: Record<string, string | number | boolean | undefined>): URL {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<unknown>;
  }

  return response.text();
}

function cacheKey(
  request: FetchOpenInterestHistoryRequest,
  sourceTimeframe: Timeframe,
  namespace = 'open-interest'
): string {
  return [
    namespace,
    request.exchange,
    request.marketType,
    request.symbol,
    sourceTimeframe,
    request.since ?? '',
    request.limit ?? ''
  ].join(':');
}

function toSecondsOrMs(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function numberFrom(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function timeFrom(record: Record<string, unknown>): number | null {
  return toSecondsOrMs(
    record.ts ??
      record.time ??
      record.t ??
      record.timestamp ??
      record.date ??
      record.createTime ??
      record.openTime ??
      record.startTime ??
      record.endTime
  );
}

function pointFromRecord(
  record: Record<string, unknown>,
  ohlcCloseField: OhlcCloseField
): OpenInterestPoint | null {
  const ts = timeFrom(record);
  if (ts === null) {
    return null;
  }

  const amount = numberFrom(record, [
    'openInterestAmount',
    'open_interest_amount',
    'openInterestQuantity',
    'open_interest_quantity',
    'openInterestVolume',
    'open_interest_volume',
    'sumOpenInterest',
    'sum_open_interest',
    'sumOpenInterestAmount',
    'sum_open_interest_amount',
    'amount',
    'openInterest',
    'open_interest',
    'oi',
    'volume',
    'vol',
    'v'
  ]);
  const value = numberFrom(record, [
    'openInterestValue',
    'open_interest_value',
    'openInterestUsdValue',
    'open_interest_usd_value',
    'sumOpenInterestValue',
    'sum_open_interest_value',
    'sumOpenInterestUsd',
    'sum_open_interest_usd',
    'openInterestUsd',
    'open_interest_usd',
    'value',
    'usdValue',
    'usd_value',
    'notional'
  ]);
  const close = numberFrom(record, ['close', 'c']);
  const normalizedAmount = amount ?? (ohlcCloseField === 'amount' ? close : null);
  const normalizedValue = value ?? (ohlcCloseField === 'value' ? close : null);

  return normalizedAmount !== null || normalizedValue !== null
    ? {
        ts,
        amount: normalizedAmount,
        value: normalizedValue
      }
    : null;
}

function pointFromArray(row: unknown[], ohlcCloseField: OhlcCloseField): OpenInterestPoint | null {
  const ts = toSecondsOrMs(row[0]);
  const close = Number(row[4] ?? row[1]);
  if (ts === null || !Number.isFinite(close)) {
    return null;
  }

  return {
    ts,
    amount: ohlcCloseField === 'amount' ? close : null,
    value: ohlcCloseField === 'value' ? close : null
  };
}

function collectRows(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of [
      'openInterestList',
      'open_interest_list',
      'openInterestHistory',
      'open_interest_history',
      'openInterest',
      'open_interest',
      'oi',
      'list',
      'items',
      'rows',
      'history',
      'values',
      'data'
    ]) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[];
      }
    }

    const nestedRows = Object.values(record).flatMap((value) => {
      if (Array.isArray(value)) {
        return value;
      }

      if (value && typeof value === 'object') {
        return collectRows(value);
      }

      return [];
    });

    if (nestedRows.length > 0) {
      return nestedRows;
    }
  }

  return [];
}

function parsePoints(payload: CoinGlassPayload, ohlcCloseField: OhlcCloseField = 'amount'): OpenInterestPoint[] {
  return collectRows(payload.data)
    .map((row) => {
      if (Array.isArray(row)) {
        return pointFromArray(row, ohlcCloseField);
      }

      if (row && typeof row === 'object') {
        return pointFromRecord(row as Record<string, unknown>, ohlcCloseField);
      }

      return null;
    })
    .filter((point): point is OpenInterestPoint => point !== null)
    .sort((a, b) => a.ts - b.ts);
}

function ensureSuccess(payload: CoinGlassPayload): void {
  if (payload.success === false) {
    throw new Error(payload.message ?? payload.msg ?? 'CoinGlass request failed');
  }

  if (payload.code !== undefined && !['0', '200', 0, 200].includes(payload.code)) {
    throw new Error(payload.message ?? payload.msg ?? `CoinGlass error code ${payload.code}`);
  }
}

function resolveCoinGlassTimeframe(timeframe: Timeframe): Timeframe {
  return timeframe;
}

function withQuery(url: URL, request: FetchOpenInterestHistoryRequest, sourceTimeframe: Timeframe): URL {
  url.searchParams.set('exchange', EXCHANGE_NAMES[request.exchange]);
  url.searchParams.set('symbol', cleanSymbol(request.symbol));
  url.searchParams.set('interval', sourceTimeframe);
  if (request.since !== undefined) {
    url.searchParams.set('startTime', String(request.since));
    url.searchParams.set('start_time', String(request.since));
  }
  url.searchParams.set('endTime', String(Date.now()));
  url.searchParams.set('end_time', String(Date.now()));
  if (request.limit !== undefined) {
    url.searchParams.set('limit', String(request.limit));
  }

  return url;
}

function withAggregateOpenInterestQuery(
  url: URL,
  request: FetchOpenInterestHistoryRequest,
  sourceTimeframe: Timeframe,
  extraQuery: Record<string, string>
): URL {
  const baseAsset = cleanBaseAsset(request.symbol);
  url.searchParams.set('symbol', baseAsset);
  url.searchParams.set('coin', baseAsset);
  url.searchParams.set('interval', sourceTimeframe);
  url.searchParams.set('marginCoin', 'USDT');
  url.searchParams.set('currency', 'USDT');
  if (request.since !== undefined) {
    url.searchParams.set('startTime', String(request.since));
    url.searchParams.set('start_time', String(request.since));
  }
  url.searchParams.set('endTime', String(Date.now()));
  url.searchParams.set('end_time', String(Date.now()));
  if (request.limit !== undefined) {
    url.searchParams.set('limit', String(request.limit));
  }

  for (const [key, value] of Object.entries(extraQuery)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export function isCoinGlassConfigured(): boolean {
  return getCoinGlassConfig() !== null;
}

export async function requestCoinGlass(
  path: string,
  options: CoinGlassRequestOptions = {}
): Promise<CoinGlassProxyResponse> {
  const configValue = getCoinGlassConfig();
  if (!configValue) {
    throw new Error('CoinGlass is not configured');
  }

  const method = options.method ?? 'GET';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? configValue.timeoutMs);
  const url = applyQuery(urlFor(configValue, normalizeCoinGlassPath(path)), options.query);

  try {
    const response = await fetchWithProxy(url, {
      method,
      headers: {
        'X-API-Key': configValue.apiKey,
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers ?? {})
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal
    });

    return {
      status: response.status,
      contentType: response.headers.get('content-type') ?? 'application/json',
      body: await parseResponseBody(response)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchCoinGlassCoinMarkets(): Promise<CoinGlassCoinMarket[]> {
  if (coinMarketsCache && coinMarketsCache.expiresAt > Date.now()) {
    return coinMarketsCache.value;
  }

  const response = await requestCoinGlass('/api/futures/coins-markets');
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`CoinGlass request failed: ${response.status}`);
  }

  const payload = response.body as CoinGlassPayload;
  ensureSuccess(payload);
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const value = rows.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return [];
    }

    const record = row as Record<string, unknown>;
    const symbol = String(record.symbol ?? '').trim().toUpperCase();
    if (!symbol) {
      return [];
    }

    const longVolume = numberFrom(record, ['long_volume_usd_24h']);
    const shortVolume = numberFrom(record, ['short_volume_usd_24h']);

    return [{
      symbol,
      price: numberFrom(record, ['current_price', 'price']),
      change24h: numberFrom(record, ['price_change_percent_24h']),
      volume24h:
        longVolume !== null || shortVolume !== null
          ? (longVolume ?? 0) + (shortVolume ?? 0)
          : null,
      marketCap: numberFrom(record, ['market_cap_usd', 'market_cap']),
      openInterest: numberFrom(record, ['open_interest_usd']),
      openInterestChange24h: numberFrom(record, ['open_interest_change_percent_24h']),
      fundingRate: numberFrom(record, ['avg_funding_rate_by_oi']),
      longShortRatio: numberFrom(record, ['long_short_ratio_24h']),
      liquidation24h: numberFrom(record, ['liquidation_usd_24h'])
    }];
  });

  coinMarketsCache = {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS
  };

  return value;
}

export async function fetchCoinGlassOpenInterestHistory(
  request: FetchOpenInterestHistoryRequest
): Promise<OpenInterestHistory | null> {
  const configValue = getCoinGlassConfig();
  const sourceTimeframe = resolveCoinGlassTimeframe(request.timeframe);
  if (!configValue || request.marketType === 'spot') {
    return null;
  }

  const key = cacheKey(request, sourceTimeframe);
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let lastError: unknown = null;

  for (const historyPath of configValue.historyPaths) {
    try {
      const url = withQuery(new URL('http://localhost'), request, sourceTimeframe);
      const response = await requestCoinGlass(historyPath, {
        query: Object.fromEntries(url.searchParams.entries())
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`CoinGlass request failed: ${response.status}`);
      }

      const payload = response.body as CoinGlassPayload;
      ensureSuccess(payload);
      const result = {
        sourceTimeframe,
        points: parsePoints(payload, 'value')
      };

      historyCache.set(key, {
        value: result,
        expiresAt: Date.now() + CACHE_TTL_MS
      });

      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('CoinGlass request failed');
}

export async function fetchCoinGlassAggregateOpenInterestHistory(
  request: FetchOpenInterestHistoryRequest
): Promise<OpenInterestHistory | null> {
  const configValue = getCoinGlassConfig();
  const sourceTimeframe = resolveCoinGlassTimeframe(request.timeframe);
  if (!configValue) {
    return null;
  }

  const key = cacheKey(request, sourceTimeframe, 'aggregate-open-interest');
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let lastError: unknown = null;

  for (const historyPath of configValue.aggregateOpenInterestHistoryPaths) {
    try {
      const url = withAggregateOpenInterestQuery(
        new URL('http://localhost'),
        request,
        sourceTimeframe,
        configValue.aggregateOpenInterestExtraQuery
      );
      const response = await requestCoinGlass(historyPath, {
        query: Object.fromEntries(url.searchParams.entries())
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`CoinGlass request failed: ${response.status}`);
      }

      const payload = response.body as CoinGlassPayload;
      ensureSuccess(payload);
      const result = {
        sourceTimeframe,
        points: parsePoints(payload, 'value')
      };

      historyCache.set(key, {
        value: result,
        expiresAt: Date.now() + CACHE_TTL_MS
      });

      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('CoinGlass aggregate open interest request failed');
}
