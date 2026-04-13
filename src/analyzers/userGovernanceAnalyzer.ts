/**
 * User Governance Analyzer
 *
 * Analyzes active users, dormancy, super-admin over-provisioning,
 * never-logged-in accounts, and role hierarchy depth.
 */

import {
  Issue,
  UserGovernanceSummary,
} from '../types';
import { SalesforceService } from '../services/salesforceService';
import { logInfo, logError, logWarning } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

// Days without login to be considered dormant
const DORMANT_DAYS = 90;
// Days without any login to be considered stale (never effective)
const NEVER_LOGIN_THRESHOLD_DAYS = 30;

export class UserGovernanceAnalyzer {
  constructor(private sfService: SalesforceService) {}

  async analyze(): Promise<{ issues: Issue[]; userSummary: UserGovernanceSummary }> {
    logInfo('UserGovernanceAnalyzer: starting analysis…');
    const issues: Issue[] = [];

    try {
      const [allUsers, roles] = await Promise.all([
        this.sfService.getAllUsers(),
        this.sfService.getUserRoles(),
      ]);

      const now = new Date();
      const dormantCutoff = new Date(now.getTime() - DORMANT_DAYS * 86_400_000);
      const neverLoginCutoff = new Date(now.getTime() - NEVER_LOGIN_THRESHOLD_DAYS * 86_400_000);

      const activeUsers = allUsers.filter(u => u.IsActive);
      const inactiveUsers = allUsers.filter(u => !u.IsActive);

      // Never logged in = active user created > threshold days ago but LastLoginDate is null
      const neverLoggedIn = activeUsers.filter(u =>
        !u.LastLoginDate && u.CreatedDate && new Date(u.CreatedDate) < neverLoginCutoff
      );

      // Dormant = active user, has logged in before, but last login > 90 days ago
      const dormant = activeUsers.filter(u =>
        u.LastLoginDate && new Date(u.LastLoginDate) < dormantCutoff
      );

      // Super admins (tracked via profiles — users whose profile name includes 'System Administrator')
      const superAdmins = activeUsers.filter(u =>
        u.Profile?.Name === 'System Administrator'
      );

      // Profile distribution
      const profileMap: Record<string, number> = {};
      for (const u of activeUsers) {
        const pname = u.Profile?.Name || u.ProfileId || 'Unknown';
        profileMap[pname] = (profileMap[pname] || 0) + 1;
      }
      const profileDistribution = Object.entries(profileMap)
        .sort((a, b) => b[1] - a[1])
        .map(([profileName, count]) => ({ profileName, count }));

      // User type breakdown
      const typeMap: Record<string, number> = {};
      for (const u of activeUsers) {
        const t = u.UserType || 'Unknown';
        typeMap[t] = (typeMap[t] || 0) + 1;
      }

      // Role hierarchy depth (longest chain)
      const roleHierarchyDepth = this.calculateRoleDepth(roles);

      // ── Issue Generation ──────────────────────────────────────────────────

      if (neverLoggedIn.length > 0) {
        issues.push({
          id: `user-gov-never-login`,
          ruleId: 'user-never-logged-in',
          severity: 'warning',
          category: 'user-governance',
          message: `${neverLoggedIn.length} active user(s) have never logged in (created >${NEVER_LOGIN_THRESHOLD_DAYS} days ago)`,
          description: `Active licenses consuming seat count with no usage. Review and deactivate if provisioned in error.`,
          suggestion: 'Deactivate unused user accounts to free up licenses and reduce attack surface.',
          object: 'User',
        });
      }

      if (dormant.length > 5) {
        issues.push({
          id: `user-gov-dormant`,
          ruleId: 'user-dormant-accounts',
          severity: 'warning',
          category: 'user-governance',
          message: `${dormant.length} active user(s) have not logged in for over ${DORMANT_DAYS} days`,
          description: `Dormant active users represent unused licenses and potential security risk if credentials are compromised.`,
          suggestion: 'Review dormant accounts and freeze or deactivate as appropriate.',
          object: 'User',
        });
      }

      if (superAdmins.length > 3) {
        issues.push({
          id: `user-gov-super-admins`,
          ruleId: 'excess-system-administrators',
          severity: 'error',
          category: 'user-governance',
          message: `${superAdmins.length} users have the System Administrator profile`,
          description: `System Administrators have unrestricted access to all data and configuration. Having more than 3 is a security risk.`,
          suggestion: 'Reduce System Administrator count. Use delegated admin profiles with minimum required permissions.',
          object: 'Profile',
        });
      } else if (superAdmins.length > 1) {
        issues.push({
          id: `user-gov-super-admins`,
          ruleId: 'excess-system-administrators',
          severity: 'warning',
          category: 'user-governance',
          message: `${superAdmins.length} users have the System Administrator profile`,
          description: `Consider reducing the number of full System Administrators following least-privilege principles.`,
          suggestion: 'Create delegated admin profiles for specific admin functions.',
          object: 'Profile',
        });
      }

      if (roleHierarchyDepth > 10) {
        issues.push({
          id: `user-gov-role-depth`,
          ruleId: 'deep-role-hierarchy',
          severity: 'warning',
          category: 'user-governance',
          message: `Role hierarchy depth is ${roleHierarchyDepth} levels deep`,
          description: `Very deep role hierarchies can cause performance issues with record sharing and visibility calculations.`,
          suggestion: 'Flatten the role hierarchy where possible. Aim for < 10 levels.',
          object: 'UserRole',
        });
      }

      // Info: large user counts
      if (activeUsers.length > 500) {
        issues.push({
          id: `user-gov-large-user-base`,
          ruleId: 'large-user-base',
          severity: 'info',
          category: 'user-governance',
          message: `Org has ${activeUsers.length} active users — ensure sharing rules and performance are optimised for scale`,
          description: `Large user bases benefit from well-designed role hierarchies, group-based sharing, and territory management.`,
          object: 'User',
        });
      }

      const userSummary: UserGovernanceSummary = {
        totalActiveUsers: activeUsers.length,
        totalInactiveUsers: inactiveUsers.length,
        neverLoggedIn: neverLoggedIn.length,
        dormantUsers: dormant.length,
        superAdmins: superAdmins.length,
        profileDistribution,
        usersByType: typeMap,
        roleHierarchyDepth,
      };

      logInfo(`UserGovernanceAnalyzer: ${activeUsers.length} active users, ${dormant.length} dormant, ${superAdmins.length} admins`);
      return { issues, userSummary };

    } catch (err) {
      logError('UserGovernanceAnalyzer failed', err as Error);
      return {
        issues,
        userSummary: {
          totalActiveUsers: 0,
          totalInactiveUsers: 0,
          neverLoggedIn: 0,
          dormantUsers: 0,
          superAdmins: 0,
          profileDistribution: [],
          usersByType: {},
          roleHierarchyDepth: 0,
        },
      };
    }
  }

  /** Calculate the max depth of the role tree */
  private calculateRoleDepth(roles: Array<{ Id: string; ParentRoleId?: string }>): number {
    if (!roles.length) { return 0; }
    const childToParent = new Map(roles.map(r => [r.Id, r.ParentRoleId]));
    let maxDepth = 0;
    for (const role of roles) {
      let depth = 0;
      let current: string | undefined = role.Id;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        visited.add(current);
        depth++;
        current = childToParent.get(current);
      }
      if (depth > maxDepth) { maxDepth = depth; }
    }
    return maxDepth;
  }
}

export function createUserGovernanceAnalyzer(sfService: SalesforceService): UserGovernanceAnalyzer {
  return new UserGovernanceAnalyzer(sfService);
}
