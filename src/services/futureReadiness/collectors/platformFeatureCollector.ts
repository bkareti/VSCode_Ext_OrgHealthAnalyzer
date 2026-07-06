import { SalesforceService } from '../../salesforceService';
import { PlatformFeatureFlags } from '../../../types/futureReadiness';

const DATA_CLOUD_RE = /data\s*cloud|customer data platform|\bcdp\b|genie/i;
const EINSTEIN_RE = /einstein|prompt|copilot|agentforce|generative|\bgpt\b/i;
const AGENTFORCE_RE = /agentforce|copilot|einstein.?gpt|prompt.?template/i;

/**
 * Derives AI / Data Cloud / Agentforce feature enablement primarily from already-
 * available signals (Feature Licenses + org edition). No customer data is read —
 * only metadata and aggregate feature flags.
 */
export async function collectPlatformFeatures(
  sf: SalesforceService,
  edition: string,
): Promise<PlatformFeatureFlags> {
  let dataCloudEnabled = false;
  const einsteinFeatures: string[] = [];
  let agentforceLicensed = false;

  try {
    const featureLicenses = await sf.getFeatureLicenses();
    for (const fl of featureLicenses) {
      const active = /active|enabled/i.test(fl.status) || fl.totalLicenses > 0;
      if (!active) { continue; }
      if (DATA_CLOUD_RE.test(fl.name)) { dataCloudEnabled = true; }
      if (EINSTEIN_RE.test(fl.name)) { einsteinFeatures.push(fl.name); }
      if (AGENTFORCE_RE.test(fl.name)) { agentforceLicensed = true; }
    }
  } catch {
    // Feature licenses are unavailable on some editions — leave defaults.
  }

  return {
    dataCloudEnabled,
    einsteinFeatures,
    agentforceLicensed,
    // Enhanced-domain state is not exposed via metadata; left undefined (→ 'na' check).
    enhancedDomainEnabled: undefined,
    edition,
  };
}
