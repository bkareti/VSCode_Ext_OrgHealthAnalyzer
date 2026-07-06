import { useState, useMemo } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import { EmptyState, SeverityPill } from '@/components/common';
import DonutChart from '@/components/charts/DonutChart';
import GovernorGauge from '@/components/charts/GovernorGauge';
import type { OrgLimitInfo, GovernorRiskDetail } from '@/types';

type SubTab = 'summary' | 'api' | 'storage' | 'apex' | 'async' | 'emails' | 'platform-events' | 'data' | 'forecast';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'summary',         label: 'Summary' },
  { id: 'api',             label: 'API & Integrations' },
  { id: 'storage',         label: 'Storage' },
  { id: 'apex',            label: 'Apex Execution' },
  { id: 'async',           label: 'Async Operations' },
  { id: 'emails',          label: 'Emails' },
  { id: 'platform-events', label: 'Platform Events' },
  { id: 'data',            label: 'Data' },
  { id: 'forecast',        label: 'Forecast' },
];

// Keyword filters per sub-tab category
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  api:              ['Api', 'Bulk', 'SOSL', 'SOQL', 'Callout'],
  storage:          ['Storage', 'File'],
  apex:             ['Apex', 'Batch', 'Future', 'DML', 'CPU', 'Trigger'],
  async:            ['Async', 'Schedule', 'Queue', 'Workflow', 'TimeBasedWorkflow'],
  emails:           ['Email', 'Mail'],
  'platform-events':['PlatformEvent', 'Streaming', 'Generic'],
  data:             ['Data', 'Record', 'Object'],
};

function findLimit(limits: OrgLimitInfo[], name: string): OrgLimitInfo | undefined {
  return limits.find((l) => l.name === name);
}

function statusLabel(pct: number): string {
  return pct >= 90 ? 'Critical' : pct >= 75 ? 'High' : pct >= 50 ? 'Warning' : 'Good';
}

function statusTextClass(pct: number): string {
  return pct >= 90
    ? 'text-sev-error'
    : pct >= 75
    ? 'text-score-poor'
    : pct >= 50
    ? 'text-score-fair'
    : 'text-score-good';
}

function statusBgClass(pct: number): string {
  return pct >= 90
    ? 'bg-sev-error/15 text-sev-error'
    : pct >= 75
    ? 'bg-score-poor/15 text-score-poor'
    : pct >= 50
    ? 'bg-score-fair/15 text-score-fair'
    : 'bg-score-good/15 text-score-good';
}

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtGB(mb: number): number {
  return Math.round((mb / 1024) * 10) / 10;
}

function riskClass(risk: 'low' | 'medium' | 'high'): string {
  return risk === 'high' ? 'text-sev-error' : risk === 'medium' ? 'text-score-fair' : 'text-score-good';
}

