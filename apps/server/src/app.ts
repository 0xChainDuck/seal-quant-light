import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { barsToSeries, timeframeToMs } from '@seal-quant/core';
import { listIndicators } from '@seal-quant/indicators';
import {
  fetchCoinGlassAggregateOpenInterestHistory,
  fetchCoinGlassOpenInterestHistory,
  fetchMarketSymbols,
  fetchOpenInterestHistory,
  fetchOpenInterestSnapshot,
  fetchOhlcv,
  getSupportedExchanges,
  requestCoinGlass,
  watchMarketRealtime
} from '@seal-quant/market';
import Fastify from 'fastify';
import {
  parseLimit,
  parseHistoryDays,
  parseMarketChannels,
  parseMarketSelection,
  parseOpenInterestLimit,
  parseOpenInterestSource,
  parseOrderBookLimit,
  parseTimestamp,
  parseTradeLimit
} from './query.js';

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

function coinGlassPathFromUrl(url: string | undefined): string {
  const parsed = new URL(url ?? '/', 'http://localhost');
  const prefix = '/api/coinglass';
  const path = parsed.pathname.startsWith(prefix)
    ? parsed.pathname.slice(prefix.length)
    : parsed.pathname;
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (normalized === '/' || normalized.includes('://') || normalized.startsWith('//')) {
    throw new Error('Invalid CoinGlass path');
  }

  return normalized.startsWith('/api/') ? normalized : `/api${normalized}`;
}

function queryWithoutApiKey(query: Partial<Record<string, string>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && key.toLowerCase() !== 'api_key') {
      result[key] = value;
    }
  }

  return result;
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
    const query = readQuery(request);
    const selection = parseMarketSelection(query);
    const symbols = await fetchMarketSymbols(selection.exchange, selection.marketType, {
      refresh: query.refresh === '1' || query.refresh === 'true'
    });

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
    const before = parseTimestamp(query.before);
    const since = before ? Math.max(0, before - timeframeToMs(selection.timeframe) * (limit + 1)) : undefined;
    const fetchedBars = await fetchOhlcv({
      ...selection,
      limit: before ? limit + 1 : limit,
      ...(since !== undefined ? { since } : {})
    });
    const bars = before
      ? fetchedBars
          .filter((bar) => bar.ts < before)
          .slice(-limit)
      : fetchedBars;

    return {
      ...selection,
      limit,
      ...(before !== undefined ? { before } : {}),
      bars,
      series: barsToSeries({
        bars,
        ...selection
      })
    };
  });

  app.get('/api/coinglass/open-interest/aggregate', async (request) => {
    const query = readQuery(request);
    const selection = parseMarketSelection(query);
    const days = parseHistoryDays(query.days);
    const limit = parseOpenInterestLimit(query.limit);
    const since = Date.now() - days * 24 * 60 * 60_000;
    const history = await fetchCoinGlassAggregateOpenInterestHistory({
      ...selection,
      limit,
      since
    });

    return {
      ...selection,
      metric: 'aggregateOpenInterest',
      source: 'coinglass',
      settle: 'USDT',
      days,
      limit,
      sourceTimeframe: history?.sourceTimeframe ?? selection.timeframe,
      points: history?.points ?? []
    };
  });

  app.get('/api/coinglass/*', async (request, reply) => {
    const query = readQuery(request);
    const upstream = await requestCoinGlass(coinGlassPathFromUrl(request.url), {
      query: queryWithoutApiKey(query)
    });

    reply.header('content-type', upstream.contentType);
    return reply.code(upstream.status).send(upstream.body);
  });

  app.get('/api/open-interest', async (request) => {
    const query = readQuery(request);
    const selection = parseMarketSelection(query);
    const days = parseHistoryDays(query.days);
    const limit = parseOpenInterestLimit(query.limit);
    const source = parseOpenInterestSource(query.source);
    const since = Date.now() - days * 24 * 60 * 60_000;
    const requestParams = {
      ...selection,
      limit,
      since
    };
    const history =
      source === 'coinglass'
        ? await fetchCoinGlassOpenInterestHistory(requestParams)
        : await fetchOpenInterestHistory(requestParams);

    return {
      ...selection,
      metric: 'openInterest',
      source,
      days,
      limit,
      sourceTimeframe: history?.sourceTimeframe ?? selection.timeframe,
      points: history?.points ?? []
    };
  });

  app.get('/api/open-interest/snapshot', async (request) => {
    const query = readQuery(request);
    const selection = parseMarketSelection(query);
    const snapshot = await fetchOpenInterestSnapshot(selection);

    return {
      ...selection,
      metric: 'openInterestSnapshot',
      sourceTimeframe: snapshot.sourceTimeframe,
      point: snapshot.point
    };
  });

  app.register(async (wsApp) => {
    wsApp.get('/ws/market', { websocket: true }, (connection, request) => {
      const socket = getSocket(connection as WebSocketConnection);
      const query = readQuery(request);
      const selection = parseMarketSelection(query);
      const limit = parseLimit(query.limit);
      const tradeLimit = parseTradeLimit(query.tradeLimit);
      const orderBookLimit = parseOrderBookLimit(query.orderBookLimit);
      const channels = parseMarketChannels(query.channels);
      const stream = watchMarketRealtime(
        {
          ...selection,
          limit,
          tradeLimit,
          orderBookLimit,
          channels
        },
        {
          onUpdate(update) {
            sendJson(socket, update);
          },
          onError(error) {
            sendJson(socket, error);
          }
        }
      );

      socket.on('close', () => {
        void stream.close();
      });

      socket.on('error', () => {
        void stream.close();
      });
    });
  });

  return app;
}
