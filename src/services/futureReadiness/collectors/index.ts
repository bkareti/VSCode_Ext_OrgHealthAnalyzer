import { SalesforceService } from '../../salesforceService';
import { ReadinessCollectorData } from '../../../types/futureReadiness';
import { collectDuplicateRules } from './duplicateRuleCollector';
import { collectMatchingRules } from './matchingRuleCollector';
import {
  collectRemoteSites, collectCertificates,
  collectProfileIpRanges, collectConnectedApps, collectInstalledPackages,
  collectNetworkAccessRangeCount, collectHardcodedCustomLabelCount,
  collectExperienceCloudSiteCount, collectOrgWideEmailDomainIssueCount,
  collectPromptTemplateCount, collectKnowledgeArticleCount,
  collectAutolaunchedFlowCount, collectInvocableApexCount,
  collectPrivateOwdCount, collectPiiSensitiveFieldCount,
} from './trustSurfaceCollector';
import { collectPlatformFeatures } from './platformFeatureCollector';
import {
  collectDataCloudIdentityCounts, collectDataStreamCount, collectDataConnectorCount,
  collectCalculatedInsightCount, collectDataSegmentCount, collectDataSpaceCount,
} from './dataCloudObjectCollector';

/**
 * Gathers the minimal set of Future-Readiness-specific metadata not already
 * present on AnalysisResult. Every collector is best-effort: a failure yields
 * empty/undefined data and the corresponding checks degrade to 'na'.
 */
export async function collectReadinessData(
  sf: SalesforceService,
  edition = 'unknown',
): Promise<ReadinessCollectorData> {
  const [
    duplicateRules, matchingRules, remoteSites, certificates, platformFeatures,
    profileIpRanges, connectedApps, installedPackages,
    orgNetworkAccessRangeCount, hardcodedCustomLabelCount,
    experienceCloudSiteCount, orgWideEmailDomainIssueCount,
    promptTemplateCount, knowledgeArticleCount,
    autolaunchedFlowCount, invocableApexCount,
    privateOwdObjectCount, piiSensitiveFieldCount,
    dataCloudIdentityCounts, dataStreamCount, dataConnectorCount,
    calculatedInsightCount, dataSegmentCount, dataSpaceCount,
  ] = await Promise.all([
    collectDuplicateRules(sf),
    collectMatchingRules(sf),
    collectRemoteSites(sf),
    collectCertificates(sf),
    collectPlatformFeatures(sf, edition),
    collectProfileIpRanges(sf),
    collectConnectedApps(sf),
    collectInstalledPackages(sf),
    collectNetworkAccessRangeCount(sf),
    collectHardcodedCustomLabelCount(sf),
    collectExperienceCloudSiteCount(sf),
    collectOrgWideEmailDomainIssueCount(sf),
    collectPromptTemplateCount(sf),
    collectKnowledgeArticleCount(sf),
    collectAutolaunchedFlowCount(sf),
    collectInvocableApexCount(sf),
    collectPrivateOwdCount(sf),
    collectPiiSensitiveFieldCount(sf),
    collectDataCloudIdentityCounts(sf),
    collectDataStreamCount(sf),
    collectDataConnectorCount(sf),
    collectCalculatedInsightCount(sf),
    collectDataSegmentCount(sf),
    collectDataSpaceCount(sf),
  ]);

  return {
    duplicateRules, matchingRules, remoteSites, certificates, platformFeatures,
    profileIpRanges, connectedApps, installedPackages,
    orgNetworkAccessRangeCount, hardcodedCustomLabelCount,
    experienceCloudSiteCount, orgWideEmailDomainIssueCount,
    promptTemplateCount, knowledgeArticleCount,
    autolaunchedFlowCount, invocableApexCount,
    privateOwdObjectCount, piiSensitiveFieldCount,
    dataCloudIdentityCounts, dataStreamCount, dataConnectorCount,
    calculatedInsightCount, dataSegmentCount, dataSpaceCount,
  };
}

export {
  collectDuplicateRules,
  collectMatchingRules,
  collectRemoteSites,
  collectCertificates,
  collectPlatformFeatures,
  collectProfileIpRanges,
  collectConnectedApps,
  collectInstalledPackages,
  collectNetworkAccessRangeCount,
  collectHardcodedCustomLabelCount,
  collectExperienceCloudSiteCount,
  collectOrgWideEmailDomainIssueCount,
  collectPromptTemplateCount,
  collectKnowledgeArticleCount,
  collectAutolaunchedFlowCount,
  collectInvocableApexCount,
  collectPrivateOwdCount,
  collectPiiSensitiveFieldCount,
  collectDataCloudIdentityCounts,
  collectDataStreamCount,
  collectDataConnectorCount,
  collectCalculatedInsightCount,
  collectDataSegmentCount,
  collectDataSpaceCount,
};
