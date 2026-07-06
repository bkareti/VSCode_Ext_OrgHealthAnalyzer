import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import { EmptyState } from '@/components/common';
import GovernorGauge from '@/components/charts/GovernorGauge';
import IssueTable from '@/components/issues/IssueTable';

const RISK_COLOR: Record<string, string> = {
  low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444',
};

export default function PerfLimits() {
  const results  = useDashboardStore((s) => s.results);
  const limits   = results?.orgLimits ?? [];
  const govRisks = results?.governorRisks ?? [];
  const issues   = (results?.issues ?? []).filter((i) => i.category === 'performance');

  if (!results) return <EmptyState icon="🚀" title="No performance data yet" description="Run a full analysis to see governor limits and performance metrics." className="m-6" />;

  const GAUGE_KEYS = ['DailyApiRequests', 'DailyBulkApiBatches', 'DataStorageMB', 'FileStorageMB', 'DailyWorkflowEmails'];
  const gaugeData = GAUGE_KEYS.map((key) => limits.find((l) => l.name === key)).filter(Boolean) as typeof limits;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Performance & Limits</h1>
        <p className="text-xs text-sf-muted">Governor limit gauges, live limit usage, and Apex risk analysis.</p>
      </div>

      {gaugeData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {gaugeData.map((l) => (
            <GovernorGauge
              key={l.name}
              label={l.label ?? l.name}
              used={l.remaining !== undefined ? l.max - l.remaining : l.used ?? 0}
              total={l.max}
            />
          ))}
        </div>
      )}

      {govRisks.length > 0 && (
        <GlassCard title={`Apex Governor Risk (${govRisks.length} classes)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border bg-sf-bg-3">
                  {['Class', 'SOQL Risk', 'DML Risk', 'CPU Risk', 'Heap Risk', 'Patterns'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {govRisks.map((r) => {
                  const p = r.prediction;
                  return (
                    <tr key={r.className} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                      <td className="px-3 py-1.5 text-sf-text font-mono text-[11px]">{r.className}</td>
                      {[p.soqlQueries.risk, p.dmlStatements.risk, p.cpuTime.risk, p.heapSize.risk].map((risk, i) => (
                        <td key={i} className="px-3 py-1.5">
                          <span className="text-[10px] font-medium capitalize" style={{ color: RISK_COLOR[risk] }}>{risk}</span>
                        </td>
                      ))}
                      <td className="px-3 py-1.5 text-sf-muted text-[11px] max-w-50 truncate" title={r.patterns.join(', ')}>
                        {r.patterns.slice(0, 2).join(', ')}{r.patterns.length > 2 ? ` +${r.patterns.length - 2}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {limits.length > 0 && (
        <GlassCard title={`All Org Limits (${limits.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border bg-sf-bg-3">
                  {['Limit', 'Used', 'Remaining', 'Max', 'Usage %'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {limits.map((l) => {
                  const used = l.used ?? (l.remaining !== undefined ? l.max - l.remaining : 0);
                  const pct  = l.max > 0 ? (used / l.max) * 100 : 0;
                  const col  = pct >= 90 ? '#ef4444' : pct >= 75 ? '#f97316' : pct >= 50 ? '#eab308' : '#9d9d9d';
                  return (
                    <tr key={l.name} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                      <td className="px-3 py-1.5 text-sf-text">{l.label ?? l.name}</td>
                      <td className="px-3 py-1.5 text-sf-muted tabular-nums">{used.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-sf-muted tabular-nums">{(l.remaining ?? (l.max - used)).toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-sf-muted tabular-nums">{l.max.toLocaleString()}</td>
                      <td className="px-3 py-1.5 tabular-nums font-medium" style={{ color: col }}>{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {issues.length > 0 && (
        <GlassCard title={`Performance Issues (${issues.length})`}>
          <IssueTable issues={issues} hideFilters />
        </GlassCard>
      )}
    </div>
  );
}
