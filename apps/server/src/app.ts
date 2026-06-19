import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { barsToSeries } from '@seal-quant/core';
import { listIndicators } from '@seal-quant/indicators';
import { fetchMarketSymbols, fetchOhlcv, getSupportedExchanges } from '@seal-quant/market';
import Fastify from 'fastify';
import { parseLimit, parseMarketSelection, parsePollMs } from './query.js';

type RequestWithQuery = {
  query?: unknown;
  url?: string;
};

type SocketLike = {
  send: (payload: string) => void;
  on: (event: 'close' | 'error', handler: () => void) => void;
};

type WebSocketConnection = SocketLike | { socket: SocketLike };

function readQuery(request: RequestWithQuery): Partial<Record<string, string>> {
  if (request.query && typeof request.query === 'object') {
    return request.query as Partial<Record<string, string>>;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function sendJson(socket: SocketLike, payload: unknown): void {
  socket.send(JSON.stringify(payload));
}

function getSocket(connection: WebSocketConnection): SocketLike {
  return 'socket' in connection ? connection.socket : connection;
}

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info'
    }
  });

  app.register(cors, {
    origin: true
  });

  app.register(websocket);

  app.get('/health', async () => ({
    ok: true
  }));

  app.get('/api/exchanges', async () => ({
    exchanges: getSupportedExchanges()
  }));

  app.get('/api/indicators', async () => ({
    indicators: listIndicators()
  }));

  app.get('/api/markets', async (request) => {
    const selection = parseMarketSelection(readQuery(request));
    const symbols = await fetchMarketSymbols(selection.exchange, selection.marketType);

    return {
      exchange: selection.exchange,
      marketType: selection.marketType,
      symbols
    };
  });

  app.get('/api/ohlcv', async (request) => {
    const query = readQuery(request);
    const selection = parseMarketSelection(query);
    const limit = parseLimit(query.limit);
    const bars = await fetchOhlcv({
      ...selection,
      limit
    });

    return {
      ...selection,
      limit,
      bars,
      series: barsToSeries({
        bars,
        ...selection
      })
    };
  });

  app.register(async (wsApp) => {
    wsApp.get('/ws/ohlcv', { websocket: true }, (connection, request) => {
      const socket = getSocket(connection as WebSocketConnection);
      const query = readQuery(request);
      const selection = parseMarketSelection(query);
      const limit = parseLimit(query.limit);
      const pollMs = parsePollMs(query.pollMs);
      let closed = false;

      const push = async (kind: 'snapshot' | 'update') => {
        try {
          const bars = await fetchOhlcv({
            ...selection,
            limit
          });

          if (!closed) {
            sendJson(socket, {
              type: kind,
              ...selection,
              limit,
              bars,
              series: barsToSeries({
                bars,
                ...selection
              }),
              serverTime: Date.now()
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown market data error';
          if (!closed) {
            sendJson(socket, {
              type: 'error',
              ...selection,
              message,
              serverTime: Date.now()
            });
          }
        }
      };

      void push('snapshot');
      const timer = setInterval(() => {
        void push('update');
      }, pollMs);

      socket.on('close', () => {
        closed = true;
        clearInterval(timer);
      });

      socket.on('error', () => {
        closed = true;
        clearInterval(timer);
      });
    });
  });

  return app;
}
