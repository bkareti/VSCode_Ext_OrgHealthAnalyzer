import { useState, useMemo } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import Pagination from '@/components/common/Pagination';
import { EmptyState } from '@/components/common';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import ColumnChart from '@/components/charts/ColumnChart';
import HBarChart from '@/components/charts/HBarChart';
import DonutChart from '@/components/charts/DonutChart';

const PAGE_SIZE = 10;

export default function Automation() {
  const results = useDashboardStore((s) => s.results);
  const auto    = results?.automationSummary;
  const issues  = (results?.issues ?? []).filter((i) => i.category === 'automation-design');

  const [flowSearch, setFlowSearch] = useState('');
  const [flowType, setFlowType]     = useState<string>('all');
  const [flowPage, setFlowPage]     = useState(1);

  // ── Derived data ────────────────────────────────────────────────────────────
  const deprecatedCount =
    (auto?.totalProcessBuilders ?? 0) + (auto?.totalWorkflowRules ?? 0);

  const typeData = useMemo(() => [
    { name: 'Flows',            value: auto?.totalFlows           ?? 0, color: '#3b82f6' },
    { name: 'Triggers',         value: auto?.totalTriggers        ?? 0, color: '#8b5cf6' },
    { name: 'Validation Rules', value: auto?.totalValidationRules ?? 0, color: '#22c55e' },
    { name: 'Screen Flows',     value: auto?.totalScreenFlows     ?? 0, color: '#f59e0b' },
    { name: 'Scheduled',        value: auto?.totalScheduledFlows  ?? 0, color: '#ec4899' },
    { name: 'Process Builders', value: auto?.totalProcessBuilders ?? 0, color: '#f97316' },
    { name: 'Workflows',        value: auto?.totalWorkflowRules   ?? 0, color: '#ef4444' },
  ].filter((d) => d.value > 0), [auto]);

  // Multi-trigger objects — the classic anti-pattern (>1 trigger per object)
  const multiTriggerObjects = useMemo(() =>
    Object.entries(auto?.objectMap ?? {})
      .filter(([, v]) => v.triggers > 1)
      .map(([name, v]) => ({ name, value: v.triggers }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    [auto],
  );

  const automationByObj = useMemo(() =>
    Object.entries(auto?.objectMap ?? {})
      .map(([name, v]) => ({ name, value: v.total }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    [auto],
  );

  const flowInventory = useMemo(() => auto?.flowInventory ?? [], [auto]);

  const activeDonut = useMemo(() => {
    const active   = flowInventory.filter((f) => f.isActive).length;
    const inactive = flowInventory.length - active;
    return [
      { name: 'Active',   value: active },
      { name: 'Inactive', value: inactive },
    ].filter((d) => d.value > 0);
  }, [flowInventory]);

  const flowTypes = useMemo(
    () => [...new Set(flowInventory.map((f) => f.processType))].sort(),
    [flowInventory],
  );

  const filteredFlows = useMemo(() => {
    const q = flowSearch.toLowerCase();
    return flowInventory.filter((f) =>
      (flowType === 'all' || f.processType === flowType) &&
      (!q || f.name.toLowerCase().includes(q) || (f.objectApiName ?? '').toLowerCase().includes(q)),
    );
  }, [flowInventory, flowSearch, flowType]);

  const pagedFlows = useMemo(() => {
    const s = (flowPage - 1) * PAGE_SIZE;
    return filteredFlows.slice(s, s + PAGE_SIZE);
  }, [filteredFlows, flowPage]);

  const workflows = auto?.workflowInventory ?? [];

  if (!auto) {
    return (
      <EmptyState
        icon="⚡"
        title="No automation data yet"
        description="Run a full analysis to see flows, triggers, workflow rules, and process builders."
        className="m-6"
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Automation</h1>
        <p className="text-xs text-sf-muted">Automation complexity, density per object, and deprecated technology to migrate.</p>
      </div>

      {/* KPI row — deprecated automation is the tech-debt headline */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon="🔄" value={auto.totalFlows            ?? 0} label="Record-Triggered Flows" accent="text-chart-1" />
        <StatCard icon="🖥️" value={auto.totalScreenFlows      ?? 0} label="Screen Flows" />
        <StatCard icon="⚡" value={auto.totalTriggers         ?? 0} label="Apex Triggers"     accent="text-chart-2" />
        <StatCard icon="✅" value={auto.totalValidationRules  ?? 0} label="Validation Rules"  accent="text-chart-3" />
        <StatCard
          icon="🏗️"
          value={auto.totalProcessBuilders ?? 0}
          label="Process Builders"
          sub="deprecated — migrate to Flow"
          accent={(auto.totalProcessBuilders ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'}
        />
        <StatCard
          icon="📜"
          value={auto.totalWorkflowRules ?? 0}
          label="Workflow Rules"
          sub="deprecated — migrate to Flow"
          accent={(auto.totalWorkflowRules ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'}
        />
      </div>

      {deprecatedCount > 0 && (
        <div className="rounded-lg border border-sev-warning/30 bg-sev-warning/5 px-4 py-2.5 text-xs text-sf-text">
          ⚠ <strong>{deprecatedCount}</strong> deprecated automation{deprecatedCount === 1 ? '' : 's'} (Process Builder / Workflow Rules).
          Salesforce has ended feature development for both — plan the Flow migration in your debt payoff plan.
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard title="Automation by Type">
          {typeData.length > 0
            ? <ColumnChart data={typeData} height={180} multiColor />
            : <p className="text-xs text-sf-muted">No automation detected.</p>}
        </GlassCard>

        <GlassCard title="Objects with Multiple Triggers">
          {multiTriggerObjects.length > 0 ? (
            <>
              <p className="text-[10px] text-sf-muted mb-1">
                One trigger per object is the recommended pattern — these objects have more.
              </p>
              <HBarChart data={multiTriggerObjects} color="#f97316" />
            </>
          ) : (
            <div className="flex items-center justify-center h-36 text-xs text-score-good">
              ✓ No object has more than one trigger
            </div>
          )}
        </GlassCard>

        <GlassCard title="Top Objects by Automation Count">
          {automationByObj.length > 0
            ? <HBarChart data={automationByObj} color="#3b82f6" />
            : <p className="text-xs text-sf-muted">No object-level automation data.</p>}
        </GlassCard>
      </div>

      {/* Flow inventory with search, type filter, pagination */}
      {flowInventory.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-4 items-start">
          <GlassCard>
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <span className="text-xs font-semibold text-sf-text">Flow Inventory ({filteredFlows.length})</span>
              <div className="flex gap-2">
                <select
                  value={flowType}
                  onChange={(e) => { setFlowType(e.target.value); setFlowPage(1); }}
                  className="text-xs px-2 py-1 rounded border border-sf-border bg-sf-bg-3 text-sf-text outline-none"
                >
                  <option value="all">All types</option>
                  {flowTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Search flows…"
                  value={flowSearch}
                  onChange={(e) => { setFlowSearch(e.target.value); setFlowPage(1); }}
                  className="text-xs px-2 py-1 rounded border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted outline-none w-40"
                />
              </div>
            </div>
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
                  {pagedFlows.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-sf-muted">No results</td></tr>
                  ) : pagedFlows.map((f, i) => (
                    <tr key={`${f.name}-${i}`} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
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
            <Pagination page={flowPage} pageSize={PAGE_SIZE} total={filteredFlows.length} onChange={setFlowPage} />
          </GlassCard>

          <GlassCard title="Flows: Active vs Inactive">
            {activeDonut.length > 0
              ? <DonutChart data={activeDonut} height={160} showLegend />
              : <p className="text-xs text-sf-muted">No flow data</p>}
          </GlassCard>
        </div>
      )}

      {/* Deprecated workflow rules inventory */}
      {workflows.length > 0 && (
        <GlassCard title={`Workflow Rules — Deprecated (${workflows.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border bg-sf-bg-3">
                  {['Name', 'Object', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workflows.map((w, i) => (
                  <tr key={`${w.name}-${i}`} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                    <td className="px-3 py-1.5 text-sf-text font-mono text-[11px]">{w.name}</td>
                    <td className="px-3 py-1.5 text-sf-muted font-mono text-[11px]">{w.objectApiName || '—'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`text-[10px] font-medium ${w.isActive ? 'text-sev-warning' : 'text-sf-muted'}`}>
                        {w.isActive === false ? '○ Inactive' : '● Active'}
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
