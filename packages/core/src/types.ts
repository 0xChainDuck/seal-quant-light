export type ExchangeId = 'binance' | 'okx' | 'bybit' | 'bitget';

export type MarketType = 'spot' | 'swap' | 'future';

export type Timeframe =
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '6h'
  | '12h'
  | '1d';

export type Bar = {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BarSeries = {
  exchange?: ExchangeId;
  marketType?: MarketType;
  symbol: string;
  timeframe: Timeframe;
  ts: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
};

export type NumericSeries = Array<number | null>;

export type OrderBookLevel = {
  price: number;
  amount: number;
};

export type OrderBookSnapshot = {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  ts: number;
  nonce?: number;
};

export type TradeTick = {
  id?: string;
  ts: number;
  price: number;
  amount: number;
  side?: 'buy' | 'sell';
};

export type SeriesPoint = {
  ts: number;
  value: number | null;
};

export type MarketSelection = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  timeframe: Timeframe;
};

export type MarketStatus = 'idle' | 'loading' | 'live' | 'error';

export type MarketSummary = {
  exchange: ExchangeId;
  marketType: MarketType;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: number | null;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
  openInterest: number | null;
  openInterestChange24h: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  liquidation24h: number | null;
};

export type MarketOverview = {
  exchange: ExchangeId;
  marketType: MarketType;
  quoteAsset: string;
  sources: Array<'ccxt' | 'coinglass'>;
  updatedAt: number;
  markets: MarketSummary[];
};
