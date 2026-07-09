import type { DataCloudInsightsReport, ReadinessPackAssessment } from '@/types';

/**
 * Client-side fallback for the AI Insights panel, used only until the
 * extension host has computed `dataCloudInsights` on the AnalysisResult (or
 * for a stale/legacy cached result missing the field). Mirrors the shape and
 * logic of `buildDataCloudInsightsBase` in src/services/dataCloudInsights.ts —
 * duplicated here because the webview bundle cannot import extension-host
 * services, only shared types.
 */
export function buildDataCloudInsightsFallback(pack: ReadinessPackAssessment): DataCloudInsightsReport {
  const insights: DataCloudInsightsReport['insights'] = [];

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

  return { generatedAt: new Date().toISOString(), insights };
}
