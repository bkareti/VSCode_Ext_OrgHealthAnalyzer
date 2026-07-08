import { PackId } from '../../../types/futureReadiness';
import { ReadinessCheck } from '../interfaces';
import { BaseReadinessPack } from './basePack';
import { outcome, na, inverseRatioScore, coverageScore } from './packHelpers';

/**
 * Data Cloud Readiness checks.
 * Evaluates identity-resolution primitives, data model quality, volume/scale,
 * integration surface, and data governance — the pillars of a Data Cloud rollout.
 */
export const DATA_CLOUD_READINESS_CHECKS: ReadinessCheck[] = [
  // ── Identity Resolution Readiness (25) ───────────────────────────────────
  {
    id: 'duplicate-rules',
    dimension: 'Identity Resolution Readiness',
    weight: 13,
    label: 'Duplicate Rules on key objects',
    whyItMatters: 'Duplicate Rules prevent redundant records from fragmenting identity resolution before Data Cloud ingestion.',
    evaluate(input) {
      const rules = input.collectors.duplicateRules;
      if (!rules) { return na('Duplicate rule metadata was not collected.'); }
      const active = rules.filter((r) => r.isActive);
      const objects = new Set(active.map((r) => r.sobjectType));
      const score = active.length === 0 ? 30 : objects.size >= 3 ? 90 : objects.size >= 1 ? 70 : 50;
      return outcome(
        score,
        [`${active.length} active duplicate rules across ${objects.size} objects`],
        active.length === 0 ? 'Configure Duplicate Rules on key objects before Data Cloud identity resolution ingests them.' : undefined,
      );
    },
  },
  {
    id: 'matching-rules',
    dimension: 'Identity Resolution Readiness',
    weight: 12,
    label: 'Matching Rules for identity resolution',
    whyItMatters: "Matching Rules define how records are compared and merged — Data Cloud's identity resolution relies on them to unify profiles.",
    evaluate(input) {
      const rules = input.collectors.matchingRules;
      if (!rules) { return na('Matching rule metadata was not collected.'); }
      const active = rules.filter((r) => /active/i.test(r.status));
      const score = active.length === 0 ? 30 : active.length >= 3 ? 90 : active.length >= 1 ? 70 : 50;
      return outcome(
        score,
        [`${active.length} active matching rules`],
        active.length === 0 ? 'Define Matching Rules to power identity resolution and unification in Data Cloud.' : undefined,
      );
    },
  },

  // ── Data Model Quality (25) ──────────────────────────────────────────────
  {
    id: 'reference-integrity',
    dimension: 'Data Model Quality',
    weight: 13,
    label: 'Object relationship / reference integrity',
    whyItMatters: "Clear object relationships let Data Cloud map reference integrity accurately across ingested sources.",
    evaluate(input) {
      const stats = input.result.dataModelStats ?? [];
      if (stats.length === 0) { return na('Data model stats unavailable.'); }
      const withRel = stats.filter(
        (o) => (o.relationshipCount ?? (o.lookupFields ?? 0) + (o.masterDetailFields ?? 0)) > 0,
      ).length;
      const score = coverageScore(withRel, stats.length, 40);
      return outcome(
        score,
        [`${withRel} of ${stats.length} objects define relationships (reference integrity)`],
        withRel < stats.length ? 'Establish clear object relationships so Data Cloud can map reference integrity across sources.' : undefined,
      );
    },
  },
  {
    id: 'field-documentation',
    dimension: 'Data Model Quality',
    weight: 12,
    label: 'Field documentation coverage',
    whyItMatters: 'Documented fields give Data Cloud mapping and harmonization a reliable, self-describing schema to work from.',
    evaluate(input) {
      const stats = input.result.dataModelStats ?? [];
      if (stats.length === 0) { return na('Data model stats unavailable.'); }
      const totalFields = stats.reduce((s, o) => s + (o.totalFields ?? 0), 0);
      const undoc = stats.reduce((s, o) => s + (o.fieldsWithoutDescription ?? 0), 0);
      const score = inverseRatioScore(undoc, totalFields);
      return outcome(
        score,
        [`${undoc} of ${totalFields} fields lack descriptions`],
        undoc > 0 ? 'Document fields to standardize data definitions for accurate Data Cloud mapping.' : undefined,
      );
    },
  },
  {
    id: 'individual-object',
    dimension: 'Identity Resolution Readiness',
    weight: 10,
    label: 'Individual Records exist',
    whyItMatters: 'The Individual object anchors consent and identity for every unified profile in Data Cloud.',
    evaluate(input) {
      const counts = input.collectors.dataCloudIdentityCounts;
      if (!counts) { return na('Individual object counts were not collected.'); }
      const { individualCount } = counts;
      const score = individualCount > 0 ? 90 : 40;
      return outcome(
        score,
        [`${individualCount} Individual records`],
        individualCount === 0
          ? 'Populate the Individual object (or enable Data Cloud identity resolution) so unified profiles have a consent/identity anchor.'
          : undefined,
      );
    },
  },
  {
    id: 'contact-point-coverage',
    dimension: 'Identity Resolution Readiness',
    weight: 10,
    label: 'ContactPoint objects populated',
    whyItMatters: "ContactPointEmail/Phone/Address give identity resolution multiple match keys to unify a person's records.",
    evaluate(input) {
      const counts = input.collectors.dataCloudIdentityCounts;
      if (!counts) { return na('ContactPoint object counts were not collected.'); }
      const populated = [
        counts.contactPointEmailCount > 0,
        counts.contactPointPhoneCount > 0,
        counts.contactPointAddressCount > 0,
      ].filter(Boolean).length;
      const score = populated === 3 ? 90 : populated >= 1 ? 60 : 30;
      return outcome(
        score,
        [`${populated} of 3 ContactPoint types populated (Email: ${counts.contactPointEmailCount}, Phone: ${counts.contactPointPhoneCount}, Address: ${counts.contactPointAddressCount})`],
        populated < 3 ? 'Populate ContactPointEmail/Phone/Address to give Data Cloud identity resolution multiple match keys.' : undefined,
      );
    },
  },
  {
    id: 'contact-email-completeness',
    dimension: 'Identity Resolution Readiness',
    weight: 10,
    label: 'Contact email completeness',
    whyItMatters: "Email is a primary identity match key — incomplete email data weakens Data Cloud's ability to unify contacts.",
    evaluate(input) {
      const counts = input.collectors.dataCloudIdentityCounts;
      if (!counts || counts.contactTotalCount === 0) { return na('Contact email completeness could not be evaluated.'); }
      const score = coverageScore(counts.contactWithEmailCount, counts.contactTotalCount, 30);
      return outcome(
        score,
        [`${counts.contactWithEmailCount} of ${counts.contactTotalCount} Contacts have an Email value`],
        counts.contactWithEmailCount < counts.contactTotalCount
          ? 'Improve Contact email completeness — email is a primary Data Cloud identity match key.'
          : undefined,
      );
    },
  },

  // ── Data Volume & Scale (15) ─────────────────────────────────────────────
  {
    id: 'ldv-objects',
    dimension: 'Data Volume & Scale',
    weight: 15,
    label: 'Large data volume (LDV) objects',
    whyItMatters: 'Objects at large record volumes need an incremental data-stream and indexing strategy before Data Cloud ingestion.',
    evaluate(input) {
      const counts = input.result.objectRecordCounts ?? {};
      const keys = Object.keys(counts);
      if (keys.length === 0) { return na('Record counts unavailable.'); }
      const ldv = keys.filter((k) => counts[k] >= 500_000);
      const score = ldv.length === 0 ? 90 : ldv.length <= 2 ? 70 : 50;
      const detail = ldv.length > 0 ? `: ${ldv.slice(0, 3).join(', ')}` : '';
      return outcome(
        score,
        [`${ldv.length} large-data-volume objects (≥500k records)${detail}`],
        ldv.length > 0 ? 'Plan incremental data streams and indexing for LDV objects before Data Cloud ingestion.' : undefined,
      );
    },
  },

  // ── Integration & External Data (20) ─────────────────────────────────────
  {
    id: 'integration-surface',
    dimension: 'Integration & External Data',
    weight: 10,
    label: 'Integration surface (Named Credentials / APIs)',
    whyItMatters: 'Named Credentials and API entry points are the pipes that feed external systems into Data Cloud.',
    evaluate(input) {
      const integrations = input.result.orgInfoData?.integrations;
      const eps = input.result.entryPoints?.length ?? 0;
      if (!integrations && !input.result.entryPoints) { return na('Integration metadata unavailable.'); }
      const named = integrations?.namedCredentials ?? 0;
      const score = named > 0 || eps > 0 ? 85 : 55;
      return outcome(
        score,
        [`${named} named credentials, ${eps} API entry points`],
        named === 0 && eps === 0 ? 'Establish Named Credentials / APIs to feed external systems into Data Cloud.' : undefined,
      );
    },
  },
  {
    id: 'external-objects',
    dimension: 'Integration & External Data',
    weight: 10,
    label: 'Salesforce Connect external objects',
    whyItMatters: 'External objects show whether federated data sources are already surfaced in Salesforce ahead of Data Cloud ingestion.',
    evaluate(input) {
      const ext = input.result.dataModelSummary?.externalObjectCount ?? 0;
      const score = ext > 0 ? 90 : 65;
      return outcome(
        score,
        [`${ext} Salesforce Connect external objects (Salesforce Connect, not Data Cloud Data Streams)`],
        ext === 0
          ? 'Consider Salesforce Connect External Objects to federate external sources; see the "Data Streams" check for native Data Cloud ingestion.'
          : undefined,
      );
    },
  },

  // ── Data Cloud Provisioning (30) ─────────────────────────────────────────
  {
    id: 'data-cloud-license',
    dimension: 'Data Cloud Provisioning',
    weight: 12,
    label: 'Data Cloud license provisioned',
    whyItMatters: 'A Data Cloud feature license is the prerequisite for any ingestion, identity resolution, or activation work.',
    evaluate(input) {
      const flags = input.collectors.platformFeatures;
      if (!flags) { return na('Platform feature licenses were not collected.'); }
      const score = flags.dataCloudEnabled ? 95 : 20;
      return outcome(
        score,
        [flags.dataCloudEnabled ? 'Data Cloud feature license is active' : 'No active Data Cloud feature license detected'],
        flags.dataCloudEnabled ? undefined : 'Provision the Data Cloud license before any ingestion, identity resolution, or activation work can begin.',
      );
    },
  },
  {
    id: 'data-streams',
    dimension: 'Data Cloud Provisioning',
    weight: 10,
    label: 'Data Streams configured',
    whyItMatters: 'Data Streams are the ingestion pipeline — without at least one, no data enters Data Cloud.',
    evaluate(input) {
      const count = input.collectors.dataStreamCount;
      if (count === undefined) { return na('Data Stream metadata was not collected.'); }
      const score = count > 0 ? 90 : 30;
      return outcome(
        score,
        [`${count} Data Stream${count === 1 ? '' : 's'} configured`],
        count === 0 ? 'Configure at least one Data Stream to begin ingesting Salesforce or external data into Data Cloud.' : undefined,
      );
    },
  },
  {
    id: 'crm-connector',
    dimension: 'Data Cloud Provisioning',
    weight: 8,
    label: 'CRM / data connector configured',
    whyItMatters: 'A connector gives Data Cloud a live pipeline from your CRM or external systems to ingest records.',
    evaluate(input) {
      const count = input.collectors.dataConnectorCount;
      if (count === undefined) { return na('Data Connector metadata was not collected.'); }
      const score = count > 0 ? 85 : 40;
      return outcome(
        score,
        [`${count} data connector${count === 1 ? '' : 's'} registered`],
        count === 0 ? 'Connect a CRM or external data source connector so Data Cloud has an ingestion pipeline.' : undefined,
      );
    },
  },

  // ── Activation & Insights (20) ────────────────────────────────────────────
  {
    id: 'calculated-insights',
    dimension: 'Activation & Insights',
    weight: 10,
    label: 'Calculated Insights defined',
    whyItMatters: 'Calculated Insights turn unified profiles into activation-ready metrics for downstream use.',
    evaluate(input) {
      const count = input.collectors.calculatedInsightCount;
      if (count === undefined) { return na('Calculated Insight metadata was not collected.'); }
      const score = count > 0 ? 85 : 45;
      return outcome(
        score,
        [`${count} Calculated Insight${count === 1 ? '' : 's'} defined`],
        count === 0 ? 'Define Calculated Insights to derive activation-ready metrics from unified profiles.' : undefined,
      );
    },
  },
  {
    id: 'data-segments',
    dimension: 'Activation & Insights',
    weight: 10,
    label: 'Segments defined',
    whyItMatters: 'Segments are what let Data Cloud activate unified audiences to marketing and other downstream channels.',
    evaluate(input) {
      const count = input.collectors.dataSegmentCount;
      if (count === undefined) { return na('Segment metadata was not collected.'); }
      const score = count > 0 ? 85 : 45;
      return outcome(
        score,
        [`${count} Segment${count === 1 ? '' : 's'} defined`],
        count === 0 ? 'Define at least one Segment to enable activation of unified audiences to downstream channels.' : undefined,
      );
    },
  },

  // ── Data Governance (15) ─────────────────────────────────────────────────
  {
    id: 'access-governance',
    dimension: 'Data Governance',
    weight: 15,
    label: 'Access governance (profiles & admins)',
    whyItMatters: 'Overprivileged profiles and super admins widen the blast radius when sensitive data is unified in Data Cloud.',
    evaluate(input) {
      const p = input.result.profileSummary;
      const u = input.result.userSummary;
      if (!p && !u) { return na('Governance data unavailable.'); }
      const over = p?.overprivilegedCount ?? 0;
      const supers = u?.superAdmins ?? 0;
      const total = over + supers;
      const score = total === 0 ? 95 : total <= 3 ? 75 : total <= 8 ? 55 : 35;
      return outcome(
        score,
        [`${over} overprivileged profiles, ${supers} super admins (Modify All Data)`],
        total > 0 ? 'Tighten broad data access before unifying sensitive data in Data Cloud.' : undefined,
      );
    },
  },
  {
    id: 'data-spaces',
    dimension: 'Data Governance',
    weight: 10,
    label: 'Data Spaces configured',
    whyItMatters: 'Data Spaces partition and govern access to unified data by business unit, region, or brand.',
    evaluate(input) {
      const count = input.collectors.dataSpaceCount;
      if (count === undefined) { return na('Data Space metadata was not collected.'); }
      const score = count > 0 ? 80 : 55;
      return outcome(
        score,
        [`${count} Data Space${count === 1 ? '' : 's'} configured`],
        count === 0 ? 'Configure Data Spaces to partition and govern access to unified data by business unit or region.' : undefined,
      );
    },
  },
];

export class DataCloudReadinessPack extends BaseReadinessPack {
  readonly id: PackId = 'data-cloud';
  readonly name = 'Data Cloud Readiness';
  readonly checks = DATA_CLOUD_READINESS_CHECKS;
}
