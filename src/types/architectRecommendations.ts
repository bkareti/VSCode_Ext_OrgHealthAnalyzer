/**
 * Shared types for the generic "Architect Recommendations" pattern: evidence-cited,
 * CTA-quality pointers grouped into readable sections. First consumed by the Future
 * Readiness pilot (src/services/futureReadiness/) and intended for reuse by other
 * dashboard tabs in a later rollout — see the plan's Follow-up section.
 */

export type RecommendationPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface ArchitectRecommendationPoint {
  /** AI-authored, must cite real evidence already present in the context sent to the model. */
  text: string;
  /** Evidence strings echoed back verbatim from the deterministic layer — never invented. */
  evidence?: string[];
  priority: RecommendationPriority;
}

export interface ArchitectRecommendationSection {
  /** e.g. "Immediate Risks", "Quick Wins", "Strategic Recommendations". */
  title: string;
  points: ArchitectRecommendationPoint[];
}
