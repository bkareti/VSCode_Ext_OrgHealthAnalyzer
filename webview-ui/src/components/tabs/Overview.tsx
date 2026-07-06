import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RechartsTip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { useDashboardStore, useOrgStore, type TabId } from '@/store/dashboardStore';
import { useUIStore } from '@/store/slices/uiStore';
import GaugeChart from '@/components/charts/GaugeChart';
import CategoryScoreCard from '@/components/charts/CategoryScoreCard';
import DonutChart from '@/components/charts/DonutChart';
import GlassCard from '@/components/common/GlassCard';
import SeverityPill from '@/components/common/SeverityPill';
import EmptyState from '@/components/common/EmptyState';
import { scoreLabel, scoreHex, deltaText, deltaColorText } from '@/constants/scoring';
import type { Issue } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const toLabel = (slug: string) =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (ts: string) => {
  try { return new Date(ts).toLocaleDateString('en', { month: 'short', year: '2-digit' }); }
  catch { return ts; }
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

/** All six category cards in ONE hero row — no duplicate "Health by Area" section. */
const HERO_CATEGORIES: {
  key: string;
  trendKey: 'automationDesign' | 'security' | 'performance' | 'codeQuality' | null;
  label: string;
  icon: string;
  tabId: TabId;
}[] = [
  { key: 'automationDesign', trendKey: 'automationDesign', label: 'Architecture',    icon: '🏗️', tabId: 'cta'        },
  { key: 'codeQuality',      trendKey: 'codeQuality',      label: 'Code Quality',    icon: '💻', tabId: 'code'       },
  { key: 'security',         trendKey: 'security',         label: 'Security',        icon: '🛡️', tabId: 'secaccess'  },
  { key: 'performance',      trendKey: 'performance',      label: 'Performance',     icon: '🚀', tabId: 'perflimits' },
  { key: 'dataModel',        trendKey: null,               label: 'Data Model',      icon: '🗄️', tabId: 'datamodel'  },
  { key: 'governorLimits',   trendKey: null,               label: 'Governor Limits', icon: '📈', tabId: 'govlimits'  },
];

const FR_PACK_META: Record<string, { icon: string; label: string }> = {
  'ai-agentforce': { icon: '🤖', label: 'Agentforce / AI' },
  'data-cloud':    { icon: '☁️', label: 'Data Cloud'      },
  'hyperforce':    { icon: '🚀', label: 'Hyperforce'      },
};

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

  // Per-category trend sparklines (only for categories with trend history)
  const catTrends = useMemo(() => ({
    automationDesign: trends.map((t) => ({ value: t.automationDesign ?? t.overall })),
    security:         trends.map((t) => ({ value: t.security })),
    performance:      trends.map((t) => ({ value: t.performance })),
    codeQuality:      trends.map((t) => ({ value: t.codeQuality })),
  }), [trends]);

  const catDeltas = useMemo(() => {
    if (!prevPoint || !scores) return {} as Record<string, number>;
    const sc = scores as unknown as Record<string, number>;
    const result: Record<string, number> = {};
    for (const { key, trendKey } of HERO_CATEGORIES) {
      if (!trendKey) continue;
      const prev = (prevPoint as unknown as Record<string, number>)[trendKey] ?? prevPoint.overall;
      result[key] = Math.round((sc[key] ?? 0) - prev);
    }
    return result;
  }, [prevPoint, scores]);

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

  // Quick wins — real effort-tiered debt items, not info-severity issue groups
  const quickWins = useMemo(
    () => results?.debtSummary?.quickWins?.slice(0, 5) ?? [],
    [results],
  );

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

  // ── Key Insights — data-driven verdicts, never hardcoded alarm titles ─────
  const insightCards = useMemo(() => {
    if (!results) return [];
    const cards: { id: string; icon: string; title: string; description: string; tabId: TabId }[] = [];

    // Technical debt — severity from actual hours
    const debtHours = results.debtSummary?.totalHours;
    if (debtHours !== undefined) {
      const level = debtHours > 500 ? 'High' : debtHours > 200 ? 'Moderate' : 'Low';
      cards.push({
        id: 'tech-debt',
        icon: debtHours > 500 ? '🔴' : debtHours > 200 ? '🟡' : '🟢',
        title: `${level} Technical Debt`,
        description: `${debtHours} estimated hours across ${
          (results.debtSummary?.quickWins?.length ?? 0) +
          (results.debtSummary?.mediumItems?.length ?? 0) +
          (results.debtSummary?.largeItems?.length ?? 0)
        } items`,
        tabId: 'techdebt' as TabId,
      });
    }

    // Data model — field-limit pressure, a real scalability signal
    const hotObjects = (results.dataModelStats ?? []).filter((o) => (o.fieldLimitPct ?? 0) >= 70).length;
    const ldv        = (results.dataModelStats ?? []).filter((o) => (o.recordCount ?? 0) > 10_000_000).length;
    if (results.dataModelStats) {
      cards.push({
        id: 'data-scale',
        icon: hotObjects > 0 || ldv > 0 ? '⚠️' : '🟢',
        title: 'Data Scalability',
        description: `${ldv} LDV object${ldv === 1 ? '' : 's'} (>10M records) · ${hotObjects} object${hotObjects === 1 ? '' : 's'} above 70% field limit`,
        tabId: 'datamodel' as TabId,
      });
    }

    // Automation — deprecated tech + density
    const auto = results.automationSummary;
    if (auto) {
      const deprecated = (auto.totalProcessBuilders ?? 0) + (auto.totalWorkflowRules ?? 0);
      cards.push({
        id: 'automation',
        icon: deprecated > 0 ? '⚠️' : '🟢',
        title: deprecated > 0 ? 'Deprecated Automation' : 'Automation Health',
        description: deprecated > 0
          ? `${deprecated} Process Builder / Workflow Rule${deprecated === 1 ? '' : 's'} to migrate to Flow`
          : `${auto.totalFlows} flows, ${auto.totalTriggers} triggers — no deprecated automation`,
        tabId: 'automation' as TabId,
      });
    }

    // Future readiness — worst pack is the actionable one
    const frPacks = results.futureReadiness?.packs ?? [];
    const worstFr = [...frPacks].sort((a, b) => a.overallScore - b.overallScore)[0];
    if (worstFr) {
      cards.push({
        id: 'readiness',
        icon: FR_PACK_META[worstFr.packId]?.icon ?? '🔮',
        title: `${FR_PACK_META[worstFr.packId]?.label ?? worstFr.packName}: biggest gap`,
        description: `${Math.round(worstFr.overallScore)}% ready — lowest of ${frPacks.length} readiness packs`,
        tabId: 'futurereadiness' as TabId,
      });
    }

    return cards.slice(0, 4);
  }, [results]);

  // Future Readiness packs (compact sidebar card)
  const frPacks = useMemo(() => {
    const packs = results?.futureReadiness?.packs ?? [];
    return (['ai-agentforce', 'data-cloud', 'hyperforce'] as const)
      .map((id) => packs.find((p) => p.packId === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
  }, [results]);

  const frOverall = results?.futureReadiness?.overall?.score;

  // ── What changed since last scan (unique to Overview) ────────────────────
  const changeSummary = useMemo(() => {
    const orgId = results?.metadata?.orgId;
    const history = orgId ? (orgHistory[orgId] ?? []) : [];
    if (history.length < 2) return null;
    const sorted = [...history].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const curr = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    return {
      since: prev.timestamp,
      scoreDelta:   Math.round((curr.scores.overall ?? 0) - (prev.scores.overall ?? 0)),
      issueDelta:   curr.issueSummary.total - prev.issueSummary.total,
      errorDelta:   curr.issueSummary.error - prev.issueSummary.error,
      warningDelta: curr.issueSummary.warning - prev.issueSummary.warning,
    };
  }, [results, orgHistory]);

  // Severity donut
  const severityDonut = useMemo(() => {
    const s = results?.summary;
    if (!s) return [];
    return [
      { name: 'Critical', value: s.errorCount   ?? 0 },
      { name: 'Warning',  value: s.warningCount ?? 0 },
      { name: 'Info',     value: s.infoCount    ?? 0 },
    ].filter((d) => d.value > 0);
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
  const overall = sc['overall'] ?? 0;

  return (
    <div className="p-6 space-y-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-sf-text">Org Health Overview</h1>
          <p className="text-xs text-sf-muted mt-0.5">The 30-second briefing on {orgName}.</p>
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

          {/* Hero: gauge + all 6 category cards (single row — no duplicate section) */}
          <div className="flex gap-3 items-stretch flex-wrap 2xl:flex-nowrap">
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-sf-border bg-white/3 p-4 min-w-40 shrink-0">
              <GaugeChart
                score={overall}
                size={160}
                stroke={14}
                statusLabel={scoreLabel(overall)}
                delta={overallDelta}
              />
              <p className="text-[10px] font-semibold text-sf-muted uppercase tracking-wider mt-1">
                Org Health Score
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 min-w-0">
              {HERO_CATEGORIES.map(({ key, trendKey, label, icon, tabId }) => (
                <CategoryScoreCard
                  key={key}
                  label={label}
                  score={sc[key] ?? 0}
                  icon={icon}
                  delta={catDeltas[key]}
                  sparklineData={trendKey ? (catTrends as Record<string, { value: number }[]>)[trendKey] : undefined}
                  onClick={() => setActiveTab(tabId)}
                />
              ))}
            </div>
          </div>

          {/* ── Key Insights (data-driven) ──────────────────────────────────── */}
          {insightCards.length > 0 && (
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
          )}

          {/* ── Top Risks + Top Strengths + Findings by Severity ───────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

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
                  {topRisks.map(({ cat, sev, count }) => (
                    <li
                      key={cat}
                      className="flex items-center justify-between gap-2 text-xs py-1 border-b border-sf-border/30 last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sf-muted shrink-0">🔺</span>
                        <span className="text-sf-text truncate">{toLabel(cat)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-sf-muted tabular-nums">{count}</span>
                        <SeverityPill severity={sev} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No risk issues found" />
              )}
            </GlassCard>

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

            <GlassCard title="Findings by Severity">
              {severityDonut.length > 0
                ? <DonutChart data={severityDonut} height={180} />
                : <EmptyState title="No findings" />}
            </GlassCard>
          </div>

          {/* ── Health Trend + What Changed ─────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

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
                    <Line type="monotone" dataKey="overall"     name="Overall Health" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="security"    name="Security"       stroke="#22c55e" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="performance" name="Performance"    stroke="#f97316" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                    <Line type="monotone" dataKey="codeQuality" name="Code Quality"   stroke="#a855f7" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="Available after multiple scans" />
              )}
              <button
                type="button"
                onClick={() => setActiveTab('trendshistory')}
                className="text-[10px] text-sf-accent hover:underline mt-2 block"
              >
                View full scan history →
              </button>
            </GlassCard>

            {/* What changed since last scan — the one thing no child tab shows */}
            <GlassCard title="What Changed Since Last Scan">
              {changeSummary ? (
                <div className="space-y-3">
                  <p className="text-[10px] text-sf-muted">
                    Compared with scan on {new Date(changeSummary.since).toLocaleString()}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Overall Score', delta: changeSummary.scoreDelta,   invert: false },
                      { label: 'Total Issues',  delta: changeSummary.issueDelta,   invert: true  },
                      { label: 'Critical',      delta: changeSummary.errorDelta,   invert: true  },
                      { label: 'Warnings',      delta: changeSummary.warningDelta, invert: true  },
                    ].map(({ label, delta, invert }) => {
                      const effective = invert ? -delta : delta;
                      return (
                        <div key={label} className="p-3 rounded-lg bg-sf-bg-2 border border-sf-border">
                          <p className="text-[10px] text-sf-muted">{label}</p>
                          <p className={`text-lg font-bold tabular-nums ${deltaColorText(effective)}`}>
                            {deltaText(delta)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <EmptyState title="Run a second scan to see what changed" />
              )}
            </GlassCard>
          </div>

        </div>

        {/* ── RIGHT: sidebar ───────────────────────────────────────────────── */}
        <div className="w-64 xl:w-72 shrink-0 space-y-4">

          {/* Modernization snapshot (compact — full detail lives in Future Readiness) */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-sf-text">Modernization</h3>
              {frOverall !== undefined && (
                <span className="text-xs font-bold tabular-nums" style={{ color: scoreHex(frOverall) }}>
                  {Math.round(frOverall)}%
                </span>
              )}
            </div>
            {frPacks.length > 0 ? (
              <div className="space-y-2.5">
                {frPacks.map((pack) => {
                  const meta = FR_PACK_META[pack.packId] ?? { icon: '📦', label: pack.packName };
                  return (
                    <div key={pack.packId} className="flex items-center gap-2">
                      <span className="text-sm shrink-0">{meta.icon}</span>
                      <span className="text-[11px] text-sf-text flex-1 truncate">{meta.label}</span>
                      <div className="w-16 h-1.5 bg-sf-bg-3 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pack.overallScore}%`, background: scoreHex(pack.overallScore) }}
                        />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums w-8 text-right shrink-0" style={{ color: scoreHex(pack.overallScore) }}>
                        {Math.round(pack.overallScore)}%
                      </span>
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

          {/* Quick Wins — real effort-tiered debt items */}
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-sf-text">
                Quick Wins <span className="font-normal text-sf-muted">(&lt;1 hr each)</span>
              </h3>
            </div>
            {quickWins.length > 0 ? (
              <ul className="space-y-1.5">
                {quickWins.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-1.5 text-xs py-1 border-b border-sf-border/30 last:border-0"
                  >
                    <span className="text-sev-info shrink-0 mt-0.5">⚡</span>
                    <span className="text-sf-text text-[11px] leading-snug">{item.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No quick wins identified" />
            )}
            <button
              type="button"
              onClick={() => setActiveTab('techdebt')}
              className="text-[10px] text-sf-accent hover:underline mt-3 block"
            >
              Open Debt Payoff Plan →
            </button>
          </GlassCard>

        </div>
      </div>
    </div>
  );
}
