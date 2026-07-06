import { AnalysisResult } from '../../types';
import {
  AssessmentContext,
  MetadataCoverage,
  ScanMetadata,
  SecuritySummary,
  PerformanceSummary,
  ArchitectureSummary,
  TestCoverageSummary,
  LicenseUtilizationItem,
  GovernorLimitsSummary,
} from '../../types/assessmentContext';
import {
  IAssessmentContextBuilder,
  IPiiSanitizer,
  IFindingNormalizer,
  IScoreCalculator,
  ITrendAnalyzer,
  IQuickWinEngine,
  IBusinessContextEngine,
  IPayloadOptimizer,
} from './interfaces';

export class AssessmentContextBuilder implements IAssessmentContextBuilder {
  constructor(
    private readonly piiSanitizer: IPiiSanitizer,
    private readonly findingNormalizer: IFindingNormalizer,
    private readonly scoreCalculator: IScoreCalculator,
    private readonly trendAnalyzer: ITrendAnalyzer,
    private readonly quickWinEngine: IQuickWinEngine,
    private readonly businessContextEngine: IBusinessContextEngine,
    private readonly payloadOptimizer: IPayloadOptimizer,
  ) {}

  build(snapshot: AnalysisResult, previousSnapshot?: AnalysisResult): AssessmentContext {
    const metadataCoverage = this.buildMetadataCoverage(snapshot);

    const context: AssessmentContext = {
      scanMetadata:            this.buildScanMetadata(snapshot),
      metadataCoverage,
      scores:                  this.scoreCalculator.calculate(snapshot),
      findings:                this.findingNormalizer.normalize(snapshot.issues ?? [], this.piiSanitizer),
      businessContext:         this.businessContextEngine.infer(snapshot),
      quickWins:               this.quickWinEngine.identify(snapshot, this.piiSanitizer),
      trends:                  this.trendAnalyzer.analyze(snapshot, previousSnapshot),
      securitySummary:         this.buildSecuritySummary(snapshot),
      performanceSummary:      this.buildPerformanceSummary(snapshot),
      architectureSummary:     this.buildArchitectureSummary(snapshot),
      testCoverageSummary:     this.buildTestCoverageSummary(snapshot),
      licenseUtilizationSummary: this.buildLicenseUtilization(snapshot),
      governorLimitsSummary:   this.buildGovernorLimitsSummary(snapshot),
      // optimizerReport is filled in by payloadOptimizer.
      optimizerReport: { estimatedTokens: 0, budget: 0, truncationsApplied: [] },
    };

    return this.payloadOptimizer.optimize(context);
  }

  // ── Metadata Coverage ──────────────────────────────────────────────────────

  private buildMetadataCoverage(r: AnalysisResult): MetadataCoverage {
    return {
      hasDataModelStats:  Array.isArray(r.dataModelStats) && r.dataModelStats.length > 0,
      hasAutomationSummary: !!r.automationSummary,
      hasTestCoverage:    !!r.testCoverageSummary,
      hasLicenseSummary:  Array.isArray(r.licenseSummary) && r.licenseSummary.length > 0,
      hasQueryExplain:    Array.isArray(r.queryExplainResults) && r.queryExplainResults.length > 0,
      hasOrgLimits:       Array.isArray(r.orgLimits) && r.orgLimits.length > 0,
      hasStaleMetadata:   !!r.staleMetadata,
      hasOrgInventory:    !!r.orgInventory,
      hasUserGovernance:  !!r.userSummary,
      hasProfileSecurity: !!r.profileSummary,
      hasScaleCenter:     !!r.scaleCenterMetrics,
      hasDependencyGraph: !!r.dependencyGraph,
      hasGovernorRisks:   Array.isArray(r.governorRisks) && r.governorRisks.length > 0,
      hasTrends:          Array.isArray(r.trends) && r.trends.length > 1,
      hasRecordCounts:    !!r.objectRecordCounts && Object.keys(r.objectRecordCounts).length > 0,
      hasEntryPoints:     Array.isArray(r.entryPoints) && r.entryPoints.length > 0,
    };
  }

  // ── Scan Metadata ──────────────────────────────────────────────────────────

  private buildScanMetadata(r: AnalysisResult): ScanMetadata {
    const rawOrgId = r.metadata.orgId ?? r.orgDetails?.orgId ?? '';
    const maskedOrgId = rawOrgId.length > 3 ? `${rawOrgId.slice(0, 3)}${'*'.repeat(rawOrgId.length - 3)}` : '<masked>';

    const ts = r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp);

