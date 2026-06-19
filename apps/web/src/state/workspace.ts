import type { ExchangeId, MarketSelection, MarketType, Timeframe } from '@seal-quant/core';
import type { IndicatorConfig } from '@seal-quant/indicators';
import { create } from 'zustand';

export type WorkspaceLayout = 1 | 2 | 4;

export type ChartPanelConfig = MarketSelection & {
  id: string;
  limit: number;
  pollMs: number;
  indicators: IndicatorConfig[];
};

type WorkspaceState = {
  layout: WorkspaceLayout;
  panels: ChartPanelConfig[];
  setLayout: (layout: WorkspaceLayout) => void;
  addPanel: () => void;
  removePanel: (panelId: string) => void;
  updatePanel: (panelId: string, patch: Partial<Omit<ChartPanelConfig, 'id'>>) => void;
  toggleIndicator: (panelId: string, indicator: IndicatorConfig) => void;
};

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `panel-${Date.now()}-${Math.random()}`;
}

function defaultIndicators(): IndicatorConfig[] {
  return [
    { id: 'ema', params: { period: 20 } },
    { id: 'sma', params: { period: 50 } },
    { id: 'rsi', params: { period: 14 } }
  ];
}

function createPanel(overrides: Partial<ChartPanelConfig> = {}): ChartPanelConfig {
  return {
    id: createId(),
    exchange: 'binance',
    marketType: 'spot',
    symbol: 'BTC/USDT',
    timeframe: '1m',
    limit: 500,
    pollMs: 10_000,
    indicators: defaultIndicators(),
    ...overrides
  };
}

function indicatorKey(indicator: IndicatorConfig): string {
  return `${indicator.id}:${JSON.stringify(indicator.params ?? {})}`;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  layout: 2,
  panels: [
    createPanel(),
    createPanel({
      exchange: 'okx',
      timeframe: '5m',
      indicators: [
        { id: 'ema', params: { period: 20 } },
        { id: 'macd' },
        { id: 'bollinger' }
      ]
    })
  ],
  setLayout(layout) {
    set({ layout });
  },
  addPanel() {
    set((state) => ({
      panels: [
        ...state.panels,
        createPanel({
          exchange: 'bybit',
          marketType: 'spot',
          timeframe: '15m'
        })
      ]
    }));
  },
  removePanel(panelId) {
    set((state) => ({
      panels: state.panels.length > 1 ? state.panels.filter((panel) => panel.id !== panelId) : state.panels
    }));
  },
  updatePanel(panelId, patch) {
    set((state) => ({
      panels: state.panels.map((panel) => (panel.id === panelId ? { ...panel, ...patch } : panel))
    }));
  },
  toggleIndicator(panelId, indicator) {
    set((state) => ({
      panels: state.panels.map((panel) => {
        if (panel.id !== panelId) {
          return panel;
        }

        const key = indicatorKey(indicator);
        const exists = panel.indicators.some((item) => indicatorKey(item) === key);

        return {
          ...panel,
          indicators: exists
            ? panel.indicators.filter((item) => indicatorKey(item) !== key)
            : [...panel.indicators, indicator]
        };
      })
    }));
  }
}));

export const EXCHANGE_OPTIONS: ExchangeId[] = ['binance', 'okx', 'bybit', 'bitget'];
export const MARKET_TYPE_OPTIONS: MarketType[] = ['spot', 'swap', 'future'];
export const TIMEFRAME_OPTIONS: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];
