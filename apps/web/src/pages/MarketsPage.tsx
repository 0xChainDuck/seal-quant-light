import type { ExchangeId, MarketSummary, MarketType } from '@seal-quant/core';
import { RefreshCw, Search } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { MarketTable } from '../components/MarketTable.js';
import { useMarketOverview } from '../hooks/useMarketOverview.js';
import { formatCurrency, formatPercent } from '../lib/market-format.js';
import { EXCHANGE_OPTIONS, useWorkspaceStore } from '../state/workspace.js';

const QUOTE_OPTIONS = ['USDT', 'USDC', 'USD1', 'USD'];

export function MarketsPage() {
  const navigate = useNavigate();
  const openMarket = useWorkspaceStore((state) => state.openMarket);
  const [exchange, setExchange] = useState<ExchangeId>('binance');
  const [marketType, setMarketType] = useState<MarketType>('future');
  const [quoteAsset, setQuoteAsset] = useState('USDT');
  const [query, setQuery] = useState('');
  const overview = useMarketOverview(exchange, marketType, quoteAsset);
  const normalizedQuery = query.trim().toUpperCase();
  const markets = useMemo(() => {
    const rows = overview.data?.markets ?? [];
    return normalizedQuery
      ? rows.filter((market) =>
          market.baseAsset.includes(normalizedQuery) || market.symbol.toUpperCase().includes(normalizedQuery)
        )
      : rows;
  }, [normalizedQuery, overview.data?.markets]);

  const stats = useMemo(() => {
    const rows = overview.data?.markets ?? [];
    const openInterestValues = rows
      .map((item) => item.openInterest)
      .filter((value): value is number => value !== null);
    return {
      count: rows.length,
      volume: rows.reduce((sum, item) => sum + (item.volume24h ?? 0), 0),
      openInterest: openInterestValues.length > 0
        ? openInterestValues.reduce((sum, value) => sum + value, 0)
        : null,
      advanceRate: rows.length > 0
        ? (rows.filter((item) => (item.change24h ?? 0) > 0).length / rows.length) * 100
        : null
    };
  }, [overview.data?.markets]);

  const selectMarket = (market: MarketSummary) => {
    openMarket({
      exchange: market.exchange,
      marketType: market.marketType,
      symbol: market.symbol,
      quoteAsset: market.quoteAsset
    });
    void navigate({ to: '/market/$asset', params: { asset: market.baseAsset } });
  };

  return (
    <div className="markets-page">
      <header className="page-heading">
        <div>
          <span className="page-eyebrow">Market intelligence</span>
          <h1>Crypto markets</h1>
          <p>Exchange-native pricing enriched with CoinGlass derivatives data.</p>
        </div>
        <div className="source-status">
          {(overview.data?.sources ?? ['ccxt']).map((source) => (
            <span key={source}><i />{source === 'ccxt' ? 'Exchange' : 'CoinGlass'}</span>
          ))}
        </div>
      </header>

      <section className="market-stat-band" aria-label="Market summary">
        <div><span>Markets</span><strong>{stats.count || '--'}</strong></div>
        <div><span>24h volume</span><strong>{formatCurrency(stats.volume)}</strong></div>
        <div><span>Open interest</span><strong>{marketType === 'future' ? formatCurrency(stats.openInterest) : '--'}</strong></div>
        <div><span>Advancing</span><strong>{formatPercent(stats.advanceRate)}</strong></div>
      </section>

      <section className="market-browser">
        <div className="market-browser-toolbar">
          <div className="segmented-control market-type-control">
            {(['spot', 'future'] as MarketType[]).map((item) => (
              <button
                className={marketType === item ? 'is-active' : ''}
                key={item}
                type="button"
                onClick={() => setMarketType(item)}
              >
                {item === 'spot' ? 'Spot' : 'Futures'}
              </button>
            ))}
          </div>
          <div className="exchange-tabs">
            {EXCHANGE_OPTIONS.map((item) => (
              <button
                className={exchange === item ? 'is-active' : ''}
                key={item}
                type="button"
                onClick={() => setExchange(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="toolbar-spacer" />
          <label className="inline-search">
            <Search size={15} />
            <input
              onChange={(event) => setQuery(event.target.value.toUpperCase())}
              placeholder="Filter assets"
              spellCheck={false}
              value={query}
            />
          </label>
          <select className="quote-select" value={quoteAsset} onChange={(event) => setQuoteAsset(event.target.value)}>
            {QUOTE_OPTIONS.map((quote) => <option key={quote} value={quote}>{quote}</option>)}
          </select>
          <button className="icon-button" type="button" title="Refresh markets" onClick={() => void overview.refetch()}>
            <RefreshCw className={overview.isFetching ? 'is-spinning' : ''} size={15} />
          </button>
        </div>
        {overview.isError ? (
          <div className="data-notice is-error">{overview.error instanceof Error ? overview.error.message : 'Market data unavailable'}</div>
        ) : null}
        <MarketTable loading={overview.isLoading} markets={markets} onSelect={selectMarket} />
      </section>
    </div>
  );
}
