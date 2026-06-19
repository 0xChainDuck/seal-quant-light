import type { ChartPanelConfig } from '../state/workspace.js';
import { useMarketData } from '../hooks/useMarketData.js';
import { KlineChart } from './KlineChart.js';
import { PanelHeader } from './PanelHeader.js';

type ChartPanelProps = {
  panel: ChartPanelConfig;
};

export function ChartPanel({ panel }: ChartPanelProps) {
  const marketData = useMarketData(panel);

  return (
    <section className="chart-panel">
      <PanelHeader panel={panel} status={marketData.status} updatedAt={marketData.updatedAt} />
      <div className="panel-body">
        {marketData.series ? (
          <KlineChart series={marketData.series} indicators={panel.indicators} />
        ) : (
          <div className="empty-state">{marketData.error ?? 'Loading market data'}</div>
        )}
        {marketData.error ? <div className="panel-error">{marketData.error}</div> : null}
      </div>
    </section>
  );
}
