import { useState, useCallback, type ReactNode } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import Tooltip from '@/components/common/Tooltip';
import SegmentedTabs from '@/components/common/SegmentedTabs';
import { EmptyState } from '@/components/common';
import IssueTable from '@/components/issues/IssueTable';
import IssueFilters from '@/components/issues/IssueFilters';
import HBarChart from '@/components/charts/HBarChart';
import DonutChart from '@/components/charts/DonutChart';
import SparklineChart from '@/components/charts/SparklineChart';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { scoreLabel, scoreHex } from '@/constants/scoring';
import type { ScanHistoryEntry } from '@/types';
import {
  governorPatternCounts,
  complexityMetrics,
  componentTypeBreakdown,
  buildCoverageLookup,
  testQualityBreakdown,
  debtByComponentType,
  buildObservations,
  buildRecommendations,
  SAMPLE_ENGINEERING_QUALITY_INDEX,
  SAMPLE_TECH_DEBT_SCORE,
  SAMPLE_COMPLEXITY_SCORE,
  SAMPLE_EQI_SPARKLINE,
  SAMPLE_DEBT_SCORE_SPARKLINE,
  SAMPLE_COMPLEXITY_SPARKLINE,
  SAMPLE_TECH_DEBT_TREND,
  SAMPLE_COVERAGE_TREND,
  SAMPLE_COMPLEXITY_STATIC_ROWS,
  SAMPLE_GOVERNOR_STATIC_ROWS,
  SAMPLE_DOCUMENTATION_QUALITY,
  SAMPLE_TEST_EXECUTION_STATS,
  SAMPLE_CODE_INVENTORY_EXTRA,
  SAMPLE_DEBT_SCORE_BY_COMPONENT,
} from './codeQuality/derivations';

type SubTab = 'overview' | 'apex' | 'triggers' | 'lwc' | 'tests';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'apex',     label: 'Apex' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'lwc',      label: 'LWC' },
  { id: 'tests',    label: 'Tests' },
];

const COV_PAGE_SIZE = 25;

function inferType(name: string): string {
  if (name.endsWith('.cls'))     return 'Apex Class';
  if (name.endsWith('.trigger')) return 'Trigger';
  if (name.includes('/lwc/') || name.includes('\\lwc\\')) return 'LWC';
  if (name.includes('/aura/') || name.includes('\\aura\\')) return 'Aura';
  if (name.endsWith('.page') || name.endsWith('.component')) return 'Visualforce';
  return 'Other';
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return ts.slice(0, 10);
  }
}

const LETTER_GRADE: Record<string, string> = { Excellent: 'A', Good: 'B', Fair: 'C', Poor: 'D', Critical: 'F' };
function letterGrade(score: number): string { return LETTER_GRADE[scoreLabel(score)] ?? 'F'; }
function countRisk(n: number): 'high' | 'medium' | 'low' { return n >= 10 ? 'high' : n >= 3 ? 'medium' : 'low'; }

/** Small "not real data yet" indicator — reused everywhere a static/sample value is shown. */
function SampleBadge({ note }: { note?: string }) {
  return (
    <Tooltip
      content={note ?? 'Not yet computed by the analyzers — sample data for layout preview.'}
      className="whitespace-normal max-w-[220px]"
    >
      <Badge variant="default" className="cursor-help">Sample</Badge>
    </Tooltip>
  );
}

interface MetricTileProps {
  icon: string;
  label: string;
  displayValue: string;
  gradeBasis: number;
  delta?: number;
  deltaSuffix?: string;
  deltaGood?: 'up' | 'down';
  sparklineData?: { value: number }[];
  sampleValue?: boolean;
  sampleTrend?: boolean;
}

/** Grade + delta + sparkline stat tile — like CategoryScoreCard, but the big number can be a
 *  raw count or percentage instead of always a /100 score (needed for Security Issues / Test Coverage). */
