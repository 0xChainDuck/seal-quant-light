import type { ChartPanelConfig } from '../state/workspace.js';
import { useMarketData } from '../hooks/useMarketData.js';
import { useOpenInterestSeries } from '../hooks/useOpenInterest.js';
import { KlineChart } from './KlineChart.js';
import { MarketTape } from './MarketTape.js';
import { PanelHeader } from './PanelHeader.js';

type ChartPanelProps = {
  panel: ChartPanelConfig;
};

export function ChartPanel({ panel }: ChartPanelProps) {
  const marketData = useMarketData(panel);
  const openInterest = useOpenInterestSeries(panel, marketData.series ?? null);

  return (
    <section className="chart-panel">
      <PanelHeader panel={panel} status={marketData.status} updatedAt={marketData.updatedAt} />
      <div className="panel-body">
        <div className="market-view">
          {marketData.series ? (
            <KlineChart
              hasMoreHistory={marketData.hasMoreHistory}
              indicators={panel.indicators}
              loadingHistory={marketData.loadingHistory}
              onLoadMoreHistory={marketData.loadMoreHistory}
              externalSeries={openInterest.series}
              series={marketData.series}
            />
          ) : (
            <div className="empty-state">{marketData.error ?? 'Loading market data'}</div>
          )}
          <MarketTape orderBook={marketData.orderBook} trades={marketData.trades} />
        </div>
        {marketData.error ? <div className="panel-error">{marketData.error}</div> : null}
        {openInterest.error ? <div className="panel-error">{openInterest.error}</div> : null}
      </div>
    </section>
  );
}
