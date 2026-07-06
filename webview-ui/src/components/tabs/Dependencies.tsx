import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import InfoCard from '@/components/common/InfoCard';
import { EmptyState } from '@/components/common';

const NODE_COLOR: Record<string, string> = {
  'apex-class': '#3b82f6', 'apex-trigger': '#8b5cf6', 'flow': '#22c55e',
  'object': '#f59e0b', 'lwc': '#ec4899', 'aura': '#14b8a6',
  'visualforce': '#f97316', 'validation-rule': '#6b7280',
};

export default function Dependencies() {
  const results = useDashboardStore((s) => s.results);
  const graph   = results?.dependencyGraph;

  if (!graph) return <EmptyState icon="🕸️" title="No dependency graph yet" description="Run a full analysis to map Apex class, trigger, flow, and LWC dependencies." className="m-6" />;

  const { nodes = [], edges = [], circularDependencies = [] } = graph;
  const inDegree: Record<string, number> = {};
  edges.forEach((e) => { inDegree[e.to] = (inDegree[e.to] ?? 0) + 1; });
  const topNodes = [...nodes].sort((a, b) => (inDegree[b.id] ?? 0) - (inDegree[a.id] ?? 0)).slice(0, 20);
  const typeCount: Record<string, number> = {};
  nodes.forEach((n) => { typeCount[n.type] = (typeCount[n.type] ?? 0) + 1; });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Dependencies</h1>
        <p className="text-xs text-sf-muted">Metadata dependency graph — centrality metrics and cycle detection.</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="🔵" value={nodes.length}                  label="Total Nodes" />
        <StatCard icon="→"  value={edges.length}                  label="Dependencies" />
        <StatCard icon="🔄" value={circularDependencies.length}   label="Circular Deps" accent={circularDependencies.length > 0 ? 'text-sev-error' : 'text-score-good'} />
        <StatCard icon="📦" value={Object.keys(typeCount).length} label="Node Types" />
      </div>
      {circularDependencies.length > 0 && (
        <InfoCard variant="error" title={`${circularDependencies.length} Circular Dependenc${circularDependencies.length === 1 ? 'y' : 'ies'} Detected`}>
          <ul className="space-y-1 mt-1">
            {circularDependencies.slice(0, 10).map((cycle, i) => (
              <li key={i} className="font-mono text-[11px] text-sev-error">{cycle.join(' → ')}</li>
            ))}
            {circularDependencies.length > 10 && <li className="text-sf-muted">…and {circularDependencies.length - 10} more</li>}
          </ul>
        </InfoCard>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard title="Nodes by Type">
          <ul className="space-y-2">
            {Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
              <li key={type} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLOR[type] ?? '#6b7280' }} />
                <span className="text-sf-text capitalize flex-1">{type.replace(/-/g, ' ')}</span>
                <span className="text-sf-muted tabular-nums">{count}</span>
                <div className="w-20 h-1 bg-sf-bg-3 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(count / nodes.length) * 100}%`, background: NODE_COLOR[type] ?? '#6b7280' }} />
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard title="Most Referenced (Top 20)">
          <ul className="space-y-1.5 max-h-80 overflow-y-auto">
            {topNodes.map((node) => (
              <li key={node.id} className="flex items-center justify-between text-xs py-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: NODE_COLOR[node.type] ?? '#6b7280' }} />
                  <span className="text-sf-text font-mono truncate text-[11px]">{node.label ?? node.id}</span>
                </div>
                <span className="text-sf-muted shrink-0 ml-2 tabular-nums">{inDegree[node.id] ?? 0} refs</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
      <GlassCard title={`All Dependencies (showing first 100 of ${edges.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-sf-border bg-sf-bg-3">
                {['Source', 'Type', 'Target'].map((h) => <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {edges.slice(0, 100).map((e, i) => (
                <tr key={i} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                  <td className="px-3 py-1.5 text-sf-text font-mono text-[11px]">{e.from}</td>
                  <td className="px-3 py-1.5 text-sf-muted text-[11px] capitalize">{e.type.replace(/-/g, ' ')}</td>
                  <td className="px-3 py-1.5 text-sf-accent font-mono text-[11px]">{e.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
