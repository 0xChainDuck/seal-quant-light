import {
  barsToSeries,
  seriesToBars,
  type BarSeries,
  type MarketSelection,
  type MarketStatus,
  type OrderBookSnapshot,
  type TradeTick
} from '@seal-quant/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartPanelConfig } from '../state/workspace.js';
import { buildMarketSocketUrl, fetchOhlcvPage, type MarketSocketMessage } from '../lib/api.js';

type MarketDataSnapshot = {
  status: MarketStatus;
  series: BarSeries | null;
  trades: TradeTick[];
  orderBook: OrderBookSnapshot | null;
  error: string | null;
  updatedAt: number | null;
};

export type MarketDataState = MarketDataSnapshot & {
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  loadMoreHistory: () => Promise<void>;
};

function mergeSeries(selection: MarketSelection, current: BarSeries | null, next: BarSeries): BarSeries {
  if (!current || current.ts.length === 0) {
    return next;
  }

  if (next.ts.length === 0) {
    return current;
  }

  const nextFirstTime = next.ts[0] ?? 0;
  const currentFirstTime = current.ts[0] ?? 0;
  const currentLastTime = current.ts.at(-1) ?? 0;

  if (nextFirstTime <= currentFirstTime && (next.ts.at(-1) ?? 0) >= currentLastTime) {
    return next;
  }

  if (nextFirstTime >= currentFirstTime) {
    const replaceIndex = current.ts.findIndex((ts) => ts >= nextFirstTime);
    if (replaceIndex >= 0) {
      return {
        ...selection,
        ts: [...current.ts.slice(0, replaceIndex), ...next.ts],
        open: [...current.open.slice(0, replaceIndex), ...next.open],
        high: [...current.high.slice(0, replaceIndex), ...next.high],
        low: [...current.low.slice(0, replaceIndex), ...next.low],
        close: [...current.close.slice(0, replaceIndex), ...next.close],
        volume: [...current.volume.slice(0, replaceIndex), ...next.volume]
      };
    }

    return {
      ...selection,
      ts: [...current.ts, ...next.ts],
      open: [...current.open, ...next.open],
      high: [...current.high, ...next.high],
      low: [...current.low, ...next.low],
      close: [...current.close, ...next.close],
      volume: [...current.volume, ...next.volume]
    };
  }

  const barsByTime = new Map<number, ReturnType<typeof seriesToBars>[number]>();

  for (const bar of current ? seriesToBars(current) : []) {
    barsByTime.set(bar.ts, bar);
  }

  for (const bar of seriesToBars(next)) {
    barsByTime.set(bar.ts, bar);
  }

  return barsToSeries({
    ...selection,
    bars: [...barsByTime.values()].sort((a, b) => a.ts - b.ts)
  });
}

export function useMarketData(panel: ChartPanelConfig): MarketDataState {
  const [state, setState] = useState<MarketDataSnapshot>({
    status: 'idle',
    series: null,
    trades: [],
    orderBook: null,
    error: null,
    updatedAt: null
  });
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selection = useMemo(
    () => ({
      exchange: panel.exchange,
      marketType: panel.marketType,
      symbol: panel.symbol,
      timeframe: panel.timeframe
    }),
    [panel.exchange, panel.marketType, panel.symbol, panel.timeframe]
  );

  const socketUrl = useMemo(
    () => buildMarketSocketUrl(selection, panel.limit, 100, 20, ['ohlcv']),
    [panel.limit, selection]
  );
  const tapeSelection = useMemo(
    () => ({
      exchange: panel.exchange,
      marketType: panel.marketType,
      symbol: panel.symbol,
      timeframe: '1m' as const
    }),
    [panel.exchange, panel.marketType, panel.symbol]
  );
  const tapeSocketUrl = useMemo(
    () => buildMarketSocketUrl(tapeSelection, panel.limit, 100, 20, ['trades', 'orderbook']),
    [panel.limit, tapeSelection]
  );

  const loadMoreHistory = useCallback(async () => {
    if (loadingHistory || !hasMoreHistory || !state.series || state.series.ts.length === 0) {
      return;
    }

    const before = Math.min(...state.series.ts);
    setLoadingHistory(true);

    try {
      const response = await fetchOhlcvPage(selection, panel.limit, before);
      if (response.series.ts.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      const loadedEarlier = Math.min(...response.series.ts) < before;
      setHasMoreHistory(response.series.ts.length >= panel.limit && loadedEarlier);
      setState((current) => ({
        ...current,
        series: mergeSeries(selection, response.series, current.series ?? response.series),
        error: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Failed to load history'
      }));
    } finally {
      setLoadingHistory(false);
    }
  }, [hasMoreHistory, loadingHistory, panel.limit, selection, state.series]);

  useEffect(() => {
    let disposed = false;
    const socket = new WebSocket(socketUrl);

    setHasMoreHistory(true);
    setLoadingHistory(false);
    setState((current) => ({
      ...current,
      status: 'loading',
      series: null,
      updatedAt: null,
      error: null
    }));

    socket.onmessage = (event) => {
      if (disposed) {
        return;
      }

      const message = JSON.parse(String(event.data)) as MarketSocketMessage;

      if (message.type === 'error') {
        setState((current) => ({
          ...current,
          status: 'error',
          error: message.message,
          updatedAt: message.serverTime
        }));
        return;
      }

      setState((current) => {
        if (message.type === 'orderbook') {
          return current;
        }

        return {
          ...current,
          status: 'live',
          series: mergeSeries(selection, current.series, message.series),
          error: null,
          updatedAt: message.serverTime
        };
      });
    };

    socket.onerror = () => {
      if (!disposed) {
        setState((current) => ({
          ...current,
          status: 'error',
          error: 'Market data socket error'
        }));
      }
    };

    socket.onclose = () => {
      if (!disposed) {
        setState((current) => ({
          ...current,
          status: current.status === 'error' ? 'error' : 'idle'
        }));
      }
    };

    return () => {
      disposed = true;
      socket.close();
    };
  }, [selection, socketUrl]);

  useEffect(() => {
    let disposed = false;
    const socket = new WebSocket(tapeSocketUrl);

    setState((current) => ({
      ...current,
      trades: [],
      orderBook: null
    }));

    socket.onmessage = (event) => {
      if (disposed) {
        return;
      }

      const message = JSON.parse(String(event.data)) as MarketSocketMessage;

      if (message.type === 'error') {
        setState((current) => ({
          ...current,
          status: 'error',
          error: message.message,
          updatedAt: message.serverTime
        }));
        return;
      }

      if (message.type === 'trades') {
        setState((current) => ({
          ...current,
          status: 'live',
          trades: message.trades,
          error: null,
          updatedAt: message.serverTime
        }));
        return;
      }

      if (message.type === 'orderbook') {
        setState((current) => ({
          ...current,
          status: 'live',
          orderBook: message.orderBook,
          error: null,
          updatedAt: message.serverTime
        }));
      }
    };

    socket.onerror = () => {
      if (!disposed) {
        setState((current) => ({
          ...current,
          status: 'error',
          error: 'Market tape socket error'
        }));
      }
    };

    return () => {
      disposed = true;
      socket.close();
    };
  }, [tapeSocketUrl]);

  return {
    ...state,
    hasMoreHistory,
    loadingHistory,
    loadMoreHistory
  };
}
