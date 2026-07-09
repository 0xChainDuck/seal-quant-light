import {
  barsToSeries,
  floorTime,
  trimBars,
  upsertBar,
  type Bar,
  type BarSeries,
  type MarketSelection,
  type OrderBookSnapshot,
  type TradeTick
} from '@seal-quant/core';
import {
  createCcxtProExchange,
  fetchOhlcv,
  loadCcxtProxyModules,
  type CcxtOrderBook,
  type CcxtTrade
} from './ccxt-provider.js';

export type MarketRealtimeRequest = MarketSelection & {
  limit?: number;
  tradeLimit?: number;
  orderBookLimit?: number;
  channels?: MarketRealtimeChannel[];
};

export type MarketRealtimeChannel = 'ohlcv' | 'trades' | 'orderbook';

type MarketRealtimeBase = MarketSelection & {
  limit: number;
  source: 'ccxt.pro';
  serverTime: number;
};

export type MarketRealtimeUpdate =
  | (MarketRealtimeBase & {
      type: 'snapshot';
      bars: Bar[];
      series: BarSeries;
      trades: TradeTick[];
      orderBook: OrderBookSnapshot | null;
    })
  | (MarketRealtimeBase & {
      type: 'ohlcv';
      bars: Bar[];
      series: BarSeries;
    })
  | (MarketRealtimeBase & {
      type: 'trades';
      bars: Bar[];
      series: BarSeries;
      trades: TradeTick[];
    })
  | (MarketRealtimeBase & {
      type: 'orderbook';
      orderBook: OrderBookSnapshot;
    });

export type MarketRealtimeError = MarketSelection & {
  type: 'error';
  message: string;
  serverTime: number;
};

export type MarketRealtimeStream = {
  close: () => Promise<void>;
};

type MarketRealtimeHandlers = {
  onUpdate: (update: MarketRealtimeUpdate) => void;
  onError: (error: MarketRealtimeError) => void;
};

function normalizeBars(rows: number[][]): Bar[] {
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
}

function toSeries(request: MarketRealtimeRequest, bars: Bar[]): BarSeries {
  return barsToSeries({
    bars,
    exchange: request.exchange,
    marketType: request.marketType,
    symbol: request.symbol,
    timeframe: request.timeframe
  });
}

function normalizeTrade(trade: CcxtTrade): TradeTick | null {
  const ts = Number(trade.timestamp ?? (trade.datetime ? Date.parse(trade.datetime) : Number.NaN));
  const price = Number(trade.price);
  const amount = Number(trade.amount);

  if (!Number.isFinite(ts) || !Number.isFinite(price) || !Number.isFinite(amount)) {
    return null;
  }

  const side = trade.side === 'buy' || trade.side === 'sell' ? trade.side : undefined;

  return {
    ...(trade.id ? { id: trade.id } : {}),
    ts,
    price,
    amount,
    ...(side ? { side } : {})
  };
}

function tradeKey(trade: TradeTick): string {
  return trade.id ?? `${trade.ts}:${trade.price}:${trade.amount}:${trade.side ?? ''}`;
}

function normalizeOrderBook(orderBook: CcxtOrderBook, limit: number): OrderBookSnapshot {
  const toLevels = (levels: number[][] | undefined) =>
    (levels ?? [])
      .slice(0, limit)
      .map((level) => ({
        price: Number(level[0]),
        amount: Number(level[1])
      }))
      .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.amount));

  return {
    bids: toLevels(orderBook.bids),
    asks: toLevels(orderBook.asks),
    ts: Number(orderBook.timestamp ?? Date.now()),
    ...(orderBook.nonce !== undefined ? { nonce: Number(orderBook.nonce) } : {})
  };
}

function mergeBars(current: Bar[], next: Bar[], limit: number): Bar[] {
  return trimBars(
    next.reduce((bars, bar) => upsertBar(bars, bar), current),
    limit
  );
}

