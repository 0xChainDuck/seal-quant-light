import type { ExchangeId, MarketOverview, MarketSummary, MarketType } from '@seal-quant/core';
import { fetchMarketTickers } from './ccxt-provider.js';
import {
  fetchCoinGlassCoinMarkets,
  isCoinGlassConfigured,
  type CoinGlassCoinMarket
} from './coinglass-provider.js';

export type FetchMarketOverviewRequest = {
  exchange: ExchangeId;
  marketType: MarketType;
  quoteAsset?: string;
  limit?: number;
  refresh?: boolean;
};

function coinMarketMap(rows: CoinGlassCoinMarket[]): Map<string, CoinGlassCoinMarket> {
  return new Map(rows.map((row) => [row.symbol, row]));
}

function toSummary(
  ticker: Awaited<ReturnType<typeof fetchMarketTickers>>[number],
  coinMarket: CoinGlassCoinMarket | undefined
): MarketSummary {
  return {
    exchange: ticker.exchange,
    marketType: ticker.marketType,
    symbol: ticker.symbol,
    baseAsset: ticker.baseAsset,
    quoteAsset: ticker.quoteAsset,
    price: ticker.price ?? coinMarket?.price ?? null,
    change24h: ticker.change24h ?? coinMarket?.change24h ?? null,
    high24h: ticker.high24h,
    low24h: ticker.low24h,
    volume24h: ticker.quoteVolume24h ?? coinMarket?.volume24h ?? null,
    marketCap: coinMarket?.marketCap ?? null,
    openInterest: coinMarket?.openInterest ?? null,
    openInterestChange24h: coinMarket?.openInterestChange24h ?? null,
    fundingRate: coinMarket?.fundingRate ?? null,
    longShortRatio: coinMarket?.longShortRatio ?? null,
    liquidation24h: coinMarket?.liquidation24h ?? null
  };
}

export async function fetchMarketOverview(
  request: FetchMarketOverviewRequest
): Promise<MarketOverview> {
  const quoteAsset = (request.quoteAsset ?? 'USDT').toUpperCase();
  const limit = Math.min(Math.max(request.limit ?? 200, 1), 500);
  const [tickers, coinMarkets] = await Promise.all([
    fetchMarketTickers(request.exchange, request.marketType, {
      ...(request.refresh !== undefined ? { refresh: request.refresh } : {})
    }),
    isCoinGlassConfigured()
      ? fetchCoinGlassCoinMarkets().catch(() => [])
      : Promise.resolve([])
  ]);
  const byCoin = coinMarketMap(coinMarkets);
  const seenAssets = new Set<string>();
  const markets: MarketSummary[] = [];

  for (const ticker of tickers) {
    if (
      ticker.quoteAsset !== quoteAsset ||
      seenAssets.has(ticker.baseAsset) ||
      (coinMarkets.length > 0 && !byCoin.has(ticker.baseAsset))
    ) {
      continue;
    }

    seenAssets.add(ticker.baseAsset);
    markets.push(toSummary(ticker, byCoin.get(ticker.baseAsset)));
    if (markets.length >= limit) {
      break;
    }
  }

  return {
    exchange: request.exchange,
    marketType: request.marketType,
    quoteAsset,
    sources: coinMarkets.length > 0 ? ['ccxt', 'coinglass'] : ['ccxt'],
    updatedAt: Date.now(),
    markets
  };
}
