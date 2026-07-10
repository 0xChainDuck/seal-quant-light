import type { ExchangeId, MarketType } from '@seal-quant/core';
import { Clock3, Wifi } from 'lucide-react';
import { IndicatorMenu } from './IndicatorMenu.js';
import { QuoteSelector, SymbolSelector } from './MarketSelector.js';
import { symbolBaseAsset } from '../lib/symbols.js';
import type { ChartPanelConfig } from '../state/workspace.js';
import {
  EXCHANGE_OPTIONS,
  EXCHANGE_MARKET_TYPES,
  TIMEFRAME_OPTIONS,
  useWorkspaceStore
} from '../state/workspace.js';

type PanelHeaderProps = {
  panel: ChartPanelConfig;
  status: string;
  updatedAt: number | null;
};

export function PanelHeader({ panel, status, updatedAt }: PanelHeaderProps) {
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);
  const marketTypes = EXCHANGE_MARKET_TYPES[panel.exchange];

  return (
    <header className="terminal-toolbar">
      <div className="terminal-toolbar-primary">
        <SymbolSelector panel={panel} />
        <QuoteSelector panel={panel} />
        <div className="segmented-control compact-segmented">
          {marketTypes.map((marketType) => (
            <button
              className={panel.marketType === marketType ? 'is-active' : ''}
              key={marketType}
              type="button"
              onClick={() => {
                const baseAsset = symbolBaseAsset(panel.symbol);
                const quoteAsset = 'USDT';
                updatePanel(panel.id, {
                  marketType: marketType as MarketType,
                  quoteAsset,
                  symbol: marketType === 'spot'
                    ? `${baseAsset}/${quoteAsset}`
                    : `${baseAsset}/${quoteAsset}:${quoteAsset}`
                });
              }}
            >
              {marketType === 'spot' ? 'Spot' : 'Futures'}
            </button>
          ))}
        </div>
        <div className="exchange-selector" aria-label="Exchange">
          {EXCHANGE_OPTIONS.map((exchange) => (
            <button
              className={panel.exchange === exchange ? 'is-active' : ''}
              key={exchange}
              type="button"
              onClick={() => {
                const nextMarketTypes = EXCHANGE_MARKET_TYPES[exchange];
                updatePanel(panel.id, {
                  exchange: exchange as ExchangeId,
                  marketType: nextMarketTypes.includes(panel.marketType) ? panel.marketType : (nextMarketTypes[0] ?? 'spot'),
                  quoteAsset: 'USDT'
                });
              }}
            >
              {exchange.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="terminal-live-state">
          <Wifi size={13} />
          <span className={`status-dot status-${status}`} />
          {status}
        </div>
      </div>

      <div className="terminal-toolbar-secondary">
        <div className="timeframe-selector" aria-label="Timeframe">
          {TIMEFRAME_OPTIONS.map((timeframe) => (
            <button
              className={panel.timeframe === timeframe ? 'is-active' : ''}
              key={timeframe}
              type="button"
              onClick={() => updatePanel(panel.id, { timeframe })}
            >
              {timeframe}
            </button>
          ))}
        </div>
        <IndicatorMenu panel={panel} />
        <span className="terminal-updated"><Clock3 size={12} />{updatedAt ? new Date(updatedAt).toLocaleTimeString() : '--:--:--'}</span>
      </div>
    </header>
  );
}
