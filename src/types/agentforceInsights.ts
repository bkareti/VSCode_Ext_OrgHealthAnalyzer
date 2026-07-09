import type { ArchitectRecommendationPoint } from './architectRecommendations';

/**
 * Deterministic "AI Insights" cards shown on the Agentforce Readiness →
 * Overview sub-tab. Mirrors the Data Cloud Insights split
 * (src/types/dataCloudInsights.ts): the icon/type/title/description are
 * computed entirely by OrgPulse from the already-scored `ai-agentforce`
 * ReadinessPackAssessment (strengths, blockingIssues, quickWins) — never
 * AI-authored. The AI model, when consented and available, only adds
 * evidence-cited narrative bullets per card via `evidencePoints` — see
 * `aiService.synthesizeAgentforceInsights`.
 */

export type AgentforceInsightType = 'warning' | 'info' | 'success' | 'opportunity';

export interface AgentforceInsightCard {
  id: string;
  type: AgentforceInsightType;
  icon: string;
  title: string;
  description: string;
  /** True when this card's content is illustrative/fabricated, not backed by real data. */
  sample: boolean;
  /** Undefined until the AI narrative has been generated. */
  evidencePoints?: ArchitectRecommendationPoint[];
}

export interface AgentforceInsightsReport {
  generatedAt: string;
  modelUsed?: string;
  insights: AgentforceInsightCard[];
}
