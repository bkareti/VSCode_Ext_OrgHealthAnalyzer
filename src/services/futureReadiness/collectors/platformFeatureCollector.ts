import { SalesforceService } from '../../salesforceService';
import { PlatformFeatureFlags } from '../../../types/futureReadiness';

const DATA_CLOUD_RE = /data\s*cloud|customer data platform|\bcdp\b|genie/i;
const EINSTEIN_RE = /einstein|prompt|copilot|agentforce|generative|\bgpt\b/i;
const AGENTFORCE_RE = /agentforce|copilot|einstein.?gpt|prompt.?template/i;
const TRUST_LAYER_RE = /trust.?layer|einsteinGPT|EinsteinTrustLayer|AiPerformance/i;

/**
 * Derives AI / Data Cloud / Agentforce feature enablement from Feature Licenses,
 * and also probes Enhanced Domains + MFA enforcement status.
 * No customer data is read — only metadata and aggregate feature flags.
 */
export async function collectPlatformFeatures(
  sf: SalesforceService,
  edition: string,
): Promise<PlatformFeatureFlags> {
  let dataCloudEnabled = false;
  const einsteinFeatures: string[] = [];
  let agentforceLicensed = false;
  let trustLayerEnabled = false;
  let enhancedDomainEnabled: boolean | undefined;
  let mfaRequired: boolean | undefined;

  try {
    const featureLicenses = await sf.getFeatureLicenses();
    for (const fl of featureLicenses) {
      const active = /active|enabled/i.test(fl.status) || fl.totalLicenses > 0;
      if (!active) { continue; }
      if (DATA_CLOUD_RE.test(fl.name)) { dataCloudEnabled = true; }
      if (EINSTEIN_RE.test(fl.name)) { einsteinFeatures.push(fl.name); }
      if (AGENTFORCE_RE.test(fl.name)) { agentforceLicensed = true; }
      if (TRUST_LAYER_RE.test(fl.name)) { trustLayerEnabled = true; }
    }
  } catch {
    // Feature licenses are unavailable on some editions — leave defaults.
  }

  // Enhanced Domains: DomainSite records exist only when Enhanced Domains is deployed.
  // An empty result means not yet enabled; a query failure means not determinable.
  try {
    const domains = await sf.toolingQuery<{ Id: string }>('SELECT Id FROM DomainSite LIMIT 1');
    enhancedDomainEnabled = domains.length > 0;
  } catch {
    // DomainSite not supported on this edition — leave undefined (→ 'na' check).
  }

  // MFA enforcement: Organization.IsMfaRequired is available from API v52+.
  try {
    const orgRows = await sf.query<{ IsMfaRequired: boolean }>(
      'SELECT IsMfaRequired FROM Organization LIMIT 1',
    );
    mfaRequired = orgRows[0]?.IsMfaRequired ?? false;
  } catch {
    // Field not available on this API version — leave undefined (→ 'na' check).
  }

  return {
    dataCloudEnabled,
    einsteinFeatures,
    agentforceLicensed,
    trustLayerEnabled,
    enhancedDomainEnabled,
    mfaRequired,
    edition,
  };
}
