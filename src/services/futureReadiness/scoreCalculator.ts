import { ScoreGrade, ConfidenceLevel } from '../../types/assessmentContext';
import { ReadinessSignal, ReadinessStatus, ReadinessDimensionScore } from '../../types/futureReadiness';
import { IReadinessScoreCalculator, PackScore } from './interfaces';

export function toGrade(score: number): ScoreGrade {
  if (score >= 90) { return 'A'; }
  if (score >= 80) { return 'B'; }
  if (score >= 70) { return 'C'; }
  if (score >= 60) { return 'D'; }
  return 'F';
}

function statusFromScore(score: number, anyBlocked: boolean): ReadinessStatus {
  if (anyBlocked || score < 50) { return 'blocked'; }
  if (score < 80) { return 'partial'; }
  return 'ready';
}

function maturityFromScore(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 90) { return 5; }
  if (score >= 75) { return 4; }
  if (score >= 60) { return 3; }
  if (score >= 40) { return 2; }
  return 1;
}

/**
 * Deterministic readiness scoring. Aggregates signals → dimension scores → pack score.
 * OrgPulse owns this math entirely; AI never touches it.
 */
export class ReadinessScoreCalculator implements IReadinessScoreCalculator {
  scoreDimensions(signals: ReadinessSignal[]): ReadinessDimensionScore[] {
    const byDimension = new Map<string, ReadinessSignal[]>();
    for (const signal of signals) {
      const list = byDimension.get(signal.dimension) ?? [];
      list.push(signal);
      byDimension.set(signal.dimension, list);
    }

    const dimensions: ReadinessDimensionScore[] = [];

    for (const [dimension, dimSignals] of byDimension) {
      const dimensionWeight = dimSignals.reduce((s, x) => s + x.weight, 0);
      const scored = dimSignals.filter((s) => s.status !== 'na');
      const evidence = dimSignals.flatMap((s) => s.evidence);

      if (scored.length === 0) {
        dimensions.push({
          dimension,
          score: 0,
          weight: dimensionWeight,
          grade: 'F',
          confidence: 'low',
          status: 'na',
          evidence,
          reason: `${dimension} could not be evaluated — required metadata was unavailable.`,
        });
        continue;
      }

      const totalWeight = scored.reduce((s, x) => s + x.weight, 0);
      const weighted = scored.reduce((s, x) => s + x.score * x.weight, 0);
      const score = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
      const anyBlocked = scored.some((s) => s.status === 'blocked');
      const status = statusFromScore(score, anyBlocked);

      // Confidence tracks how much of the dimension we could actually evaluate.
      const coverage = scored.length / dimSignals.length;
      const confidence: ConfidenceLevel = coverage >= 0.75 ? 'high' : coverage >= 0.4 ? 'medium' : 'low';

      const worst = [...scored].sort((a, b) => a.score - b.score)[0];
      const reason =
        status === 'ready'
          ? `${dimension} is ready (score ${score}); no blocking gaps detected.`
          : `${dimension} scored ${score}; ${worst.dimension} weakest signal is "${worst.id}".`;

      dimensions.push({
        dimension,
        score,
        weight: dimensionWeight,
        grade: toGrade(score),
        confidence,
        status,
        evidence,
        reason,
      });
    }

    return dimensions;
  }

  packScore(dimensions: ReadinessDimensionScore[]): PackScore {
    const scored = dimensions.filter((d) => d.status !== 'na');

    if (scored.length === 0) {
      return { score: 0, grade: 'F', confidence: 'low', maturityLevel: 1 };
    }

    const totalWeight = scored.reduce((s, d) => s + d.weight, 0);
    const weighted = scored.reduce((s, d) => s + d.score * d.weight, 0);
    const score = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;

    const naCount = dimensions.length - scored.length;
    const confidence: ConfidenceLevel = naCount === 0 ? 'high' : naCount <= dimensions.length / 3 ? 'medium' : 'low';

    return { score, grade: toGrade(score), confidence, maturityLevel: maturityFromScore(score) };
  }
}
