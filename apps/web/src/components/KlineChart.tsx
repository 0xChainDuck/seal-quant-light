import { toCandles, toIndicatorSeries, toVolume } from '@seal-quant/chart-adapter';
import type { CandlePoint, ChartSeries, HistogramPoint, LinePoint, WhitespacePoint } from '@seal-quant/chart-adapter';
import type { BarSeries } from '@seal-quant/core';
import { runIndicators } from '@seal-quant/indicators';
import type { IndicatorConfig } from '@seal-quant/indicators';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type MouseEventParams,
  type Time
} from 'lightweight-charts';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice, inferPricePrecision, toPriceFormat } from '../lib/format.js';

type KlineChartProps = {
  series: BarSeries;
  indicators: IndicatorConfig[];
  externalSeries?: ChartSeries[];
  hasMoreHistory?: boolean;
  loadingHistory?: boolean;
  onLoadMoreHistory?: () => void | Promise<void>;
};

type ChartApi = ReturnType<typeof createChart>;
type CrosshairHandler = (time: number | null) => void;
type ChartRegister = (id: string, chart: ChartApi | null) => void;
type LogicalRangeHandler = (sourceId: string, range: VisibleLogicalRange | null) => VisibleLogicalRange | null;
type MutableSeriesApi = {
  setData: (data: never[]) => void;
  update: (data: never) => void;
};
type ChartDataPoint = CandlePoint | HistogramPoint | LinePoint | WhitespacePoint;
type DataMeta = {
  firstTime: number | null;
  lastTime: number | null;
  length: number;
};
type VisibleLogicalRange = {
  from: number;
  to: number;
};

type VisiblePriceRange = {
  from: number;
  to: number;
};

const FUTURE_RIGHT_OFFSET = 28;
const MIN_VISIBLE_REAL_BARS = 2;
const PRICE_SCALE_WIDTH = 96;

type ReadoutBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ReadoutIndicator = {
  id: string;
  name: string;
  value: number;
  color?: string;
};

type PriceChartRefs = {
  chart: ChartApi;
  candleSeries: MutableSeriesApi;
  volumeSeries: MutableSeriesApi;
  priceIndicators: Map<string, MutableSeriesApi>;
};

function resizeChart(container: HTMLDivElement, chart: ReturnType<typeof createChart>) {
  chart.applyOptions({
    width: Math.max(container.clientWidth, 240),
    height: Math.max(container.clientHeight, 120)
  });
}

function dataMeta(data: readonly ChartDataPoint[]): DataMeta {
  return {
    firstTime: data[0]?.time ?? null,
    lastTime: data.at(-1)?.time ?? null,
    length: data.length
  };
}

function shouldSetFullData(previous: DataMeta | null, next: readonly ChartDataPoint[]): boolean {
  const meta = dataMeta(next);

  if (!previous) {
    return true;
  }

  if (meta.length === 0) {
    return previous.length !== 0;
  }

  if (previous.length === 0 || meta.firstTime !== previous.firstTime || meta.length < previous.length) {
    return true;
  }

  if (meta.length > previous.length + 1) {
    return true;
  }

  return previous.lastTime !== null && meta.lastTime !== null && meta.lastTime < previous.lastTime;
}

function setSeriesData(series: MutableSeriesApi, data: readonly ChartDataPoint[]): DataMeta {
  series.setData([...data] as never[]);
  return dataMeta(data);
}

function updateSeriesData(
  series: MutableSeriesApi,
  data: readonly ChartDataPoint[],
  previous: DataMeta | null,
  forceFull = false
): DataMeta {
  if (forceFull || shouldSetFullData(previous, data)) {
    return setSeriesData(series, data);
  }

  const latest = data.at(-1);
  if (latest) {
    series.update(latest as never);
  }

  return dataMeta(data);
}

