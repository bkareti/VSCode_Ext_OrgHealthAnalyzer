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
  // ── Domain Readiness (20) ────────────────────────────────────────────────
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

  // ── Integration Hardening (20) ───────────────────────────────────────────
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

  // ── Authentication & Access (15) ─────────────────────────────────────────
  {
    id: 'mfa-posture',
    dimension: 'Authentication & Access',
    weight: 8,
    evaluate() {
      // MFA enforcement is not reliably exposed via metadata; flag for manual verification.
      return na('MFA enforcement is not exposed via metadata — verify Session Settings and identity policies manually before migration.');
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

  // ── Legacy & Compatibility (20) ──────────────────────────────────────────
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
      const integrations = input.result.orgInfoData?.integrations;
      if (!integrations) { return na('Integration metadata unavailable.'); }
      const apps = integrations.connectedApps ?? 0;
      const score = apps === 0 ? 90 : apps <= 10 ? 80 : 65;
      return outcome(
        score,
        [`${apps} connected apps to review for OAuth callback URLs and IP ranges`],
        apps > 0 ? 'Audit connected app callback URLs and IP allowlists for Hyperforce endpoints.' : undefined,
      );
    },
  },
];

export class HyperforceReadinessPack extends BaseReadinessPack {
  readonly id: PackId = 'hyperforce';
  readonly name = 'Hyperforce Readiness';
  readonly checks = HYPERFORCE_READINESS_CHECKS;
}