function MetricTile({
  icon, label, displayValue, gradeBasis, delta, deltaSuffix = ' pts', deltaGood = 'up',
  sparklineData, sampleValue, sampleTrend,
}: MetricTileProps) {
  const color = scoreHex(gradeBasis);
  const grade = letterGrade(gradeBasis);
  const isGood = delta === undefined || delta === 0 ? null : (deltaGood === 'up' ? delta > 0 : delta < 0);
  const deltaColorClass = isGood === null ? 'text-sf-muted' : isGood ? 'text-score-good' : 'text-sev-error';
  const deltaArrow = delta === undefined || delta === 0 ? '→' : delta > 0 ? '↑' : '↓';

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-sf-border bg-sf-bg-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-[11px] text-sf-text font-medium leading-tight">{label}</span>
        </div>
        {sampleValue ? <SampleBadge /> : <span className="text-sm font-bold" style={{ color }}>{grade}</span>}
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-lg font-bold tabular-nums leading-none" style={{ color }}>{displayValue}</span>
        {delta !== undefined && (
          <span className={`text-[10px] tabular-nums flex items-center gap-1 ${deltaColorClass}`}>
            {deltaArrow} {Math.abs(delta)}{deltaSuffix}
            {sampleTrend && <SampleBadge />}
          </span>
        )}
      </div>
      <span className="text-[10px] text-sf-muted">{sampleValue ? 'Sample' : scoreLabel(gradeBasis)}</span>
      {sparklineData && sparklineData.length >= 2 && (
        <SparklineChart data={sparklineData} color={color} height={28} showDots={false} />
      )}
    </div>
  );
}

function ListRow({ label, value, badge, sample }: { label: string; value: ReactNode; badge?: ReactNode; sample?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-sf-border/30 last:border-0">
      <span className="text-xs text-sf-text">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tabular-nums text-sf-text">{value}</span>
        {badge}
        {sample && <SampleBadge />}
      </div>
    </div>
  );
}

function TrendChart({ title, data, color, unit = '', sample }: {
  title: string; data: { label: string; value: number }[]; color: string; unit?: string; sample?: boolean;
}) {
  const latest = data[data.length - 1]?.value;
  const first = data[0]?.value;
  const delta = latest !== undefined && first !== undefined ? Math.round((latest - first) * 10) / 10 : undefined;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <span className="text-xs font-semibold text-sf-text">{title}</span>
        <div className="flex items-center gap-2">
          {latest !== undefined && (
            <span className="text-sm font-bold tabular-nums" style={{ color }}>{latest}{unit}</span>
          )}
          {delta !== undefined && (
            <span className={`text-[10px] ${delta >= 0 ? 'text-score-good' : 'text-sev-error'}`}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}{unit}
            </span>
          )}
          {sample && <SampleBadge />}
        </div>
      </div>
      {data.length >= 2 ? (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9d9d9d' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9d9d9d' }} tickLine={false} axisLine={false} />
              <RechartsTooltip
                contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                itemStyle={{ color: '#cccccc' }}
              />
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: color }} animationDuration={500} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-sf-muted py-8 text-center">Not enough scan history yet.</p>
      )}
    </GlassCard>
  );
}