function toHoverTime(time: Time | undefined): number | null {
  if (typeof time === 'number') {
    return time;
  }

  if (time && typeof time === 'object') {
    if ('timestamp' in time && typeof time.timestamp === 'number') {
      return time.timestamp;
    }

    if (
      'year' in time &&
      'month' in time &&
      'day' in time &&
      typeof time.year === 'number' &&
      typeof time.month === 'number' &&
      typeof time.day === 'number'
    ) {
      return Date.UTC(time.year, time.month - 1, time.day) / 1000;
    }
  }

  return null;
}

function subscribeHover(chart: ChartApi, onHoverTime: CrosshairHandler) {
  const handleCrosshairMove = (param: MouseEventParams<Time>) => {
    onHoverTime(toHoverTime(param.time));
  };

  chart.subscribeCrosshairMove(handleCrosshairMove);
  return () => chart.unsubscribeCrosshairMove(handleCrosshairMove);
}

function createBaseChart(container: HTMLDivElement) {
  return createChart(container, {
    autoSize: false,
    layout: {
      background: { type: ColorType.Solid, color: '#101318' },
      textColor: '#aab4c3'
    },
    grid: {
      vertLines: { color: 'rgba(148, 163, 184, 0.06)' },
      horzLines: { color: 'rgba(148, 163, 184, 0.08)' }
    },
    rightPriceScale: {
      borderColor: 'rgba(148, 163, 184, 0.18)',
      minimumWidth: PRICE_SCALE_WIDTH
    },
    timeScale: {
      borderColor: 'rgba(148, 163, 184, 0.18)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: FUTURE_RIGHT_OFFSET,
      rightBarStaysOnScroll: true
    }
  });
}

function volumePriceFormat() {
  return { type: 'volume' as const };
}

function finiteSeriesValues(data: readonly ChartDataPoint[], range: VisibleLogicalRange | null): number[] {
  const from = range ? Math.max(0, Math.floor(range.from)) : 0;
  const to = range ? Math.min(data.length - 1, Math.ceil(range.to)) : data.length - 1;
  const values: number[] = [];

  for (let index = from; index <= to; index += 1) {
    const point = data[index];
    if (point && 'value' in point && Number.isFinite(point.value)) {
      values.push(point.value);
    }
  }

  return values;
}

function visibleRangeAutoscaleProvider(
  chart: ChartApi,
  getData: () => readonly ChartDataPoint[]
) {
  return (baseImplementation: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
    const values = finiteSeriesValues(getData(), chart.timeScale().getVisibleLogicalRange());
    if (values.length === 0) {
      return baseImplementation();
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const magnitude = Math.max(Math.abs(min), Math.abs(max), 1);
    const padding = Math.max(range * 0.12, magnitude * 0.0002);

    return {
      priceRange: {
        minValue: min - padding,
        maxValue: max + padding
      },
      margins: {
        above: 8,
        below: 8
      }
    };
  };
}

function resolveIndicatorPriceFormat(
  item: ChartSeries,
  fallback?: ReturnType<typeof toPriceFormat>
) {
  return item.priceFormat === 'volume' ? volumePriceFormat() : fallback;
}

function addIndicatorSeries(
  chart: ReturnType<typeof createChart>,
  item: ChartSeries,
  priceFormat?: ReturnType<typeof toPriceFormat>,
  getData?: () => readonly ChartDataPoint[]
): MutableSeriesApi {
  const scaleOptions = item.priceScaleId ? { priceScaleId: item.priceScaleId } : {};
  const autoscaleOptions =
    item.autoscaleMode === 'visible-range' && getData
      ? { autoscaleInfoProvider: visibleRangeAutoscaleProvider(chart, getData) }
      : {};
  const resolvedPriceFormat = resolveIndicatorPriceFormat(item, priceFormat);

  if (item.type === 'histogram') {
    return chart.addSeries(HistogramSeries, {
      color: item.color ?? '#6ee7b7',
      ...scaleOptions,
      ...autoscaleOptions,
      priceFormat: resolvedPriceFormat ?? volumePriceFormat()
    }) as MutableSeriesApi;
  }

  return chart.addSeries(LineSeries, {
    color: item.color ?? '#a78bfa',
    lineWidth: 2,
    ...scaleOptions,
    ...autoscaleOptions,
    ...(resolvedPriceFormat ? { priceFormat: resolvedPriceFormat } : {})
  }) as MutableSeriesApi;
}

function seriesStructureKey(items: ChartSeries[]): string {
  return items
    .map((item) =>
      [
        item.id,
        item.name,
        item.type,
        item.color ?? '',
        item.paneId,
        item.priceScaleId ?? '',
        item.autoscaleMode ?? '',
        item.priceFormat ?? ''
      ].join(':')
    )
    .join('|');
}

type StudyPane = {
  id: string;
  name: string;
  series: ChartSeries[];
};

function toReadoutBars(series: BarSeries): Map<number, ReadoutBar> {
  const bars = new Map<number, ReadoutBar>();

  series.ts.forEach((ts, index) => {
    const open = series.open[index];
    const high = series.high[index];
    const low = series.low[index];
    const close = series.close[index];

    if (open === undefined || high === undefined || low === undefined || close === undefined) {
      return;
    }

    const time = Math.floor(ts / 1000);
    bars.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume: series.volume[index] ?? 0
    });
  });

  return bars;
}

