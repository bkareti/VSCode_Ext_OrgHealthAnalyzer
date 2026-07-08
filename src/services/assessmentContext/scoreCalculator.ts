import { AnalysisResult, Issue, IssueCategory } from '../../types';
import {
  ScoredDimension,
  ScoredDimensionName,
  ScoreGrade,
  ConfidenceLevel,
  RuleContribution,
} from '../../types/assessmentContext';
import { IScoreCalculator } from './interfaces';

const SEVERITY_DEDUCTIONS: Record<string, number> = { error: 10, warning: 5, info: 2 };

// Categories that map to each of the 7 original HealthScores dimensions.
const DIMENSION_CATEGORIES: Record<string, IssueCategory[]> = {
  codeQuality:      ['code-quality'],
  automationDesign: ['automation-design'],
  dataModel:        ['data-model'],
  performance:      ['performance'],
  security:         ['security', 'profile-security'],
  testing:          ['testing'],
  integration:      ['integration'],
};

// Weights for the 7 original dimensions (matching HealthScoreCalculator defaults).
const ORIGINAL_WEIGHTS: Record<string, number> = {
  codeQuality:      25,
  automationDesign: 20,
  dataModel:        15,
  performance:      20,
  security:         10,
  testing:          5,
  integration:      5,
};

// Weights for the 6 new dimensions.
const NEW_DIM_WEIGHTS: Record<string, number> = {
  architecture:        8,
  governorLimits:      6,
  licenseUtilization:  4,
  featureAdoption:     4,
  complexity:          4,
  maintainability:     4,
};

function toGrade(score: number): ScoreGrade {
  if (score >= 90) { return 'A'; }
  if (score >= 80) { return 'B'; }
  if (score >= 70) { return 'C'; }
  if (score >= 60) { return 'D'; }
  return 'F';
}

function buildRuleBreakdown(issues: Issue[], categories: IssueCategory[]): RuleContribution[] {
  const catSet = new Set<IssueCategory>(categories);
  const byRule = new Map<string, RuleContribution>();

  for (const issue of issues) {
    if (!catSet.has(issue.category)) { continue; }
    const deduction = SEVERITY_DEDUCTIONS[issue.severity] ?? 0;
    if (!byRule.has(issue.ruleId)) {
      byRule.set(issue.ruleId, { ruleId: issue.ruleId, count: 0, severity: issue.severity, deduction: 0 });
    }
    const entry = byRule.get(issue.ruleId)!;
    entry.count++;
    entry.deduction += deduction;
  }

  return Array.from(byRule.values()).sort((a, b) => b.deduction - a.deduction);
}

function buildOriginalDimension(
  name: ScoredDimensionName,
  score: number,
  weight: number,
  issues: Issue[],
  categories: IssueCategory[],
): ScoredDimension {
  const ruleBreakdown = buildRuleBreakdown(issues, categories);
  const totalDeduction = ruleBreakdown.reduce((s, r) => s + r.deduction, 0);
  const reason = ruleBreakdown.length === 0
    ? 'No issues detected in this category.'
    : `${ruleBreakdown[0].ruleId} (${ruleBreakdown[0].count} occurrence${ruleBreakdown[0].count !== 1 ? 's' : ''}, −${ruleBreakdown[0].deduction} pts) is the top contributor; total deduction ${totalDeduction} pts.`;

  return { dimension: name, score, weight, grade: toGrade(score), confidence: 'high', ruleBreakdown, reason };
}

