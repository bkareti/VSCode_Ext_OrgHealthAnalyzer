import { AnalysisResult } from '../../types';
import {
  BusinessContext,
  OrgComplexity,
  AutomationComplexity,
  RiskLevel,
} from '../../types/assessmentContext';
import { IBusinessContextEngine } from './interfaces';

export class BusinessContextEngine implements IBusinessContextEngine {
  infer(result: AnalysisResult): BusinessContext {
    const activeUsers   = result.userSummary?.totalActiveUsers ?? result.metadata.analyzedUsers ?? 0;
    const customObjects = result.orgInventory?.customObjectCount ?? result.dataModelSummary?.customObjectCount ?? 0;
    const apexClasses   = result.orgInventory?.apexClassCount   ?? result.codeInventory?.apexClasses ?? 0;

    return {
      orgComplexity:              this.inferOrgComplexity(activeUsers, customObjects, apexClasses),
      orgComplexityEvidence:      { activeUsers, customObjectCount: customObjects, apexClassCount: apexClasses },
      automationComplexity:       this.inferAutomationComplexity(result),
      automationComplexityEvidence: this.buildAutomationEvidence(result),
      architectureMaturityLevel:  this.inferMaturityLevel(result),
      architectureMaturityEvidence: this.buildMaturityEvidence(result),
      businessRisk:               this.inferBusinessRisk(result),
      scalabilityRisk:            this.inferScalabilityRisk(result),
      complianceRisk:             this.inferComplianceRisk(result),
      complianceRiskEvidence:     this.buildComplianceEvidence(result),
    };
  }

  private inferOrgComplexity(users: number, customObjects: number, apexClasses: number): OrgComplexity {
    if (users >= 1000 || customObjects >= 100 || apexClasses >= 400) { return 'Enterprise'; }
    if (users >= 200  || customObjects >= 50  || apexClasses >= 150) { return 'Large'; }
    if (users >= 50   || customObjects >= 15  || apexClasses >= 50)  { return 'Medium'; }
    return 'Small';
  }

  private inferAutomationComplexity(result: AnalysisResult): AutomationComplexity {
    const auto = result.automationSummary;
    if (!auto) { return 'Low'; }

    const multiTriggerObjects = Object.entries(auto.objectMap ?? {})
      .filter(([, v]) => v.triggers > 1)
      .map(([k]) => k);

    const totalAutomations = (auto.totalTriggers ?? 0) + (auto.totalFlows ?? 0);

    if (multiTriggerObjects.length > 0 || totalAutomations >= 60) { return 'High'; }
    if (totalAutomations >= 20) { return 'Medium'; }
    return 'Low';
  }

  private buildAutomationEvidence(result: AnalysisResult): BusinessContext['automationComplexityEvidence'] {
    const auto = result.automationSummary;
    const multiTriggerObjects = auto
      ? Object.entries(auto.objectMap ?? {}).filter(([, v]) => v.triggers > 1).map(([k]) => k)
      : [];
    return {
      totalTriggers:       auto?.totalTriggers ?? 0,
      totalFlows:          auto?.totalFlows ?? 0,
      multiTriggerObjects,
    };
  }

  private inferMaturityLevel(result: AnalysisResult): 1 | 2 | 3 | 4 | 5 {
    const auto        = result.automationSummary;
    const scores      = result.scores;
    const coverage    = result.testCoverageSummary?.averageCoverage ?? 0;
    const staleTotal  = result.staleMetadata?.totalStaleItems ?? 0;

    const processBuilders   = auto?.totalProcessBuilders  ?? 0;
    const workflowRules     = auto?.totalWorkflowRules    ?? 0;
    const multiTriggers     = auto
      ? Object.values(auto.objectMap ?? {}).some(v => v.triggers > 1)
      : false;

    // Level 5: excellent scores, high coverage, no legacy automation.
    if (scores.overall >= 90 && coverage >= 90 && processBuilders === 0 && workflowRules === 0) {
      return 5;
    }
    // Level 4: good scores, solid coverage, clean automation, few stale items.
    if (scores.overall >= 75 && coverage >= 85 && processBuilders === 0 && staleTotal < 20) {
      return 4;
    }
    // Level 3: standardized patterns but some stale metadata present.
    if (!multiTriggers && processBuilders === 0 && workflowRules === 0 && scores.overall >= 65) {
      return 3;
    }
    // Level 1: clear ad-hoc signals — legacy automation AND multi-trigger objects.
    if ((processBuilders > 0 || workflowRules > 5) && multiTriggers) {
      return 1;
    }
    // Level 2: some patterns exist but inconsistently applied.
    return 2;
  }

