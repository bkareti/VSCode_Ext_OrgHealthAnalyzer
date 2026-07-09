/**
 * Agentforce-Readiness-only derivation helpers for the redesigned Overview.
 * Everything here operates on the same real `ReadinessPackAssessment` data the
 * generic pack view uses (see ../derivations.ts) — nothing here fabricates a
 * number that doesn't trace back to a real check, except where explicitly
 * marked as an estimate/sample.
 */
import type {
  ReadinessPackAssessment,
  ReadinessDimensionScore,
  ReadinessSignal,
  RoadmapPhase,
  RoadmapItem,
  GapSeverity,
  FutureReadinessReport,
} from '@/types';

// ── Capability display relabeling ────────────────────────────────────────────
// The mockup's "Capability Area" names don't match the engine's real dimension
// strings 1:1 — relabel for display only, keep the underlying real dimension.

export const CAPABILITY_LABELS: Record<string, string> = {
  'Data & Metadata Quality': 'Data Readiness',
  'AI Feature Enablement': 'Platform & Licensing',
  'Security & Sharing': 'Security & Governance',
  'Automation Simplicity': 'Automation & Orchestration',
  'Flow & API Readiness': 'Integration Readiness',
  'AI Configuration': 'User Adoption & Skills',
  'Configuration Quality': 'Observability & Monitoring',
};

export const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  'Data & Metadata Quality': 'Fields without descriptions, stale / undocumented objects',
  'AI Feature Enablement': 'Einstein / Agentforce feature licenses, installed packages',
  'Security & Sharing': 'Without-sharing Apex classes, broad permission sets',
  'Automation Simplicity': 'Legacy workflows, process builders, multi-trigger objects',
  'Flow & API Readiness': 'Entry-point flows, API-callable automation',
  'AI Configuration': 'Prompt Templates, Knowledge grounding, Einstein Trust Layer setup',
  'Configuration Quality': 'Apex test coverage %, technical debt indicators',
};

export interface CapabilityRow extends ReadinessDimensionScore {
  displayLabel: string;
  description: string;
}

export function capabilityRows(pack: ReadinessPackAssessment): CapabilityRow[] {
  return pack.dimensions.map((d) => ({
    ...d,
    displayLabel: CAPABILITY_LABELS[d.dimension] ?? d.dimension,
    description: CAPABILITY_DESCRIPTIONS[d.dimension] ?? d.reason,
  }));
}

export function findDimension(pack: ReadinessPackAssessment, name: string): ReadinessDimensionScore | undefined {
  return pack.dimensions.find((d) => d.dimension === name);
}

function weightedBlend(a?: ReadinessDimensionScore, b?: ReadinessDimensionScore): number {
  if (!a && !b) { return 0; }
  if (!a) { return Math.round(b!.score); }
  if (!b) { return Math.round(a.score); }
  const totalWeight = a.weight + b.weight;
  return Math.round((a.score * a.weight + b.score * b.weight) / totalWeight);
}

/** "Platform Readiness" = AI Feature Enablement + AI Configuration, weighted by each dimension's own weight. */
export function platformReadinessScore(pack: ReadinessPackAssessment): number {
  return weightedBlend(findDimension(pack, 'AI Feature Enablement'), findDimension(pack, 'AI Configuration'));
}

/** "Automation Readiness" = Automation Simplicity + Flow & API Readiness, weighted by each dimension's own weight. */
export function automationReadinessScore(pack: ReadinessPackAssessment): number {
  return weightedBlend(findDimension(pack, 'Automation Simplicity'), findDimension(pack, 'Flow & API Readiness'));
}

/** Mockup's "Must Fix" framing = Critical-severity gaps only (not Critical+High). */
export function criticalGapCount(pack: ReadinessPackAssessment): number {
  return pack.blockingIssues.filter((g) => g.severity === 'Critical').length;
}

/** Real historical score delta for this pack — undefined on the first-ever scan. */
export function scoreDelta(report: FutureReadinessReport): number | undefined {
  return report.historical.find((t) => t.packId === 'ai-agentforce')?.delta;
}

// ── Estimated Readiness After Fixes (client-side projection, marked as an estimate) ─

const SEVERITY_LIFT: Record<GapSeverity, number> = { Critical: 6, High: 4, Medium: 2, Low: 1 };
const QUICK_WIN_LIFT = 1.5;

