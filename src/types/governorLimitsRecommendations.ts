import type { ArchitectRecommendationPoint } from './architectRecommendations';

/**
 * Deterministic "AI Recommendations" cards shown on the Governor Limits →
 * Summary tab. Mirrors the Org Info Recommendations split
 * (src/types/orgInfoRecommendations.ts): numbers are computed entirely by
 * OrgPulse from real `orgLimits` data (never AI-authored); the AI model,
 * when consented and available, only adds evidence-cited narrative bullets
 * per card via `evidencePoints` — see `aiService.synthesizeGovernorLimitsRecommendations`.
 */

export type GovernorLimitsImpact = 'High' | 'Medium' | 'Low' | 'Insight';

export type GovernorLimitsCardId =
  | 'capacity-score'
  | 'storage-headroom'
  | 'api-trajectory'
  | 'async-processing'
  | 'forecast-risk';

export interface GovernorLimitsRecommendationCard {
  id: GovernorLimitsCardId;
  title: string;
  icon: string;
  impact: GovernorLimitsImpact;
  value: number | string;
  valueLabel: string;
  detailLabel: string;
  detailValue?: string;
  /** True when any value on this card is fabricated sample data (not yet backed by a real field). */
  sample: boolean;
  /** Undefined until the AI narrative has been generated. */
  evidencePoints?: ArchitectRecommendationPoint[];
}

export interface GovernorLimitsRecommendationsReport {
  generatedAt: string;
  modelUsed?: string;
  cards: GovernorLimitsRecommendationCard[];
}
