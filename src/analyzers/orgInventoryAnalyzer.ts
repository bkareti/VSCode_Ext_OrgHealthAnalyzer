/**
 * Org Inventory Analyzer
 *
 * Builds a comprehensive inventory of the org's metadata components:
 * installed packages, Visualforce pages, custom labels, and counts of
 * all major metadata types for the Overview and Inventory tab.
 */

import {
  Issue,
  OrgInventorySummary,
} from '../types';
import { SalesforceService } from '../services/salesforceService';
import { logInfo, logError } from '../utils/logger';

export class OrgInventoryAnalyzer {
  constructor(private sfService: SalesforceService) {}

  async analyze(
    apexClassCount: number,
    apexTriggerCount: number,
    flowCount: number,
  ): Promise<{ issues: Issue[]; orgInventory: OrgInventorySummary }> {
    logInfo('OrgInventoryAnalyzer: starting analysis…');
    const issues: Issue[] = [];

    try {
      const [packages, vfPages, labels, customFields, permSets, validationRules, entityDefs, profiles, recordTypes, pageLayouts, flexiPages] = await Promise.all([
        this.sfService.getInstalledPackages(),
        this.sfService.getVisualforcePages(),
        this.sfService.getCustomLabels(),
        this.sfService.getCustomFields(),
        this.sfService.getPermissionSets(),
        this.sfService.getValidationRules(),
        this.sfService.getEntityDefinitions(),
        this.sfService.getProfilesWithPermissions(),
        this.sfService.getRecordTypes(),
        this.sfService.getPageLayouts(),
        this.sfService.getFlexiPages(),
      ]);

      const customObjectCount = entityDefs.filter(e =>
        e.QualifiedApiName.endsWith('__c')
      ).length;

      const totalComponents =
        apexClassCount + apexTriggerCount + flowCount +
        customObjectCount + customFields.length + permSets.length +
        validationRules.length + vfPages.length + packages.length +
        recordTypes.length + pageLayouts.length + flexiPages.length;

      // ── Issue Generation ──────────────────────────────────────────────────

      if (packages.length > 0) {
        // Flag packages with old API versions (heuristic: version < 50 = old)
        const oldPackages = packages.filter(p => {
          const major = p.SubscriberPackageVersion?.MajorVersion || 0;
          return major > 0 && major < 50;
        });
        if (oldPackages.length > 0) {
          const names = oldPackages
            .map(p => p.SubscriberPackage?.Name || 'Unknown')
            .slice(0, 5).join(', ');
          issues.push({
            id: 'inv-old-packages',
            ruleId: 'outdated-packages',
            severity: 'info',
            category: 'org-inventory',
            message: `${oldPackages.length} installed package(s) may be on older API versions: ${names}`,
            description: 'Outdated managed packages can introduce compatibility issues with new Salesforce releases.',
            suggestion: 'Review package release notes and upgrade to latest versions where possible.',
            object: 'InstalledSubscriberPackage',
          });
        }

        issues.push({
          id: 'inv-package-count',
          ruleId: 'installed-packages-info',
          severity: 'info',
          category: 'org-inventory',
          message: `Org has ${packages.length} installed managed package(s)`,
          description: 'Managed packages add to org complexity and can affect governor limits and deployment windows.',
          object: 'InstalledSubscriberPackage',
        });
      }

      if (vfPages.length > 0) {
        // Flag Visualforce pages with old API versions (< 45 = pre-Lightning)
        const oldVfPages = vfPages.filter(vf => vf.ApiVersion < 45);
        if (oldVfPages.length > 0) {
          issues.push({
            id: 'inv-old-vf-pages',
            ruleId: 'outdated-visualforce',
            severity: 'warning',
            category: 'org-inventory',
            message: `${oldVfPages.length} Visualforce page(s) use API version < 45 (pre-Lightning)`,
            description: 'Old Visualforce pages may not render correctly in Lightning Experience and represent technical debt.',
            suggestion: 'Migrate old Visualforce pages to LWC or update to current API version.',
            object: 'ApexPage',
          });
        }

        if (vfPages.length > 50) {
          issues.push({
            id: 'inv-many-vf-pages',
            ruleId: 'high-visualforce-count',
            severity: 'info',
            category: 'org-inventory',
            message: `Org has ${vfPages.length} Visualforce pages — consider migrating to LWC`,
            description: 'Large numbers of Visualforce pages indicate legacy UI debt.',
            suggestion: 'Prioritise migration of high-traffic Visualforce pages to Lightning Web Components.',
            object: 'ApexPage',
          });
        }
      }

      if (labels.length > 500) {
        issues.push({
          id: 'inv-many-labels',
          ruleId: 'high-label-count',
          severity: 'info',
          category: 'org-inventory',
          message: `Org has ${labels.length} custom labels — audit for unused or duplicate entries`,
          description: 'Custom label sprawl increases translation maintenance overhead.',
          object: 'ExternalString',
        });
      }

      // ── Profile Issues ──────────────────────────────────────────────────
      const customProfiles = profiles.filter(p => p.Name !== 'System Administrator' && p.Name !== 'Standard User');
      if (customProfiles.length > 20) {
        issues.push({
          id: 'inv-too-many-profiles',
          ruleId: 'high-profile-count',
          severity: 'warning',
          category: 'org-inventory',
          message: `Org has ${customProfiles.length} custom profiles — consider consolidating with Permission Sets`,
          description: 'Salesforce recommends minimizing profiles and leveraging Permission Sets and Permission Set Groups for flexible access control.',
          suggestion: 'Audit profiles for overlap, consolidate into fewer base profiles, and move granular permissions to Permission Sets.',
          object: 'Profile',
        });
      }

      if (profiles.length > permSets.length && permSets.length > 0) {
        issues.push({
          id: 'inv-profiles-exceed-permsets',
          ruleId: 'legacy-permission-model',
          severity: 'info',
          category: 'org-inventory',
          message: `Profile count (${profiles.length}) exceeds Permission Set count (${permSets.length}) — may indicate legacy permission model`,
          description: 'Modern Salesforce orgs typically have more Permission Sets than Profiles for flexible, scalable access management.',
          suggestion: 'Transition to a Permission Set-based model with minimal base profiles.',
          object: 'Profile',
        });
      }

      logInfo(`OrgInventoryAnalyzer: ${packages.length} packages, ${vfPages.length} VF pages, ${labels.length} labels, ${recordTypes.length} record types, ${pageLayouts.length} page layouts, ${flexiPages.length} Lightning pages`);

      return {
        issues,
        orgInventory: {
          installedPackages: packages,
          visualforcePages: vfPages,
          customLabels: labels,
          apexClassCount,
          apexTriggerCount,
          flowCount,
          customObjectCount,
          customFieldCount: customFields.length,
          permissionSetCount: permSets.length,
          validationRuleCount: validationRules.length,
          profileCount: profiles.length,
          recordTypeCount: recordTypes.length,
          pageLayoutCount: pageLayouts.length,
          flexiPageCount: flexiPages.length,
          totalComponents,
        },
      };

    } catch (err) {
      logError('OrgInventoryAnalyzer failed', err as Error);
      return {
        issues,
        orgInventory: {
          installedPackages: [],
          visualforcePages: [],
          customLabels: [],
          apexClassCount,
          apexTriggerCount,
          flowCount,
          customObjectCount: 0,
          customFieldCount: 0,
          permissionSetCount: 0,
          validationRuleCount: 0,
          profileCount: 0,
          recordTypeCount: 0,
          pageLayoutCount: 0,
          flexiPageCount: 0,
          totalComponents: 0,
        },
      };
    }
  }
}

export function createOrgInventoryAnalyzer(sfService: SalesforceService): OrgInventoryAnalyzer {
  return new OrgInventoryAnalyzer(sfService);
}
