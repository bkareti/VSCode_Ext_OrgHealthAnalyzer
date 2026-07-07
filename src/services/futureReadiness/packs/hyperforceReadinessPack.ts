import { PackId } from '../../../types/futureReadiness';
import { ReadinessCheck } from '../interfaces';
import { BaseReadinessPack } from './basePack';
import { getIssues, countIssues, outcome, na } from './packHelpers';

/**
 * Hyperforce Readiness checks.
 * Evaluates domain configuration, secure endpoints, integration hardening,
 * authentication/access, and legacy compatibility — the standard Hyperforce
 * migration checklist derived from public Salesforce guidance.
 */
export const HYPERFORCE_READINESS_CHECKS: ReadinessCheck[] = [
  // ── Domain Readiness (30) ──────────────────────────────────────────
  {
    id: 'my-domain',
    dimension: 'Domain Readiness',
    weight: 10,
    evaluate(input) {
      const ext = input.result.orgInfoData?.extended;
      if (!ext) { return na('Org extended details unavailable.'); }
      const has = !!ext.myDomain;
      const hyperforce = ext.isHyperforce ? ' (org already on Hyperforce)' : '';
      return outcome(
        has ? 95 : 40,
        [`My Domain: ${ext.myDomain || 'not configured'}${hyperforce}`],
        has ? undefined : 'Enable My Domain — it is a prerequisite for Hyperforce and Enhanced Domains.',
      );
    },
  },
  {
    id: 'enhanced-domains',
    dimension: 'Domain Readiness',
    weight: 10,
    evaluate(input) {
      const pf = input.collectors.platformFeatures;
      if (!pf || pf.enhancedDomainEnabled === undefined) { return na('Enhanced Domain status was not collected.'); }
      return outcome(
        pf.enhancedDomainEnabled ? 95 : 45,
        [`Enhanced Domains enabled: ${pf.enhancedDomainEnabled ? 'yes' : 'no'}`],
        pf.enhancedDomainEnabled ? undefined : 'Deploy Enhanced Domains to avoid hardcoded-domain breakage on Hyperforce.',
      );
    },
  },

  {
    id: 'experience-cloud-sites',
    dimension: 'Domain Readiness',
    weight: 5,
    evaluate(input) {
      const count = input.collectors.experienceCloudSiteCount;
      if (count === undefined) { return na('Experience Cloud site data was not collected.'); }
      const score = count === 0 ? 95 : count <= 2 ? 75 : 60;
      return outcome(
        score,
        [`${count} live Experience Cloud site(s) requiring domain review`],
        count > 0 ? 'Review Experience Cloud site domains and CDN configuration — Hyperforce changes the base domain structure.' : undefined,
      );
    },
  },
  {
    id: 'org-wide-email-domains',
    dimension: 'Domain Readiness',
    weight: 5,
    evaluate(input) {
      const count = input.collectors.orgWideEmailDomainIssueCount;
      if (count === undefined) { return na('Org-wide email address data was not collected.'); }
      const score = count === 0 ? 95 : count <= 2 ? 70 : 50;
      return outcome(
        score,
        [`${count} org-wide email address(es) using Salesforce-hosted domains`],
        count > 0 ? 'Update org-wide email sender addresses that use Salesforce-hosted domains — these change with Enhanced Domains on Hyperforce.' : undefined,
      );
    },
  },

  // ── Secure Endpoints (25) ────────────────────────────────────────────────
  {
    id: 'remote-sites-https',
    dimension: 'Secure Endpoints',
    weight: 13,
    evaluate(input) {
      const sites = input.collectors.remoteSites;
      if (!sites) { return na('Remote site detail was not collected.'); }
      const http = sites.filter((s) => s.isHttp && s.isActive);
      const score = http.length === 0 ? 95 : http.length <= 2 ? 60 : 35;
      return outcome(
        score,
        [`${sites.length} remote sites; ${http.length} using insecure http://`],
        http.length > 0 ? 'Migrate insecure http:// remote sites to https:// before Hyperforce migration.' : undefined,
      );
    },
  },
  {
    id: 'certificates',
    dimension: 'Secure Endpoints',
    weight: 12,
    evaluate(input) {
      const certs = input.collectors.certificates;
      if (!certs) { return na('Certificate detail was not collected.'); }
      const expiringSoon = certs.filter((c) => (c.daysUntilExpiry ?? 999) <= 60);
      const weak = certs.filter((c) => (c.keySize ?? 2048) < 2048);
      const problems = expiringSoon.length + weak.length;
      const score = problems === 0 ? 95 : problems <= 2 ? 65 : 40;
      return outcome(
        score,
        [`${certs.length} certificates; ${expiringSoon.length} expiring ≤60 days; ${weak.length} weak (<2048-bit)`],
        problems > 0 ? 'Rotate expiring or weak certificates before the Hyperforce cutover window.' : undefined,
      );
    },
  },

  // ── Integration Hardening (25) ───────────────────────────────────────────
  {
    id: 'named-credentials',
    dimension: 'Integration Hardening',
    weight: 10,
    evaluate(input) {
      const integrations = input.result.orgInfoData?.integrations;
      if (!integrations) { return na('Integration metadata unavailable.'); }
      const named = integrations.namedCredentials ?? 0;
      const legacyCred = countIssues(input, (i) => i.category === 'integration' && /legacy|credential/i.test(i.message));
      const score = legacyCred === 0 ? (named > 0 ? 90 : 75) : legacyCred <= 2 ? 60 : 40;
      return outcome(
        score,
        [`${named} named credentials; ${legacyCred} legacy credential findings`],
        legacyCred > 0 ? 'Move hardcoded endpoints and secrets into Named Credentials for portable Hyperforce configuration.' : undefined,
      );
    },
  },
  {
    id: 'hardcoded-urls',
    dimension: 'Integration Hardening',
    weight: 10,
    evaluate(input) {
      const cnt = countIssues(input, (i) => /hardcod/i.test(i.message) && /url|endpoint|instance|domain/i.test(i.message));
      const score = cnt === 0 ? 95 : cnt <= 3 ? 60 : 35;
      return outcome(
        score,
        [`${cnt} hardcoded URL/endpoint references detected`],
        cnt > 0 ? 'Replace hardcoded Salesforce URLs with dynamic references (My Domain / Named Credentials).' : undefined,
      );
    },
  },

  {
    id: 'hardcoded-custom-labels',
    dimension: 'Integration Hardening',
    weight: 5,
    evaluate(input) {
      const count = input.collectors.hardcodedCustomLabelCount;
      if (count === undefined) { return na('Custom Label data was not collected.'); }
      const score = count === 0 ? 95 : count <= 3 ? 65 : 35;
      return outcome(
        score,
        [`${count} Custom Label(s) with hardcoded Salesforce instance URLs`],
        count > 0 ? 'Update Custom Labels containing hardcoded instance URLs — use relative paths or My Domain references after migration.' : undefined,
      );
    },
  },

  // ── Authentication & Access (25) ─────────────────────────────────────────
  {
    id: 'mfa-posture',
    dimension: 'Authentication & Access',
    weight: 8,
    evaluate(input) {
      const pf = input.collectors.platformFeatures;
      if (!pf || pf.mfaRequired === undefined) {
        return na('MFA enforcement status unavailable — verify Session Settings and identity policies manually before migration.');
      }
      return outcome(
        pf.mfaRequired ? 95 : 45,
        [`MFA enforcement: ${pf.mfaRequired ? 'enforced org-wide' : 'NOT enforced'}`],
        pf.mfaRequired ? undefined : 'Enable org-wide MFA enforcement in Session Settings — a standard Hyperforce security checkpoint.',
      );
    },
  },
  {
    id: 'guest-user-exposure',
    dimension: 'Authentication & Access',
    weight: 7,
    evaluate(input) {
      const u = input.result.userSummary;
      if (!u) { return na('User governance data unavailable.'); }
      const guests = u.usersByType?.['Guest'] ?? u.usersByType?.['GuestUser'] ?? 0;
      const score = guests === 0 ? 90 : guests <= 2 ? 70 : 50;
      return outcome(
        score,
        [`${guests} guest users`],
        guests > 0 ? 'Review guest user sharing and object access — a standard Hyperforce security checkpoint.' : undefined,
      );
    },
  },
  {
    id: 'profile-ip-ranges',
    dimension: 'Authentication & Access',
    weight: 5,
    evaluate(input) {
      const ranges = input.collectors.profileIpRanges;
      if (!ranges) { return na('Profile IP range data was not collected.'); }
      const count = ranges.length;
      const score = count === 0 ? 95 : count <= 3 ? 70 : 50;
      return outcome(
        score,
        [`${count} profile(s) with Login IP Restrictions`],
        count > 0 ? 'Update Login IP Ranges on restricted profiles — Hyperforce uses different IP blocks than classic instances.' : undefined,
      );
    },
  },
  {
    id: 'network-access-ranges',
    dimension: 'Authentication & Access',
    weight: 5,
    evaluate(input) {
      const count = input.collectors.orgNetworkAccessRangeCount;
      if (count === undefined) { return na('Org-level Network Access data was not collected.'); }
      const score = count === 0 ? 95 : count <= 5 ? 70 : 50;
      return outcome(
        score,
        [`${count} org-level trusted IP range(s) in Network Access`],
        count > 0 ? 'Update org-level trusted IP ranges (Setup → Network Access) — Hyperforce uses different IP blocks than classic instances.' : undefined,
      );
    },
  },

  // ── Legacy & Compatibility (35) ──────────────────────────────────────────
  {
    id: 'deprecated-api',
    dimension: 'Legacy & Compatibility',
    weight: 10,
    evaluate(input) {
      const cnt = getIssues(input).filter((i) => i.category === 'technical-debt' && /api.?version/i.test(i.message)).length;
      const score = cnt === 0 ? 95 : cnt <= 5 ? 70 : 45;
      return outcome(
        score,
        [`${cnt} components on deprecated or legacy API versions`],
        cnt > 0 ? 'Upgrade components off legacy API versions that are retired on Hyperforce.' : undefined,
      );
    },
  },
  {
    id: 'connected-apps',
    dimension: 'Legacy & Compatibility',
    weight: 10,
    evaluate(input) {
      const apps = input.collectors.connectedApps;
      const count = input.result.orgInfoData?.integrations?.connectedApps ?? apps?.length ?? 0;
      if (!apps && count === 0) { return na('Connected app details were not collected.'); }
      const hardcoded = apps?.filter((a) => a.hasHardcodedInstanceUrl).length ?? 0;
      const ipRestricted = apps?.filter((a) => a.ipRelaxation && a.ipRelaxation !== 'Relaxed').length ?? 0;
      const issues = hardcoded + ipRestricted;
      const parts = [
        hardcoded > 0 ? `${hardcoded} with hardcoded instance URL(s)` : '',
        ipRestricted > 0 ? `${ipRestricted} with IP restrictions to update` : '',
      ].filter(Boolean).join('; ');
      const score = issues === 0
        ? (count === 0 ? 95 : 85)
        : issues <= 2 ? 60 : 35;
      return outcome(
        score,
        [`${count} connected app(s)${parts ? `; ${parts}` : ''}`],
        issues > 0
          ? 'Update callback URLs and IP allowlists on flagged connected apps — Hyperforce instance URLs and IP blocks differ from classic.'
          : count > 0 ? 'Audit connected app OAuth callback URLs and IP allowlists for Hyperforce endpoints.' : undefined,
      );
    },
  },
  {
    id: 'installed-packages',
    dimension: 'Legacy & Compatibility',
    weight: 8,
    evaluate(input) {
      const pkgs = input.collectors.installedPackages;
      if (!pkgs) { return na('Installed package data was not collected.'); }
      const count = pkgs.length;
      const score = count === 0 ? 95 : count <= 5 ? 85 : count <= 15 ? 72 : 55;
      return outcome(
        score,
        [`${count} installed package(s) to verify against Hyperforce compatibility list`],
        count > 0 ? `Review all ${count} package(s) against the Salesforce Hyperforce-compatible ISV list before scheduling migration.` : undefined,
      );
    },
  },
  {
    id: 'legacy-automation-hyperforce',
    dimension: 'Legacy & Compatibility',
    weight: 7,
    evaluate(input) {
      const auto = input.result.automationSummary;
      if (!auto) { return na('Automation summary unavailable.'); }
      const workflows = auto.totalWorkflowRules ?? 0;
      const processBuilders = auto.totalProcessBuilders ?? 0;
      const legacy = workflows + processBuilders;
      const score = legacy === 0 ? 100 : legacy <= 5 ? 78 : legacy <= 15 ? 58 : 35;
      return outcome(
        score,
        [`${workflows} Workflow Rule(s) and ${processBuilders} Process Builder(s) still active`],
        legacy > 0 ? 'Migrate Workflow Rules and Process Builders to Flow — Salesforce recommends retiring them before Hyperforce migration.' : undefined,
      );
    },
  },
];

export class HyperforceReadinessPack extends BaseReadinessPack {
  readonly id: PackId = 'hyperforce';
  readonly name = 'Hyperforce Readiness';
  readonly checks = HYPERFORCE_READINESS_CHECKS;
}
