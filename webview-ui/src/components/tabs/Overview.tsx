import { useDashboardStore } from '@/store/dashboardStore';
import { useUIStore } from '@/store/slices/uiStore';
import { OverviewAdvisory } from './overviewAdvisory';

export default function Overview() {
  const results               = useDashboardStore((s) => s.results);
  const setShowAnalysisDialog = useUIStore((s) => s.setShowAnalysisDialog);

  if (!results) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center">
        <div className="text-5xl">📊</div>
        <div>
          <h2 className="text-sm font-semibold text-sf-text mb-1">No analysis data yet</h2>
          <p className="text-xs text-sf-muted">Run an analysis to see your org health dashboard.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAnalysisDialog(true)}
          className="px-5 py-2 text-sm rounded-lg bg-sf-accent text-white hover:opacity-90 transition-opacity"
        >
          Run Analysis
        </button>
      </div>
    );
  }

  return <OverviewAdvisory />;
}
