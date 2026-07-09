import type { OrderBookSnapshot, TradeTick } from '@seal-quant/core';
import type { CSSProperties } from 'react';
import { formatPrice, inferPricePrecision } from '../lib/format.js';

type MarketTapeProps = {
  orderBook: OrderBookSnapshot | null;
  trades: TradeTick[];
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Math.abs(value) >= 1 ? 5 : 8
  }).format(value);
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(ts));
}

function BookRow({
  side,
  price,
  amount,
  maxAmount,
  pricePrecision
}: {
  side: 'ask' | 'bid';
  price: number;
  amount: number;
  maxAmount: number;
  pricePrecision: number;
}) {
  const depth = maxAmount > 0 ? Math.min((amount / maxAmount) * 100, 100) : 0;

  return (
    <div className={`book-row is-${side}`}>
      <span className="book-depth" style={{ width: `${depth}%` }} />
      <span>{formatPrice(price, pricePrecision)}</span>
      <span>{formatAmount(amount)}</span>
    </div>
  );
}

export function MarketTape({ orderBook, trades }: MarketTapeProps) {
  const asks = orderBook?.asks.slice(0, 12).reverse() ?? [];
  const bids = orderBook?.bids.slice(0, 12) ?? [];
  const maxAmount = Math.max(
    0,
    ...asks.map((level) => level.amount),
    ...bids.map((level) => level.amount)
  );
  const bestAsk = orderBook?.asks[0]?.price;
  const bestBid = orderBook?.bids[0]?.price;
  const spread = bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : null;
  const visibleTrades = trades.slice().reverse();
  const pricePrecision = inferPricePrecision([
    ...asks.map((level) => level.price),
    ...bids.map((level) => level.price),
    ...visibleTrades.map((trade) => trade.price)
  ]);

  return (
    <aside className="market-tape">
      <section className="micro-panel orderbook-panel">
        <header className="micro-panel-header">
          <strong>Order Book</strong>
          <span>{orderBook ? formatTime(orderBook.ts) : '--:--:--'}</span>
        </header>
        <div className="book-head">
          <span>Price</span>
          <span>Amount</span>
        </div>
        <div className="book-side">
          {asks.map((level) => (
            <BookRow
              amount={level.amount}
              key={`ask-${level.price}`}
              maxAmount={maxAmount}
              price={level.price}
              pricePrecision={pricePrecision}
              side="ask"
            />
          ))}
        </div>
        <div className="spread-row">
          <span>Spread</span>
          <strong>{spread === null ? '--' : formatPrice(spread, pricePrecision)}</strong>
        </div>
        <div className="book-side">
          {bids.map((level) => (
            <BookRow
              amount={level.amount}
              key={`bid-${level.price}`}
              maxAmount={maxAmount}
              price={level.price}
              pricePrecision={pricePrecision}
              side="bid"
            />
          ))}
        </div>
      </section>

      <section className="micro-panel trades-panel">
        <header className="micro-panel-header">
          <strong>Trades</strong>
          <span>{visibleTrades.length}/100</span>
        </header>
        <div className="trade-head">
          <span>Time</span>
          <span>Price</span>
          <span>Amount</span>
        </div>
        <div className="trade-list">
          {visibleTrades.map((trade, index) => (
            <div
              className={`trade-row is-${trade.side ?? 'buy'}`}
              key={trade.id ?? `${trade.ts}-${trade.price}-${trade.amount}-${index}`}
              style={
                {
                  '--flash-color': trade.side === 'sell' ? 'rgba(255, 92, 122, 0.1)' : 'rgba(0, 194, 168, 0.1)'
                } as CSSProperties
              }
            >
              <span>{formatTime(trade.ts)}</span>
              <span>{formatPrice(trade.price, pricePrecision)}</span>
              <span>{formatAmount(trade.amount)}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
