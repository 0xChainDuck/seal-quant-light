import type { Bar, BarSeries, ExchangeId, MarketType, Timeframe } from './types.js';

export function barsToSeries(input: {
  bars: Bar[];
  symbol: string;
  timeframe: Timeframe;
  exchange?: ExchangeId;
  marketType?: MarketType;
}): BarSeries {
  const sorted = [...input.bars].sort((a, b) => a.ts - b.ts);

  const series: BarSeries = {
    symbol: input.symbol,
    timeframe: input.timeframe,
    ts: sorted.map((bar) => bar.ts),
    open: sorted.map((bar) => bar.open),
    high: sorted.map((bar) => bar.high),
    low: sorted.map((bar) => bar.low),
    close: sorted.map((bar) => bar.close),
    volume: sorted.map((bar) => bar.volume)
  };

  if (input.exchange !== undefined) {
    series.exchange = input.exchange;
  }

  if (input.marketType !== undefined) {
    series.marketType = input.marketType;
  }

  return series;
}

export function seriesToBars(series: BarSeries): Bar[] {
  return series.ts.map((ts, index) => ({
    ts,
    open: series.open[index] ?? Number.NaN,
    high: series.high[index] ?? Number.NaN,
    low: series.low[index] ?? Number.NaN,
    close: series.close[index] ?? Number.NaN,
    volume: series.volume[index] ?? 0
  }));
}

export function upsertBar(bars: Bar[], next: Bar): Bar[] {
  const last = bars.at(-1);

  if (!last || next.ts > last.ts) {
    return [...bars, next];
  }

  if (next.ts === last.ts) {
    return [...bars.slice(0, -1), next];
  }

  const index = bars.findIndex((bar) => bar.ts === next.ts);
  if (index < 0) {
    return [...bars, next].sort((a, b) => a.ts - b.ts);
  }

  return bars.map((bar, barIndex) => (barIndex === index ? next : bar));
}

export function trimBars(bars: Bar[], limit: number): Bar[] {
  if (bars.length <= limit) {
    return bars;
  }

  return bars.slice(bars.length - limit);
}
