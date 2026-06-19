import ccxt from 'ccxt';
import type { Bar, ExchangeId, MarketType, Timeframe } from '@seal-quant/core';
import { SUPPORTED_EXCHANGES } from './exchanges.js';

type CcxtMarket = {
  symbol: string;
  active?: boolean;
  spot?: boolean;
  swap?: boolean;
  future?: boolean;
};

type CcxtExchange = {
  loadMarkets: () => Promise<Record<string, CcxtMarket>>;
  fetchOHLCV: (
    symbol: string,
    timeframe?: string,
    since?: number,
    limit?: number
  ) => Promise<number[][]>;
  close?: () => Promise<void>;
};

type CcxtConstructor = new (config: Record<string, unknown>) => CcxtExchange;

export type FetchOhlcvRequest = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
};

function resolveDefaultType(exchange: ExchangeId, marketType: MarketType): string {
  if (marketType === 'spot') {
    return 'spot';
  }

  if (exchange === 'binance') {
    return 'future';
  }

  return marketType;
}

function resolveProxyConfig(): Record<string, string> {
  const httpProxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const allProxy = process.env.ALL_PROXY ?? process.env.all_proxy;

  if (httpsProxy) {
    return { httpsProxy };
  }

  if (httpProxy) {
    return { httpProxy };
  }

  if (allProxy?.startsWith('socks')) {
    return { socksProxy: allProxy };
  }

  return {};
}

export function createCcxtExchange(exchange: ExchangeId, marketType: MarketType): CcxtExchange {
  const exchangeConstructors = ccxt as unknown as Record<string, CcxtConstructor | undefined>;
  const ExchangeConstructor = exchangeConstructors[exchange];

  if (!ExchangeConstructor) {
    throw new Error(`Unsupported exchange: ${exchange}`);
  }

  return new ExchangeConstructor({
    enableRateLimit: true,
    timeout: 30_000,
    ...resolveProxyConfig(),
    options: {
      defaultType: resolveDefaultType(exchange, marketType)
    }
  });
}

export async function fetchOhlcv(request: FetchOhlcvRequest): Promise<Bar[]> {
  const limit = request.limit ?? 500;
  const exchange = createCcxtExchange(request.exchange, request.marketType);

  try {
    const rows = await exchange.fetchOHLCV(request.symbol, request.timeframe, undefined, limit);

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

function matchesMarketType(market: CcxtMarket, marketType: MarketType): boolean {
  if (marketType === 'spot') {
    return market.spot === true;
  }

  if (marketType === 'swap') {
    return market.swap === true;
  }

  return market.future === true;
}

export async function fetchMarketSymbols(
  exchangeId: ExchangeId,
  marketType: MarketType
): Promise<string[]> {
  const exchange = createCcxtExchange(exchangeId, marketType);

  try {
    const markets = await exchange.loadMarkets();
    const symbols = Object.values(markets)
      .filter((market) => market.active !== false)
      .filter((market) => matchesMarketType(market, marketType))
      .map((market) => market.symbol)
      .filter((symbol) => symbol.includes('/'))
      .sort((a, b) => a.localeCompare(b));

    return [...new Set(symbols)];
  } finally {
    await exchange.close?.();
  }
}

export function getSupportedExchanges() {
  return SUPPORTED_EXCHANGES;
}
