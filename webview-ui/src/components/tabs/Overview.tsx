import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { useDashboardStore, useOrgStore, type TabId } from '@/store/dashboardStore';
import { useUIStore } from '@/store/slices/uiStore';
import GaugeChart from '@/components/charts/GaugeChart';
import CategoryScoreCard from '@/components/charts/CategoryScoreCard';
import SparklineChart from '@/components/charts/SparklineChart';
import DonutChart from '@/components/charts/DonutChart';
import GlassCard from '@/components/common/GlassCard';
import SeverityPill from '@/components/common/SeverityPill';
import EmptyState from '@/components/common/EmptyState';
import type { Issue } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCORE_COLOR = (s: number) =>
  s >= 90 ? '#22c55e' : s >= 75 ? '#84cc16' : s >= 50 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';

const STATUS_LABEL = (s: number) =>
  s >= 90 ? 'Excellent' : s >= 75 ? 'Good' : s >= 50 ? 'Moderate Health' : s >= 25 ? 'Needs Attention' : 'Critical';

const toLabel = (slug: string) =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (ts: string) => {
  try { return new Date(ts).toLocaleDateString('en', { month: 'short', year: '2-digit' }); }
  catch { return ts; }
};

const fmtRelTime = (ts: string | Date) => {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(diff / 86_400_000);
    if (h < 1) return 'Just now';
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  } catch { return ''; }
};

