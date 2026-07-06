import { useState, useMemo } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import { EmptyState } from '@/components/common';
import DonutChart from '@/components/charts/DonutChart';
import IssueTable from '@/components/issues/IssueTable';
import type { LimitsSimulatorClassData } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444',
};

const RISK_TEXT: Record<string, string> = {
  low: 'text-score-good', medium: 'text-score-fair', high: 'text-score-poor', critical: 'text-sev-error',
};

/** Synchronous Apex transaction limits */
const SYNC_LIMITS = { soql: 100, dml: 150, cpuMs: 10_000, heapBytes: 6_000_000 };

const SIM_STEPS = [1, 10, 50, 100, 200, 500, 1_000, 5_000, 10_000, 50_000];

function fmtMs(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

function fmtBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}KB`;
  return `${n}B`;
}

// ── Limits Simulator ──────────────────────────────────────────────────────────
// Projects per-class governor consumption at a chosen record volume using the
// static-analysis base/loop factors computed by the analyzer.

interface Projection {
  className: string;
  soql: number;
  dml: number;
  cpuMs: number;
  heapBytes: number;
  breaches: number;
}

function project(cls: LimitsSimulatorClassData, records: number): Projection {
  const soql      = cls.baseSoql + cls.loopSoql * records;
  const dml       = cls.baseDml + cls.loopDml * records;
  const cpuMs     = cls.baseCpuMs + (cls.cpuPerKRecords * records) / 1000;
  const heapBytes = cls.baseHeapBytes + (cls.heapPerKRecords * records) / 1000;
  const breaches =
    (soql > SYNC_LIMITS.soql ? 1 : 0) +
    (dml > SYNC_LIMITS.dml ? 1 : 0) +
    (cpuMs > SYNC_LIMITS.cpuMs ? 1 : 0) +
    (heapBytes > SYNC_LIMITS.heapBytes ? 1 : 0);
  return { className: cls.className, soql, dml, cpuMs, heapBytes, breaches };
}

function SimBar({ value, limit, format }: { value: number; limit: number; format: (n: number) => string }) {
  const pct = Math.min(100, (value / limit) * 100);
  const over = value > limit;
  return (
    <div className="min-w-24">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className={over ? 'text-sev-error font-semibold' : 'text-sf-muted'}>{format(value)}</span>
        <span className="text-sf-muted/60">/ {format(limit)}</span>
      </div>
      <div className="h-1 rounded-full bg-sf-bg-3 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: over ? '#ef4444' : pct >= 75 ? '#f97316' : '#3b82f6' }}
        />
      </div>
    </div>
  );
}

function LimitsSimulator({ data }: { data: LimitsSimulatorClassData[] }) {
  const [stepIdx, setStepIdx] = useState(4); // 200 records
  const records = SIM_STEPS[stepIdx];

  const projections = useMemo(() =>
    data
      .map((cls) => project(cls, records))
      .sort((a, b) => b.breaches - a.breaches || b.soql - a.soql)
      .slice(0, 10),
    [data, records],
  );

  const breachingClasses = useMemo(
    () => data.filter((cls) => project(cls, records).breaches > 0).length,
    [data, records],
  );

  return (
    <GlassCard title="Governor Limits Simulator">
      <p className="text-[11px] text-sf-muted mb-3">
        Projects SOQL / DML / CPU / heap consumption per class as record volume grows, from static-analysis
        loop patterns. Answers "what breaks at 10k records?" before it breaks in production.
      </p>

      {/* Volume slider */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-sf-muted shrink-0">Records processed:</span>
        <input
          type="range"
          min={0}
          max={SIM_STEPS.length - 1}
          step={1}
          value={stepIdx}
          onChange={(e) => setStepIdx(Number(e.target.value))}
          className="flex-1 accent-[#0176d3]"
        />
        <span className="text-sm font-bold tabular-nums text-sf-accent w-16 text-right shrink-0">
          {records.toLocaleString()}
        </span>
      </div>

      <p className={`text-xs mb-3 font-medium ${breachingClasses > 0 ? 'text-sev-error' : 'text-score-good'}`}>
        {breachingClasses > 0
          ? `⚠ ${breachingClasses} class${breachingClasses === 1 ? '' : 'es'} projected to breach a sync limit at ${records.toLocaleString()} records`
          : `✓ No class projected to breach sync limits at ${records.toLocaleString()} records`}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sf-border">
              <th className="text-left py-2 pr-3 text-sf-muted font-medium">Class</th>
              <th className="text-left py-2 px-2 text-sf-muted font-medium">SOQL</th>
              <th className="text-left py-2 px-2 text-sf-muted font-medium">DML</th>
              <th className="text-left py-2 px-2 text-sf-muted font-medium">CPU</th>
              <th className="text-left py-2 pl-2 text-sf-muted font-medium">Heap</th>
            </tr>
          </thead>
          <tbody>
            {projections.map((p) => (
              <tr key={p.className} className={`border-b border-sf-border/40 ${p.breaches > 0 ? 'bg-sev-error/5' : ''}`}>
                <td className="py-2 pr-3 text-sf-text font-mono text-[11px] truncate max-w-40">{p.className}</td>
                <td className="py-2 px-2"><SimBar value={p.soql}      limit={SYNC_LIMITS.soql}      format={(n) => String(Math.round(n))} /></td>
                <td className="py-2 px-2"><SimBar value={p.dml}       limit={SYNC_LIMITS.dml}       format={(n) => String(Math.round(n))} /></td>
                <td className="py-2 px-2"><SimBar value={p.cpuMs}     limit={SYNC_LIMITS.cpuMs}     format={fmtMs} /></td>
                <td className="py-2 pl-2"><SimBar value={p.heapBytes} limit={SYNC_LIMITS.heapBytes} format={fmtBytes} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PerfLimits() {
  const results = useDashboardStore((s) => s.results);

  const govRisks   = results?.governorRisks ?? [];
  const scale      = results?.scaleCenterMetrics;
  const explains   = useMemo(() => results?.queryExplainResults ?? [], [results]);
  const simData    = results?.limitsSimulatorData ?? [];
  const issues     = (results?.issues ?? []).filter((i) => i.category === 'performance');

  const transactions = useMemo(
    () => [...(scale?.transactions ?? [])].sort((a, b) => b.avgCpuMs - a.avgCpuMs),
    [scale],
  );
  const slowQueries = scale?.slowQueries ?? [];

  const highRiskClasses = useMemo(
    () => govRisks.filter((r) => {
      const p = r.prediction;
      return [p.soqlQueries.risk, p.dmlStatements.risk, p.cpuTime.risk, p.heapSize.risk].includes('high');
    }).length,
    [govRisks],
  );

  const fullTableScans = useMemo(() => explains.filter((e) => e.isFullTableScan).length, [explains]);

  const selectivityDonut = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of explains) {
      counts[e.sforcePerformanceLevel] = (counts[e.sforcePerformanceLevel] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [explains]);

  const badExplains = useMemo(
    () => explains.filter((e) => e.isFullTableScan || e.sforcePerformanceLevel === 'Unacceptable'),
    [explains],
  );

  if (!results) {
    return (
      <EmptyState
        icon="🚀"
        title="No performance data yet"
        description="Run a full analysis to see transaction performance, slow queries, and governor risk."
        className="m-6"
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Performance</h1>
        <p className="text-xs text-sf-muted">
          Runtime workload performance, query selectivity, and governor-limit risk. Org-limit consumption lives in Platform Limits.
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon="⚠️"
          value={highRiskClasses}
          label="High-Risk Classes"
          sub="governor risk prediction"
          accent={highRiskClasses > 0 ? 'text-sev-error' : 'text-score-good'}
        />
        <StatCard
          icon="🔍"
          value={fullTableScans}
          label="Full Table Scans"
          sub="live query explain"
          accent={fullTableScans > 0 ? 'text-sev-warning' : 'text-score-good'}
        />
        <StatCard
          icon="🐢"
          value={slowQueries.length}
          label="Slow Queries"
          sub="from event logs"
          accent={slowQueries.length > 0 ? 'text-sev-warning' : 'text-score-good'}
        />
        <StatCard
          icon="🔁"
          value={scale?.asyncFailureRate != null ? `${scale.asyncFailureRate.toFixed(1)}%` : '—'}
          label="Async Failure Rate"
          accent={(scale?.asyncFailureRate ?? 0) > 5 ? 'text-sev-error' : undefined}
        />
        <StatCard
          icon="📦"
          value={scale?.bulkJobFailures ?? '—'}
          label="Bulk Job Failures"
          sub="last 7 days"
          accent={(scale?.bulkJobFailures ?? 0) > 0 ? 'text-sev-warning' : undefined}
        />
      </div>

      {/* Limits Simulator — signature feature */}
      {simData.length > 0 && <LimitsSimulator data={simData} />}

      {/* Transaction performance (Scale Center) */}
      {transactions.length > 0 && (
        <GlassCard title={`Transaction Performance (${transactions.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border bg-sf-bg-3">
                  {['Transaction', 'Avg SOQL', 'Max SOQL', 'Avg DML', 'Avg CPU', 'Avg Heap', 'Calls', 'Risk'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.transactionName} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                    <td className="px-3 py-1.5 text-sf-text font-mono text-[11px] truncate max-w-56">{t.transactionName}</td>
                    <td className="px-3 py-1.5 text-sf-muted tabular-nums">{t.avgSoqlCount.toFixed(0)}</td>
                    <td className="px-3 py-1.5 text-sf-muted tabular-nums">{t.maxSoqlCount.toFixed(0)}</td>
                    <td className="px-3 py-1.5 text-sf-muted tabular-nums">{t.avgDmlCount.toFixed(0)}</td>
                    <td className="px-3 py-1.5 text-sf-muted tabular-nums">{fmtMs(t.avgCpuMs)}</td>
                    <td className="px-3 py-1.5 text-sf-muted tabular-nums">{fmtBytes(t.avgHeapBytes)}</td>
                    <td className="px-3 py-1.5 text-sf-muted tabular-nums">{t.callCount.toLocaleString()}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize"
                        style={{ color: RISK_COLOR[t.risk], background: `${RISK_COLOR[t.risk]}20` }}
                      >
                        {t.risk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Slow queries + query selectivity */}
      {(slowQueries.length > 0 || explains.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          {slowQueries.length > 0 ? (
            <GlassCard title={`Slow Queries (${slowQueries.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-sf-border bg-sf-bg-3">
                      {['SOQL', 'Avg Time', 'Avg Rows', 'Count', 'Class'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-sf-muted font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slowQueries.map((q, i) => (
                      <tr key={i} className="border-b border-sf-border/40 hover:bg-sf-bg-3/40 transition-colors">
                        <td className="px-3 py-1.5 text-sf-text font-mono text-[10px] truncate max-w-72" title={q.query}>{q.query}</td>
                        <td className="px-3 py-1.5 tabular-nums font-semibold text-sev-warning">{fmtMs(q.avgMs)}</td>
                        <td className="px-3 py-1.5 text-sf-muted tabular-nums">{q.avgRows.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-sf-muted tabular-nums">{q.count.toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-sf-muted font-mono text-[10px]">{q.className ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ) : (
            <GlassCard title="Query Selectivity Issues">
              {badExplains.length > 0 ? (
                <ul className="space-y-2">
                  {badExplains.map((e, i) => (
                    <li key={i} className="text-xs border-b border-sf-border/40 pb-2 last:border-0">
                      <p className="font-mono text-[10px] text-sf-text truncate" title={e.soql}>{e.soql}</p>
                      <p className="text-[10px] text-sev-error mt-0.5">
                        {e.isFullTableScan ? 'Full table scan · ' : ''}{e.sforcePerformanceLevel}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No unselective queries found" />
              )}
            </GlassCard>
          )}

          {explains.length > 0 && (
            <GlassCard title="Query Selectivity (Live Explain)">
              <DonutChart data={selectivityDonut} height={180} showLegend />
              {fullTableScans > 0 && (
                <p className="text-[11px] text-sev-error mt-2 text-center">
                  {fullTableScans} full-table-scan quer{fullTableScans === 1 ? 'y' : 'ies'} detected
                </p>
              )}
            </GlassCard>
          )}
        </div>
      )}

      {/* Governor risk matrix — THE single copy (removed from Platform Limits) */}
      {govRisks.length > 0 && (
        <GlassCard title={`Apex Governor Risk (${govRisks.length} classes)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border bg-sf-bg-3">
                  {['Class', 'SOQL', 'DML', 'CPU', 'Heap', 'Patterns'].map((h) => (
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
                          <span className={`text-[10px] font-semibold capitalize ${RISK_TEXT[risk]}`}>{risk}</span>
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

      {/* Scale Center unavailable notice — honest, single line, no empty promise cards */}
      {scale && !scale.isAvailable && (
        <p className="text-[11px] text-sf-muted">
          Transaction metrics unavailable: {scale.unavailableReason ?? 'Scale Center requires Enterprise/Unlimited edition.'}
        </p>
      )}

      {issues.length > 0 && (
        <GlassCard title={`Performance Issues (${issues.length})`}>
          <IssueTable issues={issues} hideFilters />
        </GlassCard>
      )}
    </div>
  );
}
