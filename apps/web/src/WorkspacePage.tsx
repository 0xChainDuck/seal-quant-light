import { ChartPanel } from './components/ChartPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { useWorkspaceStore } from './state/workspace.js';

export function WorkspacePage() {
  const layout = useWorkspaceStore((state) => state.layout);
  const panels = useWorkspaceStore((state) => state.panels);

  return (
    <div className="workspace">
      <Sidebar />
      <main className={`chart-grid layout-${layout}`}>
        {panels.map((panel) => (
          <ChartPanel key={panel.id} panel={panel} />
        ))}
      </main>
    </div>
  );
}
