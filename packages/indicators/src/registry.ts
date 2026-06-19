import type { BarSeries } from '@seal-quant/core';
import { bollinger } from './bollinger.js';
import { ema } from './ema.js';
import { macd } from './macd.js';
import { rsi } from './rsi.js';
import { sma } from './sma.js';
import type { IndicatorConfig, IndicatorDefinition, IndicatorResult } from './types.js';

type AnyIndicatorDefinition = IndicatorDefinition<Record<string, unknown>>;

export const indicatorRegistry = {
  sma,
  ema,
  rsi,
  macd,
  bollinger
} as const;

export type IndicatorId = keyof typeof indicatorRegistry;

export function isIndicatorId(id: string): id is IndicatorId {
  return id in indicatorRegistry;
}

export function runIndicator(
  series: BarSeries,
  config: IndicatorConfig
): IndicatorResult | null {
  if (config.enabled === false || !isIndicatorId(config.id)) {
    return null;
  }

  const definition = indicatorRegistry[config.id] as unknown as AnyIndicatorDefinition;
  const params = definition.normalizeParams
    ? definition.normalizeParams(config.params)
    : {
        ...definition.defaultParams,
        ...(config.params ?? {})
      };

  return definition.compute({
    series,
    params
  });
}

export function runIndicators(
  series: BarSeries,
  configs: IndicatorConfig[]
): IndicatorResult[] {
  return configs
    .map((config) => runIndicator(series, config))
    .filter((result): result is IndicatorResult => result !== null);
}

export function listIndicators() {
  return Object.values(indicatorRegistry).map((indicator) => ({
    id: indicator.id,
    name: indicator.name,
    defaultParams: indicator.defaultParams
  }));
}
