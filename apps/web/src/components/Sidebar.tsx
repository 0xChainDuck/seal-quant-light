import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchExchanges } from '../lib/api.js';
import { displayMarketSymbol } from '../lib/symbols.js';
import { useWorkspaceStore } from '../state/workspace.js';

export function Sidebar() {
  const activePanelId = useWorkspaceStore((state) => state.activePanelId);
  const panels = useWorkspaceStore((state) => state.panels);
  const addPanel = useWorkspaceStore((state) => state.addPanel);
  const selectPanel = useWorkspaceStore((state) => state.selectPanel);

  const exchanges = useQuery({
    queryKey: ['exchanges'],
    queryFn: fetchExchanges,
    staleTime: 5 * 60_000,
    retry: 1
  });

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">S</span>
        <div>
          <strong>Seal Quant</strong>
          <span>Light</span>
        </div>
      </div>

      <div className="toolbar-row">
        <button className="icon-button add-button is-wide" type="button" title="Add panel" onClick={addPanel}>
          <Plus size={17} />
          <span>Add Market</span>
        </button>
      </div>

      <div className="sidebar-section">
        <span className="section-label">Panels</span>
        <div className="panel-list">
          {panels.map((panel) => (
            <button
              className={panel.id === activePanelId ? 'panel-list-item is-active' : 'panel-list-item'}
              key={panel.id}
              type="button"
              onClick={() => selectPanel(panel.id)}
            >
              <strong>{displayMarketSymbol(panel.symbol, panel.quoteAsset)}</strong>
              <span>
                {panel.exchange} / {panel.marketType} / {panel.quoteAsset} / {panel.timeframe}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <span className="section-label">Exchanges</span>
        <div className="exchange-list">
          {(exchanges.data?.exchanges ?? []).map((exchange) => (
            <div className="exchange-row" key={exchange.id}>
              <strong>{exchange.name}</strong>
              <span>{exchange.marketTypes.join(' / ')}</span>
            </div>
          ))}
          {exchanges.isError ? <span className="muted">server offline</span> : null}
        </div>
      </div>
    </aside>
  );
}
