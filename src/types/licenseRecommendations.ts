import type { ArchitectRecommendationPoint } from './architectRecommendations';

/**
 * Deterministic "License Recommendations" cards shown on the Org Info →
 * Clouds & Licenses tab. Mirrors the Future Readiness split: numbers are
 * computed entirely by OrgPulse (never AI-authored); the AI model, when
 * consented and available, only adds evidence-cited narrative bullets per
 * card via `evidencePoints` — see `aiService.synthesizeLicenseRecommendations`.
 */

export type LicenseImpact = 'High' | 'Medium' | 'Low' | 'Insight';

export type LicenseCardId =
  | 'surrender-unused'
  | 'reclaim-inactive'
  | 'optimize-feature'
  | 'rightsize-permset'
  | 'plan-future';

export interface LicenseRecommendationCard {
  id: LicenseCardId;
  title: string;
  icon: string;
  impact: LicenseImpact;
  value: number | string;
  valueLabel: string;
  savingsLabel: string;
  savingsValue?: string;
  /** True when any value on this card (typically the $ savings figure) is fabricated sample data. */
  sample: boolean;
  /** Undefined until the AI narrative has been generated. */
  evidencePoints?: ArchitectRecommendationPoint[];
}

export interface LicenseRecommendationsReport {
  generatedAt: string;
  modelUsed?: string;
  cards: LicenseRecommendationCard[];
}
