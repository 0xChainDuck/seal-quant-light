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

When exchange access needs Clash, start the dev server with proxy variables:

```bash
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
ALL_PROXY=socks5://127.0.0.1:7890 \
pnpm dev
```