export class ScoreCalculator implements IScoreCalculator {
  calculate(result: AnalysisResult): ScoredDimension[] {
    const scores = result.scores;
    const issues = result.issues ?? [];
    const dimensions: ScoredDimension[] = [];

    // ── 7 original dimensions: read verbatim from result.scores (no recalculation) ──
    for (const [name, categories] of Object.entries(DIMENSION_CATEGORIES)) {
      const score = (scores as unknown as Record<string, number>)[name] ?? 0;
      dimensions.push(buildOriginalDimension(
        name as ScoredDimensionName,
        score,
        ORIGINAL_WEIGHTS[name],
        issues,
        categories,
      ));
    }

    // ── 6 new dimensions: computed from rich payloads ──
    dimensions.push(this.calcArchitecture(issues));
    dimensions.push(this.calcGovernorLimits(result));
    dimensions.push(this.calcLicenseUtilization(result));
    dimensions.push(this.calcFeatureAdoption(result));
    dimensions.push(this.calcComplexity(result));
    dimensions.push(this.calcMaintainability(result, issues));

    // ── Overall: weighted average across all 13 dimensions ──
    const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0);
    const weightedSum = dimensions.reduce((s, d) => s + d.score * d.weight, 0);
    const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    dimensions.push({
      dimension: 'overall',
      score: overallScore,
      weight: 100,
      grade: toGrade(overallScore),
      confidence: 'high',
      ruleBreakdown: [],
      reason: `Weighted average across all 13 scored dimensions. Note: the UI overall score (${scores.overall}) uses only the 7 core dimensions — use that value for healthScoreBreakdown in the CTA report.`,
    });

