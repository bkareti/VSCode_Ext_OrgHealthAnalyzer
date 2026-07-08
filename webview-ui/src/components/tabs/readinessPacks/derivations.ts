/**
 * Pure derivation helpers for the per-pack Future Readiness views.
 * Every function here operates only on data already computed live by the
 * deterministic readiness engine (ReadinessSignal / ReadinessGap / ReadinessDimensionScore) —
 * nothing here fabricates a number that doesn't trace back to a real connector query.
 */
import type {
  ReadinessSignal,
  ReadinessStatus,
  GapSeverity,
  ReadinessGap,
  ReadinessPackAssessment,
  ArchitectRecommendationSection,
} from '@/types';
import { PACK_SUMMARY_TAIL } from './constants';

// ── Status → table badge ─────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ReadinessStatus, { label: string; variant: 'success' | 'error' | 'warning' | 'default' }> = {
  ready:   { label: 'Passed',  variant: 'success' },
  blocked: { label: 'Failed',  variant: 'error' },
  partial: { label: 'Warning', variant: 'warning' },
  na:      { label: 'Manual',  variant: 'default' },
};

// ── Impact / severity per signal ─────────────────────────────────────────────
// Mirrors gapAnalyzer.ts's severityFor(), extended to cover statuses gapAnalyzer
// never sees (it's only ever given blocked/partial signals).

export function impactFor(signal: ReadinessSignal): GapSeverity {
  if (signal.status === 'blocked') { return signal.score < 30 ? 'Critical' : 'High'; }
  if (signal.status === 'partial') { return signal.score < 60 ? 'Medium' : 'Low'; }
  if (signal.status === 'na') { return 'Medium'; } // unverified — worth checking, not dismissed as Low
  return 'Low'; // ready
}

export const IMPACT_TEXT_CLASS: Record<GapSeverity, string> = {
  Critical: 'text-sev-error',
  High: 'text-sev-error',
  Medium: 'text-sev-warning',
  Low: 'text-score-good',
};

// ── Effort-hours bucket (deterministic, not hand-authored per check) ─────────

const EFFORT_HOURS: Record<GapSeverity, number> = { Critical: 8, High: 6, Medium: 4, Low: 2 };

export function effortHoursFor(severity: GapSeverity): number {
  return EFFORT_HOURS[severity];
}

export function effortLabelFor(signal: ReadinessSignal): string {
  return signal.status === 'ready' ? '—' : `${effortHoursFor(impactFor(signal))} Hrs`;
}

// ── Per-pillar issue count ────────────────────────────────────────────────────

export function issueCountForDimension(pack: ReadinessPackAssessment, dimensionName: string): number {
  const signals = pack.signals ?? [];
  return signals.filter((s) => s.dimension === dimensionName && s.status !== 'ready').length;
}

const PILLAR_STATUS_TEXT: Record<ReadinessStatus, string> = {
  ready: 'Excellent',
  partial: 'Needs Attention',
  blocked: 'At Risk',
  na: 'Not Evaluated',
};

export function pillarStatusLabel(status: ReadinessStatus): string {
  return PILLAR_STATUS_TEXT[status];
}

export const PILLAR_STATUS_CLASS: Record<ReadinessStatus, string> = {
  ready: 'text-score-good',
  partial: 'text-sev-warning',
  blocked: 'text-sev-error',
  na: 'text-sf-muted',
};

// ── Roadmap tiers (grouped directly from pack.blockingIssues) ────────────────

const SEVERITY_ORDER: GapSeverity[] = ['Critical', 'High', 'Medium', 'Low'];

export function roadmapTiers(pack: ReadinessPackAssessment): { severity: GapSeverity; items: ReadinessGap[] }[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    items: pack.blockingIssues.filter((g) => g.severity === severity),
  }));
}

export function totalEffortHours(pack: ReadinessPackAssessment): number {
  return pack.blockingIssues.reduce((sum, g) => sum + effortHoursFor(g.severity), 0);
}

// ── Executive summary decision/risk labels ───────────────────────────────────

export function decisionLabel(score: number): string {
  if (score >= 80) { return 'Ready'; }
  if (score >= 60) { return 'Ready with Gaps'; }
  return 'Not Ready';
}

export function riskLabel(score: number): { label: string; cls: string } {
  if (score >= 80) { return { label: 'Low Risk', cls: 'text-score-good' }; }
  if (score >= 60) { return { label: 'Moderate Risk', cls: 'text-sev-warning' }; }
  return { label: 'High Risk', cls: 'text-sev-error' };
}

// ── KPI tile selection ───────────────────────────────────────────────────────
// Surfaces the highest-impact signals first — most concerning, most useful at a glance.

const IMPACT_WEIGHT: Record<GapSeverity, number> = { Critical: 3, High: 2, Medium: 1, Low: 0 };

export function kpiSignals(pack: ReadinessPackAssessment, n = 6): ReadinessSignal[] {
  const signals = pack.signals ?? [];
  return [...signals]
    .sort((a, b) => IMPACT_WEIGHT[impactFor(b)] - IMPACT_WEIGHT[impactFor(a)])
    .slice(0, n);
}

// ── Deterministic fallback for Architect Recommendations ─────────────────────
// Built entirely from already-computed real data (blockingIssues/quickWins/strategicInitiatives),
// grouped into the same section titles the AI narrative uses, so the two views look identical
// in structure whether or not AI has run yet.

export function buildFallbackSections(pack: ReadinessPackAssessment): ArchitectRecommendationSection[] {
  const sections: ArchitectRecommendationSection[] = [];

  if (pack.blockingIssues.length > 0) {
    sections.push({
      title: 'Immediate Risks',
      points: pack.blockingIssues.map((g) => ({
        text: `${g.title} — ${g.whyItMatters}`,
        priority: g.severity,
        evidence: g.evidence,
      })),
    });
  }

  if (pack.quickWins.length > 0) {
    sections.push({
      title: 'Quick Wins',
      points: pack.quickWins.map((q) => ({
        text: `${q.title} — ${q.impact}`,
        priority: q.priority,
        evidence: q.reason ? [q.reason] : undefined,
      })),
    });
  }

  if (pack.strategicInitiatives.length > 0) {
    sections.push({
      title: 'Strategic Recommendations',
      points: pack.strategicInitiatives.map((s) => ({
        text: `${s.title} (${s.timeline}) — ${s.impact}`,
        priority: 'Medium' as const,
      })),
    });
  }

  return sections;
}

/**
 * Deterministic, non-AI narrative summary sentence — used until (or unless) the AI
 * narrative has been generated for this pack. Built entirely from already-computed
 * live values (overallScore, blockingIssues), same as buildFallbackSections above.
 */
export function buildFallbackSummary(pack: ReadinessPackAssessment): string {
  const topBlockers = pack.blockingIssues.slice(0, 3);
  const headline = `Your organization has achieved a ${pack.overallScore}% ${pack.packName} score.`;
  const body = topBlockers.length > 0
    ? `The platform is technically capable, but ${topBlockers.length} prerequisite${topBlockers.length > 1 ? 's are' : ' is'} missing: ${topBlockers.map((b) => b.title).join(', ')}. These must be addressed ${PACK_SUMMARY_TAIL[pack.packId]}`
    : 'No blocking issues were found — this capability is ready to move forward with a focused pilot.';
  return `${headline} ${body}`;
}
