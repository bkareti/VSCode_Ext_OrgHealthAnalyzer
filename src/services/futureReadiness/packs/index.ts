import {
  IReadinessPack,
  IReadinessRuleEngine,
  IReadinessScoreCalculator,
  IGapAnalyzer,
  IRecommendationEngine,
} from '../interfaces';
import { AIReadinessPack } from './aiReadinessPack';
import { DataCloudReadinessPack } from './dataCloudReadinessPack';
import { HyperforceReadinessPack } from './hyperforceReadinessPack';

export interface ReadinessPackDeps {
  ruleEngine: IReadinessRuleEngine;
  scoreCalculator: IReadinessScoreCalculator;
  gapAnalyzer: IGapAnalyzer;
  recommendationEngine: IRecommendationEngine;
}

/**
 * The pack registry — the single extension point for future readiness packs.
 * Add a new pack here and it flows through scoring, gaps, roadmap, and the UI
 * with no further refactoring.
 */
export function createReadinessPacks(deps: ReadinessPackDeps): IReadinessPack[] {
  const args = [deps.ruleEngine, deps.scoreCalculator, deps.gapAnalyzer, deps.recommendationEngine] as const;
  return [
    new AIReadinessPack(...args),
    new DataCloudReadinessPack(...args),
    new HyperforceReadinessPack(...args),
  ];
}

export { AIReadinessPack, DataCloudReadinessPack, HyperforceReadinessPack };
