/**
 * Data-Cloud-only derivation helpers for the redesigned Data Cloud Readiness
 * Overview. Everything here operates on the same real `ReadinessPackAssessment`
 * data the generic pack view uses (see ../derivations.ts) — nothing here
 * fabricates a number that doesn't trace back to a real connector query,
 * except where explicitly marked as an estimate/sample.
 */
import type {
  ReadinessPackAssessment,
  ReadinessDimensionScore,
  ReadinessSignal,
  RoadmapPhase,
  RoadmapItem,
  GapSeverity,
} from '@/types';

// ── Sub-tab dimension name aliasing ──────────────────────────────────────────
// The mockup's 5 sub-tab names don't map 1:1 onto the engine's real dimension
// strings — group the closest real dimensions under each sub-tab label.

export const DATA_CLOUD_SUBTABS = [
  'Data Architecture',
  'Identity & Unification',
  'Data Ingestion',
  'Data Activation',
  'Governance & Privacy',
] as const;

export type DataCloudSubtab = typeof DATA_CLOUD_SUBTABS[number];

export const SUBTAB_DIMENSION_ALIASES: Record<DataCloudSubtab, string[]> = {
  'Data Architecture': ['Data Model Quality', 'Data Volume & Scale'],
  'Identity & Unification': ['Identity Resolution Readiness'],
  'Data Ingestion': ['Data Cloud Provisioning', 'Integration & External Data'],
  'Data Activation': ['Activation & Insights'],
  'Governance & Privacy': ['Data Governance'],
};

export function dimensionsForSubtab(pack: ReadinessPackAssessment, subtab: DataCloudSubtab): ReadinessDimensionScore[] {
  const names = SUBTAB_DIMENSION_ALIASES[subtab];
  return pack.dimensions.filter((d) => names.includes(d.dimension));
}

export function signalsForSubtab(pack: ReadinessPackAssessment, subtab: DataCloudSubtab): ReadinessSignal[] {
  const names = SUBTAB_DIMENSION_ALIASES[subtab];
  return pack.signals.filter((s) => names.includes(s.dimension));
}

export function findDimension(pack: ReadinessPackAssessment, name: string): ReadinessDimensionScore | undefined {
  return pack.dimensions.find((d) => d.dimension === name);
}

// ── Data Sources Detected stat (real, reframed count) ────────────────────────

const DATA_SOURCE_DIMENSIONS = ['Data Cloud Provisioning', 'Integration & External Data'];

export function dataSourcesDetected(pack: ReadinessPackAssessment): { connected: number; total: number } {
  const signals = pack.signals.filter((s) => DATA_SOURCE_DIMENSIONS.includes(s.dimension));
  return { connected: signals.filter((s) => s.status !== 'blocked').length, total: signals.length };
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

// ── Recommended Roadmap — presentation-only 4-phase relabel of the shared 3-horizon type ─

export interface DataCloudRoadmapPhase {
  label: string;
  items: RoadmapItem[];
}

export function dataCloudRoadmapPhases(roadmap: RoadmapPhase[]): DataCloudRoadmapPhase[] {
  const now = roadmap.find((p) => p.horizon === 'Now')?.items.filter((i) => i.packId === 'data-cloud') ?? [];
  const next = roadmap.find((p) => p.horizon === 'Next')?.items.filter((i) => i.packId === 'data-cloud') ?? [];
  const later = roadmap.find((p) => p.horizon === 'Later')?.items.filter((i) => i.packId === 'data-cloud') ?? [];
  const mediumTerm = later.filter((i) => i.effort !== 'High');
  const longTerm = later.filter((i) => i.effort === 'High');

  return [
    { label: 'Quick Wins (0-30 Days)', items: now },
    { label: 'Short Term (1-3 Months)', items: next },
    { label: 'Medium Term (3-6 Months)', items: mediumTerm },
    { label: 'Long Term (6+ Months)', items: longTerm },
  ];
}
