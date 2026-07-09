import type { AnalysisResult, DataCloudInsightCard, DataCloudInsightsReport } from '../types';

/**
 * Deterministic base for the "AI Insights" panel on the Data Cloud Readiness
 * → Overview sub-tab. Every card here is built from the already-scored
 * `data-cloud` ReadinessPackAssessment (strengths, blockingIssues, quickWins)
 * computed by the Future Readiness engine — nothing is fabricated, so every
 * card carries `sample: false`. The optional AI narrative layer
 * (`aiService.synthesizeDataCloudInsights`) only adds evidence-cited
 * `evidencePoints` on top of these cards — it never invents new ones.
 */
export function buildDataCloudInsightsBase(result: AnalysisResult): DataCloudInsightsReport {
  const pack = result.futureReadiness?.packs.find((p) => p.packId === 'data-cloud');
  const generatedAt = new Date().toISOString();

  if (!pack) {
    return { generatedAt, insights: [] };
  }

  const insights: DataCloudInsightCard[] = [];

  // Top blocking issues (Critical/High first) become "warning" insights.
  const sortedGaps = [...pack.blockingIssues].sort((a, b) => {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return order[a.severity] - order[b.severity];
  });
  sortedGaps.slice(0, 3).forEach((gap, i) => {
    insights.push({
      id: `gap-${i}`,
      type: 'warning',
      icon: gap.severity === 'Critical' || gap.severity === 'High' ? '⚠️' : '🔎',
      title: gap.title,
      description: gap.whyItMatters,
      sample: false,
    });
  });

  // Quick wins become "opportunity" insights.
  pack.quickWins.slice(0, 2).forEach((qw, i) => {
    insights.push({
      id: `quickwin-${i}`,
      type: 'opportunity',
      icon: '💡',
      title: qw.title,
      description: qw.reason,
      sample: false,
    });
  });

  // Strengths become "success" insights.
  pack.strengths.slice(0, 2).forEach((strength, i) => {
    insights.push({
      id: `strength-${i}`,
      type: 'success',
      icon: '⭐',
      title: 'Strong foundation',
      description: strength,
      sample: false,
    });
  });

  // Lowest-confidence / lowest-scoring dimension becomes an "info" insight, if present.
  const weakestDimension = [...pack.dimensions].sort((a, b) => a.score - b.score)[0];
  if (weakestDimension && weakestDimension.score < 70) {
    insights.push({
      id: 'weakest-dimension',
      type: 'info',
      icon: 'ℹ️',
      title: `${weakestDimension.dimension} needs attention`,
      description: weakestDimension.reason,
      sample: false,
    });
  }

  return { generatedAt, insights };
}