// ── Reusable limit table ─────────────────────────────────────────────────────
function LimitTable({ limits, showAll = false }: { limits: OrgLimitInfo[]; showAll?: boolean }) {
  const [expanded, setExpanded] = useState(showAll);
  const sorted = useMemo(
    () => [...limits].sort((a, b) => b.usedPct - a.usedPct),
    [limits],
  );
  const visible = expanded ? sorted : sorted.slice(0, 11);

  if (limits.length === 0) {
    return <EmptyState title="No limit data available for this category" />;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-sf-border">
              <th className="text-left py-2 pr-3 text-sf-muted font-medium">Limit Area</th>
              <th className="text-right py-2 px-2 text-sf-muted font-medium">Used</th>
              <th className="text-right py-2 px-2 text-sf-muted font-medium">Limit</th>
              <th className="text-right py-2 px-2 text-sf-muted font-medium">% Used</th>
              <th className="text-center py-2 px-2 text-sf-muted font-medium">Status</th>
              <th className="text-right py-2 pl-2 text-sf-muted font-medium">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => (
              <tr key={l.name} className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors">
                <td className="py-1.5 pr-3 text-sf-text font-medium truncate max-w-48">{l.label}</td>
                <td className="py-1.5 px-2 text-right text-sf-text tabular-nums">{fmtNum(l.used)}</td>
                <td className="py-1.5 px-2 text-right text-sf-muted tabular-nums">{fmtNum(l.max)}</td>
                <td className={`py-1.5 px-2 text-right font-semibold tabular-nums ${statusTextClass(l.usedPct)}`}>
                  {l.usedPct.toFixed(1)}%
                </td>
                <td className="py-1.5 px-2 text-center">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBgClass(l.usedPct)}`}>
                    {statusLabel(l.usedPct)}
                  </span>
                </td>
                <td className="py-1.5 pl-2 text-right text-sf-muted tabular-nums">{fmtNum(l.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && sorted.length > 11 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-[11px] text-sf-accent hover:underline"
        >
          {expanded ? 'Show less' : `View all ${sorted.length} limits`}
        </button>
      )}
    </div>
  );
}

// ── Apex risks table ─────────────────────────────────────────────────────────
function ApexRisksTable({ risks }: { risks: GovernorRiskDetail[] }) {
  if (risks.length === 0) {
    return <EmptyState title="No Apex governor risk data available. Run analysis with Apex sources." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-sf-border">
            <th className="text-left py-2 pr-3 text-sf-muted font-medium">Class / Trigger</th>
            <th className="text-center py-2 px-2 text-sf-muted font-medium">SOQL</th>
            <th className="text-center py-2 px-2 text-sf-muted font-medium">DML</th>
            <th className="text-center py-2 px-2 text-sf-muted font-medium">CPU</th>
            <th className="text-center py-2 px-2 text-sf-muted font-medium">Heap</th>
            <th className="text-left py-2 pl-2 text-sf-muted font-medium">Patterns</th>
          </tr>
        </thead>
        <tbody>
          {risks.map((r) => {
            const extra = r.patterns.length > 2 ? ` +${r.patterns.length - 2}` : '';
            return (
              <tr key={r.className} className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors">
                <td className="py-1.5 pr-3 text-sf-text font-medium truncate max-w-40">{r.className}</td>
                <td className={`py-1.5 px-2 text-center font-semibold ${riskClass(r.prediction.soqlQueries.risk)}`}>
                  {r.prediction.soqlQueries.risk.toUpperCase()}
                </td>
                <td className={`py-1.5 px-2 text-center font-semibold ${riskClass(r.prediction.dmlStatements.risk)}`}>
                  {r.prediction.dmlStatements.risk.toUpperCase()}
                </td>
                <td className={`py-1.5 px-2 text-center font-semibold ${riskClass(r.prediction.cpuTime.risk)}`}>
                  {r.prediction.cpuTime.risk.toUpperCase()}
                </td>
                <td className={`py-1.5 px-2 text-center font-semibold ${riskClass(r.prediction.heapSize.risk)}`}>
                  {r.prediction.heapSize.risk.toUpperCase()}
                </td>
                <td className="py-1.5 pl-2 text-sf-muted truncate max-w-56">
                  {r.patterns.slice(0, 2).join(', ')}{extra}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Category sub-tab (filtered limits + optional risks) ───────────────────────
function CategoryTab({
  limits,
  category,
  risks,
}: {
  limits: OrgLimitInfo[];
  category: string;
  risks?: GovernorRiskDetail[];
}) {
  const keywords = CATEGORY_KEYWORDS[category] ?? [];
  const filtered = useMemo(
    () => limits.filter((l) => keywords.some((k) => l.name.includes(k))),
    [limits, keywords],
  );

  // For storage convert MB values shown in gauges
  const isStorage = category === 'storage';
  const gauges = filtered.slice(0, 4);

  return (
    <div className="space-y-4">
      {gauges.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {gauges.map((l) =>
            isStorage ? (
              <GovernorGauge
                key={l.name}
                label={l.label}
                used={fmtGB(l.used)}
                total={fmtGB(l.max)}
                unit=" GB"
              />
            ) : (
              <GovernorGauge key={l.name} label={l.label} used={l.used} total={l.max} />
            ),
          )}
        </div>
      )}
      <GlassCard title="Limit Details">
        <LimitTable limits={filtered} showAll />
      </GlassCard>
      {risks && risks.length > 0 && (
        <GlassCard title="Apex Governor Risk Analysis">
          <ApexRisksTable risks={risks} />
        </GlassCard>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GovernorLimits() {
  const [subTab, setSubTab] = useState<SubTab>('summary');
  const results = useDashboardStore((s) => s.results);

  const limits = useMemo(() => results?.orgLimits ?? [], [results]);
  const govRisks = useMemo(() => results?.governorRisks ?? [], [results]);

  // 8 headline gauges
  const apiCalls    = useMemo(() => findLimit(limits, 'DailyApiRequests'), [limits]);
  const dailyEmail  = useMemo(() => findLimit(limits, 'DailySingleEmail'), [limits]);
  const fileStore   = useMemo(() => findLimit(limits, 'FileStorageMB'), [limits]);
  const dataStore   = useMemo(() => findLimit(limits, 'DataStorageMB'), [limits]);
  const asyncApex   = useMemo(() => findLimit(limits, 'DailyAsyncApexExecutions'), [limits]);
  const batchApex   = useMemo(() => findLimit(limits, 'DailyBulkApiBatches'), [limits]);
  const platEvents  = useMemo(() => findLimit(limits, 'HourlyPublishedPlatformEvents'), [limits]);
  const streaming   = useMemo(() => findLimit(limits, 'StreamingApiConcurrentClients'), [limits]);

  // Summary donut — overall average usage across all limits
  const avgUsage = useMemo(() => {
    if (limits.length === 0) return 0;
    const avg = limits.reduce((sum, l) => sum + l.usedPct, 0) / limits.length;
    return Math.round(avg * 10) / 10;
  }, [limits]);

  const usageDonutData = useMemo(
    () => [
      { name: 'Used', value: avgUsage },
      { name: 'Available', value: Math.max(0, 100 - avgUsage) },
    ],
    [avgUsage],
  );

  // Limit alerts — usedPct >= 50, sorted desc
  const alertLimits = useMemo(
    () => [...limits].filter((l) => l.usedPct >= 50).sort((a, b) => b.usedPct - a.usedPct),
    [limits],
  );

  if (!results) {
    return (
      <div className="p-6">
        <EmptyState title="Run an org analysis to view Governor / Daily Limits data." />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-sf-text">Governor / Daily Limits</h1>
        <p className="text-xs text-sf-muted mt-0.5">
          Monitor usage of Salesforce governor limits and system resources
        </p>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-sf-border overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              subTab === t.id
                ? 'border-b-2 border-sf-accent text-sf-text'
                : 'text-sf-muted hover:text-sf-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      {subTab === 'summary' && (
        <div className="space-y-4">
          {/* Row 1 — 8 headline gauges */}
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
            <GovernorGauge
              label="API Calls"
              used={apiCalls?.used ?? 0}
              total={apiCalls?.max ?? 0}
            />
            <GovernorGauge
              label="Daily Email"
              used={dailyEmail?.used ?? 0}
              total={dailyEmail?.max ?? 0}
            />
            <GovernorGauge
              label="File Storage"
              used={fmtGB(fileStore?.used ?? 0)}
              total={fmtGB(fileStore?.max ?? 1)}
              unit=" GB"
            />
            <GovernorGauge
              label="Data Storage"
              used={fmtGB(dataStore?.used ?? 0)}
              total={fmtGB(dataStore?.max ?? 1)}
              unit=" GB"
            />
            <GovernorGauge
              label="Async Apex"
              used={asyncApex?.used ?? 0}
              total={asyncApex?.max ?? 0}
            />
            <GovernorGauge
              label="Batch Apex"
              used={batchApex?.used ?? 0}
              total={batchApex?.max ?? 0}
            />
            <GovernorGauge
              label="Platform Events"
              used={platEvents?.used ?? 0}
              total={platEvents?.max ?? 0}
            />
            <GovernorGauge
              label="Streaming Events"
              used={streaming?.used ?? 0}
              total={streaming?.max ?? 0}
            />
          </div>

          {/* Row 2 — overview table + trend + donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard title="Limits Usage Overview" className="lg:col-span-1">
              <LimitTable limits={limits} />
            </GlassCard>

            <GlassCard title="Limits Usage Trend (Last 7 Days)" className="lg:col-span-1">
              <EmptyState title="Per-limit trend data will be available in a future analysis" />
            </GlassCard>

            <GlassCard title="Current Usage vs Limit" className="lg:col-span-1">
              {limits.length === 0 ? (
                <EmptyState title="No limit data available" />
              ) : (
                <div className="space-y-3">
                  <DonutChart
                    data={usageDonutData}
                    height={160}
                    showLegend
                  />
                  <div className="text-center">
                    <p className="text-[11px] text-sf-muted">Average usage across all limits</p>
                    <p className={`text-sm font-bold ${statusTextClass(avgUsage)}`}>
                      {avgUsage}% Overall
                    </p>
                  </div>
                </div>
              )}
            </GlassCard>
          </div>

          {/* Row 3 — API consumers + storage by object + limit alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard title="Top API Consumers (Today)">
              <EmptyState title="API consumer data requires enhanced monitoring. Not available in current analysis." />
            </GlassCard>

            <GlassCard title="Top Storage by Object Type">
              <EmptyState title="Object storage breakdown requires enhanced monitoring. Not available in current analysis." />
            </GlassCard>

            <GlassCard title="Limit Alerts">
              {alertLimits.length === 0 ? (
                <EmptyState title="No limits are above 50% threshold" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-sf-border">
                        <th className="text-left py-2 pr-2 text-sf-muted font-medium">Limit Area</th>
                        <th className="text-center py-2 px-2 text-sf-muted font-medium">Severity</th>
                        <th className="text-right py-2 px-2 text-sf-muted font-medium">Usage</th>
                        <th className="text-right py-2 pl-2 text-sf-muted font-medium">Threshold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alertLimits.slice(0, 8).map((l) => (
                        <tr
                          key={l.name}
                          className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors"
                        >
                          <td className="py-1.5 pr-2 text-sf-text truncate max-w-36">{l.label}</td>
                          <td className="py-1.5 px-2 text-center">
                            <SeverityPill
                              severity={
                                l.usedPct >= 90 ? 'error' : l.usedPct >= 75 ? 'warning' : 'info'
                              }
                            />
                          </td>
                          <td className={`py-1.5 px-2 text-right font-semibold tabular-nums ${statusTextClass(l.usedPct)}`}>
                            {l.usedPct.toFixed(1)}%
                          </td>
                          <td className="py-1.5 pl-2 text-right text-sf-muted">
                            {l.usedPct >= 90 ? '90%' : l.usedPct >= 75 ? '75%' : '50%'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {alertLimits.length > 8 && (
                    <p className="mt-2 text-[11px] text-sf-muted">
                      +{alertLimits.length - 8} more alerts
                    </p>
                  )}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      {/* ── API & Integrations ───────────────────────────────────────────────── */}
      {subTab === 'api' && (
        <CategoryTab limits={limits} category="api" risks={govRisks} />
      )}

      {/* ── Storage ─────────────────────────────────────────────────────────── */}
      {subTab === 'storage' && (
        <CategoryTab limits={limits} category="storage" />
      )}

      {/* ── Apex Execution ──────────────────────────────────────────────────── */}
      {subTab === 'apex' && (
        <div className="space-y-4">
          <CategoryTab limits={limits} category="apex" />
          <GlassCard title="Apex Governor Risk Analysis">
            <ApexRisksTable risks={govRisks} />
          </GlassCard>
        </div>
      )}

      {/* ── Async Operations ────────────────────────────────────────────────── */}
      {subTab === 'async' && (
        <CategoryTab limits={limits} category="async" />
      )}

      {/* ── Emails ──────────────────────────────────────────────────────────── */}
      {subTab === 'emails' && (
        <CategoryTab limits={limits} category="emails" />
      )}

      {/* ── Platform Events ─────────────────────────────────────────────────── */}
      {subTab === 'platform-events' && (
        <CategoryTab limits={limits} category="platform-events" />
      )}

      {/* ── Data ────────────────────────────────────────────────────────────── */}
      {subTab === 'data' && (
        <CategoryTab limits={limits} category="data" />
      )}

      {/* ── Forecast ────────────────────────────────────────────────────────── */}
      {subTab === 'forecast' && (
        <GlassCard title="Limits Forecast">
          <EmptyState title="Predictive limit forecasting is not yet available. This feature will use historical trends to project future limit consumption." />
        </GlassCard>
      )}

      <p className="text-[10px] text-sf-muted text-center pb-2">
        All limit usage is based on the current 24-hour period (12:00 AM – 11:59 PM).
      </p>
    </div>
  );
}