function applyTradesToBars(current: Bar[], trades: TradeTick[], request: MarketRealtimeRequest, limit: number): Bar[] {
  return trimBars(
    trades.reduce((bars, trade) => {
      const ts = floorTime(trade.ts, request.timeframe);
      const previous = bars.find((bar) => bar.ts === ts);
      const next: Bar = previous
        ? {
            ...previous,
            high: Math.max(previous.high, trade.price),
            low: Math.min(previous.low, trade.price),
            close: trade.price,
            volume: previous.volume + trade.amount
          }
        : {
            ts,
            open: trade.price,
            high: trade.price,
            low: trade.price,
            close: trade.price,
            volume: trade.amount
          };

      return upsertBar(bars, next);
    }, current),
    limit
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function watchMarketRealtime(
  request: MarketRealtimeRequest,
  handlers: MarketRealtimeHandlers
): MarketRealtimeStream {
  const limit = request.limit ?? 500;
  const tradeLimit = request.tradeLimit ?? 100;
  const orderBookLimit = request.orderBookLimit ?? 20;
  const channels = new Set<MarketRealtimeChannel>(request.channels ?? ['ohlcv', 'trades', 'orderbook']);
  const shouldWatchOhlcv = channels.has('ohlcv');
  const shouldWatchTrades = channels.has('trades');
  const shouldWatchOrderBook = channels.has('orderbook');
  const exchange = createCcxtProExchange(request.exchange, request.marketType);
  const seenTrades = new Set<string>();
  const seenTradeQueue: string[] = [];
  let bars: Bar[] = [];
  let trades: TradeTick[] = [];
  let orderBook: OrderBookSnapshot | null = null;
  let closed = false;
  let seededTrades = false;
  let tradesTimer: ReturnType<typeof setTimeout> | null = null;
  let orderBookTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingTradesUpdate: MarketRealtimeUpdate | null = null;
  let pendingOrderBookUpdate: MarketRealtimeUpdate | null = null;

  const base = (): MarketRealtimeBase => ({
    exchange: request.exchange,
    marketType: request.marketType,
    symbol: request.symbol,
    timeframe: request.timeframe,
    limit,
    source: 'ccxt.pro',
    serverTime: Date.now()
  });

  const rememberTrade = (trade: TradeTick): boolean => {
    const key = tradeKey(trade);
    if (seenTrades.has(key)) {
      return false;
    }

    seenTrades.add(key);
    seenTradeQueue.push(key);

    if (seenTradeQueue.length > tradeLimit * 20) {
      const oldest = seenTradeQueue.shift();
      if (oldest) {
        seenTrades.delete(oldest);
      }
    }

    return true;
  };

  const emit = (update: MarketRealtimeUpdate) => {
    if (!closed) {
      handlers.onUpdate(update);
    }
  };

  const emitTrades = (update: MarketRealtimeUpdate) => {
    pendingTradesUpdate = update;
    if (tradesTimer) {
      return;
    }

    tradesTimer = setTimeout(() => {
      tradesTimer = null;
      const pending = pendingTradesUpdate;
      pendingTradesUpdate = null;
      if (pending) {
        emit(pending);
      }
    }, 300);
  };

  const emitOrderBook = (update: MarketRealtimeUpdate) => {
    pendingOrderBookUpdate = update;
    if (orderBookTimer) {
      return;
    }

    orderBookTimer = setTimeout(() => {
      orderBookTimer = null;
      const pending = pendingOrderBookUpdate;
      pendingOrderBookUpdate = null;
      if (pending) {
        emit(pending);
      }
    }, 300);
  };

  const reportError = (error: unknown) => {
    if (closed) {
      return;
    }

    handlers.onError({
      type: 'error',
      exchange: request.exchange,
      marketType: request.marketType,
      symbol: request.symbol,
      timeframe: request.timeframe,
      message: error instanceof Error ? error.message : 'Unknown realtime market error',
      serverTime: Date.now()
    });
  };

  const runLoop = (loop: () => Promise<void>) => {
    void (async () => {
      while (!closed) {
        try {
          await loop();
        } catch (error) {
          reportError(error);
          await delay(1_000);
        }
      }
    })();
  };

  void (async () => {
    try {
      await loadCcxtProxyModules(exchange);
    } catch (error) {
      reportError(error);
    }

    if (shouldWatchOhlcv) {
      try {
        bars = await fetchOhlcv({ ...request, limit });
        emit({
          ...base(),
          type: 'snapshot',
          bars,
          series: toSeries(request, bars),
          trades,
          orderBook
        });
      } catch (error) {
        reportError(error);
      }

      runLoop(async () => {
        const watched = await exchange.watchOHLCV(request.symbol, request.timeframe, undefined, limit);
        bars = mergeBars(bars, normalizeBars(watched), limit);
        emit({
          ...base(),
          type: 'ohlcv',
          bars,
          series: toSeries(request, bars)
        });
      });
    }

    if (shouldWatchTrades) {
      runLoop(async () => {
        const watched = await exchange.watchTrades(request.symbol, undefined, tradeLimit);
        const normalized = watched
          .map((trade) => normalizeTrade(trade))
          .filter((trade): trade is TradeTick => trade !== null)
          .sort((a, b) => a.ts - b.ts);
        const additions = normalized.filter((trade) => rememberTrade(trade));

        trades = [...trades, ...additions]
          .sort((a, b) => a.ts - b.ts)
          .slice(-tradeLimit);

        if (!seededTrades) {
          seededTrades = true;
        } else if (shouldWatchOhlcv && additions.length > 0) {
          bars = applyTradesToBars(bars, additions, request, limit);
        }

        emitTrades({
          ...base(),
          type: 'trades',
          bars,
          series: toSeries(request, bars),
          trades
        });
      });
    }

    if (shouldWatchOrderBook) {
      runLoop(async () => {
        orderBook = normalizeOrderBook(
          await exchange.watchOrderBook(request.symbol, orderBookLimit),
          orderBookLimit
        );
        emitOrderBook({
          ...base(),
          type: 'orderbook',
          orderBook
        });
      });
    }
  })();

  return {
    async close() {
      closed = true;
      if (tradesTimer) {
        clearTimeout(tradesTimer);
      }
      if (orderBookTimer) {
        clearTimeout(orderBookTimer);
      }
      await exchange.close?.();
    }
  };
}
