import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { ChartPanel } from '../components/ChartPanel.js';
import { TokenAvatar } from '../components/TokenAvatar.js';
import { useMarketOverview } from '../hooks/useMarketOverview.js';
import { fetchMarketSymbols } from '../lib/api.js';
import { formatCurrency, formatMarketPrice, formatPercent, valueTone } from '../lib/market-format.js';
import { displayMarketSymbol, symbolBaseAsset, symbolQuoteAsset } from '../lib/symbols.js';
import { useWorkspaceStore } from '../state/workspace.js';

export function MarketDetailPage({ asset }: { asset: string }) {
  const normalizedAsset = asset.toUpperCase();
  const activePanelId = useWorkspaceStore((state) => state.activePanelId);
  const panels = useWorkspaceStore((state) => state.panels);
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);
  const panel = panels.find((item) => item.id === activePanelId) ?? panels[0];
  const symbols = useQuery({
    queryKey: ['detail-symbols', panel?.exchange, panel?.marketType],
    queryFn: () => fetchMarketSymbols(panel!.exchange, panel!.marketType),
    enabled: Boolean(panel),
    staleTime: 6 * 60 * 60_000,
    gcTime: 12 * 60 * 60_000,
    retry: 1
  });

  useEffect(() => {
    if (!panel || !symbols.data || symbolBaseAsset(panel.symbol) === normalizedAsset) {
      return;
    }

    const candidates = symbols.data.symbols.filter((symbol) => symbolBaseAsset(symbol) === normalizedAsset);
    const preferred = candidates.find((symbol) => symbolQuoteAsset(symbol) === panel.quoteAsset) ?? candidates[0];
    if (preferred) {
      updatePanel(panel.id, {
        symbol: preferred,
        quoteAsset: symbolQuoteAsset(preferred)
      });
    }
  }, [normalizedAsset, panel, symbols.data, updatePanel]);

  const overview = useMarketOverview(
    panel?.exchange ?? 'binance',
    panel?.marketType ?? 'future',
    panel?.quoteAsset ?? 'USDT'
  );
  const summary = useMemo(
    () => overview.data?.markets.find((market) => market.symbol === panel?.symbol),
    [overview.data?.markets, panel?.symbol]
  );

  if (!panel) {
    return <div className="page-loading">Preparing terminal...</div>;
  }

  return (
    <div className="terminal-page">
      <header className="asset-context-bar">
        <Link className="back-button" to="/" title="Back to markets"><ArrowLeft size={17} /></Link>
        <TokenAvatar size="lg" symbol={normalizedAsset} />
        <div className="asset-context-title">
          <div>
            <h1>{displayMarketSymbol(panel.symbol, panel.quoteAsset)}</h1>
            <span>{panel.exchange.toUpperCase()} · {panel.marketType === 'spot' ? 'Spot' : 'Perpetual'}</span>
          </div>
          <strong>{formatMarketPrice(summary?.price ?? null)}</strong>
          <span className={`value-${valueTone(summary?.change24h ?? null)}`}>
            {formatPercent(summary?.change24h ?? null)}
          </span>
        </div>
        <div className="asset-context-metrics">
          <div><span>24h volume</span><strong>{formatCurrency(summary?.volume24h ?? null)}</strong></div>
          <div><span>Market cap</span><strong>{formatCurrency(summary?.marketCap ?? null)}</strong></div>
          <div><span>Open interest</span><strong>{formatCurrency(summary?.openInterest ?? null)}</strong></div>
          <div><span>Funding</span><strong>{formatPercent(summary?.fundingRate ?? null, 4)}</strong></div>
        </div>
      </header>
      {symbols.isSuccess && !symbols.data.symbols.some((symbol) => symbolBaseAsset(symbol) === normalizedAsset) ? (
        <div className="data-notice is-error">
          {normalizedAsset} is not available on {panel.exchange.toUpperCase()} {panel.marketType}.
        </div>
      ) : null}
      <ChartPanel panel={panel} />
    </div>
  );
}
