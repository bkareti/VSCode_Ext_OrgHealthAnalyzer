import { SalesforceService } from '../../salesforceService';
import { ReadinessCollectorData } from '../../../types/futureReadiness';
import { collectDuplicateRules } from './duplicateRuleCollector';
import { collectMatchingRules } from './matchingRuleCollector';
import { collectRemoteSites, collectCertificates } from './trustSurfaceCollector';
import { collectPlatformFeatures } from './platformFeatureCollector';

/**
 * Gathers the minimal set of Future-Readiness-specific metadata not already
 * present on AnalysisResult. Every collector is best-effort: a failure yields
 * empty/undefined data and the corresponding checks degrade to 'na'.
 */
export async function collectReadinessData(
  sf: SalesforceService,
  edition = 'unknown',
): Promise<ReadinessCollectorData> {
  const [duplicateRules, matchingRules, remoteSites, certificates, platformFeatures] = await Promise.all([
    collectDuplicateRules(sf),
    collectMatchingRules(sf),
    collectRemoteSites(sf),
    collectCertificates(sf),
    collectPlatformFeatures(sf, edition),
  ]);

  return { duplicateRules, matchingRules, remoteSites, certificates, platformFeatures };
}

export {
  collectDuplicateRules,
  collectMatchingRules,
  collectRemoteSites,
  collectCertificates,
  collectPlatformFeatures,
};
