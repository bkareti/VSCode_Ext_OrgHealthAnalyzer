import type { ArchitectRecommendationPoint } from './architectRecommendations';

/**
 * Deterministic "AI Recommendations" cards shown on the Org Info → Overview
 * tab. Mirrors the License Recommendations split (src/types/licenseRecommendations.ts):
 * numbers are computed entirely by OrgPulse from real Overview KPI fields
 * (never AI-authored); the AI model, when consented and available, only adds
 * evidence-cited narrative bullets per card via `evidencePoints` — see
 * `aiService.synthesizeOrgInfoRecommendations`. Unlike license recommendations,
 * these cards have no dollar "savings" figure, so `detailLabel`/`detailValue`
 * carry a neutral secondary metric or guideline instead.
 */

export type OrgInfoImpact = 'High' | 'Medium' | 'Low' | 'Insight';

export type OrgInfoCardId =
  | 'license-utilization'
  | 'storage-headroom'
  | 'cloud-adoption'
  | 'integration-footprint'
  | 'platform-currency';

export interface OrgInfoRecommendationCard {
  id: OrgInfoCardId;
  title: string;
  icon: string;
  impact: OrgInfoImpact;
  value: number | string;
  valueLabel: string;
  detailLabel: string;
  detailValue?: string;
  /** True when any value on this card is fabricated sample data (not yet backed by a real field). */
  sample: boolean;
  /** Undefined until the AI narrative has been generated. */
  evidencePoints?: ArchitectRecommendationPoint[];
}

export interface OrgInfoRecommendationsReport {
  generatedAt: string;
  modelUsed?: string;
  cards: OrgInfoRecommendationCard[];
}
