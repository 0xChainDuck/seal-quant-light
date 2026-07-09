import { ChartPanel } from './components/ChartPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { useWorkspaceStore } from './state/workspace.js';

export function WorkspacePage() {
  const activePanelId = useWorkspaceStore((state) => state.activePanelId);
  const panels = useWorkspaceStore((state) => state.panels);
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];

  return (
    <div className="workspace">
      <Sidebar />
      <main className="chart-grid layout-1">
        {activePanel ? <ChartPanel key={activePanel.id} panel={activePanel} /> : null}
      </main>
    </div>
  );
}
