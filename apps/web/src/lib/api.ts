import type {
  BarSeries,
  ExchangeId,
  MarketSelection,
  MarketType,
  OrderBookSnapshot,
  Timeframe,
  TradeTick
} from '@seal-quant/core';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://127.0.0.1:8787';

export type ExchangeInfo = {
  id: ExchangeId;
  name: string;
  marketTypes: MarketType[];
  defaultSymbol: string;
};

export type ExchangesResponse = {
  exchanges: ExchangeInfo[];
};

export type MarketsResponse = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbols: string[];
};

export type OhlcvResponse = {
  limit: number;
  before?: number;
  bars: unknown[];
  series: BarSeries;
} & MarketSelection;

export type OpenInterestPoint = {
  ts: number;
  amount: number | null;
  value: number | null;
};

export type OpenInterestResponse = {
  metric: 'openInterest';
  source: 'ccxt' | 'coinglass';
  days: number;
  limit: number;
  sourceTimeframe: Timeframe;
  points: OpenInterestPoint[];
} & MarketSelection;

export type OpenInterestSnapshotResponse = {
  metric: 'openInterestSnapshot';
  sourceTimeframe: Timeframe;
  point: OpenInterestPoint | null;
} & MarketSelection;

export type CoinGlassAggregateOpenInterestResponse = {
  metric: 'aggregateOpenInterest';
  source: 'coinglass';
  settle: 'USDT';
  days: number;
  limit: number;
  sourceTimeframe: Timeframe;
  points: OpenInterestPoint[];
} & MarketSelection;

export type MarketSocketChannel = 'ohlcv' | 'trades' | 'orderbook';

type MarketSocketBase = {
  limit: number;
  serverTime: number;
  source?: 'ccxt.pro';
} & MarketSelection;

export type MarketSocketMessage =
  | ({
      type: 'snapshot';
      bars: unknown[];
      series: BarSeries;
      trades: TradeTick[];
      orderBook: OrderBookSnapshot | null;
    } & MarketSocketBase)
  | ({
      type: 'ohlcv';
      bars: unknown[];
      series: BarSeries;
    } & MarketSocketBase)
  | ({
      type: 'trades';
      bars: unknown[];
      series: BarSeries;
      trades: TradeTick[];
    } & MarketSocketBase)
  | ({
      type: 'orderbook';
      orderBook: OrderBookSnapshot;
    } & MarketSocketBase)
  | ({
      type: 'error';
      message: string;
      serverTime: number;
    } & MarketSelection);

export async function fetchExchanges(): Promise<ExchangesResponse> {
  const response = await fetch(`${SERVER_URL}/api/exchanges`);
  if (!response.ok) {
    throw new Error(`Failed to fetch exchanges: ${response.status}`);
  }

  return response.json() as Promise<ExchangesResponse>;
}

export async function fetchMarketSymbols(
  exchange: ExchangeId,
  marketType: MarketType
): Promise<MarketsResponse> {
  const url = new URL(`${SERVER_URL}/api/markets`);
  url.searchParams.set('exchange', exchange);
  url.searchParams.set('marketType', marketType);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch markets: ${response.status}`);
  }

  return response.json() as Promise<MarketsResponse>;
}

export async function fetchOhlcvPage(
  selection: MarketSelection,
  limit: number,
  before?: number
): Promise<OhlcvResponse> {
  const url = new URL(`${SERVER_URL}/api/ohlcv`);
  url.searchParams.set('exchange', selection.exchange);
  url.searchParams.set('marketType', selection.marketType);
  url.searchParams.set('symbol', selection.symbol);
  url.searchParams.set('timeframe', selection.timeframe);
  url.searchParams.set('limit', String(limit));
  if (before !== undefined) {
    url.searchParams.set('before', String(before));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch OHLCV: ${response.status}`);
  }

  return response.json() as Promise<OhlcvResponse>;
}

export async function fetchOpenInterest(
  selection: MarketSelection,
  days = 30,
  limit = 10_000,
  source: 'ccxt' | 'coinglass' = 'ccxt'
): Promise<OpenInterestResponse> {
  const url = new URL(`${SERVER_URL}/api/open-interest`);
  url.searchParams.set('exchange', selection.exchange);
  url.searchParams.set('marketType', selection.marketType);
  url.searchParams.set('symbol', selection.symbol);
  url.searchParams.set('timeframe', selection.timeframe);
  url.searchParams.set('days', String(days));
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('source', source);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch open interest: ${response.status}`);
  }

  return response.json() as Promise<OpenInterestResponse>;
}

export async function fetchOpenInterestSnapshot(
  selection: MarketSelection
): Promise<OpenInterestSnapshotResponse> {
  const url = new URL(`${SERVER_URL}/api/open-interest/snapshot`);
  url.searchParams.set('exchange', selection.exchange);
  url.searchParams.set('marketType', selection.marketType);
  url.searchParams.set('symbol', selection.symbol);
  url.searchParams.set('timeframe', selection.timeframe);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch open interest snapshot: ${response.status}`);
  }

  return response.json() as Promise<OpenInterestSnapshotResponse>;
}

export async function fetchCoinGlassAggregateOpenInterest(
  selection: MarketSelection,
  days = 30,
  limit = 10_000
): Promise<CoinGlassAggregateOpenInterestResponse> {
  const url = new URL(`${SERVER_URL}/api/coinglass/open-interest/aggregate`);
  url.searchParams.set('exchange', selection.exchange);
  url.searchParams.set('marketType', selection.marketType);
  url.searchParams.set('symbol', selection.symbol);
  url.searchParams.set('timeframe', selection.timeframe);
  url.searchParams.set('days', String(days));
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch CoinGlass aggregate open interest: ${response.status}`);
  }

  return response.json() as Promise<CoinGlassAggregateOpenInterestResponse>;
}

export async function fetchCoinGlass<T = unknown>(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${SERVER_URL}/api/coinglass${normalizedPath}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch CoinGlass: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function buildMarketSocketUrl(
  selection: MarketSelection,
  limit: number,
  tradeLimit = 100,
  orderBookLimit = 20,
  channels?: MarketSocketChannel[]
): string {
  const url = new URL(SERVER_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/market';
  url.searchParams.set('exchange', selection.exchange);
  url.searchParams.set('marketType', selection.marketType);
  url.searchParams.set('symbol', selection.symbol);
  url.searchParams.set('timeframe', selection.timeframe);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('tradeLimit', String(tradeLimit));
  url.searchParams.set('orderBookLimit', String(orderBookLimit));
  if (channels && channels.length > 0) {
    url.searchParams.set('channels', channels.join(','));
  }
  return url.toString();
}
