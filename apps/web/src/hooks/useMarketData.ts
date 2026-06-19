import type { BarSeries, MarketStatus } from '@seal-quant/core';
import { useEffect, useMemo, useState } from 'react';
import type { ChartPanelConfig } from '../state/workspace.js';
import { buildOhlcvSocketUrl, type OhlcvSocketMessage } from '../lib/api.js';

export type MarketDataState = {
  status: MarketStatus;
  series: BarSeries | null;
  error: string | null;
  updatedAt: number | null;
};

export function useMarketData(panel: ChartPanelConfig): MarketDataState {
  const [state, setState] = useState<MarketDataState>({
    status: 'idle',
    series: null,
    error: null,
    updatedAt: null
  });

  const socketUrl = useMemo(
    () =>
      buildOhlcvSocketUrl(
        {
          exchange: panel.exchange,
          marketType: panel.marketType,
          symbol: panel.symbol,
          timeframe: panel.timeframe
        },
        panel.limit,
        panel.pollMs
      ),
    [panel.exchange, panel.limit, panel.marketType, panel.pollMs, panel.symbol, panel.timeframe]
  );

  useEffect(() => {
    let disposed = false;
    const socket = new WebSocket(socketUrl);

    setState((current) => ({
      ...current,
      status: 'loading',
      error: null
    }));

    socket.onmessage = (event) => {
      if (disposed) {
        return;
      }

      const message = JSON.parse(String(event.data)) as OhlcvSocketMessage;

      if (message.type === 'error') {
        setState((current) => ({
          ...current,
          status: 'error',
          error: message.message,
          updatedAt: message.serverTime
        }));
        return;
      }

      setState({
        status: 'live',
        series: message.series,
        error: null,
        updatedAt: message.serverTime
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
  }, [socketUrl]);

  return state;
}
