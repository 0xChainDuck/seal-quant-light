import { toCandles, toIndicatorSeries, toVolume } from '@seal-quant/chart-adapter';
import type { ChartSeries } from '@seal-quant/chart-adapter';
import type { BarSeries } from '@seal-quant/core';
import { runIndicators } from '@seal-quant/indicators';
import type { IndicatorConfig } from '@seal-quant/indicators';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries
} from 'lightweight-charts';
import { useEffect, useMemo, useRef } from 'react';

type KlineChartProps = {
  series: BarSeries;
  indicators: IndicatorConfig[];
};

function resizeChart(container: HTMLDivElement, chart: ReturnType<typeof createChart>) {
  chart.applyOptions({
    width: Math.max(container.clientWidth, 240),
    height: Math.max(container.clientHeight, 120)
  });
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
      borderColor: 'rgba(148, 163, 184, 0.18)'
    },
    timeScale: {
      borderColor: 'rgba(148, 163, 184, 0.18)',
      timeVisible: true,
      secondsVisible: false
    }
  });
}

function addStudySeries(chart: ReturnType<typeof createChart>, items: ChartSeries[]) {
  for (const item of items) {
    if (item.type === 'histogram') {
      const study = chart.addSeries(HistogramSeries, {
        color: item.color ?? '#6ee7b7'
      });
      study.setData(item.data as never);
    } else {
      const study = chart.addSeries(LineSeries, {
        color: item.color ?? '#a78bfa',
        lineWidth: 2
      });
      study.setData(item.data as never);
    }
  }
}

type StudyPane = {
  id: string;
  name: string;
  series: ChartSeries[];
};

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

function StudyPaneChart({ pane }: { pane: StudyPane }) {
  const paneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = paneRef.current;
    if (!container || pane.series.length === 0) {
      return;
    }

    const chart = createBaseChart(container);
    addStudySeries(chart, pane.series);

    const observer = new ResizeObserver(() => resizeChart(container, chart));
    observer.observe(container);
    resizeChart(container, chart);
    chart.timeScale().fitContent();

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [pane]);

  return <div aria-label={pane.name} className="oscillator-chart" ref={paneRef} />;
}

export function KlineChart({ series, indicators }: KlineChartProps) {
  const priceRef = useRef<HTMLDivElement | null>(null);

  const chartData = useMemo(() => {
    const results = runIndicators(series, indicators);
    const indicatorSeries = toIndicatorSeries(series, results);
    const oscillatorIndicators = indicatorSeries.filter((item) => item.pane === 'oscillator');

    return {
      candles: toCandles(series),
      volume: toVolume(series),
      priceIndicators: indicatorSeries.filter((item) => item.pane === 'price'),
      studyPanes: groupStudyPanes(oscillatorIndicators)
    };
  }, [indicators, series]);

  useEffect(() => {
    const priceContainer = priceRef.current;
    if (!priceContainer) {
      return;
    }

    const chart = createBaseChart(priceContainer);
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: '#101318' },
        textColor: '#aab4c3'
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' }
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00c2a8',
      downColor: '#ff5c7a',
      borderUpColor: '#00c2a8',
      borderDownColor: '#ff5c7a',
      wickUpColor: '#00c2a8',
      wickDownColor: '#ff5c7a'
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

    candleSeries.setData(chartData.candles as never);
    volumeSeries.setData(chartData.volume as never);

    for (const item of chartData.priceIndicators) {
      if (item.type === 'histogram') {
        const study = chart.addSeries(HistogramSeries, {
          color: item.color ?? '#6ee7b7'
        });
        study.setData(item.data as never);
      } else {
        const study = chart.addSeries(LineSeries, {
          color: item.color ?? '#f2b84b',
          lineWidth: 2
        });
        study.setData(item.data as never);
      }
    }

    const observer = new ResizeObserver(() => resizeChart(priceContainer, chart));
    observer.observe(priceContainer);
    resizeChart(priceContainer, chart);
    chart.timeScale().fitContent();

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [chartData.candles, chartData.priceIndicators, chartData.volume]);

  return (
    <div
      className="kline-stack"
      style={{
        gridTemplateRows:
          chartData.studyPanes.length > 0
            ? `minmax(300px, 1fr) repeat(${chartData.studyPanes.length}, 150px)`
            : 'minmax(420px, 1fr)'
      }}
    >
      <div className="price-chart" ref={priceRef} />
      {chartData.studyPanes.map((pane) => (
        <StudyPaneChart key={pane.id} pane={pane} />
      ))}
    </div>
  );
}
