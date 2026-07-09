import type { ExchangeId, MarketType } from '@seal-quant/core';

export type SupportedExchange = {
  id: ExchangeId;
  name: string;
  marketTypes: MarketType[];
  defaultSymbol: string;
};

export const SUPPORTED_EXCHANGES: SupportedExchange[] = [
  {
    id: 'binance',
    name: 'Binance',
    marketTypes: ['spot', 'future'],
    defaultSymbol: 'BTC/USDT'
  },
  {
    id: 'okx',
    name: 'OKX',
    marketTypes: ['spot', 'future'],
    defaultSymbol: 'BTC/USDT'
  },
  {
    id: 'bybit',
    name: 'Bybit',
    marketTypes: ['spot', 'future'],
    defaultSymbol: 'BTC/USDT'
  },
  {
    id: 'bitget',
    name: 'Bitget',
    marketTypes: ['spot', 'future'],
    defaultSymbol: 'BTC/USDT'
  }
];

export function isExchangeId(value: string): value is ExchangeId {
  return SUPPORTED_EXCHANGES.some((exchange) => exchange.id === value);
}

export function isMarketType(value: string): value is MarketType {
  return value === 'spot' || value === 'swap' || value === 'future';
}
