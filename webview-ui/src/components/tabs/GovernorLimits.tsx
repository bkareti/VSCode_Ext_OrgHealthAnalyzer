import { useState, useMemo } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import { EmptyState } from '@/components/common';
import HBarChart from '@/components/charts/HBarChart';
import GovernorGauge from '@/components/charts/GovernorGauge';
import { usageBand } from '@/constants/scoring';
import type { OrgLimitInfo } from '@/types';

type SubTab = 'summary' | 'api' | 'storage' | 'apex' | 'messaging' | 'data';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'summary',   label: 'Summary' },
  { id: 'api',       label: 'API & Integrations' },
  { id: 'storage',   label: 'Storage' },
  { id: 'apex',      label: 'Apex & Async' },
  { id: 'messaging', label: 'Email & Events' },
  { id: 'data',      label: 'Data' },
];

// Keyword filters per sub-tab category
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  api:       ['Api', 'Bulk', 'SOSL', 'SOQL', 'Callout'],
  storage:   ['Storage', 'File'],
  apex:      ['Apex', 'Batch', 'Future', 'DML', 'CPU', 'Trigger', 'Async', 'Schedule', 'Queue', 'Workflow', 'TimeBasedWorkflow'],
  messaging: ['Email', 'Mail', 'PlatformEvent', 'Streaming', 'Generic'],
  data:      ['Data', 'Record', 'Object'],
};

function findLimit(limits: OrgLimitInfo[], name: string): OrgLimitInfo | undefined {
  return limits.find((l) => l.name === name);
}

// Unified capacity bands (see constants/scoring.ts)
const statusLabel     = (pct: number): string => usageBand(pct).label;
const statusTextClass = (pct: number): string => usageBand(pct).text;
const statusBgClass   = (pct: number): string => usageBand(pct).badge;

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtGB(mb: number): number {
  return Math.round((mb / 1024) * 10) / 10;
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

// ── Category sub-tab (filtered limits) ────────────────────────────────────────
function CategoryTab({
  limits,
  category,
}: {
  limits: OrgLimitInfo[];
  category: string;
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
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GovernorLimits() {
  const [subTab, setSubTab] = useState<SubTab>('summary');
  const results = useDashboardStore((s) => s.results);

  const limits = useMemo(() => results?.orgLimits ?? [], [results]);

  // 8 headline gauges
  const apiCalls    = useMemo(() => findLimit(limits, 'DailyApiRequests'), [limits]);
  const dailyEmail  = useMemo(() => findLimit(limits, 'DailySingleEmail'), [limits]);
  const fileStore   = useMemo(() => findLimit(limits, 'FileStorageMB'), [limits]);
  const dataStore   = useMemo(() => findLimit(limits, 'DataStorageMB'), [limits]);
  const asyncApex   = useMemo(() => findLimit(limits, 'DailyAsyncApexExecutions'), [limits]);
  const batchApex   = useMemo(() => findLimit(limits, 'DailyBulkApiBatches'), [limits]);
  const platEvents  = useMemo(() => findLimit(limits, 'HourlyPublishedPlatformEvents'), [limits]);
  const streaming   = useMemo(() => findLimit(limits, 'StreamingApiConcurrentClients'), [limits]);

  // Limits at risk — usedPct >= 50, sorted desc, colored by capacity band.
  // (An "average across all limits" donut was removed: averaging unrelated
  // percentages is not a meaningful metric.)
  const limitsAtRisk = useMemo(
    () => [...limits]
      .filter((l) => l.usedPct >= 50)
      .sort((a, b) => b.usedPct - a.usedPct)
      .map((l) => ({
        name: l.label ?? l.name,
        value: Math.round(l.usedPct * 10) / 10,
        color: usageBand(l.usedPct).hex,
      })),
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
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-sf-text">Platform Limits</h1>
        <p className="text-xs text-sf-muted mt-0.5">
          Consumption of Salesforce governor limits and system resources. Runtime performance analysis lives in the Performance tab.
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

          {/* Row 2 — all limits table + limits at risk */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GlassCard title="Limits Usage Overview">
              <LimitTable limits={limits} />
            </GlassCard>

            <GlassCard title={`Limits at Risk (≥50% consumed: ${limitsAtRisk.length})`}>
              {limitsAtRisk.length === 0 ? (
                <EmptyState title="No limits are above the 50% watch threshold" />
              ) : (
                <HBarChart data={limitsAtRisk.slice(0, 12)} multiColor color="#eab308" />
              )}
            </GlassCard>
          </div>
        </div>
      )}

      {/* ── Category sub-tabs ────────────────────────────────────────────────── */}
      {subTab === 'api'       && <CategoryTab limits={limits} category="api" />}
      {subTab === 'storage'   && <CategoryTab limits={limits} category="storage" />}
      {subTab === 'apex'      && <CategoryTab limits={limits} category="apex" />}
      {subTab === 'messaging' && <CategoryTab limits={limits} category="messaging" />}
      {subTab === 'data'      && <CategoryTab limits={limits} category="data" />}

      <p className="text-[10px] text-sf-muted text-center pb-2">
        All limit usage is based on the current 24-hour period (12:00 AM – 11:59 PM).
      </p>
    </div>
  );
}
