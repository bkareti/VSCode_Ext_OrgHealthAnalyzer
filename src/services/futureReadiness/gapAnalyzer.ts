import { PackId, ReadinessSignal, ReadinessGap, GapSeverity } from '../../types/futureReadiness';
import { IGapAnalyzer } from './interfaces';

const STATUS_ORDER: Record<string, number> = { blocked: 0, partial: 1, ready: 2, na: 3 };

function severityFor(signal: ReadinessSignal): GapSeverity {
  if (signal.status === 'blocked') { return signal.score < 30 ? 'Critical' : 'High'; }
  return signal.score < 60 ? 'Medium' : 'Low';
}

/**
 * Turns blocked/partial signals into prioritized readiness gaps. Pure derivation
 * from signals — no AI, no narrative invention.
 */
export class GapAnalyzer implements IGapAnalyzer {
  analyze(_packId: PackId, signals: ReadinessSignal[]): ReadinessGap[] {
    return signals
      .filter((s) => s.status === 'blocked' || s.status === 'partial')
      .sort((a, b) => {
        const bySeverity = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return bySeverity !== 0 ? bySeverity : a.score - b.score;
      })
      .map((s) => ({
        title: s.status === 'blocked' ? `Resolve ${s.dimension} blocker` : `Strengthen ${s.dimension}`,
        severity: severityFor(s),
        area: s.dimension,
        whyItMatters:
          s.recommendation ??
          `${s.dimension} is below the readiness threshold (score ${s.score}); addressing it improves adoption readiness.`,
        evidence: s.evidence,
        recommendation: s.recommendation,
      }));
  }
}
