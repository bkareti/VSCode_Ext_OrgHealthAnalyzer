import { AnalysisResult } from '../../types';
import { AssessmentContext } from '../../types/assessmentContext';
import { IAssessmentContextService, IAssessmentContextBuilder } from './interfaces';
import { PiiSanitizer } from './piiSanitizer';
import { FindingNormalizer } from './findingNormalizer';
import { ScoreCalculator } from './scoreCalculator';
import { TrendAnalyzer } from './trendAnalyzer';
import { QuickWinEngine } from './quickWinEngine';
import { BusinessContextEngine } from './businessContextEngine';
import { PayloadOptimizer } from './payloadOptimizer';
import { AssessmentContextBuilder } from './assessmentContextBuilder';

export class AssessmentContextService implements IAssessmentContextService {
  private readonly builder: IAssessmentContextBuilder;

  constructor(builder: IAssessmentContextBuilder) {
    this.builder = builder;
  }

  build(snapshot: AnalysisResult, previousSnapshot?: AnalysisResult): AssessmentContext {
    return this.builder.build(snapshot, previousSnapshot);
  }

  toJson(context: AssessmentContext): string {
    return JSON.stringify(context, null, 2);
  }

  estimateTokenCount(context: AssessmentContext): number {
    return Math.ceil(JSON.stringify(context).length / 4);
  }

  /**
   * Factory that wires up all 8 sub-services with default implementations.
   * Use this in extension.ts to keep activation code to a single line.
   */
  static createDefault(): AssessmentContextService {
    const piiSanitizer      = new PiiSanitizer();
    const findingNormalizer = new FindingNormalizer();
    const scoreCalculator   = new ScoreCalculator();
    const trendAnalyzer     = new TrendAnalyzer();
    const quickWinEngine    = new QuickWinEngine();
    const businessContextEngine = new BusinessContextEngine();
    const payloadOptimizer  = new PayloadOptimizer();

    const builder = new AssessmentContextBuilder(
      piiSanitizer,
      findingNormalizer,
      scoreCalculator,
      trendAnalyzer,
      quickWinEngine,
      businessContextEngine,
      payloadOptimizer,
    );

    return new AssessmentContextService(builder);
  }
}
