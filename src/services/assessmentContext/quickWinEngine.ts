import { AnalysisResult } from '../../types';
import { QuickWin, QuickWinPriority } from '../../types/assessmentContext';
import { IQuickWinEngine, IPiiSanitizer } from './interfaces';

const PRIORITY_ORDER: Record<QuickWinPriority, number> = { High: 0, Medium: 1, Low: 2 };

export class QuickWinEngine implements IQuickWinEngine {
  identify(result: AnalysisResult, sanitizer: IPiiSanitizer): QuickWin[] {
    const wins: QuickWin[] = [];

    this.findUnusedFields(result, sanitizer, wins);
    this.findDeprecatedAutomation(result, wins);
    this.findDormantUsers(result, wins);
    this.findStaleReports(result, wins);
    this.findUnusedPermissionSets(result, wins);

    // Sort by priority (High → Medium → Low).
    return wins.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }

  private findUnusedFields(result: AnalysisResult, sanitizer: IPiiSanitizer, wins: QuickWin[]): void {
    const stale = result.staleMetadata;
    if (!stale?.unusedCustomFields?.length) { return; }

    // Group unused fields by object.
    const byObject = new Map<string, number>();
    for (const item of stale.unusedCustomFields) {
      const obj = item.objectName ?? 'Unknown';
      byObject.set(obj, (byObject.get(obj) ?? 0) + 1);
    }

    for (const [objectName, count] of byObject) {
      if (count < 5) { continue; } // Only surface significant clusters.
      wins.push({
        title: `Remove unused custom fields on ${objectName}`,
        category: 'stale-metadata',
        reason: sanitizer.sanitizeString(`${count} custom fields on ${objectName} show no recent usage — removing them reduces schema complexity.`),
        priority: count > 20 ? 'High' : 'Medium',
        impact: 'Improves data model score and reduces schema maintenance burden.',
        complexity: 'Low',
        affectedCount: count,
      });
    }
  }

  private findDeprecatedAutomation(result: AnalysisResult, wins: QuickWin[]): void {
    const auto = result.automationSummary;
    if (!auto) { return; }

    const workflowRules = auto.totalWorkflowRules ?? 0;
    const processBuilders = auto.totalProcessBuilders ?? 0;

    if (workflowRules > 0) {
      wins.push({
        title: `Migrate ${workflowRules} Workflow Rule${workflowRules !== 1 ? 's' : ''} to Flow`,
        category: 'automation-design',
        reason: 'Workflow Rules are retired automation technology. Salesforce has announced end-of-support. Migration to Flow provides equivalent functionality with better governance.',
        priority: 'High',
        impact: 'Eliminates deprecated automation debt before enforcement deadline and improves automation score.',
        complexity: workflowRules > 10 ? 'High' : 'Medium',
        affectedCount: workflowRules,
      });
    }

    if (processBuilders > 0) {
      wins.push({
        title: `Migrate ${processBuilders} Process Builder${processBuilders !== 1 ? 's' : ''} to Flow`,
        category: 'automation-design',
        reason: 'Process Builder is deprecated. Salesforce recommends migrating all Process Builders to Flow before enforcement.',
        priority: 'High',
        impact: 'Reduces technical debt and prepares the org for upcoming Salesforce platform changes.',
        complexity: processBuilders > 5 ? 'High' : 'Medium',
        affectedCount: processBuilders,
      });
    }
  }

  private findDormantUsers(result: AnalysisResult, wins: QuickWin[]): void {
    const userSummary = result.userSummary;
    if (!userSummary) { return; }

    const dormant = userSummary.dormantUsers;
    if (dormant < 10) { return; }

    wins.push({
      title: `Deactivate ${dormant} dormant users to reclaim licenses`,
      category: 'user-governance',
      reason: `${dormant} active users have not logged in for 90+ days. Deactivating them frees up paid licenses.`,
      priority: dormant > 30 ? 'High' : 'Medium',
      impact: 'Recovers license capacity and reduces security surface area.',
      complexity: 'Low',
      affectedCount: dormant,
    });
  }

  private findStaleReports(result: AnalysisResult, wins: QuickWin[]): void {
    const stale = result.staleMetadata;
    if (!stale) { return; }

    const staleReportCount  = stale.staleReports?.length ?? 0;
    const staleDashCount    = stale.staleDashboards?.length ?? 0;
    const total = staleReportCount + staleDashCount;
    if (total < 20) { return; }

    wins.push({
      title: `Archive ${total} stale reports and dashboards`,
      category: 'stale-metadata',
      reason: `${staleReportCount} reports and ${staleDashCount} dashboards have not been accessed recently. Archiving declutters the org.`,
      priority: total > 100 ? 'Medium' : 'Low',
      impact: 'Improves org maintainability and reduces cognitive overhead for end users.',
      complexity: 'Low',
      affectedCount: total,
    });
  }

  private findUnusedPermissionSets(result: AnalysisResult, wins: QuickWin[]): void {
    const profileSummary = result.profileSummary;
    if (!profileSummary?.permissionSetList) { return; }

    const unused = profileSummary.permissionSetList.filter(ps => (ps._userCount ?? 1) === 0);
    if (unused.length < 3) { return; }

    wins.push({
      title: `Remove ${unused.length} unassigned permission sets`,
      category: 'user-governance',
      reason: `${unused.length} permission sets are not assigned to any active user and can be safely removed.`,
      priority: 'Low',
      impact: 'Reduces permission model complexity and improves security review clarity.',
      complexity: 'Low',
      affectedCount: unused.length,
    });
  }
}
