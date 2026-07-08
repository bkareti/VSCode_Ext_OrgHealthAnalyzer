import { SalesforceService } from '../../salesforceService';
import {
  RemoteSiteDetail, CertificateDetail,
  ProfileIpRangeInfo, ConnectedAppInfo, InstalledPackageInfo,
} from '../../../types/futureReadiness';

/** Collects Remote Site Settings with endpoint + protocol detail (Tooling API). */
export async function collectRemoteSites(sf: SalesforceService): Promise<RemoteSiteDetail[]> {
  try {
    const rows = await sf.toolingQuery<{ SiteName?: string; EndpointUrl?: string; IsActive?: boolean }>(
      'SELECT SiteName, EndpointUrl, IsActive FROM RemoteProxy LIMIT 500',
    );
    return rows.map((r) => {
      const endpoint = r.EndpointUrl ?? '';
      return {
        name: r.SiteName ?? endpoint,
        endpoint,
        isActive: r.IsActive ?? true,
        isHttp: /^http:\/\//i.test(endpoint),
      };
    });
  } catch {
    return [];
  }
}

/** Collects Certificates with expiry + key-size detail (Tooling API). */
export async function collectCertificates(sf: SalesforceService): Promise<CertificateDetail[]> {
  try {
    const rows = await sf.toolingQuery<{ MasterLabel?: string; DeveloperName?: string; ExpirationDate?: string; KeySize?: number }>(
      'SELECT DeveloperName, MasterLabel, ExpirationDate, KeySize FROM Certificate LIMIT 200',
    );
    const now = Date.now();
    return rows.map((r) => {
      const daysUntilExpiry = r.ExpirationDate
        ? Math.round((new Date(r.ExpirationDate).getTime() - now) / 86_400_000)
        : undefined;
      return {
        name: r.MasterLabel ?? r.DeveloperName ?? 'Certificate',
        expirationDate: r.ExpirationDate,
        keySize: r.KeySize,
        daysUntilExpiry,
      };
    });
  } catch {
    return [];
  }
}

/** Matches hardcoded Salesforce-hosted email domains that change with Enhanced Domains / Hyperforce. */
const SFDC_EMAIL_DOMAIN_RE = /@(?:[a-z0-9-]+.)*(?:salesforce.com|force.com|visualforce.com)$/i;

/**
 * Collects profiles that have at least one Login IP Range restriction.
 * Hyperforce uses different IP blocks from classic instances, so restricted
 * profiles must be updated before migration.
 */
export async function collectProfileIpRanges(sf: SalesforceService): Promise<ProfileIpRangeInfo[]> {
  try {
    const rows = await sf.query<{ ProfileId: string; IpStartAddress: string }>(
      'SELECT ProfileId, IpStartAddress FROM ProfileIpRange LIMIT 2000',
    );
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.ProfileId, (map.get(r.ProfileId) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([profileId, rangeCount]) => ({ profileId, rangeCount }));
  } catch {
    return [];
  }
}

// Matches hardcoded Salesforce instance hostnames (na1, cs89, eu25, ap20, etc.)
// that will need to be updated when the org is migrated to Hyperforce.
const INSTANCE_HOST_RE =
  /https?:\/\/(?:(?:na|cs|eu|ap|la|ind|au|uk|jp)\d+|[a-z0-9]+-dev-ed)\.salesforce\.com/i;

/**
/** Collects Connected Apps — flags hardcoded instance URLs and non-Relaxed IP restriction settings. */
export async function collectConnectedApps(sf: SalesforceService): Promise<ConnectedAppInfo[]> {
  try {
    const rows = await sf.toolingQuery<{
      MasterLabel?: string;
      StartUrl?: string;
      MobileStartUrl?: string;
      IpRelaxation?: string;
    }>('SELECT MasterLabel, StartUrl, MobileStartUrl, IpRelaxation FROM ConnectedApplication LIMIT 500');
    return rows.map((r) => ({
      name: r.MasterLabel ?? 'Unknown',
      hasHardcodedInstanceUrl:
        INSTANCE_HOST_RE.test(r.StartUrl ?? '') || INSTANCE_HOST_RE.test(r.MobileStartUrl ?? ''),
      ipRelaxation: r.IpRelaxation,
    }));
  } catch {
    return [];
  }
}

/**
 * Counts org-level trusted IP ranges (Network Access settings).
 * These IP allowlists must be updated when the org migrates to Hyperforce.
 */
export async function collectNetworkAccessRangeCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.query<{ Id: string }>('SELECT Id FROM NetworkAccess LIMIT 500');
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Counts Custom Labels whose Value contains a hardcoded Salesforce instance URL.
 * These will break after Hyperforce migration changes the org's base domain.
 */
export async function collectHardcodedCustomLabelCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Value?: string }>(
      'SELECT Value FROM CustomLabel LIMIT 1000',
    );
    return rows.filter((r) => INSTANCE_HOST_RE.test(r.Value ?? '')).length;
  } catch {
    return 0;
  }
}

/**
 * Counts live Experience Cloud sites. Each site has its own domain configuration
 * that must be updated as part of the Hyperforce migration.
 */
export async function collectExperienceCloudSiteCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.query<{ Id: string }>(
      "SELECT Id FROM Network WHERE Status = 'Live' LIMIT 200",
    );
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Counts org-wide email addresses using Salesforce-hosted domains.
 * These domains change when Enhanced Domains / Hyperforce updates the base URL,
 * requiring SPF/DKIM and sender-address updates.
 */
export async function collectOrgWideEmailDomainIssueCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.query<{ Address?: string }>(
      'SELECT Address FROM OrgWideEmailAddress LIMIT 200',
    );
    return rows.filter((r) => SFDC_EMAIL_DOMAIN_RE.test(r.Address ?? '')).length;
  } catch {
    return 0;
  }
}

/**
 * Collects installed managed and unmanaged packages.
 * All packages must be verified against Salesforce’s Hyperforce-compatible
 * ISV package list before the org is migrated.
 */
export async function collectInstalledPackages(sf: SalesforceService): Promise<InstalledPackageInfo[]> {
  try {
    const rows = await sf.toolingQuery<{
      SubscriberPackage?: { Name?: string; NamespacePrefix?: string };
    }>(
      'SELECT SubscriberPackage.Name, SubscriberPackage.NamespacePrefix FROM InstalledSubscriberPackage LIMIT 200',
    );
    return rows.map((r) => ({
      name: r.SubscriberPackage?.Name ?? 'Unknown',
      namespacePrefix: r.SubscriberPackage?.NamespacePrefix,
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// Agentforce-specific collectors
// ============================================================================

/**
 * Counts active Prompt Templates. Zero means the org has no AI content-generation
 * capability — Agentforce actions that generate responses require at least one.
 */
export async function collectPromptTemplateCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Id: string }>('SELECT Id FROM PromptTemplate LIMIT 200');
    return rows.length;
  } catch {
    // PromptTemplate not provisioned on this org/edition.
    return 0;
  }
}

/**
 * Counts published Knowledge articles.
 * Agentforce copilot actions ground responses from Knowledge; zero articles means
 * the knowledge-base grounding capability is absent.
 */
export async function collectKnowledgeArticleCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.query<{ Id: string }>(
      "SELECT Id FROM KnowledgeArticleVersion WHERE PublishStatus = 'Online' LIMIT 500",
    );
    return rows.length;
  } catch {
    // Knowledge not enabled on this org.
    return 0;
  }
}

/**
 * Counts active Autolaunched (invocable) flows.
 * Agentforce can only invoke Autolaunched flows — Screen flows are incompatible.
 */
export async function collectAutolaunchedFlowCount(sf: SalesforceService): Promise<number> {
  try {
    const rows = await sf.toolingQuery<{ Id: string }>(
      "SELECT Id FROM Flow WHERE Status = 'Active' AND ProcessType = 'AutoLaunchedFlow' LIMIT 500",
    );
    return rows.length;
  } catch {
    return 0;
  }
}

/**
 * Counts active Apex classes that expose at least one @InvocableMethod.
 * These are usable as Agentforce actions; a count of zero means no Apex-backed actions exist.
 */
export async function collectInvocableApexCount(sf: SalesforceService): Promise<number> {
  try {
    // Tooling API SOQL supports LIKE filtering on the Body (LongTextArea) of ApexClass.
    const rows = await sf.toolingQuery<{ Id: string }>(
      "SELECT Id FROM ApexClass WHERE Status = 'Active' AND Body LIKE '%@InvocableMethod%' LIMIT 200",
    );
    return rows.length;
  } catch {
    return 0;
  }
}

/** Key standard objects whose sharing defaults are checked for Agentforce accessibility. */
const KEY_AGENTFORCE_OBJECTS = ['Account', 'Contact', 'Case', 'Opportunity', 'Lead'];

/**
 * Counts how many of the five core standard objects (Account, Contact, Case,
 * Opportunity, Lead) have a Private Org-Wide Default sharing setting.
 * Private OWD blocks the Agentforce service user from grounding on those objects
 * unless explicit sharing rules are configured.
 */
export async function collectPrivateOwdCount(sf: SalesforceService): Promise<number> {
  try {
    const objectList = KEY_AGENTFORCE_OBJECTS.map((o) => `'${o}'`).join(', ');
    const rows = await sf.toolingQuery<{ DeveloperName: string; DefaultSharingAccess: string }>(
      `SELECT DeveloperName, DefaultSharingAccess FROM EntityDefinition WHERE DeveloperName IN (${objectList})`,
    );
    return rows.filter((r) => r.DefaultSharingAccess === 'Private').length;
  } catch {
    return 0;
  }
}

/** PII-indicative patterns in custom field API names. */
const PII_FIELD_RE =
  /ssn|social.?security|credit.?card|card.?number|cvv|password|date.?of.?birth|\bdob\b|passport|driver.?licen/i;

/**
 * Counts custom fields on the five core standard objects whose API name suggests
 * they store PII. These fields should be masked before being used in AI grounding
 * prompts to prevent data leakage through the Einstein Trust Layer.
 */
export async function collectPiiSensitiveFieldCount(sf: SalesforceService): Promise<number> {
  try {
    const objectList = KEY_AGENTFORCE_OBJECTS.map((o) => `'${o}'`).join(', ');
    const rows = await sf.toolingQuery<{ DeveloperName: string }>(
      `SELECT DeveloperName FROM FieldDefinition WHERE NamespacePrefix = null AND EntityDefinition.QualifiedApiName IN (${objectList}) LIMIT 500`,
    );
    return rows.filter((r) => PII_FIELD_RE.test(r.DeveloperName ?? '')).length;
  } catch {
    return 0;
  }
}
