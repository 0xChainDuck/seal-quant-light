# Seal Quant Light

TypeScript market intelligence and indicator research workspace. The application combines exchange-native ccxt/ccxt.pro data with CoinGlass derivatives data behind shared domain models.

## Product surfaces

- `/`: market dashboard with exchange, spot/futures, quote-asset, search and sortable market metrics.
- `/market/:asset`: single-asset terminal with exchange/market selection, real-time K-line, indicators, order book and trades.

## Architecture

- `apps/server`: Fastify API and WebSocket gateway. Provider-specific payloads stop here.
- `apps/web`: React product shell, market dashboard and research terminal.
- `packages/core`: provider-independent market, series and overview types.
- `packages/market`: ccxt, ccxt.pro and CoinGlass adapters plus the unified market catalog service.
- `packages/indicators`: reusable K-line indicator registry and computation engine.
- `packages/chart-adapter`: conversion from domain series to lightweight-charts data.

The dashboard consumes `/api/market-overview`, which merges ccxt ticker data with CoinGlass market cap, aggregate open interest, funding and derivatives fields. Components do not parse provider payloads directly.

## Commands

```bash
nvm use default
pnpm install
pnpm dev
```

- Web: `http://127.0.0.1:5173`
- Server: `http://127.0.0.1:8787`

## Environment

Copy `.env.example` to `.env` and fill in the CoinGlass gateway key.

```bash
# 1: use the configured Clash proxy; 0: direct/system VPN networking.
SEAL_PROXY_ENABLED=0
SEAL_HTTP_PROXY=http://127.0.0.1:7890
SEAL_HTTPS_PROXY=http://127.0.0.1:7890
SEAL_WS_PROXY=http://127.0.0.1:7890
SEAL_WSS_PROXY=http://127.0.0.1:7890
SEAL_NO_PROXY=localhost,127.0.0.1,::1

COINGLASS_ENABLED=1
COINGLASS_BASE_URL=http://vip.coinglass.site
COINGLASS_API_KEY=cg_your_key
COINGLASS_OPEN_INTEREST_HISTORY_PATH=/api/futures/open-interest/history
COINGLASS_AGGREGATE_OPEN_INTEREST_HISTORY_PATHS=/api/futures/open-interest/aggregated-history,/api/futures/open-interest/aggregated-history-chart
COINGLASS_TIMEOUT_MS=12000
```

The browser never receives the CoinGlass key. The server injects `X-API-Key` and exposes a generic gateway at `/api/coinglass/*` for future data integrations.

Environment variables are read when the server starts. Restart `pnpm dev` after switching proxy mode.
