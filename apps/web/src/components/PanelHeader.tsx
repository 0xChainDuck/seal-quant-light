import { Activity, Trash2 } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { ChartPanelConfig } from '../state/workspace.js';
import {
  EXCHANGE_OPTIONS,
  MARKET_TYPE_OPTIONS,
  TIMEFRAME_OPTIONS,
  useWorkspaceStore
} from '../state/workspace.js';

const QUICK_INDICATORS = [
  { label: 'EMA20', indicator: { id: 'ema', params: { period: 20 } } },
  { label: 'SMA50', indicator: { id: 'sma', params: { period: 50 } } },
  { label: 'RSI14', indicator: { id: 'rsi', params: { period: 14 } } },
  { label: 'MACD', indicator: { id: 'macd' } },
  { label: 'BOLL', indicator: { id: 'bollinger' } }
];

type PanelHeaderProps = {
  panel: ChartPanelConfig;
  status: string;
  updatedAt: number | null;
};

function indicatorKey(value: unknown): string {
  return JSON.stringify(value);
}

export function PanelHeader({ panel, status, updatedAt }: PanelHeaderProps) {
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);
  const removePanel = useWorkspaceStore((state) => state.removePanel);
  const toggleIndicator = useWorkspaceStore((state) => state.toggleIndicator);

  const onSymbolChange = (event: ChangeEvent<HTMLInputElement>) => {
    updatePanel(panel.id, {
      symbol: event.target.value.toUpperCase()
    });
  };

  return (
    <header className="panel-header">
      <div className="panel-title">
        <Activity size={16} />
        <strong>{panel.symbol}</strong>
        <span>{panel.exchange}</span>
        <span className={`status-dot status-${status}`} />
      </div>

      <div className="panel-controls">
        <select
          value={panel.exchange}
          onChange={(event) => updatePanel(panel.id, { exchange: event.target.value as ChartPanelConfig['exchange'] })}
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
            updatePanel(panel.id, { marketType: event.target.value as ChartPanelConfig['marketType'] })
          }
          title="Market"
        >
          {MARKET_TYPE_OPTIONS.map((marketType) => (
            <option key={marketType} value={marketType}>
              {marketType}
            </option>
          ))}
        </select>

        <input value={panel.symbol} onChange={onSymbolChange} spellCheck={false} />

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
