import { LayoutGrid, PanelsTopLeft, Plus, Rows3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchExchanges } from '../lib/api.js';
import { useWorkspaceStore, type WorkspaceLayout } from '../state/workspace.js';

const LAYOUTS: Array<{ value: WorkspaceLayout; icon: typeof PanelsTopLeft; title: string }> = [
  { value: 1, icon: PanelsTopLeft, title: 'Single layout' },
  { value: 2, icon: Rows3, title: 'Two column layout' },
  { value: 4, icon: LayoutGrid, title: 'Grid layout' }
];

export function Sidebar() {
  const layout = useWorkspaceStore((state) => state.layout);
  const panels = useWorkspaceStore((state) => state.panels);
  const setLayout = useWorkspaceStore((state) => state.setLayout);
  const addPanel = useWorkspaceStore((state) => state.addPanel);
  const updatePanel = useWorkspaceStore((state) => state.updatePanel);

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
        {LAYOUTS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={layout === item.value ? 'icon-button is-active' : 'icon-button'}
              key={item.value}
              type="button"
              title={item.title}
              onClick={() => setLayout(item.value)}
            >
              <Icon size={17} />
            </button>
          );
        })}
        <button className="icon-button add-button" type="button" title="Add panel" onClick={addPanel}>
          <Plus size={17} />
        </button>
      </div>

      <div className="sidebar-section">
        <span className="section-label">Panels</span>
        <div className="panel-list">
          {panels.map((panel) => (
            <button
              className="panel-list-item"
              key={panel.id}
              type="button"
              onClick={() =>
                updatePanel(panel.id, {
                  limit: panel.limit === 500 ? 1000 : 500
                })
              }
            >
              <strong>{panel.symbol}</strong>
              <span>
                {panel.exchange} / {panel.timeframe} / {panel.limit}
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
