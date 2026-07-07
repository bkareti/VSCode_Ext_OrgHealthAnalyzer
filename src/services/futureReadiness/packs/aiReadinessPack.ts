import { PackId } from '../../../types/futureReadiness';
import { ReadinessCheck } from '../interfaces';
import { BaseReadinessPack } from './basePack';
import { getIssues, countIssues, outcome, na, inverseRatioScore } from './packHelpers';

/**
 * AI / Agentforce Readiness checks.
 * Evaluates whether the org's data, metadata, automation, security, and feature
 * enablement are in shape to safely adopt AI grounding and Agentforce actions.
 */
export const AI_READINESS_CHECKS: ReadinessCheck[] = [
  // ── Data & Metadata Quality (25) ─────────────────────────────────────────
  {
    id: 'undocumented-fields',
    dimension: 'Data & Metadata Quality',
    weight: 13,
    evaluate(input) {
      const stats = input.result.dataModelStats ?? [];
      if (stats.length === 0) { return na('Data model stats unavailable — run a full analysis.'); }
      const totalFields = stats.reduce((s, o) => s + (o.totalFields ?? 0), 0);
      const undoc = stats.reduce((s, o) => s + (o.fieldsWithoutDescription ?? 0), 0);
      const score = inverseRatioScore(undoc, totalFields);
      return outcome(
        score,
        [`${undoc} of ${totalFields} fields lack a description across ${stats.length} objects`],
        undoc > 0 ? 'Add field descriptions and help text so AI grounding has reliable, self-describing metadata.' : undefined,
      );
    },
  },
  {
    id: 'unused-fields',
    dimension: 'Data & Metadata Quality',
    weight: 12,
    evaluate(input) {
      const stats = input.result.dataModelStats ?? [];
      const stale = input.result.staleMetadata;
      if (stats.length === 0 && !stale) { return na('Field usage data unavailable.'); }
      const unused = stale?.unusedCustomFields?.length ?? stats.reduce((s, o) => s + (o.unusedFields ?? 0), 0);
      const custom = Math.max(1, stats.reduce((s, o) => s + (o.customFields ?? 0), 0));
      const score = inverseRatioScore(unused, custom);
      return outcome(
        score,
        [`${unused} unused custom fields detected`],
        unused > 0 ? 'Remove or archive unused custom fields to reduce schema noise that confuses AI models.' : undefined,
      );
    },
  },

  // ── Automation Simplicity (20) ───────────────────────────────────────────
  {
    id: 'legacy-automation',
    dimension: 'Automation Simplicity',
    weight: 12,
    evaluate(input) {
      const auto = input.result.automationSummary;
      if (!auto) { return na('Automation summary unavailable.'); }
      const workflows = auto.totalWorkflowRules ?? 0;
      const processBuilders = auto.totalProcessBuilders ?? 0;
      const legacy = workflows + processBuilders;
      const score = legacy === 0 ? 100 : legacy <= 3 ? 75 : legacy <= 10 ? 55 : 35;
      return outcome(
        score,
        [`${workflows} Workflow Rules and ${processBuilders} Process Builders still active`],
        legacy > 0 ? 'Migrate legacy Workflow Rules and Process Builder to Flow before layering AI-driven automation on top.' : undefined,
      );
    },
  },
  {
    id: 'multi-trigger-objects',
    dimension: 'Automation Simplicity',
    weight: 8,
    evaluate(input) {
      const auto = input.result.automationSummary;
      if (!auto) { return na('Automation summary unavailable.'); }
      const multi = Object.entries(auto.objectMap ?? {}).filter(([, v]) => v.triggers > 1).map(([k]) => k);
      const score = multi.length === 0 ? 100 : multi.length <= 2 ? 70 : 45;
      const detail = multi.length > 0 ? ` (${multi.slice(0, 3).join(', ')})` : '';
      return outcome(
        score,
        [`${multi.length} objects with multiple triggers${detail}`],
        multi.length > 0 ? 'Consolidate multi-trigger objects into a single handler for predictable AI-driven automation.' : undefined,
      );
    },
  },

  // ── Security & Sharing (20) ──────────────────────────────────────────────
  {
    id: 'overprivileged-profiles',
    dimension: 'Security & Sharing',
    weight: 10,
    evaluate(input) {
      const p = input.result.profileSummary;
      if (!p) { return na('Profile security data unavailable.'); }
      const over = p.overprivilegedCount ?? 0;
      const score = over === 0 ? 100 : over <= 2 ? 70 : over <= 5 ? 50 : 30;
      return outcome(
        score,
        [`${over} overprivileged profiles (3+ dangerous permissions)`],
        over > 0 ? 'Tighten overprivileged profiles before granting AI/Agentforce broad data access.' : undefined,
      );
    },
  },
  {
    id: 'without-sharing-apex',
    dimension: 'Security & Sharing',
    weight: 10,
    evaluate(input) {
      const cnt = countIssues(input, (i) => i.category === 'security' && /without.?sharing/i.test(i.message));
      const score = cnt === 0 ? 100 : cnt <= 2 ? 70 : cnt <= 5 ? 50 : 30;
      return outcome(
        score,
        [`${cnt} Apex classes declared without sharing`],
        cnt > 0 ? 'Review without-sharing Apex; AI features must honor record visibility to avoid data leakage.' : undefined,
      );
    },
  },
  {
    id: 'owd-accessibility',
    dimension: 'Security & Sharing',
    weight: 6,
    evaluate(input) {
      const count = input.collectors.privateOwdObjectCount;
      if (count === undefined) { return na('Org-Wide Default sharing data was not collected.'); }
      const score = count === 0 ? 100 : count <= 1 ? 65 : count <= 3 ? 40 : 20;
      return outcome(
        score,
        [`${count} of 5 core standard objects (Account, Contact, Case, Opportunity, Lead) have Private OWD`],
        count > 0 ? 'Objects with Private OWD block the Agentforce service user from grounding — add explicit sharing rules or adjust OWD for AI-accessible objects.' : undefined,
      );
    },
  },
  {
    id: 'pii-field-risk',
    dimension: 'Security & Sharing',
    weight: 4,
    evaluate(input) {
      const count = input.collectors.piiSensitiveFieldCount;
      if (count === undefined) { return na('PII field detection data was not collected.'); }
      const score = count === 0 ? 100 : count <= 3 ? 70 : count <= 8 ? 45 : 25;
      return outcome(
        score,
        [`${count} custom field(s) with PII-indicative API names (SSN, CreditCard, DOB, etc.)`],
        count > 0 ? 'Configure Einstein Trust Layer data masking for PII fields before grounding prompts — prevents sensitive data leakage to AI models.' : undefined,
      );
    },
  },

  // ── Flow & API Readiness (15) ────────────────────────────────────────────
  {
    id: 'api-entry-points',
    dimension: 'Flow & API Readiness',
    weight: 8,
    evaluate(input) {
      const eps = input.result.entryPoints ?? [];
      const score = eps.length >= 3 ? 95 : eps.length > 0 ? 85 : 65;
      return outcome(
        score,
        [`${eps.length} public API entry points detected`],
        eps.length === 0 ? 'Expose governed API/Flow entry points so Agentforce actions have safe automation hooks.' : undefined,
      );
    },
  },
  {
    id: 'flow-adoption',
    dimension: 'Flow & API Readiness',
    weight: 7,
    evaluate(input) {
      const auto = input.result.automationSummary;
      if (!auto) { return na('Automation summary unavailable.'); }
      const flows = auto.totalFlows ?? 0;
      const score = flows >= 10 ? 95 : flows >= 3 ? 80 : flows > 0 ? 65 : 50;
      return outcome(
        score,
        [`${flows} active flows (all types)`],
        flows < 3 ? 'Adopt Flow for declarative automation that Agentforce actions can safely invoke.' : undefined,
      );
    },
  },
  {
    id: 'invocable-flows',
    dimension: 'Flow & API Readiness',
    weight: 7,
    evaluate(input) {
      const count = input.collectors.autolaunchedFlowCount;
      if (count === undefined) { return na('Autolaunched flow count was not collected.'); }
      const score = count >= 5 ? 95 : count >= 2 ? 80 : count === 1 ? 65 : 40;
      return outcome(
        score,
        [`${count} active Autolaunched (Agentforce-invocable) flow(s)`],
        count === 0 ? 'Create Autolaunched flows with outputs — Agentforce can only invoke Autolaunched flows, not Screen flows.' : undefined,
      );
    },
  },
  {
    id: 'invocable-apex',
    dimension: 'Flow & API Readiness',
    weight: 5,
    evaluate(input) {
      const count = input.collectors.invocableApexCount;
      if (count === undefined) { return na('Invocable Apex count was not collected.'); }
      const score = count >= 5 ? 95 : count >= 1 ? 80 : 55;
      return outcome(
        score,
        [`${count} active Apex class(es) exposing @InvocableMethod`],
        count === 0 ? 'Add @InvocableMethod to Apex classes that Agentforce actions should be able to call.' : undefined,
      );
    },
  },

  // ── AI Feature Enablement (10) ───────────────────────────────────────────
  {
    id: 'einstein-agentforce',
    dimension: 'AI Feature Enablement',
    weight: 10,
    evaluate(input) {
      const pf = input.collectors.platformFeatures;
      if (!pf) { return na('Platform feature detection unavailable.'); }
      const einstein = pf.einsteinFeatures ?? [];
      const score = pf.agentforceLicensed ? 95 : einstein.length > 0 ? 75 : 40;
      return outcome(
        score,
        [
          `Agentforce licensed: ${pf.agentforceLicensed ? 'yes' : 'no'}`,
          `Einstein features: ${einstein.length > 0 ? einstein.join(', ') : 'none detected'}`,
        ],
        !pf.agentforceLicensed && einstein.length === 0
          ? 'Enable Einstein / Agentforce features and provision the required licenses to begin AI adoption.'
          : undefined,
      );
    },
  },
  {
    id: 'data-cloud-connection',
    dimension: 'AI Feature Enablement',
    weight: 5,
    evaluate(input) {
      const pf = input.collectors.platformFeatures;
      if (!pf) { return na('Platform feature detection unavailable.'); }
      const score = pf.dataCloudEnabled ? 95 : 50;
      return outcome(
        score,
        [`Data Cloud enabled: ${pf.dataCloudEnabled ? 'yes' : 'no'}`],
        !pf.dataCloudEnabled ? 'Connect Data Cloud to unlock production-grade Agentforce grounding and a unified customer data layer for AI actions.' : undefined,
      );
    },
  },

  // ── AI Configuration (20) ──────────────────────────────────────────
  {
    id: 'trust-layer',
    dimension: 'AI Configuration',
    weight: 8,
    evaluate(input) {
      const pf = input.collectors.platformFeatures;
      if (!pf) { return na('Platform feature detection unavailable.'); }
      const score = pf.trustLayerEnabled ? 95 : 35;
      return outcome(
        score,
        [`Einstein Trust Layer: ${pf.trustLayerEnabled ? 'enabled' : 'not detected'}`],
        !pf.trustLayerEnabled ? 'Enable the Einstein Trust Layer — it provides data masking, PII protection, and auditability required for safe AI grounding.' : undefined,
      );
    },
  },
  {
    id: 'prompt-templates',
    dimension: 'AI Configuration',
    weight: 8,
    evaluate(input) {
      const count = input.collectors.promptTemplateCount;
      if (count === undefined) { return na('Prompt Template data was not collected.'); }
      const score = count >= 3 ? 95 : count >= 1 ? 75 : 30;
      return outcome(
        score,
        [`${count} Prompt Template(s) configured`],
        count === 0 ? 'Create Prompt Templates in Prompt Builder — Agentforce requires them to generate AI-powered responses and content.' : undefined,
      );
    },
  },
  {
    id: 'knowledge-articles',
    dimension: 'AI Configuration',
    weight: 4,
    evaluate(input) {
      const count = input.collectors.knowledgeArticleCount;
      if (count === undefined) { return na('Knowledge article data was not collected.'); }
      const score = count >= 50 ? 95 : count >= 10 ? 80 : count > 0 ? 65 : 45;
      return outcome(
        score,
        [`${count} published Knowledge article(s)`],
        count === 0 ? 'Publish Knowledge articles — Agentforce copilot actions ground responses from Knowledge to provide accurate, org-specific answers.' : undefined,
      );
    },
  },

  // ── Configuration Quality (10) ───────────────────────────────────────────
  {
    id: 'test-coverage',
    dimension: 'Configuration Quality',
    weight: 6,
    evaluate(input) {
      const cov = input.result.testCoverageSummary;
      if (!cov) { return na('Test coverage summary unavailable.'); }
      const avg = cov.averageCoverage ?? 0;
      return outcome(
        avg,
        [`Average Apex test coverage ${avg}%`],
        avg < 75 ? 'Raise Apex test coverage above 75% to safely deploy AI-driven automation.' : undefined,
      );
    },
  },
  {
    id: 'technical-debt',
    dimension: 'Configuration Quality',
    weight: 4,
    evaluate(input) {
      const debt = countIssues(input, (i) => i.category === 'technical-debt');
      const score = debt === 0 ? 100 : debt <= 5 ? 80 : debt <= 15 ? 60 : 40;
      return outcome(
        score,
        [`${debt} technical-debt issues`],
        debt > 0 ? 'Reduce technical debt so AI features interact with stable, well-structured code.' : undefined,
      );
    },
  },
];

export class AIReadinessPack extends BaseReadinessPack {
  readonly id: PackId = 'ai-agentforce';
  readonly name = 'AI / Agentforce Readiness';
  readonly checks = AI_READINESS_CHECKS;
}