export default function CodeQuality() {
  const [activeTab, setActiveTab]   = useState<SubTab>('overview');
  const [covPage,   setCovPage]     = useState(0);
  const results    = useOrgStore((s) => s.results);
  const orgHistory = useOrgStore((s) => s.orgHistory);
  const { postMessage } = useVSCode();
  const allIssues = results?.issues ?? [];
  const codeQualityIssues = allIssues.filter(i =>
    i.category === 'code-quality' || i.category === 'lwc-quality' ||
    i.category === 'technical-debt' || i.category === 'testing' || i.category === 'aura-quality'
  );
  const coverage  = results?.testCoverageSummary;
  const lwc       = results?.lwcSummary;
  const inv       = results?.codeInventory;
  const debt      = results?.debtSummary;
  const scores    = results?.scores;

  const orgId  = results?.orgDetails?.orgId ?? results?.metadata?.orgId ?? null;
  const history: ScanHistoryEntry[] = orgId ? (orgHistory[orgId] ?? []) : [];

  // ── All hooks before early return ──────────────────────────────────────────
  const catCounts: Record<string, number> = {};
  for (const i of codeQualityIssues) { catCounts[i.category] = (catCounts[i.category] ?? 0) + 1; }

  const top10Map: Record<string, { name: string; type: string; error: number; warning: number; info: number }> = {};
  for (const i of codeQualityIssues) {
    const key = i.file ?? i.object ?? 'Unknown';
    if (!top10Map[key]) top10Map[key] = { name: key, type: inferType(key), error: 0, warning: 0, info: 0 };
    top10Map[key][i.severity as 'error' | 'warning' | 'info']++;
  }
  const top10Components = Object.values(top10Map)
    .sort((a, b) => (b.error + b.warning + b.info) - (a.error + a.warning + a.info))
    .slice(0, 10);

  const apexIssues    = allIssues.filter(i => i.category === 'code-quality' && !i.file?.endsWith('.trigger'));
  const trigIssues    = allIssues.filter(i => i.file?.endsWith('.trigger'));
  const lwcIssues     = allIssues.filter(i => i.category === 'lwc-quality');
  const testingIssues = allIssues.filter(i => i.category === 'testing');

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
  const auraCount    = lwc?.orgAuraComponentCount ?? 0;
  const vfCount      = results.orgInventory?.visualforcePages?.length ?? 0;

  const totalClasses = coverage?.totalClasses  ?? 0;
  const below75      = coverage?.classesBelow75 ?? 0;
  const zeroCov      = coverage?.zeroCoverageCount ?? 0;
  const passing      = Math.max(0, totalClasses - below75);
  const covDetails    = coverage?.classCoverageDetails ?? [];

  const qualityScore = Math.round(scores?.codeQuality ?? 0);
  const securityScore = Math.round(scores?.security ?? 0);
  const securityCount = results.summary?.byCategory?.['security'] ?? 0;

  const lrg = debt?.largeItems?.length  ?? 0;
  const debtItemsAll = [...(debt?.quickWins ?? []), ...(debt?.mediumItems ?? []), ...(debt?.largeItems ?? [])];

  // ── Real per-org scan history (≤10 scans) → Code Quality Score trend/delta ──
  const prevHist = history.length >= 2 ? history[history.length - 2] : undefined;
  const codeQualityDelta = prevHist ? Math.round((qualityScore) - (prevHist.scores.codeQuality ?? 0)) : undefined;
  const codeQualitySparkline = history.map((h) => ({ value: h.scores.codeQuality ?? 0 }));
  const codeQualityTrendData = history.map((h) => ({ label: formatTs(h.timestamp), value: Math.round(h.scores.codeQuality ?? 0) }));

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

  const componentTypeData = componentTypeBreakdown(codeQualityIssues, inferType);

  const codeInventoryTiles: { icon: string; label: string; value: number; sample?: boolean }[] = [
    { icon: '📄', label: 'Apex Classes',    value: inv?.apexClasses        ?? 0 },
    { icon: '⚡', label: 'Triggers',        value: inv?.apexTriggers       ?? 0 },
    { icon: '🧩', label: 'LWC',             value: lwcCount },
    { icon: '🌀', label: 'Aura',            value: auraCount },
    { icon: '📃', label: 'Visualforce',     value: vfCount },
    { icon: '🔁', label: 'Batch Apex',      value: inv?.batchClasses       ?? 0 },
    { icon: '🔃', label: 'Queueables',      value: inv?.queueableClasses   ?? 0 },
    { icon: '⏰', label: 'Schedulables',    value: inv?.schedulableClasses ?? 0 },
  ].filter(t => t.value > 0);
  const codeInventorySampleTiles = SAMPLE_CODE_INVENTORY_EXTRA.map((t) => ({
    icon: t.label === 'Test Classes' ? '✅' : t.label === 'Interfaces' ? '🔌' : t.label === 'Enums' ? '🔢' : t.label === 'REST Services' ? '🌐' : '📡',
    label: t.label, value: t.value, sample: true,
  }));

  // ── Complexity / dependency / governor derivations (all real, joined here) ─
  const complexity = complexityMetrics(allIssues, debt, results.dependencyGraph);
  const govCounts = governorPatternCounts(results.governorRisks);
  const nonSelectiveCount = allIssues.filter(i => i.ruleId === 'non-selective-query').length;
  const testQuality = testQualityBreakdown(covDetails);
  const coverageLookup = buildCoverageLookup(covDetails);
  const debtTypeRows = debtByComponentType({
    debtItems: debtItemsAll, inferType,
    apexClasses: inv?.apexClasses ?? 0, apexTriggers: inv?.apexTriggers ?? 0,
    lwcCount, auraCount, vfCount,
  });

  const observations = buildObservations({
    coveragePct: covPct,
    debtHours: debt?.totalHours ?? 0,
    largeItemsCount: lrg,
    soqlInLoopInstances: govCounts.soqlInLoopInstances,
    soqlInLoopClasses: govCounts.soqlInLoopClasses,
    outdatedApiCount: debt?.byCategory?.['outdated-api'] ?? 0,
  });
  const recommendations = buildRecommendations({
    soqlInLoopInstances: govCounts.soqlInLoopInstances,
    below75Count: below75,
    largeClasses: complexity.largeClasses,
    longMethods: complexity.longMethods,
    securityIssueCount: securityCount,
  });

  const testQualityDonutData = [
    { name: 'Classes ≥75% Coverage', value: passing },
    { name: 'Classes <75% Coverage', value: Math.max(0, below75 - zeroCov) },
    { name: 'Untested Classes',      value: testQuality.untestedClasses },
    { name: 'Untested Triggers',     value: testQuality.untestedTriggers },
  ].filter(d => d.value > 0);

  // ── Per-class coverage pagination (Tests tab) ──────────────────────────────
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
      <SegmentedTabs items={SUB_TABS} active={activeTab} onChange={setActiveTab} variant="underline" size="md" />

      {/* ══ Overview ═════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
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

          {/* Row 1: 6 grade/delta/sparkline stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricTile
              icon="📊" label="Engineering Quality Index"
              displayValue={String(SAMPLE_ENGINEERING_QUALITY_INDEX)} gradeBasis={SAMPLE_ENGINEERING_QUALITY_INDEX}
              delta={4} sparklineData={SAMPLE_EQI_SPARKLINE} sampleValue sampleTrend
            />
            <MetricTile
              icon="🛡️" label="Code Quality Score"
              displayValue={String(qualityScore)} gradeBasis={qualityScore}
              delta={codeQualityDelta} sparklineData={codeQualitySparkline}
            />
            <MetricTile
              icon="💰" label="Technical Debt Score"
              displayValue={String(SAMPLE_TECH_DEBT_SCORE)} gradeBasis={SAMPLE_TECH_DEBT_SCORE}
              delta={-5} deltaGood="down" sparklineData={SAMPLE_DEBT_SCORE_SPARKLINE} sampleValue sampleTrend
            />
            <MetricTile
              icon="🔒" label="Security Issues"
              displayValue={String(securityCount)} gradeBasis={securityScore}
              delta={-7} deltaGood="down" deltaSuffix="" sampleTrend
            />
            <MetricTile
              icon="✅" label="Test Coverage"
              displayValue={`${covPct.toFixed(1)}%`} gradeBasis={covPct}
              delta={5.8} deltaSuffix="%" sampleTrend
            />
            <MetricTile
              icon="🧬" label="Code Complexity Score"
              displayValue={String(SAMPLE_COMPLEXITY_SCORE)} gradeBasis={SAMPLE_COMPLEXITY_SCORE}
              delta={-3} deltaGood="down" sparklineData={SAMPLE_COMPLEXITY_SPARKLINE} sampleValue sampleTrend
            />
          </div>

          {/* AI Architect Observations */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
              <h3 className="text-xs font-semibold text-sf-text flex items-center gap-1.5">
                <span>💡</span> AI Architect Observations
              </h3>
              <span className="text-[11px] text-sf-accent">View all insights →</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {observations.map((o) => (
                <div key={o.title} className="flex flex-col gap-1.5 p-3 rounded-lg border border-sf-border bg-sf-bg-2">
                  <div className="flex items-center justify-between">
                    <span className="text-base">{o.icon}</span>
                    {o.sample && <SampleBadge />}
                  </div>
                  <span className="text-xs font-semibold text-sf-text">{o.title}</span>
                  <span className="text-[11px] text-sf-muted leading-snug">{o.text}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Code Quality Trends */}
          <div>
            <h3 className="text-xs font-semibold text-sf-text mb-2">
              Code Quality Trends (Last {Math.max(history.length, 1)} Scan{history.length === 1 ? '' : 's'})
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TrendChart title="Code Quality Score" data={codeQualityTrendData} color="#3b82f6" />
              <TrendChart title="Technical Debt Score" data={SAMPLE_TECH_DEBT_TREND} color="#f59e0b" sample />
              <TrendChart title="Test Coverage (%)" data={SAMPLE_COVERAGE_TREND} color="#a78bfa" unit="%" sample />
            </div>
          </div>

          {/* Issues by Severity | Category | Component Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <GlassCard title="Issues by Severity">
              {severityData.length > 0 ? (
                <div>
                  <DonutChart data={severityData} height={130} showLegend={false} />
                  <div className="mt-2 space-y-1">
                    {severityData.map(d => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <span className={d.name === 'Error' ? 'text-sev-error' : d.name === 'Warning' ? 'text-sev-warning' : 'text-sf-muted'}>●</span>
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

            <GlassCard title="Issues by Category">
              {catChartData.length > 0
                ? <HBarChart data={catChartData} color="#3b82f6" />
                : <p className="text-xs text-sf-muted py-6 text-center">No issues found.</p>}
            </GlassCard>

            <GlassCard title="Issues by Component Type">
              {componentTypeData.length > 0
                ? <HBarChart data={componentTypeData} color="#8b5cf6" />
                : <p className="text-xs text-sf-muted py-6 text-center">No issues found.</p>}
            </GlassCard>
          </div>

          {/* Code Inventory */}
          <GlassCard title="Code Inventory">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {[...codeInventoryTiles, ...codeInventorySampleTiles].map((t) => (
                <div key={t.label} className="relative flex flex-col items-center gap-1 p-2 rounded-lg border border-sf-border bg-sf-bg-2 text-center">
                  {t.sample && <span className="absolute top-1 right-1 scale-90 origin-top-right"><SampleBadge /></span>}
                  <span className="text-sm">{t.icon}</span>
                  <span className="text-sm font-bold tabular-nums text-sf-text">{t.value.toLocaleString()}</span>
                  <span className="text-[9px] text-sf-muted leading-tight">{t.label}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Technical Debt Summary | Complexity Analysis | Test Quality */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-sf-text">Technical Debt Summary</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-sf-border">
                      <th className="text-left py-1.5 px-1 text-sf-muted font-medium">Component</th>
                      <th className="text-right py-1.5 px-1 text-sf-muted font-medium">Files</th>
                      <th className="text-right py-1.5 px-1 text-sf-muted font-medium">Violations</th>
                      <th className="text-right py-1.5 px-1 text-sf-muted font-medium">
                        <span className="inline-flex items-center gap-1">Debt Score <SampleBadge /></span>
                      </th>
                      <th className="text-center py-1.5 px-1 text-sf-muted font-medium">
                        <span className="inline-flex items-center gap-1">Grade <SampleBadge /></span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {debtTypeRows.map((row) => {
                      const sample = SAMPLE_DEBT_SCORE_BY_COMPONENT[row.component] ?? { debtScore: 0, grade: '—' };
                      return (
                        <tr key={row.component} className="border-b border-sf-border/30">
                          <td className="py-1.5 px-1 text-sf-text">{row.component}</td>
                          <td className="py-1.5 px-1 text-right tabular-nums text-sf-text">{row.files}</td>
                          <td className="py-1.5 px-1 text-right tabular-nums text-sf-text">{row.violations}</td>
                          <td className="py-1.5 px-1 text-right tabular-nums text-sf-muted">{sample.debtScore}</td>
                          <td className="py-1.5 px-1 text-center text-sf-muted">{sample.grade}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <span className="text-[11px] text-sf-accent hover:underline mt-2 inline-block cursor-pointer">View all technical debt →</span>
            </GlassCard>

            <GlassCard title="Complexity Analysis">
              <div>
                <ListRow label="Cyclomatic Complexity" value={SAMPLE_COMPLEXITY_STATIC_ROWS[0].value} sample />
                <ListRow label="Cognitive Complexity" value={SAMPLE_COMPLEXITY_STATIC_ROWS[1].value} sample />
                <ListRow label="Long Methods (>50 lines)" value={complexity.longMethods} />
                <ListRow label="Large Classes (>500 lines)" value={complexity.largeClasses} />
                <ListRow label="Deep Nesting (>4 levels)" value={complexity.deepNesting} />
                <ListRow label="Duplicate Code" value={SAMPLE_COMPLEXITY_STATIC_ROWS[2].value} sample />
                <ListRow label="High Fan-In Classes (>20)" value={complexity.highFanIn} />
                <ListRow label="High Fan-Out Classes (>20)" value={complexity.highFanOut} />
              </div>
              <span className="text-[11px] text-sf-accent hover:underline mt-2 inline-block cursor-pointer">View complexity details →</span>
            </GlassCard>

            <GlassCard title="Test Quality">
              <div className="space-y-3">
                {testQualityDonutData.length > 0 ? (
                  <DonutChart data={testQualityDonutData} height={130} showLegend={false} />
                ) : (
                  <p className="text-xs text-sf-muted py-4 text-center">No coverage data available.</p>
                )}
                <div className="space-y-1">
                  {testQualityDonutData.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-sf-muted">{d.name}</span>
                      <span className="text-sf-text font-medium tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-sf-border pt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-sf-muted">Test Methods</span>
                    <span className="flex items-center gap-1 text-sf-text font-medium tabular-nums">{SAMPLE_TEST_EXECUTION_STATS.testMethods.toLocaleString()} <SampleBadge /></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sf-muted">Failed Tests</span>
                    <span className="flex items-center gap-1 text-sf-text font-medium tabular-nums">{SAMPLE_TEST_EXECUTION_STATS.failedTests} <SampleBadge /></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sf-muted">Assertions</span>
                    <span className="flex items-center gap-1 text-sf-text font-medium tabular-nums">{SAMPLE_TEST_EXECUTION_STATS.assertions.toLocaleString()} <SampleBadge /></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sf-muted">Avg Test Time</span>
                    <span className="flex items-center gap-1 text-sf-text font-medium tabular-nums">{SAMPLE_TEST_EXECUTION_STATS.avgTestTimeSec}s <SampleBadge /></span>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Governor Limit Risks | Documentation Quality | Top Problem Components */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GlassCard title="Governor Limit Risks">
              <div>
                <ListRow label="SOQL in Loops" value={govCounts.soqlInLoopInstances} badge={riskBadge(countRisk(govCounts.soqlInLoopInstances))} />
                <ListRow label="DML in Loops" value={govCounts.dmlInLoopInstances} badge={riskBadge(countRisk(govCounts.dmlInLoopInstances))} />
                <ListRow label="Heap Size Risk" value={govCounts.heapRiskHigh} badge={riskBadge(countRisk(govCounts.heapRiskHigh))} />
                <ListRow label="CPU Time Risk" value={govCounts.cpuRiskHigh} badge={riskBadge(countRisk(govCounts.cpuRiskHigh))} />
                <ListRow label="Non-selective Queries" value={nonSelectiveCount} badge={riskBadge(countRisk(nonSelectiveCount))} />
                {SAMPLE_GOVERNOR_STATIC_ROWS.map((r) => (
                  <ListRow key={r.label} label={r.label} value={r.value} badge={riskBadge(r.risk)} sample />
                ))}
              </div>
              <span className="text-[11px] text-sf-accent hover:underline mt-2 inline-block cursor-pointer">View all risks →</span>
            </GlassCard>

            <GlassCard>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-semibold text-sf-text">Documentation Quality</h3>
                <SampleBadge note="ApexDoc / comment / description coverage isn't measured by any analyzer yet." />
              </div>
              <div>
                {SAMPLE_DOCUMENTATION_QUALITY.map((d) => (
                  <ListRow key={d.label} label={d.label} value={`${d.value.toLocaleString()} (${d.pct}%)`} />
                ))}
              </div>
              <span className="text-[11px] text-sf-accent hover:underline mt-2 inline-block cursor-pointer">View documentation details →</span>
            </GlassCard>

            <GlassCard title="Top Problem Components">
              {top10Components.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-sf-border">
                        <th className="text-left py-1.5 px-1 text-sf-muted font-medium">Component</th>
                        <th className="text-left py-1.5 px-1 text-sf-muted font-medium">Type</th>
                        <th className="text-right py-1.5 px-1 text-sf-muted font-medium">Issues</th>
                        <th className="text-right py-1.5 px-1 text-sf-muted font-medium">Coverage</th>
                        <th className="text-right py-1.5 px-1 text-sf-muted font-medium">
                          <span className="inline-flex items-center gap-1">Debt <SampleBadge /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {top10Components.map(row => {
                        const basename = row.name.split('/').pop()?.split('\\').pop() ?? row.name;
                        const total = row.error + row.warning + row.info;
                        const cov = coverageLookup[basename] ?? coverageLookup[row.name];
                        return (
                          <tr key={row.name} className="border-b border-sf-border/30 hover:bg-sf-bg-3/40">
                            <td className="py-1.5 px-1 max-w-[110px]">
                              <span className="block truncate font-mono text-[10px] text-sf-text" title={row.name}>{basename}</span>
                            </td>
                            <td className="py-1.5 px-1 text-sf-muted whitespace-nowrap">{row.type}</td>
                            <td className="py-1.5 px-1 text-right text-sf-text font-semibold">{total}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums text-sf-text">{cov !== undefined ? `${cov}%` : '—'}</td>
                            <td className="py-1.5 px-1 text-right tabular-nums text-sf-muted">—</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-sf-muted py-6 text-center">No issues found.</p>
              )}
              <span className="text-[11px] text-sf-accent hover:underline mt-2 inline-block cursor-pointer">View all components →</span>
            </GlassCard>
          </div>

          {/* Recommended Improvements (AI) */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
              <h3 className="text-xs font-semibold text-sf-text flex items-center gap-1.5">
                <span>🎯</span> Recommended Improvements (AI)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {recommendations.map((r) => (
                <div key={r.title} className="flex flex-col gap-1.5 p-3 rounded-lg border border-sf-border bg-sf-bg-2">
                  <div className="flex items-center justify-between">
                    <span className="text-base">{r.icon}</span>
                    {r.sample
                      ? <SampleBadge />
                      : <Badge variant={r.impact === 'High' ? 'error' : 'warning'}>{r.impact} Impact</Badge>}
                  </div>
                  <span className="text-xs font-semibold text-sf-text">{r.title}</span>
                  <span className="text-[11px] text-sf-muted leading-snug flex-1">{r.text}</span>
                  <span className="text-[11px] text-sf-accent cursor-pointer">View Details →</span>
                </div>
              ))}
            </div>
          </GlassCard>
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
              <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
                <div className="text-xl font-bold tabular-nums text-sf-text">{lwcCount}</div>
                <div className="text-[10px] text-sf-muted mt-1">LWC Components</div>
              </div>
              <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
                <div className="text-xl font-bold tabular-nums text-score-good">{lwc.componentsWithTests ?? 0}</div>
                <div className="text-[10px] text-sf-muted mt-1">With Tests</div>
              </div>
              <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
                <div className={`text-xl font-bold tabular-nums ${(lwc.componentsWithA11yIssues ?? 0) > 0 ? 'text-sev-warning' : 'text-score-good'}`}>{lwc.componentsWithA11yIssues ?? 0}</div>
                <div className="text-[10px] text-sf-muted mt-1">Accessibility Issues</div>
              </div>
              <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
                <div className="text-xl font-bold tabular-nums text-sf-text">{auraCount}</div>
                <div className="text-[10px] text-sf-muted mt-1">Aura (org)</div>
              </div>
            </div>
          )}
          <GlassCard title={`LWC Issues (${lwcIssues.length})`}>
            <IssueFilters />
            <IssueTable issues={lwcIssues} />
          </GlassCard>
        </div>
      )}

      {/* ══ Tests ════════════════════════════════════════════════════════════ */}
      {activeTab === 'tests' && (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
              <div className={`text-xl font-bold tabular-nums ${covColor}`}>{covPct.toFixed(1)}%</div>
              <div className="text-[10px] text-sf-muted mt-1">Avg Test Coverage</div>
            </div>
            <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
              <div className="text-xl font-bold tabular-nums text-sf-text">{totalClasses}</div>
              <div className="text-[10px] text-sf-muted mt-1">Classes Analyzed</div>
            </div>
            <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
              <div className={`text-xl font-bold tabular-nums ${below75 > 0 ? 'text-sev-warning' : 'text-score-good'}`}>{below75}</div>
              <div className="text-[10px] text-sf-muted mt-1">Below 75%</div>
            </div>
            <div className="rounded-xl border border-sf-border bg-sf-glass p-3 text-center">
              <div className={`text-xl font-bold tabular-nums ${zeroCov > 0 ? 'text-sev-error' : 'text-score-good'}`}>{zeroCov}</div>
              <div className="text-[10px] text-sf-muted mt-1">Zero Coverage</div>
            </div>
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

function riskBadge(risk: 'high' | 'medium' | 'low') {
  const variant = risk === 'high' ? 'error' : risk === 'medium' ? 'warning' : 'default';
  const label = risk === 'high' ? 'High' : risk === 'medium' ? 'Medium' : 'Low';
  return <Badge variant={variant}>{label}</Badge>;
}
