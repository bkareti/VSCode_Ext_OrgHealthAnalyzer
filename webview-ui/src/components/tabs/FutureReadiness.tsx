import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useOrgStore } from '@/store/slices/orgStore';
import { useFutureReadinessStore } from '@/store/slices/futureReadinessStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import type {
  ReadinessGap,
  GapSeverity,
  ReadinessTrend,
  RoadmapPhase,
  FutureReadinessReport,
  ReadinessPackAssessment,
} from '@/types';

// ── Colour helpers ─────────────────────────────────────────────────────────────

const SCORE_COLOR = (s: number) =>
  s >= 80 ? '#22c55e' : s >= 60 ? '#eab308' : s >= 40 ? '#f97316' : '#ef4444';

const SCORE_STATUS = (s: number) =>
  s >= 80 ? 'Ready' : s >= 60 ? 'Moderately Ready' : s >= 40 ? 'Needs Preparation' : 'Not Ready';

const SEV_ORDER: Record<GapSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const PACK_ICONS: Record<string, string> = {
  'ai-agentforce': '🤖',
  'data-cloud':    '☁️',
  'hyperforce':    '⚡',
};

const PACK_COLORS: Record<string, string> = {
  'overall':       '#8b5cf6',
  'ai-agentforce': '#3b82f6',
  'data-cloud':    '#22c55e',
  'hyperforce':    '#f59e0b',
};

const packShort = (name: string) => name.replace(' Readiness', '');

// ── Deterministic derivations (no fabricated numbers) ───────────────────────────

function decisionFor(score: number, hasCritical: boolean): { label: string; variant: 'success' | 'warning' | 'error' } {
  if (score >= 80 && !hasCritical) { return { label: 'GO', variant: 'success' }; }
  if (score >= 60) { return { label: 'GO WITH CONDITIONS', variant: 'warning' }; }
  return { label: 'NOT READY', variant: 'error' };
}

function businessRisk(score: number, criticalCount: number): { label: string; cls: string } {
  if (criticalCount > 0) { return { label: 'High', cls: 'text-sev-error' }; }
  if (score >= 80) { return { label: 'Low', cls: 'text-score-good' }; }
  if (score >= 60) { return { label: 'Medium', cls: 'text-sev-warning' }; }
  return { label: 'High', cls: 'text-sev-error' };
}

const CONFIDENCE_PCT: Record<string, number> = { high: 95, medium: 80, low: 60 };
function confidencePct(packs: ReadinessPackAssessment[]): number {
  if (!packs.length) { return 0; }
  const sum = packs.reduce((s, p) => s + (CONFIDENCE_PCT[p.confidence] ?? 70), 0);
  return Math.round(sum / packs.length);
}

function impactFromSeverity(sev: GapSeverity): { label: string; variant: 'error' | 'warning' | 'info' } {
  if (sev === 'Critical' || sev === 'High') { return { label: 'High', variant: 'error' }; }
  if (sev === 'Medium') { return { label: 'Medium', variant: 'warning' }; }
  return { label: 'Low', variant: 'info' };
}

function trendGlyph(t?: ReadinessTrend): { text: string; cls: string } {
  if (!t) { return { text: '—', cls: 'text-sf-muted' }; }
  if (t.direction === 'improving') { return { text: `▲ +${t.delta}`, cls: 'text-score-good' }; }
  if (t.direction === 'declining') { return { text: `▼ ${t.delta}`, cls: 'text-sev-error' }; }
  return { text: '▬ 0', cls: 'text-sf-muted' };
}

// ── SpeedoGauge ───────────────────────────────────────────────────────────────
// Half-circle SVG arc speedometer (0° left → 180° right, arcing upward)

