import { toCandles, toIndicatorSeries, toVolume } from '@seal-quant/chart-adapter';
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

export function KlineChart({ series, indicators }: KlineChartProps) {
  const priceRef = useRef<HTMLDivElement | null>(null);
  const oscillatorRef = useRef<HTMLDivElement | null>(null);

  const chartData = useMemo(() => {
    const results = runIndicators(series, indicators);
    const indicatorSeries = toIndicatorSeries(series, results);

    return {
      candles: toCandles(series),
      volume: toVolume(series),
      priceIndicators: indicatorSeries.filter((item) => item.pane === 'price'),
      oscillatorIndicators: indicatorSeries.filter((item) => item.pane === 'oscillator')
    };
  }, [indicators, series]);

  useEffect(() => {
    const priceContainer = priceRef.current;
    if (!priceContainer) {
      return;
    }

    const chart = createChart(priceContainer, {
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: '#101318' },
        textColor: '#aab4c3'
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
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

  useEffect(() => {
    const oscillatorContainer = oscillatorRef.current;
    if (!oscillatorContainer || chartData.oscillatorIndicators.length === 0) {
      return;
    }

    const chart = createChart(oscillatorContainer, {
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

    for (const item of chartData.oscillatorIndicators) {
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

    const observer = new ResizeObserver(() => resizeChart(oscillatorContainer, chart));
    observer.observe(oscillatorContainer);
    resizeChart(oscillatorContainer, chart);
    chart.timeScale().fitContent();

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [chartData.oscillatorIndicators]);

  return (
    <div className="kline-stack">
      <div className="price-chart" ref={priceRef} />
      <div
        className={
          chartData.oscillatorIndicators.length > 0 ? 'oscillator-chart' : 'oscillator-chart is-empty'
        }
        ref={oscillatorRef}
      />
    </div>
  );
}
