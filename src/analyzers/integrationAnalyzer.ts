/**
 * Integration Analyzer
 * Analyzes Named Credentials, Connected Apps, Custom Metadata Types,
 * and Platform Events in the connected org.
 */

import { Issue } from '../types';
import { SalesforceService } from '../services/salesforceService';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logWarning } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

// ============================================================================
// Types
// ============================================================================

export interface IntegrationAnalysisResult {
  issues: Issue[];
  namedCredentialCount: number;
  legacyCredentialCount: number;
  connectedAppCount: number;
  platformEventCount: number;
  customMetadataTypeCount: number;
}

// ============================================================================
// Analyzer
// ============================================================================

export class IntegrationAnalyzer {
  constructor(private salesforceService: SalesforceService) {}

  async analyze(): Promise<IntegrationAnalysisResult> {
    logSection('Integration Analysis');

    const result: IntegrationAnalysisResult = {
      issues: [],
      namedCredentialCount: 0,
      legacyCredentialCount: 0,
      connectedAppCount: 0,
      platformEventCount: 0,
      customMetadataTypeCount: 0,
    };

    try {
      // Named Credentials
      const namedCreds = await this.salesforceService.getNamedCredentials();
      result.namedCredentialCount = namedCreds.length;
      logInfo(`Found ${namedCreds.length} Named Credentials`);

      for (const cred of namedCreds) {
        const isLegacy =
          cred.PrincipalType === 'NamedUser' ||
          cred.Protocol === 'Password' ||
          cred.Protocol === 'NoAuthentication';

        if (isLegacy) {
          result.legacyCredentialCount++;
        }

        const issues = ruleEngine.run(
          ['legacy-credential'],
          {
            name: cred.MasterLabel || cred.DeveloperName,
            protocol: cred.Protocol,
            principalType: cred.PrincipalType,
          },
          {}
        );
        result.issues.push(...issues);
      }

      // Connected Apps
      try {
        const connectedApps = await this.salesforceService.getConnectedApps();
        result.connectedAppCount = connectedApps.length;
        logInfo(`Found ${connectedApps.length} Connected Apps`);
      } catch {
        logWarning('Could not fetch Connected Apps');
      }

      // Custom Metadata Types
      try {
        const cmdts = await this.salesforceService.getCustomMetadataTypes();
        result.customMetadataTypeCount = cmdts.length;
        logInfo(`Found ${cmdts.length} Custom Metadata Types`);

        // Flag if org has very few CMDTs relative to its age (hardcoded IDs likely used instead)
        if (cmdts.length === 0) {
          result.issues.push({
            id: 'no-cmdt',
            ruleId: 'no-custom-metadata',
            severity: 'info',
            category: 'integration',
            message: 'No Custom Metadata Types found',
            description:
              'Custom Metadata Types provide environment-safe configuration. ' +
              'If you have hardcoded values or Custom Settings used as config, consider migrating.',
            suggestion:
              'Use Custom Metadata Types for environment-specific configuration such as endpoint URLs, thresholds, and feature flags',
          });
        }
      } catch {
        logWarning('Could not fetch Custom Metadata Types');
      }

      // Platform Events
      try {
        const events = await this.salesforceService.getPlatformEvents();
        result.platformEventCount = events.length;
        logInfo(`Found ${events.length} Platform Events`);
      } catch {
        logWarning('Could not fetch Platform Events');
      }

    } catch (error) {
      logWarning(`Integration analysis failed: ${getErrorMessage(error)}`);
    }

    return result;
  }
}

export function createIntegrationAnalyzer(
  salesforceService: SalesforceService
): IntegrationAnalyzer {
  return new IntegrationAnalyzer(salesforceService);
}
