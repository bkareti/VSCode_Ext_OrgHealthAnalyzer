import {
  ReadinessPackAssessment,
  RoadmapPhase,
  RoadmapItem,
  RoadmapHorizon,
  GapSeverity,
} from '../../types/futureReadiness';
import { IRoadmapBuilder } from './interfaces';

const HORIZON_LABELS: Record<RoadmapHorizon, string> = {
  Now: '0–30 days',
  Next: '1–3 months',
  Later: '3–6 months',
};

function horizonForSeverity(severity: GapSeverity): RoadmapHorizon {
  if (severity === 'Critical' || severity === 'High') { return 'Now'; }
  if (severity === 'Medium') { return 'Next'; }
  return 'Later';
}

/**
 * Sequences every pack's blocking issues into a Now / Next / Later roadmap.
 * Critical & High gaps come first; Medium next; Low later.
 */
export class RoadmapBuilder implements IRoadmapBuilder {
  build(assessments: ReadinessPackAssessment[]): RoadmapPhase[] {
    const buckets: Record<RoadmapHorizon, RoadmapItem[]> = { Now: [], Next: [], Later: [] };

    for (const pack of assessments) {
      for (const gap of pack.blockingIssues) {
        const horizon = horizonForSeverity(gap.severity);
        buckets[horizon].push({
          title: gap.recommendation ?? gap.title,
          packId: pack.packId,
          area: gap.area,
          effort: gap.severity === 'Critical' ? 'High' : gap.severity === 'High' ? 'Medium' : 'Low',
          impact: gap.whyItMatters,
        });
      }
    }

    const order: RoadmapHorizon[] = ['Now', 'Next', 'Later'];
    return order.map((horizon) => ({
      horizon,
      label: HORIZON_LABELS[horizon],
      items: buckets[horizon],
    }));
  }
}