  private buildMaturityEvidence(result: AnalysisResult): string[] {
    const evidence: string[] = [];
    const auto = result.automationSummary;

    const multiTriggerObjects = auto
      ? Object.entries(auto.objectMap ?? {}).filter(([, v]) => v.triggers > 1).map(([k]) => k)
      : [];
    if (multiTriggerObjects.length > 0) {
      evidence.push(`${multiTriggerObjects.length} object(s) have multiple triggers (${multiTriggerObjects.slice(0, 3).join(', ')})`);
    }
    const processBuilders = auto?.totalProcessBuilders ?? 0;
    if (processBuilders > 0) { evidence.push(`${processBuilders} deprecated Process Builder(s) still active`); }

    const workflowRules = auto?.totalWorkflowRules ?? 0;
    if (workflowRules > 0) { evidence.push(`${workflowRules} Workflow Rule(s) pending migration`); }

    const coverage = result.testCoverageSummary?.averageCoverage;
    if (coverage !== undefined) { evidence.push(`Average test coverage: ${coverage}%`); }

    if (evidence.length === 0) {
      evidence.push('Automation follows modern patterns');
    }
    return evidence;
  }

  private inferBusinessRisk(result: AnalysisResult): RiskLevel {
    const secScore       = result.scores.security ?? 100;
    const overallScore   = result.scores.overall;
    const criticalIssues = (result.issues ?? []).filter(i => i.severity === 'error').length;

    if (secScore < 40 || overallScore < 40 || criticalIssues > 30) { return 'Critical'; }
    if (secScore < 60 || overallScore < 60 || criticalIssues > 15) { return 'High'; }
    if (secScore < 75 || overallScore < 75 || criticalIssues > 5)  { return 'Medium'; }
    return 'Low';
  }

  private inferScalabilityRisk(result: AnalysisResult): RiskLevel {
    const ldvObjects     = Object.values(result.objectRecordCounts ?? {}).filter(c => c >= 500_000).length;
    const soqlInLoop     = (result.issues ?? []).filter(i => i.ruleId === 'soql-in-loop').length;
    const dmlInLoop      = (result.issues ?? []).filter(i => i.ruleId === 'dml-in-loop').length;
    const asyncRisks     = (result.governorRisks ?? []).filter(r =>
      r.prediction.soqlQueries.risk === 'high' || r.prediction.dmlStatements.risk === 'high'
    ).length;

    if (ldvObjects > 2 || soqlInLoop + dmlInLoop > 10) { return 'High'; }
    if (ldvObjects > 0 || soqlInLoop + dmlInLoop > 3 || asyncRisks > 3) { return 'Medium'; }
    return 'Low';
  }

  private inferComplianceRisk(result: AnalysisResult): RiskLevel {
    const issues = result.issues ?? [];
    const withoutSharingCount = issues.filter(
      i => i.category === 'security' && /without.?sharing/i.test(i.message)
    ).length;
    const modifyAllCount = issues.filter(i => i.ruleId === 'modifyall-permission').length;
    const overprivileged = result.profileSummary?.overprivilegedCount ?? 0;
    const superAdmins    = result.userSummary?.superAdmins ?? 0;

    if (withoutSharingCount > 5 || modifyAllCount > 3 || superAdmins > 5) { return 'High'; }
    if (withoutSharingCount > 1 || modifyAllCount > 0 || overprivileged > 5) { return 'Medium'; }
    return 'Low';
  }

  private buildComplianceEvidence(result: AnalysisResult): string[] {
    const evidence: string[] = [];
    const issues      = result.issues ?? [];
    const withSharing = issues.filter(i => /without.?sharing/i.test(i.message));
    if (withSharing.length > 0) {
      evidence.push(`${withSharing.length} Apex class(es) declared without sharing — data visibility risk`);
    }
    const superAdmins = result.userSummary?.superAdmins;
    if (superAdmins && superAdmins > 0) {
      evidence.push(`${superAdmins} user(s) have Modify All Data permission`);
    }
    const overprivileged = result.profileSummary?.overprivilegedCount;
    if (overprivileged && overprivileged > 0) {
      evidence.push(`${overprivileged} overprivileged profile(s) with 3+ dangerous permissions`);
    }
    return evidence;
  }
}
