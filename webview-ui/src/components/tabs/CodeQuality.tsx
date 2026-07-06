import { useState, useMemo, useCallback } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import { EmptyState, SeverityPill } from '@/components/common';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import HBarChart from '@/components/charts/HBarChart';
import DonutChart from '@/components/charts/DonutChart';
import ScoreRing from '@/components/charts/ScoreRing';
import { scoreLabel, scoreText } from '@/constants/scoring';

type SubTab = 'summary' | 'apex' | 'triggers' | 'lwc' | 'coverage';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'summary',  label: 'Summary' },
  { id: 'apex',     label: 'Apex' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'lwc',      label: 'LWC' },
  { id: 'coverage', label: 'Coverage' },
];

const COV_PAGE_SIZE = 25;

function inferType(name: string): string {
  if (name.endsWith('.cls'))     return 'Apex Class';
  if (name.endsWith('.trigger')) return 'Trigger';
  if (name.includes('/lwc/') || name.includes('\\lwc\\')) return 'LWC';
  return 'Other';
}

function fmtChars(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function CodeQuality() {
  const [activeTab, setActiveTab]   = useState<SubTab>('summary');
  const [covPage,   setCovPage]     = useState(0);
  const results   = useDashboardStore((s) => s.results);
  const { postMessage } = useVSCode();
  const allIssues = results?.issues ?? [];
  const codeQualityIssues = useMemo(() => allIssues.filter(i =>
    i.category === 'code-quality' || i.category === 'lwc-quality' ||
    i.category === 'technical-debt' || i.category === 'testing' || i.category === 'aura-quality'
  ), [allIssues]);
  const coverage  = results?.testCoverageSummary;
  const lwc       = results?.lwcSummary;
  const inv       = results?.codeInventory;
  const debt      = results?.debtSummary;
  const scores    = results?.scores;

  // ── All hooks before early return ──────────────────────────────────────────
  const catCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of codeQualityIssues) { map[i.category] = (map[i.category] ?? 0) + 1; }
    return map;
  }, [codeQualityIssues]);

  const top10Components = useMemo(() => {
    const map: Record<string, { name: string; type: string; error: number; warning: number; info: number }> = {};
    for (const i of codeQualityIssues) {
      const key = i.file ?? i.object ?? 'Unknown';
      if (!map[key]) map[key] = { name: key, type: inferType(key), error: 0, warning: 0, info: 0 };
      map[key][i.severity as 'error' | 'warning' | 'info']++;
    }
    return Object.values(map)
      .sort((a, b) => (b.error + b.warning + b.info) - (a.error + a.warning + a.info))
      .slice(0, 10);
  }, [codeQualityIssues]);

  const apexIssues    = useMemo(() => allIssues.filter(i => i.category === 'code-quality' && !i.file?.endsWith('.trigger')), [allIssues]);
  const trigIssues    = useMemo(() => allIssues.filter(i => i.file?.endsWith('.trigger')), [allIssues]);
  const lwcIssues     = useMemo(() => allIssues.filter(i => i.category === 'lwc-quality'), [allIssues]);
  const testingIssues = useMemo(() => allIssues.filter(i => i.category === 'testing'), [allIssues]);

  const handleExportCsv = useCallback(() => {
    const escape = (v: string | number | undefined) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ['Severity', 'Category', 'Rule', 'Component/File', 'Line', 'Message'].join(','),
      ...codeQualityIssues.map(i =>
        [escape(i.severity), escape(i.category), escape(i.ruleId), escape(i.file ?? i.object), escape(i.line), escape(i.message)].join(',')
      ),
    ];
    postMessage({ command: 'exportCodeQualityCsv', data: { csv: rows.join('\n'), fileName: 'code-quality-issues.csv' } });
  }, [codeQualityIssues, postMessage]);

  if (!results) {
    return (
      <EmptyState
        icon="💻"
        title="No code quality data yet"
        description="Run a full analysis to review Apex quality, test coverage, and LWC metrics."
        className="m-6"
      />
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const covPct       = coverage?.averageCoverage ?? 0;
  const covColor     = covPct >= 75 ? 'text-score-good' : covPct >= 50 ? 'text-score-fair' : 'text-score-critical';
  const errCnt       = codeQualityIssues.filter(i => i.severity === 'error').length;
  const warnCnt      = codeQualityIssues.filter(i => i.severity === 'warning').length;
  const infoCnt      = codeQualityIssues.filter(i => i.severity === 'info').length;
  const lwcCount     = lwc?.totalComponents ?? lwc?.orgComponentCount ?? 0;
  const totalComponents =
    (inv?.apexClasses       ?? 0) +
    (inv?.apexTriggers      ?? 0) +
    lwcCount +
    (lwc?.orgAuraComponentCount ?? 0);

  const totalClasses = coverage?.totalClasses  ?? 0;
  const below75      = coverage?.classesBelow75 ?? 0;
  const zeroCov      = coverage?.zeroCoverageCount ?? 0;
  const passing      = Math.max(0, totalClasses - below75);

  const qualityScore = Math.round(scores?.codeQuality ?? 0);

  const qw  = debt?.quickWins?.length  ?? 0;
  const med = debt?.mediumItems?.length ?? 0;
  const lrg = debt?.largeItems?.length  ?? 0;

  // Apex code size vs per-namespace character limit (~6M) — % is more useful than raw chars
  const codeSizePct = inv && inv.apexCodeCharLimit > 0
    ? Math.round((inv.apexCodeChars / inv.apexCodeCharLimit) * 1000) / 10
    : null;

  // ── Quality Gate (SonarQube-style binary verdicts) ─────────────────────────
  const deprecatedAutomation =
    (results.automationSummary?.totalProcessBuilders ?? 0) +
    (results.automationSummary?.totalWorkflowRules   ?? 0);

  const gateConditions = [
    { label: 'Test coverage ≥ 75%',        pass: covPct >= 75,             detail: `${covPct.toFixed(1)}%` },
    { label: 'No critical issues',         pass: errCnt === 0,             detail: String(errCnt) },
    { label: 'Debt under 200 hrs',         pass: (debt?.totalHours ?? 0) < 200, detail: debt ? `${debt.totalHours} hrs` : 'n/a' },
    { label: 'No deprecated automation',   pass: deprecatedAutomation === 0, detail: String(deprecatedAutomation) },
  ];
  const gatePassed = gateConditions.every(c => c.pass);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const severityData = [
    { name: 'Error',   value: errCnt  },
    { name: 'Warning', value: warnCnt },
    { name: 'Info',    value: infoCnt },
  ].filter(d => d.value > 0);

  const catChartData = Object.entries(catCounts)
    .map(([name, value]) => ({ name: name.replace(/-/g, ' '), value }))
    .sort((a, b) => b.value - a.value);

  const codeInventoryData = [
    { name: 'Apex Classes',    value: inv?.apexClasses        ?? 0 },
    { name: 'Apex Triggers',   value: inv?.apexTriggers       ?? 0 },
    { name: 'LWC Components',  value: lwcCount },
    { name: 'Aura Components', value: lwc?.orgAuraComponentCount ?? 0 },
    { name: 'VF Pages',        value: results.orgInventory?.visualforcePages?.length ?? 0 },
    { name: 'Batch Classes',   value: inv?.batchClasses       ?? 0 },
    { name: 'Queueable',       value: inv?.queueableClasses   ?? 0 },
    { name: 'Schedulable',     value: inv?.schedulableClasses ?? 0 },
  ].filter(d => d.value > 0);

  const coverageBarData = [
    { name: '≥75% Coverage', value: passing },
    { name: '<75% Coverage', value: Math.max(0, below75 - zeroCov) },
    { name: '0% Coverage',   value: zeroCov },
  ].filter(d => d.value > 0);

  // Coverage histogram — shape of the problem, from per-class details
  const covHistogram = (() => {
    const details = coverage?.classCoverageDetails ?? [];
    if (details.length === 0) return [];
    const b: Record<string, number> = { '0–25%': 0, '25–50%': 0, '50–75%': 0, '75–100%': 0 };
    for (const c of details) {
      if (c.pct < 25)      b['0–25%']++;
      else if (c.pct < 50) b['25–50%']++;
      else if (c.pct < 75) b['50–75%']++;
      else                 b['75–100%']++;
    }
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  })();

  const recentIssues = codeQualityIssues.slice(0, 10);

  // ── Per-class coverage pagination ─────────────────────────────────────────
  const covDetails    = coverage?.classCoverageDetails ?? [];
  const covTotalPages = Math.ceil(covDetails.length / COV_PAGE_SIZE);
  const covPageSlice  = covDetails.slice(covPage * COV_PAGE_SIZE, (covPage + 1) * COV_PAGE_SIZE);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-sf-text mb-1">Code Quality</h1>
          <p className="text-xs text-sf-muted">Analyze and improve the quality of your Salesforce code.</p>
        </div>
        <button
          onClick={handleExportCsv}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-sf-border text-sf-muted hover:text-sf-text hover:border-sf-text-2 transition-colors"
        >
          <span>⬇</span> Export CSV
        </button>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 flex-wrap border-b border-sf-border">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-3 py-1.5 text-xs font-medium rounded-t transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'text-sf-accent border-b-2 border-sf-accent -mb-px bg-sf-bg-2'
                : 'text-sf-muted hover:text-sf-text',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ Summary ══════════════════════════════════════════════════════════ */}
      {activeTab === 'summary' && (
        <div className="space-y-6">

          {/* Quality Gate — binary pass/fail conditions */}
          <div className={`rounded-xl border p-4 ${gatePassed ? 'border-score-good/30 bg-score-good/5' : 'border-sev-error/30 bg-sev-error/5'}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${gatePassed ? 'bg-score-good/15 text-score-good' : 'bg-sev-error/15 text-sev-error'}`}>
                Quality Gate: {gatePassed ? 'PASSED' : 'FAILED'}
              </span>
              <div className="flex gap-2 flex-wrap flex-1">
                {gateConditions.map(c => (
                  <span
                    key={c.label}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border ${
                      c.pass
                        ? 'border-score-good/25 text-score-good bg-score-good/5'
                        : 'border-sev-error/25 text-sev-error bg-sev-error/5'
                    }`}
                    title={c.detail}
                  >
                    {c.pass ? '✓' : '✗'} {c.label} <span className="opacity-70">({c.detail})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Row 1: 6 KPI stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatCard icon="🛡️" value={`${qualityScore}/100`}  label="Code Quality Score"  sub={scoreLabel(qualityScore)} accent={scoreText(qualityScore)} />
            <StatCard icon="🔴" value={errCnt}                  label="Critical Issues"  accent={errCnt  > 0 ? 'text-sev-error'   : 'text-score-good'} />
            <StatCard icon="🟡" value={warnCnt}                 label="Warnings"         accent={warnCnt > 0 ? 'text-sev-warning' : 'text-score-good'} />
            <StatCard icon="✅" value={`${covPct.toFixed(1)}%`} label="Test Coverage"    accent={covColor} />
            <StatCard
              icon="</>"
              value={codeSizePct != null ? `${codeSizePct}%` : (inv ? fmtChars(inv.apexCodeChars ?? 0) : '—')}
              label="Apex Code Size"
              sub={codeSizePct != null ? `of ${fmtChars(inv!.apexCodeCharLimit)} char limit` : undefined}
              accent={codeSizePct != null && codeSizePct >= 75 ? 'text-sev-warning' : undefined}
            />
            <StatCard icon="🧩" value={totalComponents}         label="Total Components" />
          </div>

          {/* Row 2: Severity | Category | Top Components | Coverage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* Issues by Severity */}
            <GlassCard title="Issues by Severity">
              {severityData.length > 0 ? (
                <div>
                  <DonutChart data={severityData} height={130} showLegend={false} />
                  <div className="mt-2 space-y-1">
                    {severityData.map(d => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <span className={d.name === 'Critical' ? 'text-sev-error' : d.name === 'Warning' ? 'text-sev-warning' : 'text-sf-muted'}>●</span>
                        <span className="text-sf-muted flex-1">{d.name}</span>
                        <span className="text-sf-text font-medium tabular-nums">{d.value}</span>
                        <span className="text-sf-muted tabular-nums w-12 text-right">
                          {codeQualityIssues.length > 0 ? `${((d.value / codeQualityIssues.length) * 100).toFixed(1)}%` : '0%'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-sf-muted py-6 text-center">No issues found.</p>
              )}
            </GlassCard>

            {/* Issues by Category — the ONE place this dataset renders */}
            <GlassCard title="Issues by Category">
              {catChartData.length > 0
                ? <HBarChart data={catChartData} color="#3b82f6" />
                : <p className="text-xs text-sf-muted py-6 text-center">No issues found.</p>}
            </GlassCard>
            {/* Top 10 Components by Issues */}
            <GlassCard title="Top 10 Components by Issues">
              {top10Components.length > 0 ? (
                <div>
                  {/* Legend */}
                  <div className="flex gap-3 mb-2 text-[10px] text-sf-muted">
                    <span><span className="text-sev-error font-bold">●</span> Error</span>
                    <span><span className="text-sev-warning font-bold">●</span> Warning</span>
                    <span><span className="text-sf-muted">●</span> Info</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-sf-border">
                          <th className="text-left py-1.5 px-2 text-sf-muted font-medium">Component</th>
                          <th className="text-left py-1.5 px-2 text-sf-muted font-medium">Type</th>
                          <th className="text-center py-1.5 px-1 text-sev-error">●</th>
                          <th className="text-center py-1.5 px-1 text-sev-warning">●</th>
                          <th className="text-center py-1.5 px-1 text-sf-muted">●</th>
                          <th className="text-right py-1.5 px-2 text-sf-muted font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top10Components.map(row => {
                          const basename = row.name.split('/').pop()?.split('\\').pop() ?? row.name;
                          const total = row.error + row.warning + row.info;
                          return (
                            <tr key={row.name} className="border-b border-sf-border/30 hover:bg-sf-bg-3/40">
                              <td className="py-1.5 px-2 max-w-[120px]">
                                <span className="block truncate font-mono text-[10px] text-sf-text" title={row.name}>{basename}</span>
                              </td>
                              <td className="py-1.5 px-2 text-sf-muted whitespace-nowrap">{row.type}</td>
                              <td className="py-1.5 px-1 text-center text-sev-error font-medium">{row.error   || '—'}</td>
                              <td className="py-1.5 px-1 text-center text-sev-warning font-medium">{row.warning || '—'}</td>
                              <td className="py-1.5 px-1 text-center text-sf-muted">{row.info    || '—'}</td>
                              <td className="py-1.5 px-2 text-right text-sf-text font-semibold">{total}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-sf-muted py-6 text-center">No issues found.</p>
              )}
            </GlassCard>

            {/* Consolidated Test Coverage (the one coverage card on Summary) */}
            <GlassCard title="Test Coverage Summary">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <ScoreRing score={covPct} size={80} />
                  <dl className="flex-1 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-sf-muted">Avg Coverage</dt>
                      <dd className={`font-semibold ${covColor}`}>{covPct.toFixed(1)}%</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sf-muted">Total Classes</dt>
                      <dd className="text-sf-text font-semibold">{totalClasses}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sf-muted">Below 75%</dt>
                      <dd className={`font-semibold ${below75 > 0 ? 'text-sev-warning' : 'text-score-good'}`}>{below75}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sf-muted">Zero Coverage</dt>
                      <dd className={`font-semibold ${zeroCov > 0 ? 'text-sev-error' : 'text-score-good'}`}>{zeroCov}</dd>
                    </div>
                  </dl>
                </div>
                {lwc && (
                  <div className="border-t border-sf-border pt-3 space-y-1.5 text-xs">
                    <p className="text-sf-muted font-medium mb-2">LWC Components</p>
                    {[
                      { label: 'With Tests',             value: lwc.componentsWithTests ?? 0, accent: 'text-score-good' },
                      { label: 'Without Tests',          value: Math.max(0, lwcCount - (lwc.componentsWithTests ?? 0)), accent: 'text-sev-warning' },
                      { label: 'Accessibility Issues',   value: lwc.componentsWithA11yIssues ?? 0, accent: 'text-sev-warning' },
                    ].map(({ label, value, accent }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-sf-muted">{label}</span>
                        <span className={`font-semibold ${value > 0 ? accent : 'text-score-good'}`}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Row 3: Debt pointer | Code Inventory (with LWC/Aura/VF) | Recent Issues */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Technical Debt — compact pointer; full breakdown lives in the Technical Debt tab */}
            <GlassCard title="Technical Debt">
              {debt ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold tabular-nums ${debt.totalHours > 200 ? 'text-sev-warning' : 'text-sf-text'}`}>
                      {debt.totalHours}
                    </span>
                    <span className="text-xs text-sf-muted">estimated hours · {debt.sprintCycles ?? '—'} sprint cycles</span>
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-score-good/10 text-score-good">{qw} quick wins</span>
                    <span className="px-2 py-0.5 rounded bg-sev-warning/10 text-sev-warning">{med} medium</span>
                    <span className="px-2 py-0.5 rounded bg-sev-error/10 text-sev-error">{lrg} large</span>
                  </div>
                  <a href="#/techdebt" className="text-[11px] text-sf-accent hover:underline">
                    Open Debt Payoff Plan →
                  </a>
                </div>
              ) : (
                <p className="text-xs text-sf-muted py-6 text-center">No debt data available.</p>
              )}
            </GlassCard>

            {/* Code Inventory — includes LWC, Aura, VF Pages */}
            <GlassCard title="Code Inventory">
              {codeInventoryData.length > 0
                ? <HBarChart data={codeInventoryData} color="#3b82f6" />
                : <p className="text-xs text-sf-muted py-6 text-center">No inventory data.</p>}
            </GlassCard>

            {/* Recent Issues */}
            <GlassCard title={`Recent Issues (${recentIssues.length})`}>
              {recentIssues.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-sf-border">
                        <th className="text-left py-1.5 text-sf-muted font-medium">Issue</th>
                        <th className="text-left py-1.5 px-2 text-sf-muted font-medium">Component</th>
                        <th className="text-left py-1.5 text-sf-muted font-medium">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentIssues.map((issue, idx) => {
                        const basename = issue.file
                          ? (issue.file.split('/').pop()?.split('\\').pop() ?? issue.file)
                          : (issue.object ?? '—');
                        return (
                          <tr key={`${issue.id}-${idx}`} className="border-b border-sf-border/30 hover:bg-sf-bg-3/40">
                            <td className="py-1.5 pr-2 max-w-[160px]">
                              <span className="block truncate text-sf-text" title={issue.message}>{issue.message}</span>
                            </td>
                            <td className="py-1.5 px-2 max-w-[100px]">
                              <span className="block truncate font-mono text-[10px] text-sf-muted" title={basename}>{basename}</span>
                            </td>
                            <td className="py-1.5 whitespace-nowrap"><SeverityPill severity={issue.severity} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-sf-muted py-6 text-center">No issues found.</p>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      {/* ══ Apex ═════════════════════════════════════════════════════════════ */}
      {activeTab === 'apex' && (
        <GlassCard title={`Apex Issues (${apexIssues.length})`}>
          <IssueFilters />
          <IssueTable issues={apexIssues} />
        </GlassCard>
      )}

      {/* ══ Triggers ═════════════════════════════════════════════════════════ */}
      {activeTab === 'triggers' && (
        <GlassCard title={`Trigger Issues (${trigIssues.length})`}>
          <IssueFilters />
          <IssueTable issues={trigIssues} />
        </GlassCard>
      )}

      {/* ══ LWC ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'lwc' && (
        <div className="space-y-4">
          {lwc && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon="🧩" value={lwcCount}                                    label="LWC Components" />
              <StatCard icon="✅" value={lwc.componentsWithTests ?? 0}                label="With Tests"             accent="text-score-good" />
              <StatCard icon="♿" value={lwc.componentsWithA11yIssues ?? 0}           label="Accessibility Issues"   accent={(lwc.componentsWithA11yIssues ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'} />
              <StatCard icon="🌀" value={lwc.orgAuraComponentCount ?? 0}              label="Aura (org)" />
            </div>
          )}
          <GlassCard title={`LWC Issues (${lwcIssues.length})`}>
            <IssueFilters />
            <IssueTable issues={lwcIssues} />
          </GlassCard>
        </div>
      )}

      {/* ══ Coverage ═════════════════════════════════════════════════════════ */}
      {activeTab === 'coverage' && (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon="📊" value={`${covPct.toFixed(1)}%`} label="Avg Test Coverage" accent={covColor} />
            <StatCard icon="📚" value={totalClasses}             label="Classes Analyzed" />
            <StatCard icon="⚠️" value={below75}                  label="Below 75%"        accent={below75 > 0 ? 'text-sev-warning' : 'text-score-good'} />
            <StatCard icon="🚫" value={zeroCov}                  label="Zero Coverage"    accent={zeroCov > 0 ? 'text-sev-error'   : 'text-score-good'} />
          </div>

          {/* Distribution + LWC */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GlassCard title="Coverage Distribution">
              <div className="flex flex-col items-center gap-4">
                <ScoreRing score={covPct} size={140} label="Average Coverage" />
                {covHistogram.length > 0 ? (
                  <div className="w-full">
                    <p className="text-[10px] text-sf-muted mb-1">Classes by coverage bucket</p>
                    <HBarChart data={covHistogram} color="#22c55e" />
                  </div>
                ) : coverageBarData.length > 0 && (
                  <div className="w-full">
                    <HBarChart data={coverageBarData} multiColor color="#22c55e" />
                  </div>
                )}
              </div>
            </GlassCard>
            {lwc && (
              <GlassCard title="LWC Test Coverage">
                <dl className="grid grid-cols-2 gap-4 text-xs">
                  {[
                    { label: 'Total Components',       value: lwcCount,                                               accent: undefined },
                    { label: 'With Tests',             value: lwc.componentsWithTests ?? 0,                           accent: 'text-score-good' },
                    { label: 'Without Tests',          value: Math.max(0, lwcCount - (lwc.componentsWithTests ?? 0)), accent: 'text-sev-warning' },
                    { label: 'Accessibility Issues',   value: lwc.componentsWithA11yIssues ?? 0,                      accent: 'text-sev-warning' },
                  ].map(({ label, value, accent }) => (
                    <div key={label}>
                      <dt className="text-sf-muted">{label}</dt>
                      <dd className={`text-2xl font-bold mt-1 ${accent ?? 'text-sf-text'}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </GlassCard>
            )}
          </div>

          {/* Testing issues from analyzer */}
          {testingIssues.length > 0 && (
            <GlassCard title={`Test Quality Issues (${testingIssues.length})`}>
              <IssueFilters />
              <IssueTable issues={testingIssues} />
            </GlassCard>
          )}

          {/* Per-class coverage table */}
          <GlassCard title={`Apex Class Coverage (${covDetails.length} classes)`}>
            {covDetails.length > 0 ? (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-sf-border">
                        <th className="text-left py-1.5 px-2 text-sf-muted font-medium">Class / Trigger</th>
                        <th className="text-right py-1.5 px-2 text-sf-muted font-medium">Coverage %</th>
                        <th className="text-center py-1.5 px-2 text-sf-muted font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {covPageSlice.map(row => {
                        const status =
                          row.pct === 0 ? { label: '0%', cls: 'bg-sev-error/10 text-sev-error' } :
                          row.pct < 75  ? { label: '<75%', cls: 'bg-sev-warning/10 text-sev-warning' } :
                                          { label: '≥75%', cls: 'bg-score-good/10 text-score-good' };
                        return (
                          <tr key={row.name} className="border-b border-sf-border/30 hover:bg-sf-bg-3/40">
                            <td className="py-1.5 px-2 font-mono text-[11px] text-sf-text">{row.name}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums text-sf-text font-medium">{row.pct}%</td>
                            <td className="py-1.5 px-2 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {covTotalPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-sf-muted pt-1">
                    <span>
                      {covPage * COV_PAGE_SIZE + 1}–{Math.min((covPage + 1) * COV_PAGE_SIZE, covDetails.length)} of {covDetails.length}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCovPage(p => Math.max(0, p - 1))}
                        disabled={covPage === 0}
                        className="px-2 py-1 rounded border border-sf-border disabled:opacity-40 hover:bg-sf-bg-2 transition-colors"
                      >
                        ‹ Prev
                      </button>
                      <button
                        onClick={() => setCovPage(p => Math.min(covTotalPages - 1, p + 1))}
                        disabled={covPage >= covTotalPages - 1}
                        className="px-2 py-1 rounded border border-sf-border disabled:opacity-40 hover:bg-sf-bg-2 transition-colors"
                      >
                        Next ›
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-sf-muted py-6 text-center">
                No per-class coverage data available. Run a full analysis connected to a Salesforce org.
              </p>
            )}
          </GlassCard>
        </div>
      )}

    </div>
  );
}
