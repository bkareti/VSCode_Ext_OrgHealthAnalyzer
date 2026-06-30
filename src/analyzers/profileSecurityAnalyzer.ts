/**
 * Profile Security Analyzer
 *
 * Analyzes profiles and permission sets for over-privileged access:
 * Modify All Data, View All Data, Author Apex, Manage Users, Customize Application.
 */

import {
  Issue,
  ProfileSecuritySummary,
} from '../types';
import { SalesforceService } from '../services/salesforceService';
import { logInfo, logError } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

export class ProfileSecurityAnalyzer {
  constructor(private sfService: SalesforceService) {}

  async analyze(): Promise<{ issues: Issue[]; profileSummary: ProfileSecuritySummary }> {
    logInfo('ProfileSecurityAnalyzer: starting analysis…');
    const issues: Issue[] = [];

    try {
      const [profiles, permSets] = await Promise.all([
        this.sfService.getProfilesWithPermissions(),
        this.sfService.getPermissionSets(),
      ]);

      // Profile metrics
      const withModifyAll = profiles.filter(p => p.PermissionsModifyAllData);
      const withViewAll   = profiles.filter(p => p.PermissionsViewAllData);
      const withAuthorApex = profiles.filter(p => p.PermissionsAuthorApex);
      const withManageUsers = profiles.filter(p => p.PermissionsManageUsers);

      const overprivileged = profiles.filter(p => {
        let count = 0;
        if (p.PermissionsModifyAllData)    { count++; }
        if (p.PermissionsViewAllData)      { count++; }
        if (p.PermissionsAuthorApex)       { count++; }
        if (p.PermissionsManageUsers)      { count++; }
        if (p.PermissionsCustomizeApplication) { count++; }
        return count >= 3;
      });

      // Permission set metrics
      const psWithModifyAll = permSets.filter(ps => ps.PermissionsModifyAllData);
      const psWithViewAll   = permSets.filter(ps => ps.PermissionsViewAllData);

      // ── Issue Generation ──────────────────────────────────────────────────

      if (withModifyAll.length > 0) {
        const profileNames = withModifyAll.map(p => p.Name).slice(0, 5).join(', ');
        issues.push({
          id: 'profile-sec-modify-all',
          ruleId: 'profile-modify-all-data',
          severity: withModifyAll.length > 2 ? 'error' : 'warning',
          category: 'profile-security',
          message: `${withModifyAll.length} profile(s) have "Modify All Data": ${profileNames}${withModifyAll.length > 5 ? '…' : ''}`,
          description: 'Modify All Data bypasses all record-level security (OWD, sharing rules, role hierarchy). Only System Administrator should have this.',
          suggestion: 'Remove Modify All Data from non-admin profiles. Use FLS and object-level permissions instead.',
          object: 'Profile',
        });
      }

      if (withViewAll.length > 1) {
        const profileNames = withViewAll.map(p => p.Name).slice(0, 5).join(', ');
        issues.push({
          id: 'profile-sec-view-all',
          ruleId: 'profile-view-all-data',
          severity: 'warning',
          category: 'profile-security',
          message: `${withViewAll.length} profile(s) have "View All Data": ${profileNames}${withViewAll.length > 5 ? '…' : ''}`,
          description: 'View All Data grants read access to every record in the org regardless of sharing settings.',
          suggestion: 'Restrict View All Data to reporting/admin profiles. Use Reports with sharing-aware visibility instead.',
          object: 'Profile',
        });
      }

      if (withAuthorApex.length > 3) {
        issues.push({
          id: 'profile-sec-author-apex',
          ruleId: 'profile-author-apex',
          severity: 'warning',
          category: 'profile-security',
          message: `${withAuthorApex.length} profile(s) can Author Apex (execute arbitrary code in production)`,
          description: 'Author Apex in production should be restricted to developer/admin profiles to prevent accidental or malicious code execution.',
          suggestion: 'Limit Author Apex to System Administrator and dedicated dev profiles.',
          object: 'Profile',
        });
      }

      if (overprivileged.length > 0) {
        const profileNames = overprivileged.map(p => p.Name).slice(0, 5).join(', ');
        issues.push({
          id: 'profile-sec-overprivileged',
          ruleId: 'overprivileged-profiles',
          severity: 'error',
          category: 'profile-security',
          message: `${overprivileged.length} profile(s) have 3+ dangerous permissions: ${profileNames}`,
          description: 'Profiles combining Modify All Data, View All Data, Author Apex, Manage Users, and Customize Application represent maximum attack surface.',
          suggestion: 'Apply least-privilege principle: split responsibilities into separate permission sets.',
          object: 'Profile',
        });
      }

      if (psWithModifyAll.length > 0) {
        const psNames = psWithModifyAll.map(ps => ps.Name || ps.Label).slice(0, 5).join(', ');
        issues.push({
          id: 'ps-sec-modify-all',
          ruleId: 'permission-set-modify-all-data',
          severity: 'error',
          category: 'profile-security',
          message: `${psWithModifyAll.length} permission set(s) grant "Modify All Data": ${psNames}`,
          description: 'Permission Sets with Modify All Data can be assigned to any user to grant full data access, effectively bypassing all record security.',
          suggestion: 'Remove Modify All Data from permission sets. Use object-level CRUD and FLS instead.',
          object: 'PermissionSet',
        });
      }

      if (psWithViewAll.length > 2) {
        issues.push({
          id: 'ps-sec-view-all',
          ruleId: 'permission-set-view-all-data',
          severity: 'warning',
          category: 'profile-security',
          message: `${psWithViewAll.length} permission set(s) grant "View All Data"`,
          description: 'Multiple permission sets with View All Data indicates overly broad data visibility grants.',
          suggestion: 'Replace View All Data with specific object-level "View All" permissions per object.',
          object: 'PermissionSet',
        });
      }

      // Info: overall profile count
      issues.push({
        id: 'profile-sec-count-info',
        ruleId: 'profile-count',
        severity: 'info',
        category: 'profile-security',
        message: `Org has ${profiles.length} profiles and ${permSets.length} custom permission sets`,
        description: 'High profile/permission set counts increase management overhead. Consider rationalising.',
        object: 'Profile',
      });

      const profileSummary: ProfileSecuritySummary = {
        totalProfiles: profiles.length,
        systemAdminProfiles: withModifyAll.length,
        profilesWithModifyAll: withModifyAll.length,
        profilesWithViewAll: withViewAll.length,
        profilesWithAuthorApex: withAuthorApex.length,
        overprivilegedCount: overprivileged.length,
        profileList: profiles,
        permissionSetList: permSets,
      };

      logInfo(`ProfileSecurityAnalyzer: ${profiles.length} profiles, ${overprivileged.length} overprivileged`);
      return { issues, profileSummary };

    } catch (err) {
      logError('ProfileSecurityAnalyzer failed', err as Error);
      return {
        issues,
        profileSummary: {
          totalProfiles: 0,
          systemAdminProfiles: 0,
          profilesWithModifyAll: 0,
          profilesWithViewAll: 0,
          profilesWithAuthorApex: 0,
          overprivilegedCount: 0,
          profileList: [],
        },
      };
    }
  }
}

export function createProfileSecurityAnalyzer(sfService: SalesforceService): ProfileSecurityAnalyzer {
  return new ProfileSecurityAnalyzer(sfService);
}
