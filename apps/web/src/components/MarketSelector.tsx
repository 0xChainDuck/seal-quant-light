import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMarketSymbols } from '../lib/api.js';
import {
  cleanSymbolBase,
  displayMarketSymbol,
  normalizeSymbolInput,
  symbolBaseAsset,
  symbolQuoteAsset
} from '../lib/symbols.js';
import type { ChartPanelConfig } from '../state/workspace.js';
import { useWorkspaceStore } from '../state/workspace.js';
import { TokenAvatar } from './TokenAvatar.js';

const QUOTE_PRIORITY = ['USDT', 'USDC', 'USD1', 'USD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY'];

type SymbolOption = {
  label: string;
  searchText: string;
  symbol: string;
};

function sortQuoteAssets(a: string, b: string): number {
  const priorityA = QUOTE_PRIORITY.indexOf(a);
  const priorityB = QUOTE_PRIORITY.indexOf(b);
  if (priorityA !== -1 || priorityB !== -1) {
    return (priorityA === -1 ? Number.MAX_SAFE_INTEGER : priorityA) -
      (priorityB === -1 ? Number.MAX_SAFE_INTEGER : priorityB);
  }
  return a.localeCompare(b);
}

function symbolsForQuote(symbols: string[], quoteAsset: string): string[] {
  return symbols.filter((symbol) => symbolQuoteAsset(symbol) === quoteAsset);
}

function preferredSymbol(symbols: string[], quoteAsset: string, currentSymbol: string): string | undefined {
  const candidates = symbolsForQuote(symbols, quoteAsset);
  const currentBase = symbolBaseAsset(currentSymbol);
  return candidates.find((symbol) => symbolBaseAsset(symbol) === currentBase) ?? candidates[0];
}

function usePanelMarkets(panel: ChartPanelConfig) {
  return useQuery({
    queryKey: ['markets', panel.exchange, panel.marketType],
    queryFn: () => fetchMarketSymbols(panel.exchange, panel.marketType),
    staleTime: 6 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
    retry: 1
  });
}

export function QuoteSelector({ panel }: { panel: ChartPanelConfig }) {
  const navigate = useNavigate();
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);
  const markets = usePanelMarkets(panel);
  const symbols = markets.data?.symbols ?? [];
  const quoteAssets = useMemo(() => {
    const assets = [...new Set(symbols.map(symbolQuoteAsset).filter(Boolean))].sort(sortQuoteAssets);
    return assets.includes(panel.quoteAsset) ? assets : [panel.quoteAsset, ...assets].filter(Boolean);
  }, [panel.quoteAsset, symbols]);

  useEffect(() => {
    if (!markets.isSuccess || symbols.length === 0) {
      return;
    }

    const quoteAsset = quoteAssets.includes(panel.quoteAsset) ? panel.quoteAsset : quoteAssets[0];
    if (!quoteAsset || (symbols.includes(panel.symbol) && symbolQuoteAsset(panel.symbol) === quoteAsset)) {
      return;
    }

    const symbol = preferredSymbol(symbols, quoteAsset, panel.symbol);
    if (symbol) {
      updatePanel(panel.id, { quoteAsset, symbol });
      void navigate({ to: '/market/$asset', params: { asset: symbolBaseAsset(symbol) }, replace: true });
    }
  }, [markets.isSuccess, navigate, panel.id, panel.quoteAsset, panel.symbol, quoteAssets, symbols, updatePanel]);

  return (
    <select
      className="toolbar-select quote-toolbar-select"
      disabled={markets.isLoading || quoteAssets.length === 0}
      title="Quote asset"
      value={panel.quoteAsset}
      onChange={(event) => {
        const quoteAsset = event.target.value;
        const symbol = preferredSymbol(symbols, quoteAsset, panel.symbol);
        updatePanel(panel.id, { quoteAsset, ...(symbol ? { symbol } : {}) });
        if (symbol) {
          void navigate({ to: '/market/$asset', params: { asset: symbolBaseAsset(symbol) }, replace: true });
        }
      }}
    >
      {quoteAssets.map((asset) => <option key={asset} value={asset}>{asset}</option>)}
    </select>
  );
}

export function SymbolSelector({ panel }: { panel: ChartPanelConfig }) {
  const navigate = useNavigate();
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);
  const markets = usePanelMarkets(panel);
  const currentLabel = cleanSymbolBase(panel.symbol);
  const [query, setQuery] = useState(currentLabel);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQuery(currentLabel), [currentLabel]);

  const symbols = markets.data?.symbols ?? [];
  const options = useMemo<SymbolOption[]>(() => {
    const seen = new Set<string>();
    return symbolsForQuote(symbols, panel.quoteAsset).flatMap((symbol) => {
      const label = cleanSymbolBase(symbol);
      if (!label || seen.has(label)) {
        return [];
      }
      seen.add(label);
      return [{ label, symbol, searchText: `${label} ${symbol}`.toUpperCase() }];
    });
  }, [panel.quoteAsset, symbols]);
  const normalized = normalizeSymbolInput(query);
  const filtered = useMemo(() => {
    if (!normalized || normalized === currentLabel.toUpperCase()) {
      return options.slice(0, 80);
    }
    return options
      .filter((option) => option.label.startsWith(normalized) || option.searchText.includes(normalized))
      .slice(0, 80);
  }, [currentLabel, normalized, options]);

  const commit = (symbol: string | undefined) => {
    if (!symbol) {
      setQuery(currentLabel);
      setOpen(false);
      return;
    }
    updatePanel(panel.id, { symbol });
    setQuery(cleanSymbolBase(symbol));
    setOpen(false);
    void navigate({ to: '/market/$asset', params: { asset: symbolBaseAsset(symbol) } });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(filtered[0]?.symbol);
    }
    if (event.key === 'Escape') {
      setQuery(currentLabel);
      setOpen(false);
    }
  };

  return (
    <div className="terminal-symbol-selector">
      <Search size={14} />
      <input
        aria-label="Market symbol"
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            const exact = options.find((option) => option.label === normalized);
            commit(exact?.symbol);
          }, 120);
        }}
        onChange={(event) => {
          setQuery(event.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        value={query}
      />
      {open ? (
        <div className="terminal-symbol-menu">
          <div className="symbol-menu-meta">{filtered.length} of {options.length}</div>
          {markets.isLoading ? <div className="symbol-menu-state">Loading markets...</div> : null}
          {markets.isError ? <div className="symbol-menu-state">Markets unavailable</div> : null}
          {filtered.map((option) => (
            <button
              className={option.symbol === panel.symbol ? 'terminal-symbol-option is-active' : 'terminal-symbol-option'}
              key={option.symbol}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                commit(option.symbol);
              }}
            >
              <TokenAvatar size="sm" symbol={option.label} />
              <span><strong>{option.label}</strong><small>{displayMarketSymbol(option.symbol, panel.quoteAsset)}</small></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
