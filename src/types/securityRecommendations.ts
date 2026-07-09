import type { ArchitectRecommendationPoint } from './architectRecommendations';

/**
 * Deterministic "AI Security Recommendations" cards shown on the Security →
 * Overview tab. Mirrors the Org Info recommendations split
 * (src/types/orgInfoRecommendations.ts): numbers/titles are computed entirely
 * by OrgPulse from real `Issue.suggestion` text and security collector data —
 * cards only carry `sample: true` when padding is needed because fewer than
 * 5 real candidates were found for a given scan.
 */

export type SecurityImpact = 'High' | 'Medium' | 'Low' | 'Insight';

export interface SecurityRecommendationCard {
  id: string;
  title: string;
  icon: string;
  impact: SecurityImpact;
  value: number | string;
  valueLabel: string;
  detailLabel: string;
  detailValue?: string;
  /** True when this card is fabricated sample data (not yet backed by a real detected issue). */
  sample: boolean;
  /** Undefined until an AI narrative layer is added for this card. */
  evidencePoints?: ArchitectRecommendationPoint[];
}

export interface SecurityRecommendationsReport {
  generatedAt: string;
  modelUsed?: string;
  cards: SecurityRecommendationCard[];
}