export function projectedScoreAfterQuickWins(pack: ReadinessPackAssessment): number {
  const lift = pack.quickWins.length * QUICK_WIN_LIFT;
  return Math.min(100, Math.round(pack.overallScore + lift));
}

export function projectedScoreAfterFullRemediation(pack: ReadinessPackAssessment): number {
  const gapLift = pack.blockingIssues.reduce((sum, g) => sum + SEVERITY_LIFT[g.severity], 0);
  const quickWinLift = pack.quickWins.length * QUICK_WIN_LIFT;
  return Math.min(100, Math.round(pack.overallScore + gapLift + quickWinLift));
}

// ── Overall Readiness Breakdown donut (status counts across all signals) ────

export function readinessStatusCounts(pack: ReadinessPackAssessment): { ready: number; partial: number; blocked: number; na: number; total: number } {
  const signals = pack.signals ?? [];
  return {
    ready: signals.filter((s) => s.status === 'ready').length,
    partial: signals.filter((s) => s.status === 'partial').length,
    blocked: signals.filter((s) => s.status === 'blocked').length,
    na: signals.filter((s) => s.status === 'na').length,
    total: signals.length,
  };
}

// ── Checklist tri-state (Available / Configured / In Use), derived from status ─

export function checklistTriState(signal: ReadinessSignal): { available: boolean; configured: boolean; inUse: boolean } {
  if (signal.status === 'ready') { return { available: true, configured: true, inUse: true }; }
  if (signal.status === 'partial') { return { available: true, configured: true, inUse: false }; }
  return { available: false, configured: false, inUse: false };
}

// ── Recommended Roadmap — presentation-only 3-phase relabel of the shared 3-horizon type ─

export interface AgentforceRoadmapPhase {
  label: string;
  items: RoadmapItem[];
}

export function agentforceRoadmapPhases(roadmap: RoadmapPhase[]): AgentforceRoadmapPhase[] {
  const now = roadmap.find((p) => p.horizon === 'Now')?.items.filter((i) => i.packId === 'ai-agentforce') ?? [];
  const next = roadmap.find((p) => p.horizon === 'Next')?.items.filter((i) => i.packId === 'ai-agentforce') ?? [];
  const later = roadmap.find((p) => p.horizon === 'Later')?.items.filter((i) => i.packId === 'ai-agentforce') ?? [];

  return [
    { label: 'Foundation (0-30 Days)', items: now },
    { label: 'Enablement (1-3 Months)', items: next },
    { label: 'Optimization (3-6 Months)', items: later },
  ];
}

// ── Checklist rows → real signal-id mapping ──────────────────────────────────
// Every row maps to one real signal id from aiReadinessPack.ts — no fabricated
// flags. Note: the mockup's "Einstein Data Agreement" row has no backing
// collector (no signal tracks DPA/agreement acceptance) — it is relabeled here
// to the closest real signal (PII field risk / data-privacy framing) instead
// of being fabricated.

export const CHECKLIST_ROWS: { requirement: string; signalId: string }[] = [
  { requirement: 'Agentforce License', signalId: 'einstein-agentforce' },
  { requirement: 'Einstein Trust Layer', signalId: 'trust-layer' },
  { requirement: 'Salesforce Data Cloud', signalId: 'data-cloud-connection' },
  { requirement: 'Data Privacy (PII Masking)', signalId: 'pii-field-risk' },
  { requirement: 'Low Code Automation (Flows)', signalId: 'flow-adoption' },
  { requirement: 'External Actions (Invocable Apex)', signalId: 'invocable-apex' },
  { requirement: 'Prompt Templates', signalId: 'prompt-templates' },
  { requirement: 'Guardrails (Sharing & Access)', signalId: 'without-sharing-apex' },
  { requirement: 'Monitoring & Quality (Tests/Debt)', signalId: 'test-coverage' },
  { requirement: 'User Adoption (Autolaunched Flows)', signalId: 'invocable-flows' },
];

export interface ChecklistRow {
  requirement: string;
  signal?: ReadinessSignal;
}

export function checklistData(pack: ReadinessPackAssessment): ChecklistRow[] {
  return CHECKLIST_ROWS.map((row) => ({
    requirement: row.requirement,
    signal: pack.signals.find((s) => s.id === row.signalId),
  }));
}