function SpeedoGauge({ score, grade, size = 210 }: { score: number; grade: string; size?: number }) {
  const stroke = 18;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const halfCirc = Math.PI * r;
  const fillLen = halfCirc * (score / 100);
  const color = SCORE_COLOR(score);
  const svgH = cy + stroke / 2 + 2;
  const d = `M ${stroke / 2},${cy} A ${r},${r} 0 0 0 ${size - stroke / 2},${cy}`;

  return (
    <div className="flex flex-col items-center py-1">
      <div className="relative" style={{ width: size }}>
        <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
          <path d={d} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} strokeLinecap="round" />
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${fillLen} ${halfCirc}`}
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
          />
          {[0, 0.5, 1].map((pct) => {
            const angle = Math.PI * (1 - pct);
            const tx = cx + (r - stroke / 2 - 6) * Math.cos(angle);
            const ty = cy - (r - stroke / 2 - 6) * Math.sin(angle);
            return (
              <text key={pct} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="rgba(204,204,204,0.4)" fontSize="9">
                {Math.round(pct * 100)}
              </text>
            );
          })}
        </svg>
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center" style={{ paddingBottom: 2 }}>
          <span className="text-5xl font-bold tabular-nums leading-none" style={{ color }}>{Math.round(score)}<span className="text-lg">%</span></span>
          <span className="text-[11px] text-sf-muted mt-1">Grade {grade}</span>
        </div>
      </div>
      <div className="mt-2 text-center px-2">
        <span className="text-sm font-semibold" style={{ color }}>{SCORE_STATUS(score)}</span>
      </div>
    </div>
  );
}

// ── StarRating ──────────────────────────────────────────────────────────────────

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-sm leading-none">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < value ? 'text-sev-warning' : 'text-sf-muted/30'}>★</span>
      ))}
    </span>
  );
}

// ── Section title ────────────────────────────────────────────────────────────────

function SectionTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h2 className="text-sm font-semibold text-sf-text">
        <span className="text-sf-muted">{n}.</span> {title}
      </h2>
      {hint && <span className="text-[11px] text-sf-muted">{hint}</span>}
    </div>
  );
}

// ── DecisionCard (section 1) ─────────────────────────────────────────────────────

function DecisionCard({ pack, onViewDetails }: { pack: ReadinessPackAssessment; onViewDetails: () => void }) {
  const color = SCORE_COLOR(pack.overallScore);
  const hasCritical = pack.blockingIssues.some((b) => b.severity === 'Critical');
  const decision = decisionFor(pack.overallScore, hasCritical);
  const topBlocker = [...pack.blockingIssues].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])[0];

  return (
    <div className="rounded-xl border border-sf-border bg-white/[0.03] p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{PACK_ICONS[pack.packId] ?? '📊'}</span>
          <span className="text-xs font-semibold text-sf-text truncate">{packShort(pack.packName)}</span>
        </div>
        <Badge variant={decision.variant}>{decision.label}</Badge>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold tabular-nums" style={{ color }}>{pack.overallScore}</span>
        <span className="text-sm text-sf-muted">%</span>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{SCORE_STATUS(pack.overallScore)}</span>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pack.overallScore}%`, backgroundColor: color }} />
      </div>
      <div className="pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sf-muted">Top Blocker</p>
        <p className="text-[11px] text-sf-text leading-snug mt-0.5">{topBlocker?.title ?? 'No blocking issues found.'}</p>
      </div>
      <button className="text-[11px] text-sf-accent hover:underline mt-auto text-left" onClick={onViewDetails}>
        View details →
      </button>
    </div>
  );
}

// ── TrendChart (section 8) ───────────────────────────────────────────────────────