    return dimensions;
  }

  private calcArchitecture(issues: Issue[]): ScoredDimension {
    const ctaIssues = issues.filter(i => i.category === 'cta-review');
    const ruleBreakdown = buildRuleBreakdown(ctaIssues, ['cta-review']);
    const totalDeduction = Math.min(80, ruleBreakdown.reduce((s, r) => s + r.deduction, 0));
    const score = Math.max(0, 100 - totalDeduction);
    const reason = ctaIssues.length === 0
      ? 'No CTA-tier architectural issues detected.'
      : `${ctaIssues.length} architectural issue${ctaIssues.length !== 1 ? 's' : ''} detected across CTA domains.`;
    return {
      dimension: 'architecture',
      score,
      weight: NEW_DIM_WEIGHTS.architecture,
      grade: toGrade(score),
      confidence: ctaIssues.length > 0 ? 'high' : 'medium',
      ruleBreakdown,
      reason,
    };
  }

  private calcGovernorLimits(result: AnalysisResult): ScoredDimension {
    const orgLimits = result.orgLimits ?? [];
    const governorRisks = result.governorRisks ?? [];
    const hasData = orgLimits.length > 0 || governorRisks.length > 0;

    let deduction = 0;
    const breakdown: RuleContribution[] = [];

    for (const limit of orgLimits) {
      if (limit.usedPct >= 90) { deduction += 15; breakdown.push({ ruleId: limit.name, count: 1, severity: 'error', deduction: 15 }); }
      else if (limit.usedPct >= 75) { deduction += 8; breakdown.push({ ruleId: limit.name, count: 1, severity: 'warning', deduction: 8 }); }
      else if (limit.usedPct >= 60) { deduction += 3; breakdown.push({ ruleId: limit.name, count: 1, severity: 'info', deduction: 3 }); }
    }

    const highRiskClasses = governorRisks.filter(r =>
      r.prediction.soqlQueries.risk === 'high' ||
      r.prediction.dmlStatements.risk === 'high' ||
      r.prediction.cpuTime.risk === 'high' ||
      r.prediction.heapSize.risk === 'high'
    ).length;

    if (highRiskClasses > 0) {
      deduction += highRiskClasses * 5;
      breakdown.push({ ruleId: 'governor-risk-classes', count: highRiskClasses, severity: 'warning', deduction: highRiskClasses * 5 });
    }

    const score = Math.max(0, 100 - Math.min(80, deduction));
    const confidence: ConfidenceLevel = hasData ? 'high' : 'low';
    const reason = hasData
      ? `${orgLimits.filter(l => l.usedPct >= 60).length} limit(s) above 60% usage; ${highRiskClasses} high-risk class(es) predicted.`
      : 'No org limits data available — governor limit score is an estimate.';

    return {
      dimension: 'governorLimits',
      score,
      weight: NEW_DIM_WEIGHTS.governorLimits,
      grade: toGrade(score),
      confidence,
      ruleBreakdown: breakdown,
      reason,
    };
  }

  private calcLicenseUtilization(result: AnalysisResult): ScoredDimension {
    const licenses = result.licenseSummary ?? [];
    const hasData = licenses.length > 0;

    if (!hasData) {
      return {
        dimension: 'licenseUtilization',
        score: 70,
        weight: NEW_DIM_WEIGHTS.licenseUtilization,
        grade: 'C',
        confidence: 'low',
        ruleBreakdown: [],
        reason: 'No license data available — defaulting to neutral score.',
      };
    }

    const avgUsedPct = licenses.reduce((s, l) => s + l.usedPct, 0) / licenses.length;
    // Optimal utilization is 60-85%. Over 90% = risk; under 30% = waste.
    let score: number;
    let reason: string;
    if (avgUsedPct > 95) { score = 40; reason = 'Licenses critically near capacity — risk of allocation failures.'; }
    else if (avgUsedPct > 90) { score = 60; reason = 'License utilization above 90% — procurement risk.'; }
    else if (avgUsedPct > 85) { score = 75; reason = `Average license utilization at ${Math.round(avgUsedPct)}% — approaching capacity.`; }
    else if (avgUsedPct >= 30) { score = 90; reason = `Healthy license utilization at ${Math.round(avgUsedPct)}%.`; }
    else { score = 70; reason = `Low license utilization (${Math.round(avgUsedPct)}%) — potential over-provisioning.`; }

    return {
      dimension: 'licenseUtilization',
      score,
      weight: NEW_DIM_WEIGHTS.licenseUtilization,
      grade: toGrade(score),
      confidence: 'high',
      ruleBreakdown: [],
      reason,
    };
  }

  private calcFeatureAdoption(result: AnalysisResult): ScoredDimension {
    const auto = result.automationSummary;
    const hasData = !!auto;

    if (!hasData) {
      return {
        dimension: 'featureAdoption',
        score: 70,
        weight: NEW_DIM_WEIGHTS.featureAdoption,
        grade: 'C',
        confidence: 'low',
        ruleBreakdown: [],
        reason: 'No automation summary available — feature adoption score is an estimate.',
      };
    }

    const workflowRules = auto!.totalWorkflowRules ?? 0;
    const processBuilders = auto!.totalProcessBuilders ?? 0;
    const flows = auto!.totalFlows ?? 0;
    const legacyCount = workflowRules + processBuilders;

    let score: number;
    let reason: string;
    if (legacyCount === 0) {
      score = 95;
      reason = 'No deprecated automation (Workflow Rules or Process Builders) detected.';
    } else if (legacyCount <= 3) {
      score = 75;
      reason = `${legacyCount} deprecated automation artifact(s) — recommend migrating to Flow.`;
    } else if (legacyCount <= 10) {
      score = 55;
      reason = `${legacyCount} deprecated automation artifacts; ${flows} modern flows. Migration recommended before retirement deadline.`;
    } else {
      score = 35;
      reason = `${legacyCount} deprecated automation artifacts (${workflowRules} Workflow Rules, ${processBuilders} Process Builders). Significant migration required.`;
    }

    const breakdown: RuleContribution[] = [];
    if (workflowRules > 0) { breakdown.push({ ruleId: 'workflow-rules-to-migrate', count: workflowRules, severity: 'warning', deduction: workflowRules * 3 }); }
    if (processBuilders > 0) { breakdown.push({ ruleId: 'process-builders-to-migrate', count: processBuilders, severity: 'warning', deduction: processBuilders * 4 }); }

    return {
      dimension: 'featureAdoption',
      score,
      weight: NEW_DIM_WEIGHTS.featureAdoption,
      grade: toGrade(score),
      confidence: 'high',
      ruleBreakdown: breakdown,
      reason,
    };
  }

  private calcComplexity(result: AnalysisResult): ScoredDimension {
    const inv = result.orgInventory;
    const code = result.codeInventory;
    const hasData = !!(inv ?? code);

    const customObjects = inv?.customObjectCount ?? 0;
    const apexClasses = inv?.apexClassCount ?? code?.apexClasses ?? 0;
    const triggers = inv?.apexTriggerCount ?? code?.apexTriggers ?? 0;
    const flows = inv?.flowCount ?? result.automationSummary?.totalFlows ?? 0;

    if (!hasData) {
      return { dimension: 'complexity', score: 70, weight: NEW_DIM_WEIGHTS.complexity, grade: 'C', confidence: 'low', ruleBreakdown: [], reason: 'Insufficient inventory data.' };
    }

    let deduction = 0;
    const breakdown: RuleContribution[] = [];

    // Graduated deductions for org complexity signals.
    if (customObjects > 150) { deduction += 20; breakdown.push({ ruleId: 'high-custom-object-count', count: customObjects, severity: 'warning', deduction: 20 }); }
    else if (customObjects > 75) { deduction += 10; breakdown.push({ ruleId: 'high-custom-object-count', count: customObjects, severity: 'info', deduction: 10 }); }

    if (apexClasses > 500) { deduction += 20; breakdown.push({ ruleId: 'high-apex-class-count', count: apexClasses, severity: 'warning', deduction: 20 }); }
    else if (apexClasses > 250) { deduction += 10; breakdown.push({ ruleId: 'high-apex-class-count', count: apexClasses, severity: 'info', deduction: 10 }); }

    if (triggers > 50) { deduction += 15; breakdown.push({ ruleId: 'high-trigger-count', count: triggers, severity: 'warning', deduction: 15 }); }
    else if (triggers > 25) { deduction += 7; breakdown.push({ ruleId: 'high-trigger-count', count: triggers, severity: 'info', deduction: 7 }); }

    if (flows > 100) { deduction += 10; breakdown.push({ ruleId: 'high-flow-count', count: flows, severity: 'info', deduction: 10 }); }

    const score = Math.max(0, 100 - Math.min(80, deduction));
    return {
      dimension: 'complexity',
      score,
      weight: NEW_DIM_WEIGHTS.complexity,
      grade: toGrade(score),
      confidence: 'medium',
      ruleBreakdown: breakdown,
      reason: `Org has ${customObjects} custom objects, ${apexClasses} Apex classes, ${triggers} triggers, and ${flows} flows.`,
    };
  }

  private calcMaintainability(result: AnalysisResult, issues: Issue[]): ScoredDimension {
    const stale = result.staleMetadata;
    const debtIssues = issues.filter(i => i.category === 'technical-debt');
    const hasData = !!(stale ?? debtIssues.length);

    const staleTotal = stale?.totalStaleItems ?? 0;
    const debtCount = debtIssues.length;

    let deduction = 0;
    const breakdown: RuleContribution[] = [];

    if (staleTotal > 100) { deduction += 20; breakdown.push({ ruleId: 'stale-metadata-volume', count: staleTotal, severity: 'warning', deduction: 20 }); }
    else if (staleTotal > 30) { deduction += 10; breakdown.push({ ruleId: 'stale-metadata-volume', count: staleTotal, severity: 'info', deduction: 10 }); }

    if (debtCount > 0) {
      const debtDeduction = Math.min(30, debtCount * 3);
      deduction += debtDeduction;
      breakdown.push({ ruleId: 'technical-debt-issues', count: debtCount, severity: 'warning', deduction: debtDeduction });
    }

    const score = Math.max(0, 100 - Math.min(80, deduction));
    return {
      dimension: 'maintainability',
      score,
      weight: NEW_DIM_WEIGHTS.maintainability,
      grade: toGrade(score),
      confidence: hasData ? 'medium' : 'low',
      ruleBreakdown: breakdown,
      reason: `${staleTotal} stale metadata items and ${debtCount} technical-debt issues detected.`,
    };
  }
}
