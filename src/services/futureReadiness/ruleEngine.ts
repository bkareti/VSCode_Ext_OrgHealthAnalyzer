import { ReadinessSignal } from '../../types/futureReadiness';
import { IReadinessRuleEngine, IReadinessPack, IEvidenceBuilder, ReadinessInput } from './interfaces';

function clamp(n: number): number {
  if (Number.isNaN(n)) { return 0; }
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Runs every check in a pack and maps outcomes to signals.
 * A throwing check degrades to a 'na' signal so a missing feature never fails
 * the whole assessment (same defensive posture as the existing analyzers).
 */
export class ReadinessRuleEngine implements IReadinessRuleEngine {
  constructor(private readonly evidenceBuilder: IEvidenceBuilder) {}

  run(pack: IReadinessPack, input: ReadinessInput): ReadinessSignal[] {
    return pack.checks.map((check) => {
      let status: ReadinessSignal['status'] = 'na';
      let score = 0;
      let evidence: string[] = [];
      let recommendation: string | undefined;

      try {
        const outcome = check.evaluate(input);
        status = outcome.status;
        score = outcome.status === 'na' ? 0 : clamp(outcome.score);
        evidence = outcome.evidence;
        recommendation = outcome.recommendation;
      } catch {
        status = 'na';
      }

      return {
        id: check.id,
        packId: pack.id,
        dimension: check.dimension,
        label: check.label,
        whyItMatters: check.whyItMatters,
        status,
        score,
        weight: check.weight,
        evidence: this.evidenceBuilder.clean(evidence),
        recommendation,
      };
    });
  }
}
