import type { ExchangeId, MarketSelection, MarketType, Timeframe } from '@seal-quant/core';
import type { IndicatorConfig } from '@seal-quant/indicators';
import { create } from 'zustand';

export type ChartPanelConfig = MarketSelection & {
  id: string;
  quoteAsset: string;
  limit: number;
  indicators: IndicatorConfig[];
};

type WorkspaceState = {
  activePanelId: string;
  panels: ChartPanelConfig[];
  selectPanel: (panelId: string) => void;
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
    quoteAsset: 'USDT',
    timeframe: '1m',
    limit: 500,
    indicators: defaultIndicators(),
    ...overrides
  };
}

function indicatorKey(indicator: IndicatorConfig): string {
  return `${indicator.id}:${JSON.stringify(indicator.params ?? {})}`;
}

const initialPanels = [
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
];

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activePanelId: initialPanels[0]?.id ?? '',
  panels: initialPanels,
  selectPanel(panelId) {
    set({ activePanelId: panelId });
  },
  addPanel() {
    const panel = createPanel({
      exchange: 'bybit',
      marketType: 'spot',
      timeframe: '15m'
    });

    set((state) => ({
      activePanelId: panel.id,
      panels: [...state.panels, panel]
    }));
  },
  removePanel(panelId) {
    set((state) => {
      if (state.panels.length <= 1) {
        return state;
      }

      const panels = state.panels.filter((panel) => panel.id !== panelId);
      const activePanelId =
        state.activePanelId === panelId ? (panels[0]?.id ?? state.activePanelId) : state.activePanelId;

      return {
        activePanelId,
        panels
      };
    });
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
export const EXCHANGE_MARKET_TYPES: Record<ExchangeId, MarketType[]> = {
  binance: ['spot', 'future'],
  okx: ['spot', 'future'],
  bybit: ['spot', 'future'],
  bitget: ['spot', 'future']
};
export const TIMEFRAME_OPTIONS: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];
