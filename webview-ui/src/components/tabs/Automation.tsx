import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import { EmptyState } from '@/components/common';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import ColumnChart from '@/components/charts/ColumnChart';

export default function Automation() {
  const results = useDashboardStore((s) => s.results);
  const auto    = results?.automationSummary;
  const issues  = (results?.issues ?? []).filter((i) => i.category === 'automation-design');

  if (!auto) {
    return <EmptyState icon="⚡" title="No automation data yet" description="Run a full analysis to see flows, triggers, workflow rules, and process builders." className="m-6" />;
  }

  const typeData = [
    { name: 'Flows',            value: auto.totalFlows           ?? 0, color: '#3b82f6' },
    { name: 'Triggers',         value: auto.totalTriggers        ?? 0, color: '#8b5cf6' },
    { name: 'Validation Rules', value: auto.totalValidationRules ?? 0, color: '#22c55e' },
    { name: 'Screen Flows',     value: auto.totalScreenFlows     ?? 0, color: '#f59e0b' },
    { name: 'Scheduled',        value: auto.totalScheduledFlows  ?? 0, color: '#ec4899' },
    { name: 'Process Builders', value: auto.totalProcessBuilders ?? 0, color: '#14b8a6' },
    { name: 'Workflows',        value: auto.totalWorkflowRules   ?? 0, color: '#f97316' },
  ].filter((d) => d.value > 0);

  const automationByObj = Object.entries(auto.objectMap ?? {})
    .map(([name, v]) => ({ name, value: v.total }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Automation</h1>
        <p className="text-xs text-sf-muted">Flows, triggers, process builders, and validation rules across your org.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="🔄" value={auto.totalFlows            ?? 0} label="Total Flows"       accent="text-chart-1" />
        <StatCard icon="⚡" value={auto.totalTriggers         ?? 0} label="Apex Triggers"     accent="text-chart-2" />
        <StatCard icon="✅" value={auto.totalValidationRules  ?? 0} label="Validation Rules"  accent="text-chart-3" />
        <StatCard icon="🏗️" value={auto.totalProcessBuilders  ?? 0} label="Process Builders"
          accent={(auto.totalProcessBuilders ?? 0) > 0 ? 'text-sev-warning' : 'text-sf-muted'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard title="Automation by Type">
          {typeData.length > 0
            ? <ColumnChart data={typeData} height={180} multiColor />
            : <p className="text-xs text-sf-muted">No automation detected.</p>
          }
        </GlassCard>

        <GlassCard title="Top Objects by Automation Count">
          {automationByObj.length > 0
            ? <ColumnChart data={automationByObj} height={180} color="#3b82f6" />
            : <p className="text-xs text-sf-muted">No object-level automation data.</p>
          }
        </GlassCard>
      </div>

      {(auto.flowInventory?.length ?? 0) > 0 && (
        <GlassCard title={`Flow Inventory (${auto.flowInventory!.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border bg-sf-bg-3">
                  {['Name', 'Type', 'Object', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auto.flowInventory!.map((f, i) => (
                  <tr key={i} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                    <td className="px-3 py-1.5 text-sf-text font-mono text-[11px]">{f.name}</td>
                    <td className="px-3 py-1.5 text-sf-muted text-[11px]">{f.processType}</td>
                    <td className="px-3 py-1.5 text-sf-muted font-mono text-[11px]">{f.objectApiName || '—'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] font-medium ${f.isActive ? 'text-score-good' : 'text-sf-muted'}`}>
                        {f.isActive ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {issues.length > 0 && (
        <GlassCard title={`Automation Issues (${issues.length})`}>
          <IssueFilters />
          <IssueTable issues={issues} />
        </GlassCard>
      )}
    </div>
  );
}
