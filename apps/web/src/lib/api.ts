import type { BarSeries, ExchangeId, MarketSelection, MarketType } from '@seal-quant/core';

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

export type OhlcvSocketMessage =
  | ({
      type: 'snapshot' | 'update';
      limit: number;
      bars: unknown[];
      series: BarSeries;
      serverTime: number;
    } & MarketSelection)
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

export function buildOhlcvSocketUrl(selection: MarketSelection, limit: number, pollMs: number): string {
  const url = new URL(SERVER_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws/ohlcv';
  url.searchParams.set('exchange', selection.exchange);
  url.searchParams.set('marketType', selection.marketType);
  url.searchParams.set('symbol', selection.symbol);
  url.searchParams.set('timeframe', selection.timeframe);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('pollMs', String(pollMs));
  return url.toString();
}
