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
