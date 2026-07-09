import { useState, useMemo, type ReactNode } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import GlassCard from '@/components/common/GlassCard';
import { EmptyState } from '@/components/common';
import GovernorGauge from '@/components/charts/GovernorGauge';
import IssueFilters from '@/components/issues/IssueFilters';
import { usageBand } from '@/constants/scoring';
import { GovernorLimitsSummary } from './governorLimitsSummary';
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

// Anchored dropdown for the header's Scan History / Filters actions — mirrors
// the same local helper in SecurityAccess.tsx (no shared popover component exists yet).
function HeaderPopoverButton({ label, icon, children }: { label: string; icon: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 text-xs font-medium rounded border border-sf-border bg-sf-bg-2 text-sf-text hover:bg-sf-bg-3 transition-colors flex items-center gap-1.5"
      >
        <span>{icon}</span>
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 z-20 rounded-lg border border-sf-border bg-sf-bg-2 shadow-glass p-3">
            {children}
          </div>
        </>
      )}
    </div>
  );
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
  const results    = useOrgStore((s) => s.results);
  const orgHistory = useOrgStore((s) => s.orgHistory);

  const limits = useMemo(() => results?.orgLimits ?? [], [results]);

  if (!results) {
    return (
      <div className="p-6">
        <EmptyState title="Run an org analysis to view Governor / Daily Limits data." />
      </div>
    );
  }

  const orgId = results.orgDetails?.orgId ?? results.metadata?.orgId ?? null;
  const history = orgId ? (orgHistory[orgId] ?? []) : [];
  const historyNewestFirst = [...history].reverse();

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-sf-text">Platform Usage & Limits</h1>
          <p className="text-xs text-sf-muted mt-0.5">
            Consumption of Salesforce governor limits and system resources. Runtime performance analysis lives in the Performance tab.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HeaderPopoverButton label="Scan History" icon="🕐">
            {historyNewestFirst.length > 0 ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {historyNewestFirst.map((h, i) => {
                  const prev = historyNewestFirst[i + 1];
                  const delta = prev ? Math.round((h.scores.overall ?? 0) - (prev.scores.overall ?? 0)) : undefined;
                  return (
                    <div key={h.timestamp} className="flex items-center justify-between text-[11px] py-1 border-b border-sf-border/40 last:border-0">
                      <span className="text-sf-muted">{new Date(h.timestamp).toLocaleString()}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-sf-text tabular-nums">{Math.round(h.scores.overall ?? 0)}</span>
                        {delta !== undefined && (
                          <span className={delta >= 0 ? 'text-score-good' : 'text-sev-error'}>
                            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-sf-muted">No scan history yet — run at least 2 scans to see trends.</p>
            )}
          </HeaderPopoverButton>

          <HeaderPopoverButton label="Filters" icon="🔍">
            <IssueFilters />
          </HeaderPopoverButton>
        </div>
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
        <GovernorLimitsSummary results={results} limits={limits} onJumpToCategory={setSubTab} />
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
