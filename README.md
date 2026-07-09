# Seal Quant Light

A lightweight TypeScript quant research workspace for exchange data, reusable indicators, multi-timeframe aggregation, and real-time charting.

## First version

- `apps/server`: Fastify API over ccxt with REST OHLCV and polling WebSocket streams.
- `apps/web`: Vite + React workspace for multi-exchange chart panels.
- `packages/core`: shared market types, timeframes, and series helpers.
- `packages/market`: exchange provider and OHLCV aggregation.
- `packages/indicators`: reusable indicator engine and built-in studies.
- `packages/chart-adapter`: serializable chart data adapters.

## Commands

```bash
nvm use default
pnpm install
pnpm dev
```

The server defaults to `http://localhost:8787`; the web app defaults to `http://localhost:5173`.

## Environment

Copy `.env.example` to `.env`, then fill in the CoinGlass gateway key:

```bash
SEAL_PROXY_ENABLED=1
SEAL_HTTP_PROXY=http://127.0.0.1:7890
SEAL_HTTPS_PROXY=http://127.0.0.1:7890
SEAL_WS_PROXY=http://127.0.0.1:7890
SEAL_WSS_PROXY=http://127.0.0.1:7890
SEAL_NO_PROXY=localhost,127.0.0.1,::1

COINGLASS_ENABLED=1
COINGLASS_BASE_URL=http://vip.coinglass.site
COINGLASS_API_KEY=cg_your_key
COINGLASS_OPEN_INTEREST_HISTORY_PATH=/api/futures/open-interest/ohlc-history
# Optional comma-separated fallbacks while checking official path variants:
# COINGLASS_OPEN_INTEREST_HISTORY_PATHS=/api/futures/open-interest/ohlc-history,/api/futures/open-interest/history
COINGLASS_AGGREGATE_OPEN_INTEREST_HISTORY_PATHS=/api/futures/open-interest/aggregated-history,/api/futures/open-interest/aggregated-history-chart
# Optional extra query string for aggregate OI. Default requests already include USDT settle params:
# COINGLASS_AGGREGATE_OPEN_INTEREST_QUERY=marginCoin=USDT
COINGLASS_TIMEOUT_MS=12000
```

CoinGlass is available as an independent server-side data source when `COINGLASS_API_KEY` is set.
The server exposes a generic CoinGlass gateway proxy at `/api/coinglass/*`; for example:

```bash
curl "http://127.0.0.1:8787/api/coinglass/api/futures/coins-markets"
```

The server injects `X-API-Key`, so the browser never sees the CoinGlass key. Open-interest history can
be requested explicitly from either source with `source=ccxt` or `source=coinglass`.
The chart also has CoinGlass-only aggregate USDT open-interest indicators through `AGG OI` and `AGG OI-RSI`.

When exchange or CoinGlass access needs Clash, keep `SEAL_PROXY_ENABLED=1` and point both HTTP and WSS
proxy variables to the local Clash HTTP proxy. `pnpm dev` will load `.env` automatically.
