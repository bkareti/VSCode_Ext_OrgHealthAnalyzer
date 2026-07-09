import type { ArchitectRecommendationPoint } from './architectRecommendations';

/**
 * Deterministic "AI Insights" cards shown on the Data Cloud Readiness →
 * Overview sub-tab. Mirrors the Governor Limits Recommendations split
 * (src/types/governorLimitsRecommendations.ts): the icon/type/title/description
 * are computed entirely by OrgPulse from the already-scored `data-cloud`
 * ReadinessPackAssessment (strengths, blockingIssues, quickWins) — never
 * AI-authored. The AI model, when consented and available, only adds
 * evidence-cited narrative bullets per card via `evidencePoints` — see
 * `aiService.synthesizeDataCloudInsights`.
 */

export type DataCloudInsightType = 'warning' | 'info' | 'success' | 'opportunity';

export interface DataCloudInsightCard {
  id: string;
  type: DataCloudInsightType;
  icon: string;
  title: string;
  description: string;
  /** True when this card's content is illustrative/fabricated, not backed by real data. */
  sample: boolean;
  /** Undefined until the AI narrative has been generated. */
  evidencePoints?: ArchitectRecommendationPoint[];
}

export interface DataCloudInsightsReport {
  generatedAt: string;
  modelUsed?: string;
  insights: DataCloudInsightCard[];
}
