import { BarChart3, CandlestickChart } from 'lucide-react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { symbolBaseAsset } from '../lib/symbols.js';
import { useWorkspaceStore } from '../state/workspace.js';
import { GlobalMarketSearch } from '../components/GlobalMarketSearch.js';

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const panels = useWorkspaceStore((state) => state.panels);
  const activePanelId = useWorkspaceStore((state) => state.activePanelId);
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];
  const activeAsset = activePanel ? symbolBaseAsset(activePanel.symbol) : 'BTC';

  return (
    <div className="product-shell">
      <aside className="nav-rail">
        <Link className="brand-lockup" to="/" title="Seal Quant">
          <span className="brand-mark">S</span>
          <span className="brand-name">Seal Quant</span>
        </Link>
        <nav className="primary-nav" aria-label="Primary navigation">
          <Link className={pathname === '/' ? 'nav-item is-active' : 'nav-item'} to="/">
            <BarChart3 size={18} />
            <span>Markets</span>
          </Link>
          <Link
            className={pathname.startsWith('/market/') ? 'nav-item is-active' : 'nav-item'}
            to="/market/$asset"
            params={{ asset: activeAsset }}
          >
            <CandlestickChart size={18} />
            <span>Terminal</span>
          </Link>
        </nav>
        <div className="nav-rail-spacer" />
      </aside>
      <div className="product-main">
        <header className="topbar">
          <GlobalMarketSearch />
          <div className="topbar-status">
            <span className="live-pulse" />
            Live data
          </div>
        </header>
        <main className="page-surface">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
