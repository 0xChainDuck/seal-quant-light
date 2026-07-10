import type { IndicatorConfig } from '@seal-quant/indicators';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '../state/workspace.js';
import type { ChartPanelConfig } from '../state/workspace.js';

const INDICATOR_GROUPS: Array<{
  name: string;
  items: Array<{ label: string; description: string; indicator: IndicatorConfig }>;
}> = [
  {
    name: 'Trend',
    items: [
      { label: 'EMA 20', description: 'Exponential moving average', indicator: { id: 'ema', params: { period: 20 } } },
      { label: 'SMA 50', description: 'Simple moving average', indicator: { id: 'sma', params: { period: 50 } } },
      { label: 'Bollinger', description: 'Volatility envelope', indicator: { id: 'bollinger' } }
    ]
  },
  {
    name: 'Momentum',
    items: [
      { label: 'RSI 14', description: 'Relative strength index', indicator: { id: 'rsi', params: { period: 14 } } },
      { label: 'MACD', description: 'Trend momentum', indicator: { id: 'macd' } }
    ]
  },
  {
    name: 'Derivatives',
    items: [
      { label: 'Exchange OI', description: 'Venue open interest', indicator: { id: 'openInterest' } },
      { label: 'OI-RSI', description: 'OI change strength', indicator: { id: 'openInterestRsi', params: { period: 14 } } },
      { label: 'Aggregate OI', description: 'CoinGlass USDT OI', indicator: { id: 'coinGlassAggregateOpenInterest' } },
      { label: 'Aggregate OI-RSI', description: 'Aggregate OI strength', indicator: { id: 'coinGlassAggregateOpenInterestRsi', params: { period: 14 } } }
    ]
  }
];

function indicatorKey(indicator: IndicatorConfig): string {
  return `${indicator.id}:${JSON.stringify(indicator.params ?? {})}`;
}

function indicatorLabel(indicator: IndicatorConfig): string {
  return INDICATOR_GROUPS.flatMap((group) => group.items)
    .find((item) => indicatorKey(item.indicator) === indicatorKey(indicator))?.label ?? indicator.id;
}

export function IndicatorMenu({ panel }: { panel: ChartPanelConfig }) {
  const toggleIndicator = useWorkspaceStore((state) => state.toggleIndicator);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <div className="indicator-control" ref={rootRef}>
      <button className={open ? 'toolbar-command is-active' : 'toolbar-command'} type="button" onClick={() => setOpen(!open)}>
        <SlidersHorizontal size={15} />
        Indicators
        <span>{panel.indicators.length}</span>
      </button>
      {open ? (
        <div className="indicator-menu">
          <header><strong>Indicators</strong><button className="icon-button is-ghost" type="button" title="Close" onClick={() => setOpen(false)}><X size={15} /></button></header>
          {INDICATOR_GROUPS.map((group) => (
            <section key={group.name}>
              <span className="indicator-group-label">{group.name}</span>
              {group.items.map((item) => {
                const active = panel.indicators.some((indicator) => indicatorKey(indicator) === indicatorKey(item.indicator));
                return (
                  <button
                    className={active ? 'indicator-menu-item is-active' : 'indicator-menu-item'}
                    key={item.label}
                    type="button"
                    onClick={() => toggleIndicator(panel.id, item.indicator)}
                  >
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <span className="indicator-check">{active ? <Check size={14} /> : null}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      ) : null}
      <div className="active-indicators">
        {panel.indicators.map((indicator) => (
          <button key={indicatorKey(indicator)} type="button" onClick={() => toggleIndicator(panel.id, indicator)}>
            {indicatorLabel(indicator)}<X size={11} />
          </button>
        ))}
      </div>
    </div>
  );
}
