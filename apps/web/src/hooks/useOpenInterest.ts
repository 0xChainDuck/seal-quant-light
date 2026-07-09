import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BarSeries } from '@seal-quant/core';
import type { ChartSeries, HistogramPoint, LinePoint, WhitespacePoint } from '@seal-quant/chart-adapter';
import type { IndicatorConfig } from '@seal-quant/indicators';
import {
  fetchCoinGlassAggregateOpenInterest,
  fetchOpenInterest,
  fetchOpenInterestSnapshot,
  type OpenInterestPoint
} from '../lib/api.js';
import type { ChartPanelConfig } from '../state/workspace.js';

export const OPEN_INTEREST_INDICATOR_ID = 'openInterest';
export const OPEN_INTEREST_RSI_INDICATOR_ID = 'openInterestRsi';
export const COINGLASS_AGGREGATE_OPEN_INTEREST_INDICATOR_ID = 'coinGlassAggregateOpenInterest';
export const COINGLASS_AGGREGATE_OPEN_INTEREST_RSI_INDICATOR_ID = 'coinGlassAggregateOpenInterestRsi';
const DEFAULT_OI_RSI_PERIOD = 14;

export function hasOpenInterestIndicator(indicators: IndicatorConfig[]): boolean {
  return indicators.some((indicator) => indicator.id === OPEN_INTEREST_INDICATOR_ID);
}

function openInterestRsiPeriod(indicators: IndicatorConfig[]): number {
  return indicatorPeriod(indicators, OPEN_INTEREST_RSI_INDICATOR_ID, DEFAULT_OI_RSI_PERIOD);
}

function aggregateOpenInterestRsiPeriod(indicators: IndicatorConfig[]): number {
  return indicatorPeriod(
    indicators,
    COINGLASS_AGGREGATE_OPEN_INTEREST_RSI_INDICATOR_ID,
    DEFAULT_OI_RSI_PERIOD
  );
}

function indicatorPeriod(indicators: IndicatorConfig[], id: string, fallback: number): number {
  const config = indicators.find((indicator) => indicator.id === id);
  const period = Number(config?.params?.period ?? fallback);

  return Number.isFinite(period) && period > 0 ? Math.floor(period) : fallback;
}

function hasOpenInterestRsiIndicator(indicators: IndicatorConfig[]): boolean {
  return indicators.some((indicator) => indicator.id === OPEN_INTEREST_RSI_INDICATOR_ID);
}

function hasOpenInterestDataIndicator(indicators: IndicatorConfig[]): boolean {
  return hasOpenInterestIndicator(indicators) || hasOpenInterestRsiIndicator(indicators);
}

function hasCoinGlassAggregateOpenInterestIndicator(indicators: IndicatorConfig[]): boolean {
  return indicators.some((indicator) => indicator.id === COINGLASS_AGGREGATE_OPEN_INTEREST_INDICATOR_ID);
}

function hasCoinGlassAggregateOpenInterestRsiIndicator(indicators: IndicatorConfig[]): boolean {
  return indicators.some((indicator) => indicator.id === COINGLASS_AGGREGATE_OPEN_INTEREST_RSI_INDICATOR_ID);
}

function hasCoinGlassAggregateOpenInterestDataIndicator(indicators: IndicatorConfig[]): boolean {
  return (
    hasCoinGlassAggregateOpenInterestIndicator(indicators) ||
    hasCoinGlassAggregateOpenInterestRsiIndicator(indicators)
  );
}

function alignOpenInterestToCandles(
  candles: BarSeries,
  points: OpenInterestPoint[],
  field: 'amount' | 'value',
  color?: string
): Array<HistogramPoint | LinePoint | WhitespacePoint> {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  let pointIndex = 0;
  let currentAmount: number | null = null;
  let currentValue: number | null = null;

  return candles.ts.map((ts, index) => {
    while (pointIndex < sorted.length && sorted[pointIndex]!.ts <= ts) {
      const nextPoint = sorted[pointIndex]!;
      if (nextPoint.amount !== null) {
        currentAmount = nextPoint.amount;
      }
      if (nextPoint.value !== null) {
        currentValue = nextPoint.value;
      }
      pointIndex += 1;
    }

    const close = candles.close[index];
    const value =
      field === 'amount'
        ? (currentAmount ?? (currentValue !== null && close ? currentValue / close : null))
        : (currentValue ?? (currentAmount !== null && close ? currentAmount * close : null));
    const time = Math.floor(ts / 1000);
    return value === null
      ? { time }
      : {
          time,
          value,
          ...(color ? { color } : {})
        };
  });
}

