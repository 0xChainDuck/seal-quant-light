import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import type { ExchangeId, MarketType } from '@seal-quant/core';
import { fetchMarketSymbols } from '../lib/api.js';
import { displayMarketSymbol, symbolBaseAsset, symbolQuoteAsset } from '../lib/symbols.js';
import { EXCHANGE_OPTIONS, useWorkspaceStore } from '../state/workspace.js';
import { TokenAvatar } from './TokenAvatar.js';

export function GlobalMarketSearch() {
  const navigate = useNavigate();
  const panels = useWorkspaceStore((state) => state.panels);
  const activePanelId = useWorkspaceStore((state) => state.activePanelId);
  const openMarket = useWorkspaceStore((state) => state.openMarket);
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState<ExchangeId>(activePanel?.exchange ?? 'binance');
  const [marketType, setMarketType] = useState<MarketType>(activePanel?.marketType ?? 'future');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        setOpen(true);
      }

      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const markets = useQuery({
    queryKey: ['global-market-search', exchange, marketType],
    queryFn: () => fetchMarketSymbols(exchange, marketType),
    enabled: open,
    staleTime: 6 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
    retry: 1
  });
  const normalizedQuery = query.trim().toUpperCase();
  const results = useMemo(() => {
    const symbols = markets.data?.symbols ?? [];
    const filtered = normalizedQuery
      ? symbols.filter((symbol) => {
          const base = symbolBaseAsset(symbol);
          return base.startsWith(normalizedQuery) || symbol.toUpperCase().includes(normalizedQuery);
        })
      : symbols;

    return filtered.slice(0, 40);
  }, [markets.data?.symbols, normalizedQuery]);

  const selectSymbol = (symbol: string) => {
    const baseAsset = symbolBaseAsset(symbol);
    openMarket({
      exchange,
      marketType,
      symbol,
      quoteAsset: symbolQuoteAsset(symbol)
    });
    setOpen(false);
    setQuery('');
    void navigate({ to: '/market/$asset', params: { asset: baseAsset } });
  };

  return (
    <>
      <button className="global-search-trigger" type="button" onClick={() => setOpen(true)}>
        <Search size={16} />
        <span>Search markets</span>
        <kbd>/</kbd>
      </button>
      {open ? (
        <div className="search-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            aria-label="Search markets"
            aria-modal="true"
            className="search-dialog"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="search-dialog-head">
              <Search size={18} />
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="BTC, ETH, SOL..."
                spellCheck={false}
                value={query}
              />
              <button className="icon-button is-ghost" type="button" title="Close" onClick={() => setOpen(false)}>
                <X size={17} />
              </button>
            </div>
            <div className="search-filters">
              <select value={exchange} onChange={(event) => setExchange(event.target.value as ExchangeId)}>
                {EXCHANGE_OPTIONS.map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
              </select>
              <div className="segmented-control">
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
            </div>
            <div className="search-results">
              {markets.isLoading ? <div className="search-state">Loading markets...</div> : null}
              {markets.isError ? <div className="search-state is-error">Market source unavailable</div> : null}
              {!markets.isLoading && !markets.isError && results.length === 0 ? (
                <div className="search-state">No matching market</div>
              ) : null}
              {results.map((symbol) => {
                const base = symbolBaseAsset(symbol);
                const quote = symbolQuoteAsset(symbol);
                return (
                  <button className="search-result" key={symbol} type="button" onClick={() => selectSymbol(symbol)}>
                    <TokenAvatar symbol={base} />
                    <span className="search-result-main">
                      <strong>{base}</strong>
                      <small>{displayMarketSymbol(symbol, quote)}</small>
                    </span>
                    <span className="market-badge">{marketType === 'spot' ? 'Spot' : 'Perp'}</span>
                    <span className="search-result-exchange">{exchange.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
