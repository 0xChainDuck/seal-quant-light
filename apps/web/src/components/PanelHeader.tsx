import { useQuery } from '@tanstack/react-query';
import { Activity, Trash2 } from 'lucide-react';
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
import {
  EXCHANGE_OPTIONS,
  EXCHANGE_MARKET_TYPES,
  TIMEFRAME_OPTIONS,
  useWorkspaceStore
} from '../state/workspace.js';

const QUICK_INDICATORS = [
  { label: 'EMA20', indicator: { id: 'ema', params: { period: 20 } } },
  { label: 'SMA50', indicator: { id: 'sma', params: { period: 50 } } },
  { label: 'OI', indicator: { id: 'openInterest' } },
  { label: 'OI-RSI', indicator: { id: 'openInterestRsi', params: { period: 14 } } },
  { label: 'AGG OI', indicator: { id: 'coinGlassAggregateOpenInterest' } },
  { label: 'AGG OI-RSI', indicator: { id: 'coinGlassAggregateOpenInterestRsi', params: { period: 14 } } },
  { label: 'RSI14', indicator: { id: 'rsi', params: { period: 14 } } },
  { label: 'MACD', indicator: { id: 'macd' } },
  { label: 'BOLL', indicator: { id: 'bollinger' } }
];

const QUOTE_PRIORITY = ['USDT', 'USDC', 'USD1', 'USD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY'];

type PanelHeaderProps = {
  panel: ChartPanelConfig;
  status: string;
  updatedAt: number | null;
};

type SymbolOption = {
  label: string;
  searchText: string;
  symbol: string;
};

function indicatorKey(value: unknown): string {
  return JSON.stringify(value);
}

function sortQuoteAssets(a: string, b: string): number {
  const priorityA = QUOTE_PRIORITY.indexOf(a);
  const priorityB = QUOTE_PRIORITY.indexOf(b);

  if (priorityA !== -1 || priorityB !== -1) {
    return (priorityA === -1 ? Number.MAX_SAFE_INTEGER : priorityA) - (priorityB === -1 ? Number.MAX_SAFE_INTEGER : priorityB);
  }

  return a.localeCompare(b);
}

function symbolsForQuote(symbols: string[], quoteAsset: string): string[] {
  return symbols.filter((symbol) => symbolQuoteAsset(symbol) === quoteAsset);
}

function symbolOptionsForQuote(symbols: string[], quoteAsset: string): SymbolOption[] {
  const seenLabels = new Set<string>();

  return symbolsForQuote(symbols, quoteAsset).flatMap((symbol) => {
    const label = cleanSymbolBase(symbol);
    if (!label || seenLabels.has(label)) {
      return [];
    }

    seenLabels.add(label);
    return [
      {
        label,
        searchText: `${label} ${displayMarketSymbol(symbol, quoteAsset)} ${symbol}`.toUpperCase(),
        symbol
      }
    ];
  });
}

function preferredSymbolForQuote(symbols: string[], quoteAsset: string, currentSymbol: string): string | undefined {
  const candidates = symbolsForQuote(symbols, quoteAsset);
  const currentBase = symbolBaseAsset(currentSymbol);

  return candidates.find((symbol) => symbolBaseAsset(symbol) === currentBase) ?? candidates[0];
}

