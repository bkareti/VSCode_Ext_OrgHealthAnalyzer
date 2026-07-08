import { AnalysisResult } from '../../types';
import { ScoreGrade } from '../../types/assessmentContext';
import {
  FutureReadinessResult,
  FutureReadinessContext,
  ReadinessPackAssessment,
  ReadinessContextPack,
} from '../../types/futureReadiness';
import {
  IFutureReadinessService,
  IReadinessPack,
  IRoadmapBuilder,
  IHistoricalComparisonService,
  IReadinessSnapshotStore,
  ReadinessInput,
} from './interfaces';
import { ReadinessRuleEngine } from './ruleEngine';
import { ReadinessScoreCalculator, toGrade } from './scoreCalculator';
import { GapAnalyzer } from './gapAnalyzer';
import { RecommendationEngine } from './recommendationEngine';
import { RoadmapBuilder } from './roadmapBuilder';
import { EvidenceBuilder } from './evidenceBuilder';
import { HistoricalComparisonService, InMemorySnapshotStore } from './historicalComparison';
import { createReadinessPacks } from './packs';

/**
 * Orchestrates every readiness pack plus the common engines into a single,
 * deterministic FutureReadinessResult. AI is never invoked here — the result is
 * complete and presentable on its own; AI only adds narrative later.
 */
export class FutureReadinessService implements IFutureReadinessService {
  constructor(
    private readonly packs: IReadinessPack[],
    private readonly roadmapBuilder: IRoadmapBuilder,
    private readonly historical: IHistoricalComparisonService,
  ) {}

  assess(input: ReadinessInput): FutureReadinessResult {
    const packAssessments = this.packs.map((p) => p.assess(input));
    const overall = this.computeOverall(packAssessments);
    const roadmap = this.roadmapBuilder.build(packAssessments);
    const generatedAt = new Date().toISOString();

    const result: FutureReadinessResult = { packs: packAssessments, overall, roadmap, historical: [], generatedAt };
    result.historical = this.historical.compare(result);
    this.historical.record(result);
    return result;
  }

  buildContext(result: FutureReadinessResult, analysis: AnalysisResult): FutureReadinessContext {
    const ext = analysis.orgInfoData?.extended;
    const activeUsers = analysis.userSummary?.totalActiveUsers ?? analysis.orgInfoData?.activeUsers ?? 0;
    const edition = analysis.orgDetails?.orgType ?? 'unknown';
    const complexity = this.inferComplexity(analysis);

    const packs: ReadinessContextPack[] = result.packs.map((p) => ({
      packId: p.packId,
      packName: p.packName,
      overallScore: p.overallScore,
      grade: p.grade,
      maturityLevel: p.maturityLevel,
      dimensions: p.dimensions.map((d) => ({
        dimension: d.dimension,
        score: d.score,
        status: d.status,
        reason: d.reason,
        evidence: d.evidence,
      })),
      blockingIssues: p.blockingIssues.map((g) => ({
        title: g.title,
        severity: g.severity,
        area: g.area,
        whyItMatters: g.whyItMatters,
        evidence: g.evidence,
      })),
      strengths: p.strengths,
    }));

    return {
      generatedAt: result.generatedAt,
      orgProfile: {
        complexity,
        activeUsers,
        isHyperforce: ext?.isHyperforce ?? false,
        edition,
      },
      overall: result.overall,
      packs,
      roadmap: result.roadmap,
      historical: result.historical,
    };
  }

  private computeOverall(packs: ReadinessPackAssessment[]): { score: number; grade: ScoreGrade } {
    if (packs.length === 0) { return { score: 0, grade: 'F' }; }
    const score = Math.round(packs.reduce((s, p) => s + p.overallScore, 0) / packs.length);
    return { score, grade: toGrade(score) };
  }

  private inferComplexity(analysis: AnalysisResult): string {
    const users = analysis.userSummary?.totalActiveUsers ?? 0;
    const customObjects = analysis.orgInventory?.customObjectCount ?? analysis.dataModelSummary?.customObjectCount ?? 0;
    const apexClasses = analysis.orgInventory?.apexClassCount ?? analysis.codeInventory?.apexClasses ?? 0;
    if (users >= 1000 || customObjects >= 100 || apexClasses >= 400) { return 'Enterprise'; }
    if (users >= 200 || customObjects >= 50 || apexClasses >= 150) { return 'Large'; }
    if (users >= 50 || customObjects >= 15 || apexClasses >= 50) { return 'Medium'; }
    return 'Small';
  }

  /**
   * Factory wiring all common engines + the pack registry with defaults.
   * Pass a snapshot store (globalState-backed) to enable historical comparison;
   * omit it in tests to use an in-memory store.
   */
  static createDefault(store?: IReadinessSnapshotStore): FutureReadinessService {
    const evidenceBuilder = new EvidenceBuilder();
    const ruleEngine = new ReadinessRuleEngine(evidenceBuilder);
    const scoreCalculator = new ReadinessScoreCalculator();
    const gapAnalyzer = new GapAnalyzer();
    const recommendationEngine = new RecommendationEngine();
    const roadmapBuilder = new RoadmapBuilder();
    const historical = new HistoricalComparisonService(store ?? new InMemorySnapshotStore());

    const packs = createReadinessPacks({ ruleEngine, scoreCalculator, gapAnalyzer, recommendationEngine });

    return new FutureReadinessService(packs, roadmapBuilder, historical);
  }
}
