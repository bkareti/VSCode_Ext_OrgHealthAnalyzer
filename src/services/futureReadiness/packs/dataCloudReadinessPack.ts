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

  // ── Data Volume & Scale (15) ─────────────────────────────────────────────
  {
    id: 'ldv-objects',
    dimension: 'Data Volume & Scale',
    weight: 15,
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
    evaluate(input) {
      const ext = input.result.dataModelSummary?.externalObjectCount ?? 0;
      const score = ext > 0 ? 90 : 65;
      return outcome(
        score,
        [`${ext} external objects`],
        ext === 0 ? 'Consider External Objects / data streams to unify external sources within Data Cloud.' : undefined,
      );
    },
  },

  // ── Data Governance (15) ─────────────────────────────────────────────────
  {
    id: 'access-governance',
    dimension: 'Data Governance',
    weight: 15,
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
];

export class DataCloudReadinessPack extends BaseReadinessPack {
  readonly id: PackId = 'data-cloud';
  readonly name = 'Data Cloud Readiness';
  readonly checks = DATA_CLOUD_READINESS_CHECKS;
}