function groupByCategory(list: Issue[]): { cat: string; count: number }[] {
  const map = new Map<string, number>();
  for (const issue of list) {
    map.set(issue.category, (map.get(issue.category) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([cat, count]) => ({ cat, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HERO_CATEGORIES: { key: string; trendKey: 'automationDesign' | 'security' | 'performance' | 'codeQuality'; label: string; icon: string; tabId: TabId }[] = [
  { key: 'automationDesign', trendKey: 'automationDesign', label: 'Architecture',  icon: '🏗️', tabId: 'cta'        },
  { key: 'security',         trendKey: 'security',         label: 'Security',      icon: '🛡️', tabId: 'secaccess' },
  { key: 'performance',      trendKey: 'performance',      label: 'Performance',   icon: '🚀', tabId: 'perflimits' },
  { key: 'codeQuality',      trendKey: 'codeQuality',      label: 'Code Quality',  icon: '💻', tabId: 'code'       },
];

const AREA_CATEGORIES: { key: string; label: string; icon: string; tabId: TabId }[] = [
  { key: 'automationDesign', label: 'Architecture',   icon: '🏗️', tabId: 'cta'        },
  { key: 'codeQuality',      label: 'Code Quality',   icon: '💻', tabId: 'code'       },
  { key: 'security',         label: 'Security',       icon: '🛡️', tabId: 'secaccess'  },
  { key: 'performance',      label: 'Performance',    icon: '🚀', tabId: 'perflimits' },
  { key: 'dataModel',        label: 'Data Model',     icon: '🗄️', tabId: 'datamodel'  },
  { key: 'governorLimits',   label: 'Governor Limits',icon: '📈', tabId: 'govlimits'  },
];

const ORG_METRICS: { icon: string; label: string; key: string }[] = [
  { icon: '📦', label: 'Custom Objects',  key: 'customObjects'  },
  { icon: '📋', label: 'Custom Fields',   key: 'customFields'   },
  { icon: '⚙️', label: 'Apex Classes',    key: 'apexClasses'    },
  { icon: '⚡', label: 'Triggers',        key: 'triggers'       },
  { icon: '🔄', label: 'Flows',           key: 'flows'          },
  { icon: '👥', label: 'Users',           key: 'users'          },
  { icon: '🔑', label: 'Profiles',        key: 'profiles'       },
  { icon: '🛡️', label: 'Permission Sets', key: 'permissionSets' },
  { icon: '📥', label: 'Queues',          key: 'queues'         },
  { icon: '✅', label: 'Validation Rules',key: 'validationRules'},
];

const FR_PACK_META: Record<string, { icon: string; label: string }> = {
  'ai-agentforce': { icon: '🤖', label: 'Agentforce / AI' },
  'data-cloud':    { icon: '☁️', label: 'Data Cloud'      },
  'hyperforce':    { icon: '🚀', label: 'Hyperforce'      },
};

const FR_STATUS = (s: number) =>
  s >= 80 ? { label: 'Ready',              color: '#22c55e' } :
  s >= 60 ? { label: 'Moderately Ready',   color: '#eab308' } :
            { label: 'Needs Preparation',  color: '#f97316' };

const ROADMAP_PHASES = [
  { horizon: 'Now',  title: 'Stabilize',  period: '0 – 30 Days'  },
  { horizon: 'Next', title: 'Optimize',   period: '30 – 60 Days' },
  { horizon: 'Later',title: 'Prepare',    period: '60 – 90 Days' },
];

const IMPACT_LABEL = (sev: 'error' | 'warning' | 'info') =>
  sev === 'error' ? 'High' : sev === 'warning' ? 'Medium' : 'Low';

// ── Component ─────────────────────────────────────────────────────────────────

export default function Overview() {
  const results               = useDashboardStore((s) => s.results);
  const setActiveTab          = useDashboardStore((s) => s.setActiveTab);
  const orgHistory            = useOrgStore((s) => s.orgHistory);
  const setShowAnalysisDialog = useUIStore((s) => s.setShowAnalysisDialog);

  // ── All useMemo hooks BEFORE early return ────────────────────────────────
  const issues = useMemo(() => results?.issues ?? [], [results]);
  const trends = useMemo(() => results?.trends  ?? [], [results]);
  const scores = useMemo(() => results?.scores,        [results]);

  // Org name for welcome header
  const orgName = useMemo(
    () => results?.metadata?.orgAlias ?? results?.orgDetails?.orgName ?? 'Your Org',
    [results],
  );

  // Previous scores for delta computation (second-to-last trend point)
  const prevPoint = useMemo(
    () => (trends.length >= 2 ? trends[trends.length - 2] : null),
    [trends],
  );

  const overallDelta = useMemo(
    () => (prevPoint && scores ? Math.round((scores.overall ?? 0) - prevPoint.overall) : undefined),
    [prevPoint, scores],
  );

  // Per-category trend sparklines
  const catTrends = useMemo(() => ({
    automationDesign: trends.map((t) => ({ value: t.automationDesign ?? t.overall })),
    security:         trends.map((t) => ({ value: t.security })),
    performance:      trends.map((t) => ({ value: t.performance })),
    codeQuality:      trends.map((t) => ({ value: t.codeQuality })),
  }), [trends]);

  // Per-category deltas from previous trend point
  const catDeltas = useMemo(() => {
    if (!prevPoint || !scores) return {} as Record<string, number>;
    const sc = scores as unknown as Record<string, number>;
    const result: Record<string, number> = {};
    for (const { key, trendKey } of HERO_CATEGORIES) {
      const prev = (prevPoint as unknown as Record<string, number>)[trendKey] ?? prevPoint.overall;
      result[key] = Math.round((sc[key] ?? 0) - prev);
    }
    return result;
  }, [prevPoint, scores]);

  // Code Analyzer and core architecture categories — excludes meta-categories like
  // 'testing' (coverage metrics) and 'cta-review' (architectural narratives) so
  // the list surfaces actual code violation categories from Code Analyzer output.
  const CA_CATEGORIES = new Set([
    'code-quality', 'security', 'performance', 'lwc-quality',
    'technical-debt', 'automation-design', 'data-model', 'integration',
    'governor-limits', 'dependencies', 'user-governance', 'profile-security',
  ]);

  // Top risks
  const topRisks = useMemo(() => {
    const relevant   = issues.filter((i) => CA_CATEGORIES.has(i.category));
    const errGroups  = groupByCategory(relevant.filter((i) => i.severity === 'error'));
    const warnGroups = groupByCategory(relevant.filter((i) => i.severity === 'warning'));
    const seen = new Set(errGroups.map((g) => g.cat));
    return [
      ...errGroups.map((g) => ({ ...g, sev: 'error'   as const })),
      ...warnGroups.filter((g) => !seen.has(g.cat)).map((g) => ({ ...g, sev: 'warning' as const })),
    ].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [issues]);

  // Quick wins
  const quickWins = useMemo(() =>
    groupByCategory(issues.filter((i) => i.severity === 'info')).slice(0, 5),
  [issues]);

  // Strengths derived from scores
  const strengths = useMemo(() => {
    if (!scores) return [] as string[];
    const list: string[] = [];
    if ((scores.security        ?? 0) >= 75) list.push('Strong security model with least privilege access');
    if ((scores.codeQuality     ?? 0) >= 75) list.push('Low custom code complexity');
    if ((results?.testCoverageSummary?.averageCoverage ?? 0) >= 70) list.push('Good test coverage and deployment practices');
    if ((scores.automationDesign ?? 0) >= 75) list.push('Well-structured automation and flow design');
    if ((scores.dataModel        ?? 0) >= 75) list.push('Clean, well-structured data model');
    if ((scores.integration      ?? 0) >= 75) list.push('Robust integration architecture');
    if ((scores.testing          ?? 0) >= 75) list.push('Comprehensive test suite with high coverage');
    return list.slice(0, 5);
  }, [scores, results]);

  // Key Insights cards (4)
  const insightCards = useMemo(() => {
    if (!results) return [];
    const automationIssues = issues.filter((i) => i.category === 'automation-design').length;
    const totalFlows = results.automationSummary?.totalFlows ?? 0;
    const frPacks = results.futureReadiness?.packs ?? [];
    const bestFr = [...frPacks].sort((a, b) => b.overallScore - a.overallScore)[0];

    return [
      {
        id: 'tech-debt',
        icon: '🔴',
        title: 'High Technical Debt',
        description: `${issues.length} issues found across code & configuration`,
        tabId: 'code' as TabId,
      },
      {
        id: 'data-quality',
        icon: '📊',
        title: 'Data Quality Risk',
        description: results.dataModelStats
          ? `${results.dataModelStats.length} objects analyzed — review field completeness and naming`
          : 'Run a full scan to assess data model quality',
        tabId: 'datamodel' as TabId,
      },
      {
        id: 'automation',
        icon: '⚠️',
        title: 'Automation Overlap',
        description: totalFlows > 0
          ? `${totalFlows} flows active — ${automationIssues} have overlapping or complex criteria`
          : 'Run a full scan to analyze automation',
        tabId: 'perflimits' as TabId,
      },
      {
        id: 'readiness',
        icon: '🚀',
        title: bestFr ? `${FR_PACK_META[bestFr.packId]?.label ?? 'Future'} Ready` : 'Future Readiness',
        description: bestFr
          ? `${bestFr.overallScore}% ready — ${FR_STATUS(bestFr.overallScore).label}`
          : 'Run a full scan to assess readiness',
        tabId: 'futurereadiness' as TabId,
      },
    ];
  }, [results, issues]);

  // Future Readiness packs (sidebar)
  const frPacks = useMemo(() => {
    const packs = results?.futureReadiness?.packs ?? [];
    return (['ai-agentforce', 'data-cloud', 'hyperforce'] as const)
      .map((id) => packs.find((p) => p.packId === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }, [results]);

  // Readiness roadmap (using futureReadiness.roadmap if available, else derive from issues)
  const roadmapPhases = useMemo(() => {
    const fr = results?.futureReadiness?.roadmap ?? [];
    return ROADMAP_PHASES.map((phase) => {
      const frPhase = fr.find((r) => r.horizon === phase.horizon);
      let bullets: string[];
      if (frPhase && frPhase.items.length > 0) {
        bullets = frPhase.items.slice(0, 3).map((item) => item.title);
      } else {
        // Derive from top issues per phase horizon
        if (phase.horizon === 'Now') {
          bullets = topRisks.slice(0, 3).map((r) => `Fix ${toLabel(r.cat)} issues`);
        } else if (phase.horizon === 'Next') {
          bullets = quickWins.slice(0, 3).map((w) => `Improve ${toLabel(w.cat)}`);
        } else {
          bullets = ['Prepare for Data Cloud migration', 'Integration cleanup', 'Documentation'];
        }
      }
      return { ...phase, bullets: bullets.length > 0 ? bullets : ['No actions identified'] };
    });
  }, [results, topRisks, quickWins]);

  // Recent scans (prefer org history, fall back to trend points)
  const recentScans = useMemo(() => {
    const orgId = results?.metadata?.orgId;
    const history = orgId ? (orgHistory[orgId] ?? []) : [];
    if (history.length > 0) {
      return [...history]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 4)
        .map((h, i, arr) => ({
          timestamp: h.timestamp,
          score: h.scores.overall ?? 0,
          delta: i < arr.length - 1
            ? Math.round((h.scores.overall ?? 0) - (arr[i + 1]?.scores.overall ?? 0))
            : undefined,
        }));
    }
    return [...trends]
      .reverse()
      .slice(0, 4)
      .map((t, i, arr) => ({
        timestamp: t.timestamp,
        score: t.overall,
        delta: i < arr.length - 1 ? Math.round(t.overall - arr[i + 1].overall) : undefined,
      }));
  }, [results, orgHistory, trends]);

  // Severity + category donuts (preserved for Health by Area)
  const severityDonut = useMemo(() => {
    const s = results?.summary;
    if (!s) return [];
    return [
      { name: 'Critical', value: s.errorCount   ?? 0 },
      { name: 'High',     value: s.warningCount  ?? 0 },
      { name: 'Low',      value: s.infoCount     ?? 0 },
    ].filter((d) => d.value > 0);
  }, [results]);

  // Org metrics — real data sources, no hardcoded '—'
  const orgMetricValues = useMemo((): Record<string, string | number> => {
    const qf = results?.orgInfoData?.quickFacts;
    const us = results?.userSummary;
    const ps = results?.profileSummary;

    const resolve = (
      primary: number | null | undefined,
      ...fallbacks: (number | null | undefined)[]
    ): string | number => {
      if (primary !== undefined && primary !== null) return primary;
      for (const fb of fallbacks) {
        if (fb !== undefined && fb !== null) return fb;
      }
      return '—';
    };

    return {
      customObjects:   results?.dataModelSummary?.customObjectCount ?? results?.dataModelStats?.length ?? 0,
      customFields:    results?.dataModelStats?.reduce((s, o) => s + (o.customFields ?? 0), 0) ?? 0,
      apexClasses:     results?.codeInventory?.apexClasses   ?? 0,
      triggers:        results?.codeInventory?.apexTriggers  ?? 0,
      flows:           results?.automationSummary?.totalFlows ?? 0,
      users:           resolve(qf?.users,         us?.totalActiveUsers),
      profiles:        resolve(qf?.profiles,      ps?.totalProfiles),
      permissionSets:  resolve(qf?.permissionSets, ps?.permissionSetList?.length),
      queues:          resolve(qf?.queues),
      validationRules: results?.automationSummary?.totalValidationRules ?? 0,
    };
  }, [results]);

  // ── Early return when no data ────────────────────────────────────────────
  if (!results) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 p-8 text-center">
        <div className="text-5xl">📊</div>
        <div>
          <h2 className="text-sm font-semibold text-sf-text mb-1">No analysis data yet</h2>
          <p className="text-xs text-sf-muted">Run an analysis to see your org health dashboard.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAnalysisDialog(true)}
          className="px-5 py-2 text-sm rounded-lg bg-sf-accent text-white hover:opacity-90 transition-opacity"
        >
          Run Analysis
        </button>
      </div>
    );
  }

  const sc = scores as unknown as Record<string, number>;
  const overall     = sc['overall'] ?? 0;

  return (
    <div className="p-4 space-y-4">

      {/* ── Welcome Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-sm font-semibold text-sf-text">Welcome back, Architect!</h1>
          <p className="text-[11px] text-sf-muted mt-0.5">Here's the health of your Salesforce org at a glance.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-sf-text border border-sf-border rounded-lg px-3 py-1.5 bg-white/3">
            🏢 {orgName}
          </span>
          <button
            type="button"
            onClick={() => setShowAnalysisDialog(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold rounded-lg bg-sf-accent text-white hover:opacity-90 transition-opacity"
          >
            ⚡ Run New Scan
          </button>
        </div>
      </div>

      {/* ── Main body: left content + right sidebar ──────────────────────────── */}
      <div className="flex gap-4 items-start">

        {/* ── LEFT: main content column ────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── Hero Row: Gauge + 4 Category Cards ──────────────────────────── */}
          <div className="flex gap-3 items-stretch flex-wrap xl:flex-nowrap">

            {/* Overall Health Gauge */}
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-sf-border bg-white/3 p-4 min-w-40 shrink-0">
              <GaugeChart
                score={overall}
                size={160}
                stroke={14}
                statusLabel={STATUS_LABEL(overall)}
                delta={overallDelta}
              />
              <p className="text-[10px] font-semibold text-sf-muted uppercase tracking-wider mt-1">
                Org Health Score
              </p>
            </div>

            {/* 4 Category Score Cards */}
            {HERO_CATEGORIES.map(({ key, trendKey, label, icon, tabId }) => {
              const catScore = sc[key] ?? 0;
              return (
                <CategoryScoreCard
                  key={key}
                  label={label}
                  score={catScore}
                  icon={icon}
                  delta={catDeltas[key]}
                  sparklineData={catTrends[trendKey]}
                  onClick={() => setActiveTab(tabId)}
                />
              );
            })}
          </div>

          {/* ── Key Insights ────────────────────────────────────────────────── */}
          <div>
            <h3 className="text-xs font-semibold text-sf-text mb-2">Key Insights</h3>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {insightCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-sf-border bg-white/3 p-3 flex flex-col gap-1.5"
                >
                  <span className="text-lg">{card.icon}</span>
                  <p className="text-[11px] font-semibold text-sf-text leading-tight">{card.title}</p>
                  <p className="text-[10px] text-sf-muted leading-snug flex-1">{card.description}</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab(card.tabId)}
                    className="text-[10px] text-sf-accent hover:underline text-left"
                  >
                    View details →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Top Risks + Top Strengths + Findings by Severity ───────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Top Risks */}
            <GlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-sf-text">Top Risks</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className="text-[10px] text-sf-accent hover:underline"
                >
                  View all risks →
                </button>
              </div>
              {topRisks.length > 0 ? (
                <ul className="space-y-1.5">
                  {topRisks.map(({ cat, sev }) => (
                    <li
                      key={cat}
                      className="flex items-center justify-between gap-2 text-xs py-1 border-b border-sf-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sf-muted shrink-0">🔺</span>
                        <span className="text-sf-text truncate">{toLabel(cat)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <SeverityPill severity={sev} />
                        <span className="text-[10px] text-sf-muted">Impact: {IMPACT_LABEL(sev)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No risk issues found" />
              )}
            </GlassCard>

            {/* Top Strengths */}
            <GlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-sf-text">Top Strengths</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('cta')}
                  className="text-[10px] text-sf-accent hover:underline"
                >
                  View all strengths →
                </button>
              </div>
              {strengths.length > 0 ? (
                <ul className="space-y-1.5">
                  {strengths.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-xs py-1 border-b border-sf-border/30 last:border-0">
                      <span className="text-score-good shrink-0">✓</span>
                      <span className="text-sf-text">{s}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Run a full scan to see strengths" />
              )}
            </GlassCard>

            {/* Findings by Severity */}
            <GlassCard title="Findings by Severity">
              {severityDonut.length > 0
                ? <DonutChart data={severityDonut} height={180} />
                : <EmptyState title="No findings" />}
            </GlassCard>
          </div>

          {/* ── Health Trend + Readiness Roadmap ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Health Trend Over Time */}
            <GlassCard title="Health Trend Over Time">
              {trends.length >= 2 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trends} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={fmtDate}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <RechartsTip
                      contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 10 }}
                      itemStyle={{ color: '#cccccc' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="overall"          name="Overall Health" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="security"         name="Security"       stroke="#22c55e" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="performance"      name="Performance"    stroke="#f97316" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="codeQuality"      name="Code Quality"   stroke="#a855f7" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="Available after multiple scans" />
              )}
            </GlassCard>

            {/* Readiness Roadmap */}
            <GlassCard title="Readiness Roadmap">
              <div className="flex gap-2 h-full">
                {roadmapPhases.map((phase, idx) => (
                  <div key={phase.horizon} className="flex-1 flex flex-col gap-1 relative">
                    {/* Connector arrow */}
                    {idx < roadmapPhases.length - 1 && (
                      <div className="absolute -right-1.5 top-4 text-sf-muted text-[10px] z-10">→</div>
                    )}
                    <div className="rounded-lg border border-sf-border bg-white/2 p-2.5 flex flex-col gap-1.5 flex-1">
                      <div className="text-center">
                        <p className="text-[11px] font-semibold text-sf-text">{phase.title}</p>
                        <p className="text-[9px] text-sf-muted">{phase.period}</p>
                      </div>
                      <ul className="space-y-1 mt-1">
                        {phase.bullets.map((b) => (
                          <li key={b} className="text-[9px] text-sf-muted flex gap-1">
                            <span className="text-sf-accent shrink-0">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* ── Health by Area (preserved) ──────────────────────────────────── */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-sf-text">Health by Area</h3>
              <span className="text-[10px] text-sf-muted border border-sf-border rounded px-2 py-0.5">Last 6 Scans</span>
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
              {AREA_CATEGORIES.map(({ key, label, icon, tabId }) => {
                const score = sc[key] ?? overall;
                return (
                  <CategoryScoreCard
                    key={key}
                    label={label}
                    score={score}
                    icon={icon}
                    onClick={() => setActiveTab(tabId)}
                  />
                );
              })}
            </div>
            {trends.length >= 2 ? (
              <SparklineChart data={trends.map((t) => ({ value: t.overall }))} color={SCORE_COLOR(overall)} height={60} showDots />
            ) : (
              <div className="h-8 flex items-center justify-center">
                <span className="text-[10px] text-sf-muted">Trend available after multiple scans</span>
              </div>
            )}
          </GlassCard>


          {/* ── Key Org Metrics ──────────────────────────────────────────────── */}
          <GlassCard title="Key Org Metrics">
            <div className="grid grid-cols-5 xl:grid-cols-10 gap-3">
              {ORG_METRICS.map(({ icon, label, key }) => (
                <div key={key} className="flex flex-col items-center gap-1 text-center">
                  <span className="text-base">{icon}</span>
                  <span className="text-sm font-bold tabular-nums text-sf-text">{orgMetricValues[key]}</span>
                  <span className="text-[10px] text-sf-muted leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </GlassCard>

        </div>

        {/* ── RIGHT: sidebar ───────────────────────────────────────────────── */}
        <div className="w-64 xl:w-72 shrink-0 space-y-4">

          {/* Future Readiness Snapshot */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-sf-text">Future Readiness Snapshot</h3>
            </div>
            {frPacks.length > 0 ? (
              <div className="space-y-3">
                {frPacks.map((pack) => {
                  const meta   = FR_PACK_META[pack.packId] ?? { icon: '📦', label: pack.packName };
                  const status = FR_STATUS(pack.overallScore);
                  return (
                    <div key={pack.packId}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{meta.icon}</span>
                        <span className="text-[11px] text-sf-text font-medium flex-1">{meta.label}</span>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: status.color }}>
                          {Math.round(pack.overallScore)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-sf-bg-3 rounded-full overflow-hidden mb-0.5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pack.overallScore}%`,
                            background: status.color,
                            transition: 'width 0.8s ease',
                          }}
                        />
                      </div>
                      <p className="text-[10px]" style={{ color: status.color }}>{status.label}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="Run a full scan to see readiness" />
            )}
            <button
              type="button"
              onClick={() => setActiveTab('futurereadiness')}
              className="text-[10px] text-sf-accent hover:underline mt-3 block"
            >
              Open Modernization Assessment →
            </button>
          </GlassCard>

          {/* Quick Wins (Next 30 Days) */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-sf-text">
                Quick Wins <span className="font-normal text-sf-muted">(Next 30 Days)</span>
              </h3>
            </div>
            {quickWins.length > 0 ? (
              <ul className="space-y-1.5">
                {quickWins.map(({ cat }) => (
                  <li
                    key={cat}
                    className="flex items-center justify-between gap-2 text-xs py-1 border-b border-sf-border/30 last:border-0"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sev-info shrink-0">⚡</span>
                      <span className="text-sf-text truncate text-[11px]">{toLabel(cat)}</span>
                    </div>
                    <SeverityPill severity="info" />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No quick wins identified" />
            )}
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className="text-[10px] text-sf-accent hover:underline mt-3 block"
            >
              View all quick wins →
            </button>
          </GlassCard>

          {/* Recent Scans */}
          <GlassCard title="Recent Scans">
            {recentScans.length > 0 ? (
              <>
                <ul className="space-y-2">
                  {recentScans.map((scan, i) => {
                    const col   = SCORE_COLOR(scan.score);
                    const dCol  = scan.delta === undefined ? ''
                      : scan.delta > 0 ? '#22c55e' : scan.delta < 0 ? '#ef4444' : '#6b7280';
                    return (
                      <li key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-sf-border/30 last:border-0">
                        <div className="min-w-0">
                          <p className="text-[11px] text-sf-text">{fmtRelTime(scan.timestamp)}</p>
                          <p className="text-[10px] text-sf-muted truncate">
                            {new Date(scan.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-bold tabular-nums" style={{ color: col }}>
                            {Math.round(scan.score)}/100
                          </span>
                          {scan.delta !== undefined && (
                            <span className="text-[10px] tabular-nums" style={{ color: dCol }}>
                              {scan.delta > 0 ? '↑' : '↓'} {Math.abs(scan.delta)}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={() => setActiveTab('trendshistory')}
                  className="text-[10px] text-sf-accent hover:underline mt-3 block"
                >
                  View all scans →
                </button>
              </>
            ) : (
              <EmptyState title="No scan history yet" />
            )}
          </GlassCard>

        </div>
      </div>
    </div>
  );
}