function QuoteSelector({ panel }: { panel: ChartPanelConfig }) {
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);

  const markets = useQuery({
    queryKey: ['markets', panel.exchange, panel.marketType],
    queryFn: () => fetchMarketSymbols(panel.exchange, panel.marketType),
    staleTime: 6 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
    retry: 1
  });

  const symbols = markets.data?.symbols ?? [];
  const quoteAssets = useMemo(() => {
    const assets = [...new Set(symbols.map(symbolQuoteAsset).filter(Boolean))].sort(sortQuoteAssets);
    return assets.includes(panel.quoteAsset) ? assets : [panel.quoteAsset, ...assets].filter(Boolean);
  }, [panel.quoteAsset, symbols]);

  useEffect(() => {
    if (!markets.isSuccess || symbols.length === 0) {
      return;
    }

    const nextQuoteAsset = quoteAssets.includes(panel.quoteAsset) ? panel.quoteAsset : quoteAssets[0];
    if (!nextQuoteAsset) {
      return;
    }

    const symbolIsAvailable = symbols.includes(panel.symbol);
    const symbolMatchesQuote = symbolQuoteAsset(panel.symbol) === nextQuoteAsset;
    if (nextQuoteAsset === panel.quoteAsset && symbolIsAvailable && symbolMatchesQuote) {
      return;
    }

    const nextSymbol = preferredSymbolForQuote(symbols, nextQuoteAsset, panel.symbol);
    updatePanel(panel.id, {
      quoteAsset: nextQuoteAsset,
      ...(nextSymbol ? { symbol: nextSymbol } : {})
    });
  }, [
    markets.isSuccess,
    panel.id,
    panel.quoteAsset,
    panel.symbol,
    quoteAssets,
    symbols,
    updatePanel
  ]);

  return (
    <select
      disabled={markets.isLoading || quoteAssets.length === 0}
      value={panel.quoteAsset}
      onChange={(event) => {
        const quoteAsset = event.target.value;
        const nextSymbol = preferredSymbolForQuote(symbols, quoteAsset, panel.symbol);
        updatePanel(panel.id, {
          quoteAsset,
          ...(nextSymbol ? { symbol: nextSymbol } : {})
        });
      }}
      title="Quote / settle"
    >
      {quoteAssets.map((quoteAsset) => (
        <option key={quoteAsset} value={quoteAsset}>
          {quoteAsset}
        </option>
      ))}
    </select>
  );
}