function alignMetricToCandles(
  candles: BarSeries,
  points: Array<{ ts: number; value: number }>
): Array<LinePoint | WhitespacePoint> {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  let pointIndex = 0;
  let currentValue: number | null = null;

  return candles.ts.map((ts) => {
    while (pointIndex < sorted.length && sorted[pointIndex]!.ts <= ts) {
      currentValue = sorted[pointIndex]!.value;
      pointIndex += 1;
    }

    const time = Math.floor(ts / 1000);
    return currentValue === null ? { time } : { time, value: currentValue };
  });
}

function toRsi(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateOpenInterestRsi(
  points: OpenInterestPoint[],
  period: number,
  field: 'amount' | 'value' = 'amount'
): Array<{ ts: number; value: number }> {
  const samples = [...points]
    .map((point) => ({
      ts: point.ts,
      metric: field === 'amount' ? point.amount : point.value
    }))
    .filter((point): point is { ts: number; metric: number } => {
      return point.metric !== null && point.metric > 0;
    })
    .sort((a, b) => a.ts - b.ts);

  if (samples.length <= period) {
    return [];
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = Math.log(samples[index]!.metric / samples[index - 1]!.metric);
    gainSum += Math.max(change, 0);
    lossSum += Math.max(-change, 0);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  const values: Array<{ ts: number; value: number }> = [
    {
      ts: samples[period]!.ts,
      value: toRsi(avgGain, avgLoss)
    }
  ];

  for (let index = period + 1; index < samples.length; index += 1) {
    const change = Math.log(samples[index]!.metric / samples[index - 1]!.metric);
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    values.push({
      ts: samples[index]!.ts,
      value: toRsi(avgGain, avgLoss)
    });
  }

  return values;
}

function mergeLiveSnapshot(
  candles: BarSeries,
  historyPoints: OpenInterestPoint[],
  snapshotPoint: OpenInterestPoint | null | undefined
): OpenInterestPoint[] {
  const latestTs = candles.ts.at(-1);
  if (!latestTs || !snapshotPoint) {
    return historyPoints;
  }

  const previousPoint = [...historyPoints].reverse().find((point) => point.ts <= latestTs);

  const livePoint: OpenInterestPoint = {
    ts: latestTs,
    amount: snapshotPoint.amount ?? previousPoint?.amount ?? null,
    value: snapshotPoint.value ?? previousPoint?.value ?? null
  };

  return [...historyPoints.filter((point) => point.ts < latestTs), livePoint].sort((a, b) => a.ts - b.ts);
}

export function useOpenInterestSeries(panel: ChartPanelConfig, candles: BarSeries | null) {
  const showOpenInterest = hasOpenInterestIndicator(panel.indicators);
  const showOpenInterestRsi = hasOpenInterestRsiIndicator(panel.indicators);
  const showAggregateOpenInterest = hasCoinGlassAggregateOpenInterestIndicator(panel.indicators);
  const showAggregateOpenInterestRsi = hasCoinGlassAggregateOpenInterestRsiIndicator(panel.indicators);
  const exchangeEnabled = panel.marketType !== 'spot' && hasOpenInterestDataIndicator(panel.indicators);
  const aggregateEnabled = hasCoinGlassAggregateOpenInterestDataIndicator(panel.indicators);
  const enabled = exchangeEnabled || aggregateEnabled;
  const historyQuery = useQuery({
    queryKey: ['open-interest', panel.exchange, panel.marketType, panel.symbol, panel.timeframe],
    queryFn: () => fetchOpenInterest(panel, 30),
    enabled: exchangeEnabled,
    staleTime: 60_000,
    refetchInterval: exchangeEnabled ? 60_000 : false,
    retry: 1
  });
  const snapshotQuery = useQuery({
    queryKey: ['open-interest-snapshot', panel.exchange, panel.marketType, panel.symbol, panel.timeframe],
    queryFn: () => fetchOpenInterestSnapshot(panel),
    enabled: exchangeEnabled,
    staleTime: 2_500,
    refetchInterval: exchangeEnabled ? 3_000 : false,
    retry: 1
  });
  const aggregateQuery = useQuery({
    queryKey: [
      'coinglass-aggregate-open-interest',
      panel.exchange,
      panel.marketType,
      panel.symbol,
      panel.timeframe
    ],
    queryFn: () => fetchCoinGlassAggregateOpenInterest(panel, 30),
    enabled: aggregateEnabled,
    staleTime: 60_000,
    refetchInterval: aggregateEnabled ? 60_000 : false,
    retry: 1
  });

  const series = useMemo<ChartSeries[]>(() => {
    if (!enabled || !candles) {
      return [];
    }

    const chartSeries: ChartSeries[] = [];

    if (exchangeEnabled) {
      const sourceTimeframe =
        historyQuery.data?.sourceTimeframe ?? snapshotQuery.data?.sourceTimeframe ?? panel.timeframe;
      const points = mergeLiveSnapshot(candles, historyQuery.data?.points ?? [], snapshotQuery.data?.point);
      const hasOpenInterest = points.some((point) => point.amount !== null || point.value !== null);

      if (showOpenInterest && hasOpenInterest) {
        chartSeries.push({
          id: `${OPEN_INTEREST_INDICATOR_ID}-amount`,
          name: 'O.V Amount',
          pane: 'oscillator',
          paneId: OPEN_INTEREST_INDICATOR_ID,
          paneName: `Open Interest (${sourceTimeframe})`,
          type: 'histogram',
          color: 'rgba(118, 203, 255, 0.36)',
          autoscaleMode: 'visible-range',
          priceFormat: 'volume',
          priceScaleId: 'open-interest-volume',
          data: alignOpenInterestToCandles(
            candles,
            points,
            'amount',
            'rgba(118, 203, 255, 0.36)'
          )
        });
      }

      if (showOpenInterest && hasOpenInterest) {
        chartSeries.push({
          id: `${OPEN_INTEREST_INDICATOR_ID}-value`,
          name: 'O.I Value',
          pane: 'oscillator',
          paneId: OPEN_INTEREST_INDICATOR_ID,
          paneName: `Open Interest (${sourceTimeframe})`,
          type: 'line',
          color: '#f2b84b',
          autoscaleMode: 'visible-range',
          priceFormat: 'volume',
          data: alignOpenInterestToCandles(candles, points, 'value')
        });
      }

      if (showOpenInterestRsi) {
        const period = openInterestRsiPeriod(panel.indicators);
        const rsiPoints = calculateOpenInterestRsi(points, period);
        if (rsiPoints.length > 0) {
          chartSeries.push({
            id: `${OPEN_INTEREST_RSI_INDICATOR_ID}-${period}`,
            name: `OI-RSI ${period}`,
            pane: 'oscillator',
            paneId: OPEN_INTEREST_RSI_INDICATOR_ID,
            paneName: `OI-RSI (${sourceTimeframe})`,
            type: 'line',
            color: '#ff9f43',
            data: alignMetricToCandles(candles, rsiPoints)
          });
        }
      }
    }

    if (aggregateEnabled) {
      const sourceTimeframe = aggregateQuery.data?.sourceTimeframe ?? panel.timeframe;
      const points = aggregateQuery.data?.points ?? [];
      const hasOpenInterest = points.some((point) => point.amount !== null || point.value !== null);

      if (showAggregateOpenInterest && hasOpenInterest) {
        chartSeries.push({
          id: `${COINGLASS_AGGREGATE_OPEN_INTEREST_INDICATOR_ID}-value`,
          name: 'CG Agg O.I Value',
          pane: 'oscillator',
          paneId: COINGLASS_AGGREGATE_OPEN_INTEREST_INDICATOR_ID,
          paneName: `CoinGlass Agg OI USDT (${sourceTimeframe})`,
          type: 'line',
          color: '#22c55e',
          autoscaleMode: 'visible-range',
          priceFormat: 'volume',
          data: alignOpenInterestToCandles(candles, points, 'value')
        });
      }

      if (showAggregateOpenInterestRsi) {
        const period = aggregateOpenInterestRsiPeriod(panel.indicators);
        const rsiPoints = calculateOpenInterestRsi(points, period, 'value');
        if (rsiPoints.length > 0) {
          chartSeries.push({
            id: `${COINGLASS_AGGREGATE_OPEN_INTEREST_RSI_INDICATOR_ID}-${period}`,
            name: `CG Agg OI-RSI ${period}`,
            pane: 'oscillator',
            paneId: COINGLASS_AGGREGATE_OPEN_INTEREST_RSI_INDICATOR_ID,
            paneName: `CG Agg OI-RSI (${sourceTimeframe})`,
            type: 'line',
            color: '#22c55e',
            data: alignMetricToCandles(candles, rsiPoints)
          });
        }
      }
    }

    return chartSeries;
  }, [
    aggregateEnabled,
    aggregateQuery.data,
    candles,
    enabled,
    exchangeEnabled,
    historyQuery.data,
    panel.indicators,
    panel.timeframe,
    showAggregateOpenInterest,
    showAggregateOpenInterestRsi,
    showOpenInterest,
    showOpenInterestRsi,
    snapshotQuery.data
  ]);

  return {
    series,
    isLoading: historyQuery.isLoading || snapshotQuery.isLoading || aggregateQuery.isLoading,
    error:
      historyQuery.error instanceof Error
        ? historyQuery.error.message
        : snapshotQuery.error instanceof Error
          ? snapshotQuery.error.message
          : aggregateQuery.error instanceof Error
            ? aggregateQuery.error.message
            : null
  };
}
