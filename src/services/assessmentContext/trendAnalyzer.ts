import { AnalysisResult, Issue } from '../../types';
import { TrendAnalysis, ScoreTrend, ScoredDimensionName, TrendDirection } from '../../types/assessmentContext';
import { ITrendAnalyzer } from './interfaces';

// The 7 dimensions present in TrendPoint (the existing ring-buffer type).
const TREND_DIMENSIONS: Array<{ key: string; dimension: ScoredDimensionName }> = [
  { key: 'overall',         dimension: 'overall' },
  { key: 'codeQuality',     dimension: 'codeQuality' },
  { key: 'automationDesign',dimension: 'automationDesign' },
  { key: 'performance',     dimension: 'performance' },
  { key: 'security',        dimension: 'security' },
  { key: 'testing',         dimension: 'testing' },
];

function toDirection(delta: number): TrendDirection {
  if (delta >= 3)  { return 'improving'; }
  if (delta <= -3) { return 'declining'; }
  return 'stable';
}

/** Canonical key for deduplicating findings across snapshots. */
function findingKey(issue: Issue): string {
  return `${issue.ruleId}::${issue.severity}::${issue.category}`;
}

export class TrendAnalyzer implements ITrendAnalyzer {
  analyze(current: AnalysisResult, previous?: AnalysisResult): TrendAnalysis {
    if (!previous) {
      // Attempt to derive a delta from the TrendPoint ring buffer already in result.
      return this.analyzeFromRingBuffer(current);
    }
    return this.analyzeFromSnapshots(current, previous);
  }

  private analyzeFromSnapshots(current: AnalysisResult, previous: AnalysisResult): TrendAnalysis {
    const currentKeys = new Set((current.issues ?? []).map(findingKey));
    const previousKeys = new Set((previous.issues ?? []).map(findingKey));

    const newFindingCount = [...currentKeys].filter(k => !previousKeys.has(k)).length;
    const resolvedFindingCount = [...previousKeys].filter(k => !currentKeys.has(k)).length;

    const currentDate = current.timestamp instanceof Date ? current.timestamp : new Date(current.timestamp);
    const previousDate = previous.timestamp instanceof Date ? previous.timestamp : new Date(previous.timestamp);
    const snapshotDeltaDays = Math.round(Math.abs(currentDate.getTime() - previousDate.getTime()) / 86_400_000);

    const scoreTrends: ScoreTrend[] = TREND_DIMENSIONS.map(({ key, dimension }) => {
      const curr = (current.scores as unknown as Record<string, number>)[key] ?? 0;
      const prev = (previous.scores as unknown as Record<string, number>)[key] ?? 0;
      const delta = curr - prev;
      return { dimension, direction: toDirection(delta), delta };
    });

    return { hasPreviousSnapshot: true, snapshotDeltaDays, newFindingCount, resolvedFindingCount, scoreTrends };
  }

  private analyzeFromRingBuffer(current: AnalysisResult): TrendAnalysis {
    const trends = current.trends ?? [];
    if (trends.length < 2) {
      return {
        hasPreviousSnapshot: false,
        snapshotDeltaDays: 0,
        newFindingCount: 0,
        resolvedFindingCount: 0,
        scoreTrends: [],
      };
    }

    const latest = trends[trends.length - 1];
    const prior  = trends[trends.length - 2];

    const latestDate = new Date(latest.timestamp);
    const priorDate  = new Date(prior.timestamp);
    const snapshotDeltaDays = Math.round(Math.abs(latestDate.getTime() - priorDate.getTime()) / 86_400_000);

    const scoreTrends: ScoreTrend[] = TREND_DIMENSIONS.map(({ key, dimension }) => {
      const curr = (latest as unknown as Record<string, number>)[key] ?? 0;
      const prev = (prior  as unknown as Record<string, number>)[key] ?? 0;
      const delta = curr - prev;
      return { dimension, direction: toDirection(delta), delta };
    });

    return { hasPreviousSnapshot: true, snapshotDeltaDays, newFindingCount: 0, resolvedFindingCount: 0, scoreTrends };
  }
}
