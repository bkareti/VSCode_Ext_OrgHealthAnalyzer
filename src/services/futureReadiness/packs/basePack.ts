import { PackId, ReadinessPackAssessment } from '../../../types/futureReadiness';
import {
  IReadinessPack,
  ReadinessCheck,
  ReadinessInput,
  IReadinessRuleEngine,
  IReadinessScoreCalculator,
  IGapAnalyzer,
  IRecommendationEngine,
} from '../interfaces';

/**
 * Shared assembly logic for every readiness pack. Subclasses supply only
 * `id`, `name`, and `checks`; the deterministic pipeline (signals → scores →
 * gaps → recommendations) is identical across packs.
 */
export abstract class BaseReadinessPack implements IReadinessPack {
  abstract readonly id: PackId;
  abstract readonly name: string;
  abstract readonly checks: ReadinessCheck[];

  constructor(
    private readonly ruleEngine: IReadinessRuleEngine,
    private readonly scoreCalculator: IReadinessScoreCalculator,
    private readonly gapAnalyzer: IGapAnalyzer,
    private readonly recommendationEngine: IRecommendationEngine,
  ) {}

  assess(input: ReadinessInput): ReadinessPackAssessment {
    const signals = this.ruleEngine.run(this, input);
    const dimensions = this.scoreCalculator.scoreDimensions(signals);
    const { score, grade, confidence, maturityLevel } = this.scoreCalculator.packScore(dimensions);

    const blockingIssues = this.gapAnalyzer.analyze(this.id, signals);
    const quickWins = this.recommendationEngine.quickWins(this.id, signals);
    const strategicInitiatives = this.recommendationEngine.strategicInitiatives(blockingIssues);

    const strengths = dimensions
      .filter((d) => d.status === 'ready')
      .map((d) => `${d.dimension}: ${d.reason}`);

    return {
      packId: this.id,
      packName: this.name,
      overallScore: score,
      grade,
      confidence,
      maturityLevel,
      dimensions,
      strengths,
      blockingIssues,
      quickWins,
      strategicInitiatives,
    };
  }
}