    return {
      timestamp:     ts.toISOString(),
      durationMs:    r.duration,
      orgId:         maskedOrgId,
      apiVersion:    r.metadata.apiVersion ?? r.orgDetails?.apiVersion ?? 'unknown',
      modelTarget:   'auto',
      analyzersRan:  this.inferAnalyzersRan(r),
      tokenEstimate: 0, // Will be updated by payloadOptimizer.
    };
  }

  private inferAnalyzersRan(r: AnalysisResult): string[] {
    const ran: string[] = ['core'];
    if (r.codeInventory)       { ran.push('apex'); }
    if (r.automationSummary)   { ran.push('automation'); }
    if (r.dataModelStats?.length)  { ran.push('dataModel'); }
    if (r.testCoverageSummary) { ran.push('testCoverage'); }
    if (r.lwcSummary)          { ran.push('lwc'); }
    if (r.orgInventory)        { ran.push('orgInventory'); }
    if (r.userSummary)         { ran.push('userGovernance'); }
    if (r.profileSummary)      { ran.push('profileSecurity'); }
    if (r.staleMetadata)       { ran.push('staleMetadata'); }
    if (r.dependencyGraph)     { ran.push('dependencies'); }
    if (r.governorRisks?.length) { ran.push('governorLimits'); }
    if (r.queryExplainResults?.length) { ran.push('query'); }
    if (r.scaleCenterMetrics)  { ran.push('scaleCenter'); }
    if (r.orgLimits?.length)   { ran.push('orgLimits'); }
    return ran;
  }

  // ── Domain Summaries (direct extraction — no sub-service needed) ───────────

  private buildSecuritySummary(r: AnalysisResult): SecuritySummary {
    const issues = r.issues ?? [];
    const apexWithoutSharingCount = issues.filter(
      i => i.category === 'security' && /without.?sharing/i.test(i.message)
    ).length;
    const idempotencyGapCount = issues.filter(
      i => i.ruleId === 'sync-idempotency-risk' || i.ruleId === 'callout-no-idempotency'
    ).length;

    return {
      overprivilegedProfileCount: r.profileSummary?.overprivilegedCount ?? 0,
      apexWithoutSharingCount,
      superAdminCount:    r.userSummary?.superAdmins ?? 0,
      publicApiEntryPoints: r.entryPoints?.length ?? 0,
      idempotencyGapCount,
    };
  }

  private buildPerformanceSummary(r: AnalysisResult): PerformanceSummary {
    const issues = r.issues ?? [];

    const soqlInLoopCount  = issues.filter(i => i.ruleId === 'soql-in-loop').length;
    const dmlInLoopCount   = issues.filter(i => i.ruleId === 'dml-in-loop').length;
    const fullTableScans   = (r.queryExplainResults ?? []).filter(q => q.isFullTableScan).length;
    const asyncAntiPatternCount = issues.filter(i => i.ruleId === 'async-queueable-daisy-chain' || i.ruleId === 'batch-callout').length;

    const recordCounts = r.objectRecordCounts ?? {};
    const ldvObjects = Object.entries(recordCounts)
      .filter(([, count]) => count >= 500_000)
      .map(([name]) => name);

    const multiTriggerObjects = r.automationSummary
      ? Object.entries(r.automationSummary.objectMap ?? {})
          .filter(([, v]) => v.triggers > 1)
          .map(([k]) => k)
      : [];

    return {
      fullTableScanCount: fullTableScans,
      soqlInLoopCount,
      dmlInLoopCount,
      ldvObjectCount: ldvObjects.length,
      ldvObjects,
      asyncAntiPatternCount,
      multiTriggerObjectCount: multiTriggerObjects.length,
    };
  }

  private buildArchitectureSummary(r: AnalysisResult): ArchitectureSummary {
    const inv   = r.orgInventory;
    const code  = r.codeInventory;
    const auto  = r.automationSummary;
    const issues = r.issues ?? [];

    const deprecatedApiCount = issues.filter(i => i.category === 'technical-debt' && /api.version/i.test(i.message)).length;
    const circularDeps = r.dependencyGraph?.circularDependencies?.length ?? 0;

    return {
      totalCustomObjects:    inv?.customObjectCount  ?? r.dataModelSummary?.customObjectCount ?? 0,
      totalCustomFields:     inv?.customFieldCount   ?? 0,
      totalApexClasses:      inv?.apexClassCount     ?? code?.apexClasses    ?? 0,
      totalFlows:            inv?.flowCount          ?? auto?.totalFlows     ?? 0,
      totalTriggers:         inv?.apexTriggerCount   ?? code?.apexTriggers   ?? 0,
      workflowRulesToMigrate: auto?.totalWorkflowRules  ?? 0,
      processBuilderCount:   auto?.totalProcessBuilders ?? 0,
      circularDependencyCount: circularDeps,
      deprecatedApiUsageCount: deprecatedApiCount,
    };
  }

  private buildTestCoverageSummary(r: AnalysisResult): TestCoverageSummary {
    const cov = r.testCoverageSummary;
    return {
      averageCoverage:    cov?.averageCoverage  ?? 0,
      classesBelow75Pct:  cov?.classesBelow75   ?? 0,
      zeroCoverageCount:  cov?.zeroCoverageCount ?? 0,
    };
  }

  private buildLicenseUtilization(r: AnalysisResult): LicenseUtilizationItem[] {
    return (r.licenseSummary ?? []).map(l => ({
      licenseName:    l.name,
      totalLicenses:  l.totalLicenses,
      usedPct:        l.usedPct,
    }));
  }

  private buildGovernorLimitsSummary(r: AnalysisResult): GovernorLimitsSummary {
    const orgLimits = r.orgLimits ?? [];
    const limitsNearThreshold = orgLimits
      .filter(l => l.usedPct >= 70)
      .sort((a, b) => b.usedPct - a.usedPct)
      .map(l => ({ limitName: l.name, usedPct: l.usedPct }));

    const highRiskClassCount = (r.governorRisks ?? []).filter(g =>
      g.prediction.soqlQueries.risk  === 'high' ||
      g.prediction.dmlStatements.risk === 'high' ||
      g.prediction.cpuTime.risk      === 'high' ||
      g.prediction.heapSize.risk     === 'high'
    ).length;

    return { limitsNearThreshold, highRiskClassCount };
  }
}