function SymbolSelector({ panel }: { panel: ChartPanelConfig }) {
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);
  const currentLabel = cleanSymbolBase(panel.symbol);
  const [query, setQuery] = useState(currentLabel);
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markets = useQuery({
    queryKey: ['markets', panel.exchange, panel.marketType],
    queryFn: () => fetchMarketSymbols(panel.exchange, panel.marketType),
    staleTime: 6 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
    retry: 1
  });

  useEffect(() => {
    setQuery(currentLabel);
  }, [currentLabel]);

  const rawQuery = query.trim().toUpperCase();
  const normalizedQuery = normalizeSymbolInput(query);
  const activeSearch = normalizedQuery === currentLabel.toUpperCase() ? '' : normalizedQuery;
  const symbols = markets.data?.symbols ?? [];
  const quoteSymbols = useMemo(() => symbolsForQuote(symbols, panel.quoteAsset), [panel.quoteAsset, symbols]);
  const symbolOptions = useMemo(() => symbolOptionsForQuote(symbols, panel.quoteAsset), [panel.quoteAsset, symbols]);
  const filteredOptions = useMemo(() => {
    if (!activeSearch) {
      return symbolOptions;
    }

    const startsWith = symbolOptions.filter((option) => option.label.startsWith(activeSearch));
    const contains = symbolOptions.filter((option) => {
      return option.searchText.includes(activeSearch) && !option.label.startsWith(activeSearch);
    });

    return [...startsWith, ...contains];
  }, [activeSearch, symbolOptions]);

  const commitSymbol = (symbol: string) => {
    if (!symbol) {
      setQuery(currentLabel);
      setOpen(false);
      return;
    }

    setQuery(cleanSymbolBase(symbol));
    setOpen(false);
    if (symbol !== panel.symbol) {
      updatePanel(panel.id, { symbol });
    }
  };

  const closeOrCommitExact = () => {
    const exact = symbolOptions.find((option) => {
      return (
        option.label === normalizedQuery ||
        option.symbol.toUpperCase() === rawQuery ||
        displayMarketSymbol(option.symbol, panel.quoteAsset).toUpperCase() === rawQuery
      );
    });

    if (exact) {
      commitSymbol(exact.symbol);
      return;
    }

    setQuery(currentLabel);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitSymbol(filteredOptions[0]?.symbol ?? '');
      return;
    }

    if (event.key === 'Escape') {
      setQuery(currentLabel);
      setOpen(false);
    }
  };

  return (
    <div className="symbol-combobox">
      <input
        aria-label="Symbol"
        onBlur={() => {
          blurTimer.current = setTimeout(closeOrCommitExact, 120);
        }}
        onChange={(event) => {
          setQuery(event.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => {
          if (blurTimer.current) {
            clearTimeout(blurTimer.current);
          }
          setOpen(true);
          requestAnimationFrame(() => {
            document.activeElement instanceof HTMLInputElement && document.activeElement.select();
          });
        }}
        onKeyDown={onKeyDown}
        spellCheck={false}
        value={query}
      />
      {open ? (
        <div className="symbol-menu">
          {markets.isLoading ? <div className="symbol-menu-state">Loading symbols</div> : null}
          {markets.isError ? <div className="symbol-menu-state">Symbols offline</div> : null}
          {!markets.isLoading && !markets.isError ? (
            <div className="symbol-menu-meta">
              {filteredOptions.length} / {symbolOptions.length} symbols
            </div>
          ) : null}
          {!markets.isLoading && !markets.isError && filteredOptions.length === 0 ? (
            <div className="symbol-menu-state">No matches</div>
          ) : null}
          {filteredOptions.map((option) => (
            <button
              className={option.symbol === panel.symbol ? 'symbol-option is-active' : 'symbol-option'}
              key={option.symbol}
              onMouseDown={(event) => {
                event.preventDefault();
                commitSymbol(option.symbol);
              }}
              title={displayMarketSymbol(option.symbol, panel.quoteAsset)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PanelHeader({ panel, status, updatedAt }: PanelHeaderProps) {
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);
  const removePanel = useWorkspaceStore((state) => state.removePanel);
  const toggleIndicator = useWorkspaceStore((state) => state.toggleIndicator);
  const marketTypes = EXCHANGE_MARKET_TYPES[panel.exchange];

  return (
    <header className="panel-header">
      <div className="panel-title">
        <Activity size={16} />
        <strong>{displayMarketSymbol(panel.symbol, panel.quoteAsset)}</strong>
        <span>{panel.exchange}</span>
        <span className={`status-dot status-${status}`} />
      </div>

      <div className="panel-controls">
        <select
          value={panel.exchange}
          onChange={(event) => {
            const exchange = event.target.value as ChartPanelConfig['exchange'];
            const nextMarketTypes = EXCHANGE_MARKET_TYPES[exchange];
            updatePanel(panel.id, {
              exchange,
              marketType: nextMarketTypes.includes(panel.marketType) ? panel.marketType : (nextMarketTypes[0] ?? 'spot'),
              quoteAsset: 'USDT'
            });
          }}
          title="Exchange"
        >
          {EXCHANGE_OPTIONS.map((exchange) => (
            <option key={exchange} value={exchange}>
              {exchange}
            </option>
          ))}
        </select>

        <select
          value={panel.marketType}
          onChange={(event) =>
            updatePanel(panel.id, {
              marketType: event.target.value as ChartPanelConfig['marketType'],
              quoteAsset: 'USDT'
            })
          }
          title="Market"
        >
          {marketTypes.map((marketType) => (
            <option key={marketType} value={marketType}>
              {marketType}
            </option>
          ))}
        </select>

        <QuoteSelector panel={panel} />

        <SymbolSelector panel={panel} />

        <select
          value={panel.timeframe}
          onChange={(event) => updatePanel(panel.id, { timeframe: event.target.value as ChartPanelConfig['timeframe'] })}
          title="Timeframe"
        >
          {TIMEFRAME_OPTIONS.map((timeframe) => (
            <option key={timeframe} value={timeframe}>
              {timeframe}
            </option>
          ))}
        </select>

        <button className="icon-button" type="button" title="Remove panel" onClick={() => removePanel(panel.id)}>
          <Trash2 size={16} />
        </button>
      </div>

      <div className="indicator-strip">
        {QUICK_INDICATORS.map((item) => {
          const active = panel.indicators.some((indicator) => indicatorKey(indicator) === indicatorKey(item.indicator));
          return (
            <button
              className={active ? 'chip is-active' : 'chip'}
              key={item.label}
              type="button"
              onClick={() => toggleIndicator(panel.id, item.indicator)}
            >
              {item.label}
            </button>
          );
        })}
        <span className="updated-at">{updatedAt ? new Date(updatedAt).toLocaleTimeString() : '--:--:--'}</span>
      </div>
    </header>
  );
}