function TrendChart({ historical, packs }: { historical: ReadinessTrend[]; packs: ReadinessPackAssessment[] }) {
  const nameFor = (id: string) =>
    id === 'overall' ? 'Overall' : packShort(packs.find((p) => p.packId === id)?.packName ?? id);

  const buildPoint = (which: 'previous' | 'current') => {
    const row: Record<string, number | string> = { label: which === 'previous' ? 'Previous Scan' : 'Current Scan' };
    for (const t of historical) { row[t.packId] = which === 'previous' ? t.previous : t.current; }
    return row;
  };
  const data = [buildPoint('previous'), buildPoint('current')];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="label" tick={{ fill: '#9d9d9d', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: '#9d9d9d', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }} itemStyle={{ color: '#cccccc' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {historical.map((t) => (
          <Line
            key={t.packId}
            type="monotone"
            dataKey={t.packId}
            name={nameFor(t.packId)}
            stroke={PACK_COLORS[t.packId] ?? '#3b82f6'}
            strokeWidth={t.packId === 'overall' ? 2.5 : 1.5}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            animationDuration={700}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Analysis Methodology sub-tab ──────────────────────────────────────────────

const METHODOLOGY_PACKS = [
  {
    packId: 'ai-agentforce',
    icon: '🤖',
    name: 'AI / Agentforce Readiness',
    description: 'Evaluates whether your org can reliably adopt Einstein AI, Agentforce agents, and prompt-based automation.',
    dimensions: [
      { name: 'Data & Metadata Quality',  inspects: 'Fields without descriptions, stale / undocumented objects', source: 'dataModelStats', signal: 'ratio' },
      { name: 'Automation Simplicity',    inspects: 'Legacy workflows, process builders, multi-trigger objects', source: 'automationSummary', signal: 'count' },
      { name: 'Security & Sharing',       inspects: 'Without-sharing Apex classes, broad permission sets', source: 'profileSummary', signal: 'count' },
      { name: 'Flow & API Readiness',     inspects: 'Entry-point flows, API-callable automation', source: 'automationSummary', signal: 'count' },
      { name: 'AI Feature Enablement',    inspects: 'Einstein / Agentforce feature licenses, installed packages', source: 'platformFeatures', signal: 'presence' },
      { name: 'Configuration Quality',    inspects: 'Apex test coverage %, technical debt indicators', source: 'testCoverage + technicalDebt', signal: 'ratio' },
    ],
  },
  {
    packId: 'data-cloud',
    icon: '☁️',
    name: 'Data Cloud Readiness',
    description: 'Assesses data quality, identity resolution, volume readiness, and governance for Salesforce Data Cloud ingestion.',
    dimensions: [
      { name: 'Identity Resolution',   inspects: 'Active duplicate rules and matching rules per object', source: 'DuplicateRule + MatchingRule collectors', signal: 'count' },
      { name: 'Data Model Quality',    inspects: 'Required field ratio, lookup vs master-detail relationships', source: 'dataModelStats', signal: 'ratio' },
      { name: 'Data Volume & Scale',   inspects: 'Record counts for LDV-candidate objects', source: 'objectRecordCounts', signal: 'count' },
      { name: 'Integration & External',inspects: 'Named credentials, connected external data sources', source: 'integrationSummary', signal: 'count' },
      { name: 'Data Governance',       inspects: 'Consent / privacy objects, sharing model configuration', source: 'dataModelSummary + profileSummary', signal: 'presence' },
    ],
  },
  {
    packId: 'hyperforce',
    icon: '⚡',
    name: 'Hyperforce Readiness',
    description: 'Checks migration readiness for Salesforce Hyperforce — domain config, secure endpoints, integrations, and legacy API usage.',
    dimensions: [
      { name: 'Domain Readiness',        inspects: 'My Domain enabled, enhanced domain status', source: 'orgExtendedDetails', signal: 'presence' },
      { name: 'Secure Endpoints',        inspects: 'Remote site settings with http:// (non-TLS) endpoints', source: 'RemoteProxy collector', signal: 'count' },
      { name: 'Integration Hardening',   inspects: 'Named credentials vs hardcoded URL issues found', source: 'integrationFindings + namedCredentialCount', signal: 'ratio' },
      { name: 'Authentication & Access', inspects: 'MFA posture signals from profiles and permission sets', source: 'profileSummary', signal: 'presence' },
      { name: 'Legacy & Compatibility',  inspects: 'Deprecated API usage, old API version callouts', source: 'technicalDebt', signal: 'count' },
    ],
  },
];

const DATA_SOURCES = [
  { src: 'dataModelStats',             desc: 'Object & field inventory from analysis pipeline' },
  { src: 'automationSummary',          desc: 'Flow, trigger, workflow, and process builder counts' },
  { src: 'profileSummary',             desc: 'Profile and permission set configuration' },
  { src: 'integrationSummary',         desc: 'Named credentials, connected apps, callout patterns' },
  { src: 'objectRecordCounts',         desc: 'Aggregate record counts for LDV detection' },
  { src: 'technicalDebt',              desc: 'Deprecated patterns, API version issues' },
  { src: 'testCoverage',               desc: 'Apex test coverage percentages' },
  { src: 'platformFeatures',           desc: 'Feature licenses derived from featureLicenses list' },
  { src: 'DuplicateRule / MatchingRule', desc: 'Active duplicate & matching rules (new lightweight collector)' },
  { src: 'RemoteProxy / Certificate',  desc: 'Remote site http:// endpoints and cert expiry (collector)' },
];

function AnalysisMethodology() {
  const [openPack, setOpenPack] = useState<string>('ai-agentforce');

  return (
    <div className="space-y-5">
      <GlassCard>
        <h2 className="text-sm font-semibold text-sf-text mb-2">How OrgPulse Computes Readiness</h2>
        <p className="text-xs text-sf-muted leading-relaxed">
          OrgPulse analyses your org's Salesforce metadata — never customer records — and runs deterministic checks
          against curated rules for each capability dimension. Scores are computed entirely by the extension engine;
          AI (when enabled) adds interpretive narrative only and never influences scores or grades.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {['Metadata Only', 'No PII Collected', 'Deterministic Scores', 'AI Narrative Only', 'No Customer Records'].map((pill) => (
            <span key={pill} className="px-2.5 py-0.5 rounded-full border border-sf-accent/40 bg-sf-accent/10 text-[11px] text-sf-accent font-medium">
              {pill}
            </span>
          ))}
        </div>
      </GlassCard>

      <GlassCard title="Data Sources Used">
        <div className="grid gap-2 sm:grid-cols-2">
          {DATA_SOURCES.map(({ src, desc }) => (
            <div key={src} className="rounded-lg bg-sf-bg-2 border border-sf-border/50 p-2.5">
              <p className="text-[11px] font-semibold text-sf-accent font-mono">{src}</p>
              <p className="text-[10px] text-sf-muted mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard title="Scoring Methodology">
        <div className="grid gap-3 sm:grid-cols-3 text-center">
          {[
            { icon: '⚖️', label: 'Weighted Dimensions', desc: 'Each dimension has a configurable weight. Pack score = weighted average of dimension scores.' },
            { icon: '🔒', label: 'Deterministic Engine', desc: 'Score thresholds: ≥80 Ready, ≥50 Partial, <50 Blocked. No AI involvement.' },
            { icon: '📊', label: 'Confidence Rating', desc: 'Higher confidence when more checks have data. N/A checks are excluded from averages.' },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="rounded-lg bg-sf-bg-2 border border-sf-border/50 p-3">
              <div className="text-2xl mb-1.5">{icon}</div>
              <p className="text-xs font-semibold text-sf-text mb-1">{label}</p>
              <p className="text-[10px] text-sf-muted leading-snug">{desc}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-sf-muted mb-2">Validated Dimensions by Pack</h3>
        <div className="space-y-2">
          {METHODOLOGY_PACKS.map((pack) => (
            <GlassCard key={pack.packId}>
              <button className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setOpenPack(openPack === pack.packId ? '' : pack.packId)}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{pack.icon}</span>
                  <div>
                    <h4 className="text-sm font-semibold text-sf-text">{pack.name}</h4>
                    <p className="text-[11px] text-sf-muted">{pack.description}</p>
                  </div>
                </div>
                <span className="text-sf-muted text-xs shrink-0">{openPack === pack.packId ? '▾' : '▸'}</span>
              </button>
              {openPack === pack.packId && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-sf-border/50">
                  <table className="w-full text-left">
                    <thead className="bg-white/[0.02]">
                      <tr>
                        {['Dimension', 'What Is Inspected', 'Data Source', 'Signal Type'].map((h) => (
                          <th key={h} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-sf-muted border-b border-sf-border/50">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pack.dimensions.map((dim, i) => (
                        <tr key={dim.name} className={i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'}>
                          <td className="px-3 py-2 text-xs font-medium text-sf-text whitespace-nowrap">{dim.name}</td>
                          <td className="px-3 py-2 text-[11px] text-sf-muted">{dim.inspects}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <code className="text-[10px] text-sf-accent bg-sf-accent/10 px-1.5 py-0.5 rounded">{dim.source}</code>
                          </td>
                          <td className="px-3 py-2"><span className="text-[10px] text-sf-muted capitalize">{dim.signal}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-base">🛡️</span>
          <span className="text-xs font-semibold text-green-400">Privacy Guarantee</span>
        </div>
        <p className="text-[11px] text-sf-muted leading-relaxed">
          OrgPulse never reads or transmits customer records, source code, SOQL queries, file paths, PII, or
          unmasked org IDs. All AI context is sanitized through a PII filter before leaving the extension.
          Scores are determined by the extension engine alone — AI enriches narrative only.
        </p>
      </div>
    </div>
  );
}

// ── Sub-tab pill ──────────────────────────────────────────────────────────────

type SubTab = 'overview' | 'methodology';

function SubTabBar({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  return (
    <div className="flex items-center gap-0">
      {([['overview', 'Overview'], ['methodology', 'How We Analyzed']] as [SubTab, string][]).map(([t, label]) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-1.5 text-xs font-medium transition-colors border-b-2 ${
            active === t ? 'border-sf-accent text-sf-text' : 'border-transparent text-sf-muted hover:text-sf-text'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FutureReadiness() {
  const results = useOrgStore((s) => s.results);
  const storeReport = useFutureReadinessStore((s) => s.report);
  const loading = useFutureReadinessStore((s) => s.loading);
  const error = useFutureReadinessStore((s) => s.error);
  const { postMessage } = useVSCode();

  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [showAllBlockers, setShowAllBlockers] = useState(false);
  const [showAllWins, setShowAllWins] = useState(false);

  const report: FutureReadinessReport | null = storeReport ?? results?.futureReadiness ?? null;

  const trendByPack = useMemo(() => {
    const map = new Map<string, ReadinessTrend>();
    for (const t of report?.historical ?? []) { map.set(t.packId, t); }
    return map;
  }, [report]);

  const allGaps: ReadinessGap[] = useMemo(
    () => (report?.packs ?? [])
      .flatMap((p) => p.blockingIssues)
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]),
    [report],
  );

  const allStrengths = useMemo(
    () => (report?.packs ?? []).flatMap((p) => p.strengths.map((s) => ({ text: s, pack: packShort(p.packName) }))),
    [report],
  );

  const allQuickWins = useMemo(
    () => (report?.packs ?? []).flatMap((p) => p.quickWins.map((q) => ({ ...q, packLabel: packShort(p.packName) }))),
    [report],
  );

  const allInitiatives = useMemo(
    () => (report?.packs ?? []).flatMap((p) => p.strategicInitiatives),
    [report],
  );

  const criticalCount = useMemo(() => allGaps.filter((g) => g.severity === 'Critical').length, [allGaps]);

  const hasNarrative = !!report?.narrative;
  const overallTrend = trendByPack.get('overall');

  const scrollToBlockers = () => document.getElementById('section-blockers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Empty state (still expose methodology tab)
  if (!report) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-0 px-5 pt-4 border-b border-sf-border">
          <SubTabBar active={subTab} onChange={setSubTab} />
        </div>
        {subTab === 'methodology' ? (
          <div className="p-6"><AnalysisMethodology /></div>
        ) : (
          <EmptyState
            icon="🔮"
            title="No Future Readiness assessment yet"
            description="Run a full org analysis to evaluate readiness for AI / Agentforce, Data Cloud, and Hyperforce."
            className="m-6"
          />
        )}
      </div>
    );
  }

  const visibleBlockers = showAllBlockers ? allGaps : allGaps.slice(0, 5);
  const visibleWins = showAllWins ? allQuickWins : allQuickWins.slice(0, 6);
  const showTrend = (report.historical?.length ?? 0) >= 2;

  const roadmapPhases = [
    { label: 'Stabilize', time: '0 – 30 Days', horizon: 'Now' as const, cls: 'text-sev-error', icon: '🛡️' },
    { label: 'Optimize',  time: '30 – 60 Days', horizon: 'Next' as const, cls: 'text-sev-warning', icon: '⚙️' },
    { label: 'Prepare',   time: '60 – 90 Days', horizon: 'Later' as const, cls: 'text-sf-accent', icon: '🧭' },
    { label: 'Transform', time: '90+ Days', horizon: null, cls: 'text-score-good', icon: '🚀' },
  ];

  const achievements = allInitiatives.length
    ? allInitiatives.slice(0, 5).map((i) => i.impact)
    : ['Higher AI accuracy and reliability', 'Clean, trusted data foundation', 'Faster, safer platform migrations', 'Lower risk and operational cost'];

  const ctaText = report.narrative?.executiveSummary
    ?? `Your organization is ${SCORE_STATUS(report.overall.score).toLowerCase()} for modernization. With focused improvements to the highest-impact gaps, you can confidently adopt AI/Agentforce, Data Cloud, and Hyperforce.`;

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-0 border-b border-sf-border">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-sf-text">Modernization Assessment</h1>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-[10px] font-bold text-purple-400 uppercase tracking-wide">AI</span>
            </div>
            <p className="text-xs text-sf-muted mt-0.5">Your readiness to adopt AI/Agentforce, Data Cloud, and Hyperforce.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" disabled title="Executive summary export coming soon">Download Summary</Button>
            <Button
              variant="primary"
              loading={loading}
              onClick={() => postMessage({ command: 'runFutureReadiness', model: 'auto', force: hasNarrative })}
            >
              {hasNarrative ? 'Regenerate AI Narrative' : 'Generate AI Narrative'}
            </Button>
          </div>
        </div>
        <SubTabBar active={subTab} onChange={setSubTab} />
      </div>

      {error && (
        <div className="mx-5 mt-3 text-xs text-sev-error bg-sev-error/10 border border-sev-error/30 rounded-lg p-2">{error}</div>
      )}

      {/* ── Methodology sub-tab ─────────────────────────────────────────────── */}
      {subTab === 'methodology' && (
        <div className="p-6"><AnalysisMethodology /></div>
      )}

      {/* ── Overview sub-tab ────────────────────────────────────────────────── */}
      {subTab === 'overview' && (
        <div className="p-6 space-y-5">

          {/* 1 — Executive Decision Summary */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
            <GlassCard>
              <SectionTitle n={1} title="Executive Decision Summary" hint="Can you start these initiatives today?" />
              <div className="grid gap-3 sm:grid-cols-3">
                {report.packs.map((p) => (
                  <DecisionCard key={p.packId} pack={p} onViewDetails={scrollToBlockers} />
                ))}
              </div>
            </GlassCard>
            <GlassCard className="flex flex-col items-center justify-center">
              <p className="text-[10px] font-semibold text-sf-muted uppercase tracking-wide mb-1 text-center">Overall Future Readiness</p>
              <SpeedoGauge score={report.overall.score} grade={report.overall.grade} size={190} />
              {overallTrend && (
                <p className={`text-[10px] mt-0.5 ${trendGlyph(overallTrend).cls}`}>{trendGlyph(overallTrend).text} vs previous scan</p>
              )}
              <div className="w-full mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sf-muted">Business Risk</span>
                  <span className={`font-semibold ${businessRisk(report.overall.score, criticalCount).cls}`}>
                    {businessRisk(report.overall.score, criticalCount).label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sf-muted">Confidence Level</span>
                  <span className="font-semibold text-sf-text tabular-nums">{confidencePct(report.packs)}%</span>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* 2 — Top Blockers */}
          <GlassCard>
            <div id="section-blockers" className="scroll-mt-4" />
            <SectionTitle n={2} title="Top Blockers" hint="What's holding you back" />
            {allGaps.length === 0 ? (
              <p className="text-xs text-sf-muted">No blocking issues detected. 🎉</p>
            ) : (
              <>
                <div className="space-y-0">
                  {visibleBlockers.map((gap, i) => {
                    const impact = impactFromSeverity(gap.severity);
                    return (
                      <div key={i} className="flex items-start gap-3 py-2.5 border-b border-sf-border/50 last:border-0">
                        <span className="text-base shrink-0 mt-0.5">🚧</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-sf-text leading-snug">{gap.title}</p>
                          <p className="text-[11px] text-sf-muted mt-0.5">{gap.whyItMatters}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[9px] text-sf-muted uppercase tracking-wide">Impact</p>
                          <Badge variant={impact.variant}>{impact.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {allGaps.length > 5 && (
                  <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAllBlockers((v) => !v)}>
                    {showAllBlockers ? '▴ Show fewer' : `View all ${allGaps.length} blockers →`}
                  </button>
                )}
              </>
            )}
          </GlassCard>

          {/* 3 — Business Impact if You Start Today */}
          <GlassCard>
            <SectionTitle n={3} title="Business Impact if You Start Today" />
            <div className="grid gap-3 sm:grid-cols-3">
              {report.packs.map((pack) => {
                const ready = pack.overallScore >= 80;
                const actionBody = pack.narrative?.businessImpact
                  ?? pack.blockingIssues[0]?.recommendation
                  ?? (ready
                    ? 'Foundations look strong. Proceed with a focused pilot.'
                    : 'Address the flagged gaps before rolling out to production.');
                return (
                  <div key={pack.packId} className="rounded-lg border border-sf-border/60 bg-white/[0.02] p-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{PACK_ICONS[pack.packId] ?? '📊'}</span>
                      <span className="text-xs font-semibold text-sf-text">{packShort(pack.packName)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {pack.dimensions.slice(0, 4).map((dim) => (
                        <div key={dim.dimension} className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-sf-muted truncate">{dim.dimension}</span>
                          <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: SCORE_COLOR(dim.score) }}>{dim.score}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-sf-border/50">
                      <span className="text-[10px] text-sf-muted">Expected Answer Quality</span>
                      <StarRating value={pack.maturityLevel} />
                    </div>
                    <div className={`rounded-md p-2 mt-auto ${ready ? 'bg-score-excellent/10 border border-score-excellent/25' : 'bg-sev-warning/10 border border-sev-warning/25'}`}>
                      <p className={`text-[10px] font-semibold mb-0.5 ${ready ? 'text-score-good' : 'text-sev-warning'}`}>
                        {ready ? 'Action Recommended' : 'Action Required'}
                      </p>
                      <p className="text-[10px] text-sf-muted leading-snug">{actionBody}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* 4 — Quick Wins */}
          <GlassCard>
            <SectionTitle n={4} title="Quick Wins" hint="High Impact, Low Effort" />
            {allQuickWins.length === 0 ? (
              <p className="text-xs text-sf-muted">No quick wins identified yet.</p>
            ) : (
              <>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {visibleWins.map((qw, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-lg border border-sf-border/50 bg-white/[0.02] p-2.5">
                      <span className="text-base shrink-0 mt-0.5">⚡</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-sf-text leading-snug">{qw.title}</p>
                        <p className="text-[10px] text-sf-muted mt-0.5">{qw.reason}</p>
                      </div>
                      <Badge variant={qw.priority === 'High' ? 'error' : qw.priority === 'Medium' ? 'warning' : 'info'}>
                        {qw.priority} Impact
                      </Badge>
                    </div>
                  ))}
                </div>
                {allQuickWins.length > 6 && (
                  <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAllWins((v) => !v)}>
                    {showAllWins ? '▴ Show fewer' : `View all ${allQuickWins.length} quick wins →`}
                  </button>
                )}
              </>
            )}
          </GlassCard>

          {/* 5 & 6 — Strengths + Gaps */}
          <div className="grid gap-5 sm:grid-cols-2">
            <GlassCard>
              <SectionTitle n={5} title="Top Strengths" />
              {allStrengths.length === 0 ? (
                <p className="text-xs text-sf-muted">No standout strengths recorded.</p>
              ) : (
                <ul className="space-y-1.5">
                  {allStrengths.slice(0, 5).map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-score-good shrink-0 mt-0.5">✓</span>
                      <span className="text-sf-text">{s.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
            <GlassCard>
              <SectionTitle n={6} title="Biggest Gaps" />
              {allGaps.length === 0 ? (
                <p className="text-xs text-sf-muted">No significant gaps found.</p>
              ) : (
                <ul className="space-y-1.5">
                  {allGaps.slice(0, 5).map((gap, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-sev-error shrink-0 mt-0.5">✗</span>
                      <span className="text-sf-text">{gap.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>

          {/* 7 — Recommended Roadmap */}
          <GlassCard>
            <SectionTitle n={7} title="Recommended Roadmap" />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
              <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
                {roadmapPhases.map((phase, i) => {
                  const found = report.roadmap.find((p: RoadmapPhase) => p.horizon === phase.horizon);
                  const items = phase.horizon
                    ? (found?.items ?? []).slice(0, 4).map((it) => it.title)
                    : allInitiatives.slice(0, 4).map((it) => it.title);
                  return (
                    <div key={phase.label} className="flex items-stretch gap-1.5 shrink-0">
                      <div className="rounded-lg border border-sf-border/50 bg-white/[0.02] p-3" style={{ minWidth: 150 }}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span>{phase.icon}</span>
                          <span className={`text-xs font-bold ${phase.cls}`}>{phase.label}</span>
                        </div>
                        <p className="text-[10px] text-sf-muted mb-2">{phase.time}</p>
                        {items.length > 0 ? (
                          <ul className="space-y-1">
                            {items.map((t, j) => (
                              <li key={j} className="text-[10px] text-sf-text leading-snug flex gap-1"><span className="text-sf-muted">•</span>{t}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-sf-muted/40 italic">Continuous improvement</p>
                        )}
                      </div>
                      {i < roadmapPhases.length - 1 && <span className="self-center text-sf-muted/40 text-base shrink-0">→</span>}
                    </div>
                  );
                })}
              </div>
              <div className="rounded-lg border border-sf-accent/25 bg-sf-accent/[0.06] p-3">
                <p className="text-xs font-semibold text-sf-accent mb-2">What You'll Achieve</p>
                <ul className="space-y-1.5">
                  {achievements.map((a, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-sf-text"><span className="text-score-good shrink-0 mt-0.5">↑</span>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          </GlassCard>

          {/* 8 — Readiness Trend Over Time */}
          {showTrend && (
            <GlassCard>
              <SectionTitle n={8} title="Readiness Trend Over Time" />
              <TrendChart historical={report.historical} packs={report.packs} />
            </GlassCard>
          )}

          {/* 9 — What Happens If I Take Action? */}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <GlassCard>
              <SectionTitle n={9} title="What Happens If I Take Action?" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-sev-error/25 bg-sev-error/[0.06] p-3">
                  <p className="text-xs font-semibold text-sev-error mb-2 flex items-center gap-1.5"><span>⚠️</span> If You Do Nothing</p>
                  <ul className="space-y-1.5">
                    {(allGaps.length ? allGaps.slice(0, 4).map((g) => g.whyItMatters)
                      : ['Modernization risk and cost keep rising over time.']).map((t, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-sf-text"><span className="text-sev-error shrink-0 mt-0.5">↓</span>{t}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-score-excellent/25 bg-score-excellent/[0.06] p-3">
                  <p className="text-xs font-semibold text-score-good mb-2 flex items-center gap-1.5"><span>✅</span> If You Take Action</p>
                  <ul className="space-y-1.5">
                    {(allQuickWins.length ? allQuickWins.slice(0, 4).map((q) => q.impact)
                      : ['Faster, lower-risk adoption of AI, Data Cloud, and Hyperforce.']).map((t, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-sf-text"><span className="text-score-good shrink-0 mt-0.5">↑</span>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </GlassCard>
            <div className="rounded-xl border border-sf-accent/30 bg-sf-accent/[0.07] p-4 flex flex-col">
              <div className="flex items-center gap-1.5 mb-2">
                <span>⭐</span>
                <span className="text-xs font-semibold text-sf-accent">CTA Recommendation</span>
              </div>
              <p className="text-[11px] text-sf-text leading-relaxed">{ctaText}</p>
              {allQuickWins[0] && (
                <div className="mt-3 pt-3 border-t border-sf-accent/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-sf-muted mb-0.5">Recommended Next Step</p>
                  <p className="text-[11px] text-sf-text">{allQuickWins[0].title}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <p className="text-[10px] text-sf-muted/40 text-right leading-snug">
            Generated {new Date(report.generatedAt).toLocaleString()}
            {report.modelUsed ? ` · narrative by ${report.modelUsed}` : ' · deterministic scores (no AI narrative)'}
          </p>
        </div>
      )}
    </div>
  );
}
