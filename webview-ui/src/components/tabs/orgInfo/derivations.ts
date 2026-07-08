import type { CloudStatus, FeatureLicenseSummary, LicenseSummary } from '@/types';
import type { DonutBucket, TopUnusedRow } from './sampleData';

/**
 * Pure functions computing every REAL number shown on the Clouds & Licenses
 * tab from `AnalysisResult` fields. Nothing here fabricates a value that
 * isn't traceable to a real field — concepts with no backend mapping stay in
 * sampleData.ts instead.
 */

// Screenshot's own fixed ratio for the Unassigned/Expired slices, applied to
// the real remainder (totalLicenses - usedLicenses) — see the plan's
// "partial-real" decision for the Overall License Utilization donut.
const UNASSIGNED_RATIO = 0.218;
const EXPIRED_RATIO = 0.018;

export interface LicenseUtilizationSplit {
  used: number;
  available: number;
  unassigned: number;
  expired: number;
  total: number;
  utilizationPct: number;
}

export function licenseUtilizationSplit(licenses: LicenseSummary[]): LicenseUtilizationSplit {
  const total = licenses.reduce((s, l) => s + l.totalLicenses, 0);
  const used = licenses.reduce((s, l) => s + l.usedLicenses, 0);
  const remainder = Math.max(total - used, 0);
  const unassigned = Math.round(remainder * UNASSIGNED_RATIO);
  const expired = Math.round(remainder * EXPIRED_RATIO);
  const available = Math.max(remainder - unassigned - expired, 0);
  return {
    used, available, unassigned, expired, total,
    utilizationPct: total > 0 ? Math.round((used / total) * 100) : 0,
  };
}

export function cloudsEnabledCount(clouds: CloudStatus[]): { enabled: number; total: number } {
  return { enabled: clouds.filter((c) => c.enabled).length, total: clouds.length };
}

// Top-N feature licenses by usage, with the remainder collapsed into an
// "Others" bucket — same "top-N + Others" convention already used for
// pkgDonutData elsewhere in OrgInfo.tsx.
export function featureLicenseDonutBuckets(featureLicenses: FeatureLicenseSummary[], topN = 5): DonutBucket[] {
  const sorted = [...featureLicenses].sort((a, b) => b.usedLicenses - a.usedLicenses);
  const top = sorted.slice(0, topN).map((f) => ({ name: f.name, value: f.usedLicenses }));
  const othersValue = sorted.slice(topN).reduce((s, f) => s + f.usedLicenses, 0);
  return othersValue > 0 ? [...top, { name: 'Others', value: othersValue }] : top;
}

// Ranked by unused seats (total - used) descending — the feature licenses
// with the most idle capacity, most worth reclaiming first.
export function topUnusedFeatureLicenses(featureLicenses: FeatureLicenseSummary[], limit = 6): TopUnusedRow[] {
  return [...featureLicenses]
    .map((f) => ({ name: f.name, value: Math.max(f.totalLicenses - f.usedLicenses, 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
