import { scoreBand, usageBand } from '@/constants/scoring';
import type { AnalysisResult, OrgLimitInfo } from '@/types';

export function findLimit(limits: OrgLimitInfo[], name: string): OrgLimitInfo | undefined {
  return limits.find((l) => l.name === name);
}

/**
 * 0-100 capacity score: starts at 100 and loses points per limit based on
 * how far into its usage band it sits. Purely a function of real `orgLimits`
 * usedPct values — no fabricated inputs.
 */
export function capacityScore(limits: OrgLimitInfo[]): number {
  if (limits.length === 0) { return 100; }
  const penalty = limits.reduce((sum, l) => {
    if (l.usedPct >= 90) { return sum + 12; }
    if (l.usedPct >= 75) { return sum + 6; }
    if (l.usedPct >= 50) { return sum + 2; }
    return sum;
  }, 0);
  return Math.max(0, Math.round(100 - penalty));
}

export const capacityScoreLabel = (score: number): string => scoreBand(score).label;
export const capacityScoreTextClass = (score: number): string => scoreBand(score).text;

export function limitsAtRisk(limits: OrgLimitInfo[]): OrgLimitInfo[] {
  return [...limits].filter((l) => l.usedPct >= 50).sort((a, b) => b.usedPct - a.usedPct);
}

export interface CapacityHealthRow {
  name: string;
  label: string;
  usedPct: number;
}

/** Top N real limits by usage, restyled per the mockup's Capacity Health table. */
export function capacityHealthRows(limits: OrgLimitInfo[], topN = 10): CapacityHealthRow[] {
  return [...limits]
    .sort((a, b) => b.usedPct - a.usedPct)
    .slice(0, topN)
    .map((l) => ({ name: l.name, label: l.label, usedPct: l.usedPct }));
}

export interface StorageBreakdownReal {
  fileStorageMB: number;
  dataStorageMB: number;
}

export function storageBreakdown(limits: OrgLimitInfo[]): StorageBreakdownReal {
  return {
    fileStorageMB: findLimit(limits, 'FileStorageMB')?.used ?? 0,
    dataStorageMB: findLimit(limits, 'DataStorageMB')?.used ?? 0,
  };
}

export interface LargestObjectRow {
  objectName: string;
  objectLabel: string;
  recordCount: number;
}

/** Real per-object record counts (there is no real per-object storage-MB data anywhere in the app). */
export function largestObjectsByRecordCount(result: AnalysisResult, topN = 10): LargestObjectRow[] {
  return [...(result.dataModelStats ?? [])]
    .filter((s) => (s.recordCount ?? 0) > 0)
    .sort((a, b) => (b.recordCount ?? 0) - (a.recordCount ?? 0))
    .slice(0, topN)
    .map((s) => ({ objectName: s.objectName, objectLabel: s.objectLabel ?? s.objectName, recordCount: s.recordCount ?? 0 }));
}

/** Formats a storage MB value as GB/TB, matching the mockup's headline units. */
export function fmtStorageMB(mb: number): string {
  const gb = mb / 1024;
  if (gb >= 1000) { return `${(gb / 1024).toFixed(1)} TB`; }
  return `${gb.toFixed(1)} GB`;
}

export { usageBand };
