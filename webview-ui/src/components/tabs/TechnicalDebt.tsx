import { useMemo, useState } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import { EmptyState } from '@/components/common';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import HBarChart from '@/components/charts/HBarChart';
import InfoCard from '@/components/common/InfoCard';
import type { DebtItem } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  'outdated-api':          'Outdated API',
  'missing-documentation': 'Missing Documentation',
  'todo-fixme':            'TODO / FIXME',
  'complexity':            'Complexity',
  'test-debt':             'Test Debt',
  'naming':                'Naming',
  'dead-code':             'Dead Code',
};

const NODE_COLOR: Record<string, string> = {
  'apex-class': '#3b82f6', 'apex-trigger': '#8b5cf6', 'flow': '#22c55e',
  'object': '#f59e0b', 'lwc': '#ec4899', 'aura': '#14b8a6',
  'visualforce': '#f97316', 'validation-rule': '#6b7280',
};

function basename(path?: string): string {
  if (!path) return '';
  return path.split('/').pop()?.split('\\').pop() ?? path;
}

function DebtItemRow({ item }: { item: DebtItem }) {
  return (
    <li className="flex items-start gap-2 text-xs py-1.5 border-b border-sf-border/30 last:border-0">
      <span className="text-sev-info shrink-0 mt-0.5">⚡</span>
      <div className="min-w-0 flex-1">
        <p className="text-sf-text text-[11px] leading-snug">{item.description}</p>
        {item.file && (
          <p className="text-[10px] text-sf-muted font-mono truncate">
            {basename(item.file)}{item.line ? `:${item.line}` : ''}
          </p>
        )}
      </div>
      <span className="text-[10px] text-sf-muted tabular-nums shrink-0">{item.estimatedHours}h</span>
    </li>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TechnicalDebt() {
  const results = useDashboardStore((s) => s.results);
  const [showAllWins, setShowAllWins] = useState(false);

  const debt  = results?.debtSummary;
  const stale = results?.staleMetadata;
  const graph = results?.dependencyGraph;
  const debtIssues = useMemo(
    () => (results?.issues ?? []).filter((i) => i.category === 'technical-debt'),
    [results],
  );

  // Debt by category — collected but previously never rendered
  const byCategoryData = useMemo(() =>
    Object.entries(debt?.byCategory ?? {})
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: CATEGORY_LABEL[k] ?? k, value: v }))
      .sort((a, b) => b.value - a.value),
    [debt],
  );

  const effortTierData = useMemo(() => [
    { name: 'Quick Wins (<1 hr)', value: debt?.quickWins?.length   ?? 0, color: '#22c55e' },
    { name: 'Medium (1–4 hrs)',   value: debt?.mediumItems?.length ?? 0, color: '#eab308' },
    { name: 'Large (>4 hrs)',     value: debt?.largeItems?.length  ?? 0, color: '#ef4444' },
  ].filter((d) => d.value > 0), [debt]);

  // Dependency hubs (fan-in) + cycles — from the dependency graph
  const { topHubs, cycles } = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const edges = graph?.edges ?? [];
    const inDegree: Record<string, number> = {};
    edges.forEach((e) => { inDegree[e.to] = (inDegree[e.to] ?? 0) + 1; });
    const hubs = [...nodes]
      .sort((a, b) => (inDegree[b.id] ?? 0) - (inDegree[a.id] ?? 0))
      .slice(0, 10)
      .map((n) => ({ label: n.label ?? n.id, type: n.type, refs: inDegree[n.id] ?? 0 }));
    return { topHubs: hubs, cycles: graph?.circularDependencies ?? [] };
  }, [graph]);

  const staleReports    = stale?.staleReports       ?? [];
  const staleDashboards = stale?.staleDashboards    ?? [];
  const unusedFields    = stale?.unusedCustomFields ?? [];

  const quickWins = debt?.quickWins ?? [];
  const visibleWins = showAllWins ? quickWins : quickWins.slice(0, 8);

  const totalItems =
    (debt?.quickWins?.length ?? 0) + (debt?.mediumItems?.length ?? 0) + (debt?.largeItems?.length ?? 0);

  if (!results) {
    return (
      <EmptyState
        icon="🧹"
        title="No technical debt data yet"
        description="Run a full analysis to quantify debt hours, stale metadata, and architecture risk."
        className="m-6"
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Technical Debt</h1>
        <p className="text-xs text-sf-muted">
          Quantified debt hours, cleanup candidates, and architecture risk — your debt payoff plan.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon="⏱️"
          value={debt ? debt.totalHours : '—'}
          label="Total Debt Hours"
          sub="estimated"
          accent={debt && debt.totalHours > 200 ? 'text-sev-warning' : 'text-score-good'}
        />
        <StatCard icon="🔄" value={debt?.sprintCycles ?? '—'} label="Sprint Cycles" sub="at 20% capacity" />
        <StatCard icon="⚡" value={quickWins.length} label="Quick Wins" sub="<1 hr each" accent="text-score-good" />
        <StatCard
          icon="🧹"
          value={stale?.totalStaleItems ?? '—'}
          label="Stale Items"
          sub={stale ? `~${stale.estimatedCleanupHours}h cleanup` : undefined}
          accent={(stale?.totalStaleItems ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'}
        />
        <StatCard
          icon="🔁"
          value={cycles.length}
          label="Circular Dependencies"
          accent={cycles.length > 0 ? 'text-sev-error' : 'text-score-good'}
        />
        <StatCard icon="📋" value={totalItems} label="Debt Items" />
      </div>

      {/* How hours are estimated */}
      <div className="rounded-lg bg-sf-bg-2 border border-sf-border px-4 py-3 text-xs text-sf-muted space-y-1">
        <p className="font-medium text-sf-text">How hours are estimated</p>
        <p>
          Each item is categorized by remediation effort: <strong className="text-sf-text">Quick Wins</strong> (&lt;1 hr),{' '}
          <strong className="text-sf-text">Medium</strong> (1–4 hrs), <strong className="text-sf-text">Large</strong> (&gt;4 hrs).
          Sprint cycles assume 2-week sprints with 20% of team capacity allocated to debt resolution.
        </p>
      </div>

      {/* Charts: by category | by effort tier */}
      {debt && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlassCard title="Debt by Category">
            {byCategoryData.length > 0
              ? <HBarChart data={byCategoryData} color="#8b5cf6" />
              : <EmptyState title="No categorized debt data" />}
          </GlassCard>
          <GlassCard title="Debt by Effort Tier">
            {effortTierData.length > 0
              ? <HBarChart data={effortTierData} multiColor color="#f59e0b" />
              : <EmptyState title="No debt items" />}
          </GlassCard>
        </div>
      )}

      {/* Quick wins — actual items with file locations */}
      <GlassCard>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-sf-text">
            Debt Payoff Plan — Quick Wins ({quickWins.length})
          </h3>
          <span className="text-[10px] text-sf-muted">Slot these into your next 1–2 sprints</span>
        </div>
        {quickWins.length > 0 ? (
          <>
            <ul>
              {visibleWins.map((item) => <DebtItemRow key={item.id} item={item} />)}
            </ul>
            {quickWins.length > 8 && (
              <button
                type="button"
                className="mt-2 text-[11px] text-sf-accent hover:underline"
                onClick={() => setShowAllWins((v) => !v)}
              >
                {showAllWins ? '▴ Show fewer' : `View all ${quickWins.length} quick wins →`}
              </button>
            )}
          </>
        ) : (
          <EmptyState title="No quick wins identified" />
        )}
      </GlassCard>

      {/* Stale metadata section */}
      {stale && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <GlassCard title={`Unused Custom Fields (${unusedFields.length})`}>
            {unusedFields.length === 0 ? (
              <p className="text-xs text-score-good">✓ No unused fields detected.</p>
            ) : (
              <ul className="space-y-1 max-h-72 overflow-y-auto">
                {unusedFields.map((f) => (
                  <li key={`${f.objectName ?? ''}.${f.name}`} className="flex items-center justify-between text-xs py-1 border-b border-sf-border/40 last:border-0">
                    <span className="text-sf-text font-mono text-[11px] truncate">
                      {f.objectName && <span className="text-sf-muted">{f.objectName}.</span>}{f.name}
                    </span>
                    <span className="text-sf-muted text-[10px] shrink-0 ml-2">{f.ageInDays ? `${f.ageInDays}d old` : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard title={`Stale Reports (${staleReports.length})`}>
            {staleReports.length === 0 ? (
              <p className="text-xs text-score-good">✓ No stale reports detected.</p>
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

          <GlassCard title={`Stale Dashboards (${staleDashboards.length})`}>
            {staleDashboards.length === 0 ? (
              <p className="text-xs text-score-good">✓ No stale dashboards detected.</p>
            ) : (
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
            )}
          </GlassCard>
        </div>
      )}

      {/* Architecture risk — cycles + hubs from the dependency graph */}
      {graph && (
        <div className="space-y-4">
          {cycles.length > 0 && (
            <InfoCard variant="error" title={`${cycles.length} Circular Dependenc${cycles.length === 1 ? 'y' : 'ies'} Detected`}>
              <ul className="space-y-1 mt-1">
                {cycles.slice(0, 10).map((cycle, i) => (
                  <li key={i} className="font-mono text-[11px] text-sev-error">{cycle.join(' → ')}</li>
                ))}
                {cycles.length > 10 && <li className="text-sf-muted">…and {cycles.length - 10} more</li>}
              </ul>
            </InfoCard>
          )}

          <GlassCard title="Change-Risk Hubs (Most Referenced Components)">
            <p className="text-[11px] text-sf-muted mb-2">
              High fan-in components — a change here ripples through everything that references it. Refactor with extra care and test coverage.
            </p>
            {topHubs.length > 0 ? (
              <ul className="space-y-1.5">
                {topHubs.map((node) => (
                  <li key={`${node.type}-${node.label}`} className="flex items-center justify-between text-xs py-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: NODE_COLOR[node.type] ?? '#6b7280' }} />
                      <span className="text-sf-text font-mono truncate text-[11px]">{node.label}</span>
                      <span className="text-[10px] text-sf-muted capitalize shrink-0">{node.type.replace(/-/g, ' ')}</span>
                    </div>
                    <span className="text-sf-muted shrink-0 ml-2 tabular-nums">{node.refs} refs</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No dependency data" />
            )}
          </GlassCard>
        </div>
      )}

      {/* Debt issues table */}
      {debtIssues.length > 0 && (
        <GlassCard title={`Technical Debt Issues (${debtIssues.length})`}>
          <IssueFilters />
          <IssueTable issues={debtIssues} />
        </GlassCard>
      )}
    </div>
  );
}