function toIndicatorReadouts(items: ChartSeries[]): Map<number, ReadoutIndicator[]> {
  const values = new Map<number, ReadoutIndicator[]>();

  for (const item of items) {
    for (const point of item.data) {
      if (!('value' in point)) {
        continue;
      }

      const bucket = values.get(point.time) ?? [];
      bucket.push({
        id: item.id,
        name: item.name,
        value: point.value,
        ...(item.color ? { color: item.color } : {})
      });
      values.set(point.time, bucket);
    }
  }

  return values;
}

function formatNumber(value: number): string {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8;

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits
  }).format(value);
}

function formatVolume(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 3
  }).format(value);
}

function formatReadoutTime(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(time * 1000));
}

function ReadoutValue({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  return (
    <span className={tone ? `readout-value is-${tone}` : 'readout-value'}>
      <span>{label}</span>
      {value}
    </span>
  );
}

function ChartReadout({
  bar,
  indicators,
  isCursor,
  pricePrecision
}: {
  bar: ReadoutBar | null;
  indicators: ReadoutIndicator[];
  isCursor: boolean;
  pricePrecision: number;
}) {
  if (!bar) {
    return null;
  }

  const tone = bar.close >= bar.open ? 'up' : 'down';

  return (
    <div className="chart-readout">
      <div className="readout-row">
        <span className="readout-time">
          {isCursor ? 'Cursor' : 'Latest'} {formatReadoutTime(bar.time)}
        </span>
        <ReadoutValue label="O" value={formatPrice(bar.open, pricePrecision)} />
        <ReadoutValue label="H" value={formatPrice(bar.high, pricePrecision)} />
        <ReadoutValue label="L" value={formatPrice(bar.low, pricePrecision)} />
        <ReadoutValue label="C" value={formatPrice(bar.close, pricePrecision)} tone={tone} />
        <ReadoutValue label="V" value={formatVolume(bar.volume)} />
      </div>
      {indicators.length > 0 ? (
        <div className="readout-row readout-indicators">
          {indicators.map((item) => (
            <span
              className="readout-indicator"
              key={item.id}
              style={
                item.color
                  ? ({
                      '--series-color': item.color
                    } as CSSProperties)
                  : undefined
              }
            >
              <span className="readout-dot" />
              {item.name} {formatNumber(item.value)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function groupStudyPanes(items: ChartSeries[]): StudyPane[] {
  const panes = new Map<string, StudyPane>();

  for (const item of items) {
    const pane = panes.get(item.paneId);
    if (pane) {
      pane.series.push(item);
      continue;
    }

    panes.set(item.paneId, {
      id: item.paneId,
      name: item.paneName,
      series: [item]
    });
  }

  return [...panes.values()];
}

function StudyPaneChart({
  pane,
  onHoverTime,
  onRegisterChart,
  onVisibleRangeChange
}: {
  pane: StudyPane;
  onHoverTime: CrosshairHandler;
  onRegisterChart: ChartRegister;
  onVisibleRangeChange: LogicalRangeHandler;
}) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const seriesRefs = useRef<Map<string, MutableSeriesApi>>(new Map());
  const dataMetaRefs = useRef<Map<string, DataMeta>>(new Map());
  const latestDataRefs = useRef<Map<string, readonly ChartDataPoint[]>>(new Map());
  const paneStructureKey = useMemo(() => seriesStructureKey(pane.series), [pane.series]);

  useEffect(() => {
    const container = paneRef.current;
    if (!container || pane.series.length === 0) {
      return;
    }

    const chart = createBaseChart(container);
    const nextSeriesRefs = new Map<string, MutableSeriesApi>();
    const nextDataMetaRefs = new Map<string, DataMeta>();
    const nextLatestDataRefs = new Map<string, readonly ChartDataPoint[]>();
    latestDataRefs.current = nextLatestDataRefs;
    for (const item of pane.series) {
      nextLatestDataRefs.set(item.id, item.data);
      const study = addIndicatorSeries(
        chart,
        item,
        undefined,
        () => latestDataRefs.current.get(item.id) ?? item.data
      );
      if (item.priceScaleId && item.type === 'histogram') {
        chart.priceScale(item.priceScaleId).applyOptions({
          scaleMargins: {
            top: 0.62,
            bottom: 0
          }
        });
      }
      nextSeriesRefs.set(item.id, study);
      nextDataMetaRefs.set(item.id, setSeriesData(study, item.data));
    }

    chartRef.current = chart;
    seriesRefs.current = nextSeriesRefs;
    dataMetaRefs.current = nextDataMetaRefs;
    latestDataRefs.current = nextLatestDataRefs;
    const unsubscribeHover = subscribeHover(chart, onHoverTime);
    const handleVisibleRange = (range: { from: number; to: number } | null) => {
      onVisibleRangeChange(pane.id, range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);

    const observer = new ResizeObserver(() => resizeChart(container, chart));
    observer.observe(container);
    resizeChart(container, chart);
    onRegisterChart(pane.id, chart);

    return () => {
      onRegisterChart(pane.id, null);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRange);
      unsubscribeHover();
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = new Map();
      dataMetaRefs.current = new Map();
      latestDataRefs.current = new Map();
    };
  }, [onHoverTime, onRegisterChart, onVisibleRangeChange, pane.id, paneStructureKey]);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    for (const item of pane.series) {
      const study = seriesRefs.current.get(item.id);
      if (!study) {
        continue;
      }

      latestDataRefs.current.set(item.id, item.data);
      dataMetaRefs.current.set(
        item.id,
        updateSeriesData(study, item.data, dataMetaRefs.current.get(item.id) ?? null)
      );
    }
  }, [pane.series]);

  return <div aria-label={pane.name} className="oscillator-chart" ref={paneRef} />;
}

export function KlineChart({
  series,
  indicators,
  externalSeries = [],
  hasMoreHistory = false,
  loadingHistory = false,
  onLoadMoreHistory
}: KlineChartProps) {
  const priceRef = useRef<HTMLDivElement | null>(null);
  const priceChartRef = useRef<PriceChartRefs | null>(null);
  const chartRegistryRef = useRef<Map<string, ChartApi>>(new Map());
  const syncingRangeRef = useRef(false);
  const visibleRangeRef = useRef<VisibleLogicalRange | null>(null);
  const visiblePriceRangeRef = useRef<VisiblePriceRange | null>(null);
  const manualPriceScaleRef = useRef(false);
  const candleMetaRef = useRef<DataMeta | null>(null);
  const volumeMetaRef = useRef<DataMeta | null>(null);
  const priceIndicatorMetaRefs = useRef<Map<string, DataMeta>>(new Map());
  const initializedRef = useRef(false);
  const previousSeriesKeyRef = useRef<string | null>(null);
  const candlesLengthRef = useRef(0);
  const historyStateRef = useRef({
    hasMoreHistory,
    loadingHistory,
    onLoadMoreHistory
  });
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const handleHoverTime = useCallback((time: number | null) => {
    setHoverTime(time);
  }, []);
  const registerChart = useCallback<ChartRegister>((id, chart) => {
    if (!chart) {
      chartRegistryRef.current.delete(id);
      return;
    }

    chartRegistryRef.current.set(id, chart);
    if (visibleRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(visibleRangeRef.current);
    }
  }, []);
  const syncVisibleRange = useCallback<LogicalRangeHandler>((sourceId, range) => {
    const nextRange = range
      ? (() => {
          const span = range.to - range.from;
          const maxFrom = Math.max(candlesLengthRef.current - MIN_VISIBLE_REAL_BARS, 0);
          return range.from > maxFrom ? { from: maxFrom, to: maxFrom + span } : range;
        })()
      : null;

    visibleRangeRef.current = nextRange;
    if (!nextRange || syncingRangeRef.current) {
      return nextRange;
    }

    const shouldApplyToSource =
      range !== null && (nextRange.from !== range.from || nextRange.to !== range.to);
    try {
      syncingRangeRef.current = true;
      for (const [chartId, chart] of chartRegistryRef.current) {
        if (chartId !== sourceId || shouldApplyToSource) {
          chart.timeScale().setVisibleLogicalRange(nextRange);
        }
      }
    } finally {
      syncingRangeRef.current = false;
    }

    return nextRange;
  }, []);
  const seriesKey = `${series.exchange ?? ''}:${series.marketType ?? ''}:${series.symbol}:${series.timeframe}`;

  if (previousSeriesKeyRef.current !== seriesKey) {
    previousSeriesKeyRef.current = seriesKey;
    visibleRangeRef.current = null;
    visiblePriceRangeRef.current = null;
    manualPriceScaleRef.current = false;
    candleMetaRef.current = null;
    volumeMetaRef.current = null;
    priceIndicatorMetaRefs.current = new Map();
    initializedRef.current = false;
  }

  const chartData = useMemo(() => {
    const results = runIndicators(series, indicators);
    const indicatorSeries = toIndicatorSeries(series, results);
    const allIndicatorSeries = [...indicatorSeries, ...externalSeries];
    const oscillatorIndicators = allIndicatorSeries.filter((item) => item.pane === 'oscillator');
    const candles = toCandles(series);

    return {
      candles,
      volume: toVolume(series),
      priceIndicators: allIndicatorSeries.filter((item) => item.pane === 'price'),
      studyPanes: groupStudyPanes(oscillatorIndicators),
      barsByTime: toReadoutBars(series),
      indicatorValuesByTime: toIndicatorReadouts(allIndicatorSeries),
      pricePrecision: inferPricePrecision([
        ...series.open,
        ...series.high,
        ...series.low,
        ...series.close
      ]),
      latestTime: candles.at(-1)?.time ?? null
    };
  }, [externalSeries, indicators, series]);
  const priceChartStructureKey = useMemo(
    () => `${seriesKey}:${chartData.pricePrecision}:${seriesStructureKey(chartData.priceIndicators)}`,
    [chartData.priceIndicators, chartData.pricePrecision, seriesKey]
  );
  candlesLengthRef.current = chartData.candles.length;

  const activeTime = hoverTime ?? chartData.latestTime;
  const activeBar = activeTime === null ? null : (chartData.barsByTime.get(activeTime) ?? null);
  const activeIndicators =
    activeTime === null ? [] : (chartData.indicatorValuesByTime.get(activeTime) ?? []);

  useEffect(() => {
    historyStateRef.current = {
      hasMoreHistory,
      loadingHistory,
      onLoadMoreHistory
    };
  }, [hasMoreHistory, loadingHistory, onLoadMoreHistory]);

  useEffect(() => {
    const priceContainer = priceRef.current;
    if (!priceContainer) {
      return;
    }

    const savedRange = visibleRangeRef.current;
    const chart = createBaseChart(priceContainer);
    const priceFormat = toPriceFormat(chartData.pricePrecision);
    const savedPriceRange = visiblePriceRangeRef.current;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: '#101318' },
        textColor: '#aab4c3'
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' }
      },
      handleScale: {
        axisPressedMouseMove: {
          price: true,
          time: true
        },
        axisDoubleClickReset: {
          price: true,
          time: true
        },
        mouseWheel: true,
        pinch: true
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00c2a8',
      downColor: '#ff5c7a',
      borderUpColor: '#00c2a8',
      borderDownColor: '#ff5c7a',
      wickUpColor: '#00c2a8',
      wickDownColor: '#ff5c7a',
      priceFormat
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume'
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0
      }
    });

    candleMetaRef.current = setSeriesData(candleSeries as MutableSeriesApi, chartData.candles);
    volumeMetaRef.current = setSeriesData(volumeSeries as MutableSeriesApi, chartData.volume);

    const priceIndicatorSeriesRefs = new Map<string, MutableSeriesApi>();
    const nextPriceIndicatorMetaRefs = new Map<string, DataMeta>();
    for (const item of chartData.priceIndicators) {
      const study = addIndicatorSeries(chart, item, priceFormat);
      priceIndicatorSeriesRefs.set(item.id, study);
      nextPriceIndicatorMetaRefs.set(item.id, setSeriesData(study, item.data));
    }
    priceIndicatorMetaRefs.current = nextPriceIndicatorMetaRefs;
    priceChartRef.current = {
      chart,
      candleSeries: candleSeries as MutableSeriesApi,
      volumeSeries: volumeSeries as MutableSeriesApi,
      priceIndicators: priceIndicatorSeriesRefs
    };
    registerChart('price', chart);

    const unsubscribeHover = subscribeHover(chart, handleHoverTime);
    const isRightPriceAxisEvent = (event: PointerEvent | MouseEvent) => {
      const rightScaleWidth = chart.priceScale('right').width();
      if (rightScaleWidth <= 0) {
        return false;
      }

      const rect = priceContainer.getBoundingClientRect();
      return event.clientX >= rect.right - rightScaleWidth;
    };
    const handlePriceAxisPointerDown = (event: PointerEvent) => {
      if (isRightPriceAxisEvent(event)) {
        manualPriceScaleRef.current = true;
      }
    };
    const handlePriceAxisDoubleClick = (event: MouseEvent) => {
      if (isRightPriceAxisEvent(event)) {
        manualPriceScaleRef.current = false;
        visiblePriceRangeRef.current = null;
      }
    };
    let requestedHistory = false;
    const handleVisibleRange = (range: { from: number; to: number } | null) => {
      const syncedRange = syncVisibleRange('price', range);
      const historyState = historyStateRef.current;
      if (
        !syncedRange ||
        requestedHistory ||
        historyState.loadingHistory ||
        !historyState.hasMoreHistory ||
        !historyState.onLoadMoreHistory
      ) {
        return;
      }

      const userHasLeftLatestBars = syncedRange.to < candlesLengthRef.current - 20;
      if (syncedRange.from < 8 && userHasLeftLatestBars) {
        requestedHistory = true;
        void Promise.resolve(historyState.onLoadMoreHistory()).finally(() => {
          requestedHistory = false;
        });
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);
    priceContainer.addEventListener('pointerdown', handlePriceAxisPointerDown, { capture: true });
    priceContainer.addEventListener('dblclick', handlePriceAxisDoubleClick, { capture: true });
    const observer = new ResizeObserver(() => resizeChart(priceContainer, chart));
    observer.observe(priceContainer);
    resizeChart(priceContainer, chart);

    if (!initializedRef.current) {
      chart.timeScale().fitContent();
      chart.timeScale().scrollToPosition(FUTURE_RIGHT_OFFSET, false);
      initializedRef.current = true;
    } else if (savedRange) {
      chart.timeScale().setVisibleLogicalRange(savedRange);
    }

    if (savedPriceRange) {
      chart.priceScale('right').setVisibleRange(savedPriceRange);
      chart.priceScale('right').setAutoScale(false);
    }

    return () => {
      visiblePriceRangeRef.current = manualPriceScaleRef.current
        ? chart.priceScale('right').getVisibleRange()
        : null;
      registerChart('price', null);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRange);
      priceContainer.removeEventListener('pointerdown', handlePriceAxisPointerDown, { capture: true });
      priceContainer.removeEventListener('dblclick', handlePriceAxisDoubleClick, { capture: true });
      unsubscribeHover();
      observer.disconnect();
      chart.remove();
      priceChartRef.current = null;
      candleMetaRef.current = null;
      volumeMetaRef.current = null;
      priceIndicatorMetaRefs.current = new Map();
    };
  }, [handleHoverTime, priceChartStructureKey, registerChart, syncVisibleRange]);

  useEffect(() => {
    const refs = priceChartRef.current;
    if (!refs) {
      return;
    }

    const previousCandleMeta = candleMetaRef.current;
    const savedRange = visibleRangeRef.current;
    const prependedCount =
      previousCandleMeta?.firstTime === null || previousCandleMeta?.firstTime === undefined
        ? 0
        : chartData.candles.findIndex((candle) => candle.time === previousCandleMeta.firstTime);
    const forceFullCandles = shouldSetFullData(previousCandleMeta, chartData.candles);
    const savedPriceRange = manualPriceScaleRef.current
      ? refs.chart.priceScale('right').getVisibleRange()
      : null;

    candleMetaRef.current = updateSeriesData(
      refs.candleSeries,
      chartData.candles,
      candleMetaRef.current,
      forceFullCandles
    );
    volumeMetaRef.current = updateSeriesData(
      refs.volumeSeries,
      chartData.volume,
      volumeMetaRef.current,
      forceFullCandles
    );

    for (const item of chartData.priceIndicators) {
      const study = refs.priceIndicators.get(item.id);
      if (!study) {
        continue;
      }

      priceIndicatorMetaRefs.current.set(
        item.id,
        updateSeriesData(
          study,
          item.data,
          priceIndicatorMetaRefs.current.get(item.id) ?? null,
          forceFullCandles
        )
      );
    }

    if (forceFullCandles && savedRange && prependedCount > 0) {
      refs.chart.timeScale().setVisibleLogicalRange({
        from: savedRange.from + prependedCount,
        to: savedRange.to + prependedCount
      });
    }

    if (savedPriceRange) {
      refs.chart.priceScale('right').setVisibleRange(savedPriceRange);
      refs.chart.priceScale('right').setAutoScale(false);
    }
  }, [chartData.candles, chartData.priceIndicators, chartData.volume]);

  return (
    <div
      className="kline-stack"
      style={{
        gridTemplateRows:
          chartData.studyPanes.length > 0
            ? `var(--price-pane-height) repeat(${chartData.studyPanes.length}, var(--study-pane-height))`
            : 'var(--single-price-pane-height)'
      }}
    >
      <ChartReadout
        bar={activeBar}
        indicators={activeIndicators}
        isCursor={hoverTime !== null}
        pricePrecision={chartData.pricePrecision}
      />
      <div className="price-chart" ref={priceRef} />
      {chartData.studyPanes.map((pane) => (
        <StudyPaneChart
          key={pane.id}
          pane={pane}
          onHoverTime={handleHoverTime}
          onRegisterChart={registerChart}
          onVisibleRangeChange={syncVisibleRange}
        />
      ))}
    </div>
  );
}
