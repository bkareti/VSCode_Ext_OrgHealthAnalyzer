/**
 * Permission Analyzer
 * Detects overly permissive permission sets and profiles in the connected org.
 */

import { Issue } from '../types';
import { SalesforceService } from '../services/salesforceService';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logWarning } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

// ============================================================================
// Types
// ============================================================================

export interface PermissionAnalysisResult {
  issues: Issue[];
  totalPermissionSets: number;
  modifyAllCount: number;
  viewAllCount: number;
  /** Total Permission Set Groups (modern permission model). */
  permissionSetGroups: number;
  /** Permission Set Groups whose aggregate permissions need recalculation. */
  outdatedPermissionSetGroups: number;
}

// ============================================================================
// Analyzer
// ============================================================================

export class PermissionAnalyzer {
  constructor(private salesforceService: SalesforceService) {}

  async analyze(): Promise<PermissionAnalysisResult> {
    logSection('Permission & Security Analysis');

    const result: PermissionAnalysisResult = {
      issues: [],
      totalPermissionSets: 0,
      modifyAllCount: 0,
      viewAllCount: 0,
      permissionSetGroups: 0,
      outdatedPermissionSetGroups: 0,
    };

    try {
      const permSets = await this.salesforceService.getPermissionSets();
      result.totalPermissionSets = permSets.length;
      logInfo(`Found ${permSets.length} custom permission sets`);

      for (const ps of permSets) {
        if (ps.PermissionsModifyAllData) {
          result.modifyAllCount++;
        }
        if (ps.PermissionsViewAllData) {
          result.viewAllCount++;
        }

        const issues = ruleEngine.run(
          ['modifyall-permission'],
          {
            permissionSetName: ps.Label || ps.Name,
            hasModifyAll: !!ps.PermissionsModifyAllData,
            hasViewAll: !!ps.PermissionsViewAllData,
            isProfile: !!ps.ProfileId,
          },
          {}
        );
        result.issues.push(...issues);
      }

      logInfo(
        `Security: ${result.modifyAllCount} with ModifyAll, ${result.viewAllCount} with ViewAll`
      );

      // Permission Set Groups — modern permission model + recalculation health.
      const psGroups = await this.salesforceService.getPermissionSetGroups();
      result.permissionSetGroups = psGroups.length;
      const outdated = psGroups.filter(g => (g.Status || '').toLowerCase() === 'outdated');
      result.outdatedPermissionSetGroups = outdated.length;
      for (const g of outdated) {
        result.issues.push({
          id: `psg-outdated-${g.Id}`,
          ruleId: 'permission-set-group-outdated',
          severity: 'warning',
          category: 'security',
          message: `Permission Set Group "${g.MasterLabel || g.DeveloperName}" is Outdated — its aggregate permissions need recalculation.`,
          description: 'An Outdated Permission Set Group means users may not have the effective permissions the group is supposed to grant until Salesforce recalculates it.',
          object: g.DeveloperName,
          suggestion: 'Recalculate the Permission Set Group (Setup → Permission Set Groups → Recalculate) or review recent membership changes.',
        });
      }
      logInfo(`Security: ${result.permissionSetGroups} permission set groups (${result.outdatedPermissionSetGroups} outdated)`);
    } catch (error) {
      logWarning(`Permission analysis failed: ${getErrorMessage(error)}`);
    }

    return result;
  }
}

export function createPermissionAnalyzer(
  salesforceService: SalesforceService
): PermissionAnalyzer {
  return new PermissionAnalyzer(salesforceService);
}
