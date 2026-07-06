import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import { EmptyState } from '@/components/common';

export default function StaleMetadata() {
  const results = useDashboardStore((s) => s.results);
  const stale   = results?.staleMetadata;

  if (!stale) {
    return <EmptyState icon="🧹" title="No stale metadata data yet" description="Run a full analysis to find unused reports, dashboards, and old metadata." className="m-6" />;
  }

  const staleReports   = stale.staleReports         ?? [];
  const staleDashboards = stale.staleDashboards      ?? [];
  const unusedFields   = stale.unusedCustomFields    ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Stale Metadata</h1>
        <p className="text-xs text-sf-muted">Unused fields, stale reports and dashboards that can be safely retired.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="📊" value={staleReports.length}    label="Stale Reports"     accent={staleReports.length    > 0 ? 'text-score-fair' : 'text-score-good'} />
        <StatCard icon="📋" value={staleDashboards.length} label="Stale Dashboards"  accent={staleDashboards.length > 0 ? 'text-score-fair' : 'text-score-good'} />
        <StatCard icon="🏷️" value={unusedFields.length}    label="Unused Fields"     accent={unusedFields.length    > 0 ? 'text-score-fair' : 'text-score-good'} />
        <StatCard icon="📦" value={stale.totalStaleItems}  label="Total Stale Items" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard title={`Unused Custom Fields (${unusedFields.length})`}>
          {unusedFields.length === 0 ? (
            <p className="text-xs text-sf-muted">No unused fields detected.</p>
          ) : (
            <ul className="space-y-1 max-h-72 overflow-y-auto">
              {unusedFields.map((f) => (
                <li key={`${f.objectName ?? ''}.${f.name}`} className="flex items-center justify-between text-xs py-1 border-b border-sf-border/40 last:border-0">
                  <span className="text-sf-text font-mono text-[11px]">
                    {f.objectName && <span className="text-sf-muted">{f.objectName}.</span>}{f.name}
                  </span>
                  <span className="text-sf-muted text-[10px]">{f.ageInDays ? `${f.ageInDays}d old` : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard title={`Stale Reports (${staleReports.length})`}>
          {staleReports.length === 0 ? (
            <p className="text-xs text-sf-muted">No stale reports detected.</p>
          ) : (
            <ul className="space-y-1 max-h-72 overflow-y-auto">
              {staleReports.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-sf-border/40 last:border-0">
                  <span className="text-sf-text truncate max-w-[70%]">{r.name}</span>
                  <span className="text-sf-muted text-[10px] shrink-0 ml-2">
                    {r.lastModifiedDate ? new Date(r.lastModifiedDate).toLocaleDateString() : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {staleDashboards.length > 0 && (
          <GlassCard title={`Stale Dashboards (${staleDashboards.length})`}>
            <ul className="space-y-1 max-h-72 overflow-y-auto">
              {staleDashboards.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-xs py-1 border-b border-sf-border/40 last:border-0">
                  <span className="text-sf-text truncate max-w-[70%]">{d.name}</span>
                  <span className="text-sf-muted text-[10px] shrink-0 ml-2">
                    {d.lastModifiedDate ? new Date(d.lastModifiedDate).toLocaleDateString() : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}

        {stale.estimatedCleanupHours > 0 && (
          <GlassCard title="Cleanup Estimate">
            <p className="text-3xl font-bold text-sf-accent">{stale.estimatedCleanupHours}h</p>
            <p className="text-xs text-sf-muted mt-1">estimated cleanup effort across {stale.totalStaleItems} items</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
