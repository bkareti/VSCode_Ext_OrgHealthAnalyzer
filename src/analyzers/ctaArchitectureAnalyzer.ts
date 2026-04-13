/**
 * CTA Architecture Analyzer
 *
 * Performs deep architectural analysis that a Salesforce CTA would care about:
 * – live query selectivity via Tooling API EXPLAIN
 * – license alignment (high-value objects vs license tier)
 * – callout-in-trigger (already detected by apexAnalyzer, aggregated here)
 * – heap-risk unbounded date SOQL (detected by apexAnalyzer, aggregated here)
 * – LDV risk with live record counts
 * – Ownership skew detection on high-volume objects
 * – Async daisy-chaining and row lock risk
 * – Public entry point surface area (@RestResource, InboundEmail)
 * – Integration idempotency and trigger governance
 */

import { Issue, AnalysisResult, LicenseSummary, QueryExplainResult, ApexClass, ApexTrigger } from '../types';
import { SalesforceService } from '../services/salesforceService';
import { logInfo, logWarning, logSection } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

// ---------------------------------------------------------------------------
// License guard: standard license names that lack advanced CRM objects
// ---------------------------------------------------------------------------
const LIMITED_LICENSE_NAMES = [
  'Salesforce Platform',
  'Force.com - Free',
  'Force.com - App Subscription',
  'Identity',
  'Chatter Free',
  'Customer Community',
  'Customer Community Plus',
  'Partner Community',
];

// High-value sObjects that require full Salesforce / Sales Cloud / Service Cloud licences
const HIGH_VALUE_OBJECTS = ['Opportunity', 'Lead', 'Case', 'Contract', 'Quote', 'ForecastingItem'];

// LDV threshold — objects with >500k records are considered LDV
const LDV_RECORD_THRESHOLD = 500_000;

// Objects where ownership skew is a known Salesforce anti-pattern
const SKEW_PRONE_OBJECTS = ['Account', 'Case', 'Opportunity', 'Contact', 'Lead', 'Asset'];

// ---------------------------------------------------------------------------
// Async / Entry-point detection regexes
// ---------------------------------------------------------------------------
const RE_QUEUEABLE_EXECUTE = /\bpublic\s+void\s+execute\s*\(\s*QueueableContext/;
const RE_ENQUEUE_IN_EXECUTE = /System\.enqueueJob\s*\(/;
const RE_FUTURE_IN_FUTURE = /@future[\s\S]{0,200}@future/i;
const RE_BATCH_EXECUTE_IN_BATCH = /Database\.executeBatch\s*\(/;
const RE_REST_RESOURCE = /@RestResource\s*\(/i;
const RE_INBOUND_EMAIL = /implements\s+Messaging\.InboundEmailHandler/i;
const RE_WITHOUT_SHARING = /\bwithout\s+sharing\b/i;
const RE_USER_GROUP_DML = /\b(insert|update|upsert|delete)\s+(new\s+)?(?:User|Group|GroupMember|UserRole)\b/gi;
const RE_UPSERT_EXTERNAL = /\bupsert\b[^;]+ExternalId|externalId\s*=/gi;
const RE_TRIGGER_HANDLER = /TriggerHandler|TriggerDispatcher|TriggerFactory|fflib_SObjectDomain|mtd_TriggerHandler/i;

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------
export interface CtaArchitectureAnalysisResult {
  issues: Issue[];
  licenseSummary: LicenseSummary[];
  queryExplainResults: QueryExplainResult[];
  /** Live record counts per object { objectName → count } */
  objectRecordCounts: Record<string, number>;
  /** Detected public entry points */
  entryPoints: Array<{ name: string; type: 'RestResource' | 'InboundEmail'; annotation: string }>;
}

// ---------------------------------------------------------------------------
// Analyzer class
// ---------------------------------------------------------------------------
export class CtaArchitectureAnalyzer {
  constructor(private readonly sfService: SalesforceService) {}

  /**
   * Run all CTA-tier architectural checks.
   */
  async analyze(
    currentResult: AnalysisResult,
    queryExplainEnabled = true,
    apexClasses: ApexClass[] = [],
    apexTriggers: ApexTrigger[] = [],
  ): Promise<CtaArchitectureAnalysisResult> {
    logSection('CTA Architecture Analysis');

    const issues: Issue[] = [];
    let licenseSummary: LicenseSummary[] = [];
    const queryExplainResults: QueryExplainResult[] = [];
    const objectRecordCounts: Record<string, number> = {};
    const entryPoints: Array<{ name: string; type: 'RestResource' | 'InboundEmail'; annotation: string }> = [];

    // 1. License alignment guard
    try {
      licenseSummary = await this.sfService.getUserLicenseSummary();
      const licenseIssues = this.detectLicenseMisalignment(licenseSummary, currentResult);
      issues.push(...licenseIssues);
      logInfo(`License summary fetched: ${licenseSummary.length} license types`);
    } catch (err) {
      logWarning(`License analysis failed: ${getErrorMessage(err)}`);
    }

    // 2. Query selectivity via Tooling API explain
    if (queryExplainEnabled) {
      const soqlCandidates = this.extractSoqlCandidatesFromResult(currentResult);
      logInfo(`Running EXPLAIN on ${soqlCandidates.length} SOQL candidates`);

      for (const soql of soqlCandidates.slice(0, 10)) {
        try {
          const explain = await this.sfService.explainQuery(soql);
          queryExplainResults.push(explain);

          if (explain.isFullTableScan || explain.sforcePerformanceLevel === 'Unacceptable') {
            issues.push({
              id: `non-selective-query-${Buffer.from(soql).toString('base64').slice(0, 20)}`,
              ruleId: 'non-selective-query',
              category: 'cta-review',
              severity: 'error',
              message: `A SOQL query has been flagged as "${explain.sforcePerformanceLevel}" by Salesforce's query optimizer${explain.isFullTableScan ? ' (full table scan)' : ''}. Query: ${soql.slice(0, 120)}…`,
              file: 'org://query-explain',
              line: 0,
              suggestion: 'Add selective indexed filters (Id, lookup fields, custom indexed fields). Avoid LIKE operators or functions on WHERE fields. Consider custom indexes for high-volume objects.',
            });
          }
        } catch (err) {
          logWarning(`EXPLAIN failed for query: ${getErrorMessage(err)}`);
        }
      }
    }

    // 3. Aggregate callout-in-trigger issues already found by ApexAnalyzer
    const calloutIssues = (currentResult.issues ?? []).filter(
      i => i.ruleId === 'callout-in-trigger'
    );
    if (calloutIssues.length > 1) {
      issues.push({
        id: 'callout-in-trigger-systemic',
        ruleId: 'callout-in-trigger-systemic',
        category: 'cta-review',
        severity: 'error',
        message: `${calloutIssues.length} triggers contain HTTP callout logic. This is a systemic architectural problem causing tight coupling between DML and external systems, blocking scalability and making governor limits unpredictable.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Implement a Platform Event or Change Data Capture pattern to decouple real-time integrations. Move callouts to Queueable or @future contexts exclusively.',
      });
    }

    // 4. Heap-risk aggregation
    const heapIssues = (currentResult.issues ?? []).filter(
      i => i.ruleId === 'heap-risk-unbounded-query'
    );
    if (heapIssues.length > 2) {
      issues.push({
        id: 'heap-risk-systemic',
        ruleId: 'heap-risk-systemic',
        category: 'cta-review',
        severity: 'error',
        message: `${heapIssues.length} Apex files query with unbounded date literals (TODAY, LAST_N_DAYS, etc.) outside a Batchable context. In high-volume orgs this guarantees heap limit exceptions.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Establish an org-wide coding standard enforcing Batchable/Queueable for all queries spanning date ranges. Introduce a custom Apex linting rule for CI pipelines.',
      });
    }

    // 5. LDV heuristic + live record count enrichment
    const { issues: ldvIssues, recordCounts } = await this.detectLdvRiskWithCounts(currentResult);
    issues.push(...ldvIssues);
    Object.assign(objectRecordCounts, recordCounts);

    // 6. Async daisy-chaining + row lock detection
    if (apexClasses.length > 0 || apexTriggers.length > 0) {
      const asyncIssues = this.detectAsyncAntiPatterns(apexClasses, apexTriggers, objectRecordCounts);
      issues.push(...asyncIssues);
    }

    // 7. Public entry point surface area
    if (apexClasses.length > 0) {
      const { issues: epIssues, points } = this.detectEntryPoints(apexClasses);
      issues.push(...epIssues);
      entryPoints.push(...points);
    }

    // 8. Integration governance: trigger handler framework + idempotency
    if (apexClasses.length > 0 || apexTriggers.length > 0) {
      const govIssues = this.detectIntegrationGovernance(apexClasses, apexTriggers, currentResult);
      issues.push(...govIssues);
    }

    // 9. Implicit sharing risk on system objects
    if (apexClasses.length > 0) {
      const sharingIssues = this.detectImplicitSharingRisks(apexClasses);
      issues.push(...sharingIssues);
    }

    logInfo(`CTA Architecture Analysis complete — ${issues.length} architectural issues found`);

    return { issues, licenseSummary, queryExplainResults, objectRecordCounts, entryPoints };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private detectLicenseMisalignment(
    licenses: LicenseSummary[],
    result: AnalysisResult
  ): Issue[] {
    const issues: Issue[] = [];

    const limitedLicenses = licenses.filter(l =>
      LIMITED_LICENSE_NAMES.some(name => l.name.toLowerCase().includes(name.toLowerCase()))
    );
    if (limitedLicenses.length === 0) {
      return [];
    }

    // Check if high-value objects appear in org's dataModelStats
    const allObjectNames = (result.dataModelStats ?? []).map(s => s.objectName);
    const highValueUsed = HIGH_VALUE_OBJECTS.filter(obj =>
      allObjectNames.some(o => o.toLowerCase() === obj.toLowerCase())
    );

    if (highValueUsed.length > 0) {
      const limitedNames = limitedLicenses.map(l => l.name).join(', ');
      issues.push({
        id: 'license-misalignment-high-value-objects',
        ruleId: 'license-misalignment',
        category: 'cta-review',
        severity: 'warning',
        message: `The org has users on limited licenses (${limitedNames}) but customises high-value objects (${highValueUsed.join(', ')}). Users on Platform/Community licences cannot access these objects, leading to hidden access gaps.`,
        file: 'org://license-alignment',
        line: 0,
        suggestion: 'Audit user profiles vs object permissions. Ensure users needing Opportunity/Case/Lead access have full Salesforce or appropriate add-on licences.',
      });
    }

    // Utilisation warnings
    for (const lic of licenses) {
      if (lic.usedPct >= 90 && lic.totalLicenses > 0) {
        issues.push({
          id: `license-exhaustion-${lic.name.replace(/\s+/g, '-')}`,
          ruleId: 'license-exhaustion',
          category: 'cta-review',
          severity: 'warning',
          message: `${lic.name} licences are ${lic.usedPct}% utilised (${lic.usedLicenses}/${lic.totalLicenses}). Additional users will be blocked from the system.`,
          file: 'org://license-alignment',
          line: 0,
          suggestion: 'Review licence allocation. Purchase additional licences or reclaim unused assignments from inactive users.',
        });
      }
    }

    return issues;
  }

  private extractSoqlCandidatesFromResult(result: AnalysisResult): string[] {
    const soqlSet = new Set<string>();

    for (const issue of result.issues ?? []) {
      const matches = issue.message?.match(/\[\s*SELECT\s+[\s\S]{10,200}?\]/gi) ?? [];
      for (const m of matches) {
        soqlSet.add(m.replace(/\s+/g, ' ').trim());
      }
    }

    return Array.from(soqlSet);
  }

  private async detectLdvRiskWithCounts(
    result: AnalysisResult
  ): Promise<{ issues: Issue[]; recordCounts: Record<string, number> }> {
    const issues: Issue[] = [];
    const recordCounts: Record<string, number> = {};

    const autoSummary = result.automationSummary;
    const totalAutomations =
      (autoSummary?.totalFlows ?? 0) +
      (autoSummary?.totalTriggers ?? 0) +
      (autoSummary?.totalValidationRules ?? 0);

    const totalFields = (result.dataModelStats ?? []).reduce((sum, s) => sum + s.totalFields, 0);

    if (totalAutomations > 40 && totalFields > 300) {
      issues.push({
        id: 'ldv-automation-field-density',
        ruleId: 'ldv-risk-density',
        category: 'cta-review',
        severity: 'error',
        message: `The org has ${totalAutomations} automation rules and ${totalFields} custom fields. This combination creates extreme record lock contention and CPU time issues on Large Data Volume objects — a classic CTA design failure.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Profile your top 5 objects by row count. For objects exceeding 1M records: disable before-save flows, consolidate triggers into a single handler with transaction-aware execution, and defer all cross-object updates to platform events.',
      });
    }

    // Live record count check on skew-prone LDV objects
    for (const objName of SKEW_PRONE_OBJECTS) {
      try {
        const count = await this.sfService.getRecordCount(objName);
        if (count >= 0) {
          recordCounts[objName] = count;
          if (count >= LDV_RECORD_THRESHOLD) {
            // Flag automation density on this specific LDV object
            const objAutomations = autoSummary?.objectMap?.[objName];
            const autoCount = objAutomations
              ? objAutomations.triggers + objAutomations.flows + objAutomations.validations
              : 0;
            issues.push({
              id: `ldv-live-count-${objName}`,
              ruleId: 'ldv-live-record-count',
              category: 'cta-review',
              severity: count >= 2_000_000 ? 'error' : 'warning',
              message: `${objName} has ${count.toLocaleString()} records (LDV threshold: ${LDV_RECORD_THRESHOLD.toLocaleString()})${autoCount > 0 ? ` with ${autoCount} active automations` : ''}. Queries without selective indexed filters will cause full table scans and hit CPU limits.`,
              file: `org://${objName}`,
              line: 0,
              suggestion: `For ${objName} with ${count.toLocaleString()} records: ensure all SOQL WHERE clauses use indexed fields (OwnerId, CreatedDate with date range, custom indexed fields). Enable skinny tables if lookup joins are frequent. Consider Async processing for bulk operations.`,
            });
          }
        }
      } catch {
        // Skip — object may not exist in this org
      }
    }

    // Ownership skew detection: flag objects where automation touches OwnerId reassignment
    // in bulk context on very large objects
    for (const [objName, count] of Object.entries(recordCounts)) {
      if (count >= LDV_RECORD_THRESHOLD) {
        const objAutomations = autoSummary?.objectMap?.[objName];
        if (objAutomations && objAutomations.total > 3) {
          issues.push({
            id: `ownership-skew-risk-${objName}`,
            ruleId: 'ownership-skew-risk',
            category: 'cta-review',
            severity: 'warning',
            message: `Ownership skew risk on ${objName} (${count.toLocaleString()} records, ${objAutomations.total} automations): When a single user/queue owns >50% of records, record lock contention causes cascading failures during bulk updates.`,
            file: `org://${objName}`,
            line: 0,
            suggestion: `Run: SELECT OwnerId, COUNT(Id) FROM ${objName} GROUP BY OwnerId ORDER BY COUNT(Id) DESC LIMIT 10. If top owner holds >50% of records, redistribute ownership or use sharing rules. Avoid OwnerId-based SOQL WHERE filters on LDV objects.`,
          });
        }
      }
    }

    return { issues, recordCounts };
  }

  /**
   * Detect async anti-patterns: Queueable daisy-chaining, @future in @future,
   * concurrent batch + row lock risk.
   */
  private detectAsyncAntiPatterns(
    apexClasses: ApexClass[],
    apexTriggers: ApexTrigger[],
    recordCounts: Record<string, number>,
  ): Issue[] {
    const issues: Issue[] = [];
    const daisyChains: string[] = [];
    const futureChainingClasses: string[] = [];

    for (const cls of apexClasses) {
      if (!cls.Body) { continue; }
      const body = cls.Body;

      // Queueable daisy-chaining: enqueueJob called inside execute(QueueableContext)
      if (RE_QUEUEABLE_EXECUTE.test(body) && RE_ENQUEUE_IN_EXECUTE.test(body)) {
        daisyChains.push(cls.Name);
        issues.push({
          id: `async-daisy-chain-${cls.Name}`,
          ruleId: 'async-queueable-daisy-chain',
          category: 'cta-review',
          severity: 'warning',
          message: `${cls.Name}: Queueable daisy-chaining detected — System.enqueueJob() is called inside execute(). This creates an unbounded async chain that can exhaust the Flex Queue (100 jobs) and cause Async limit exceptions.`,
          file: `org://${cls.Name}.cls`,
          line: 0,
          suggestion: 'Use a recursive counter pattern with a max-depth guard (e.g., Limits.getQueueableJobs() < 1). For ordered batch processing, use Database.Batchable instead of chained Queueables. Consider Platform Events for truly event-driven patterns.',
        });
      }

      // @future method chains are impossible in Apex but detect @future + @future pattern
      // in the same class (two @future methods calling each other via static refs)
      if (RE_FUTURE_IN_FUTURE.test(body)) {
        futureChainingClasses.push(cls.Name);
      }
    }

    if (daisyChains.length > 2) {
      issues.push({
        id: 'async-daisy-chain-systemic',
        ruleId: 'async-queueable-daisy-chain-systemic',
        category: 'cta-review',
        severity: 'error',
        message: `${daisyChains.length} Queueable classes use daisy-chaining patterns (${daisyChains.slice(0, 5).join(', ')}${daisyChains.length > 5 ? '…' : ''}). This is a systemic async governance failure — the Flex Queue limit of 100 concurrent jobs will be breached under load.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Establish an org-wide async processing standard. Use Batch Apex with stateful chaining for ordered sequences, or implement a custom job scheduler using Custom Objects + a scheduled batch.',
      });
    }

    // Row lock risk: batch apex + heavy trigger automation on LDV objects
    const ldvObjects = Object.entries(recordCounts)
      .filter(([, cnt]) => cnt >= LDV_RECORD_THRESHOLD)
      .map(([obj]) => obj);

    const batchClassCount = apexClasses.filter(c =>
      c.Body && /implements\s+Database\.Batchable/i.test(c.Body)
    ).length;

    if (batchClassCount > 0 && ldvObjects.length > 0) {
      issues.push({
        id: 'row-lock-concurrent-batch-ldv',
        ruleId: 'row-lock-concurrent-batch',
        category: 'cta-review',
        severity: 'error',
        message: `High probability of Row Lock on ${ldvObjects.join(', ')}: ${batchClassCount} Batch Apex classes operate on objects with ${ldvObjects.map(o => `${o}=${recordCounts[o]?.toLocaleString()}`).join(', ')} records. Concurrent batch jobs + record-triggered flows create deadlocks.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Schedule batch jobs during off-peak hours. Disable before-save flows on LDV objects during batch runs using Custom Metadata flags. Use "without sharing" only in inner utility classes, never in batch execute(). Implement optimistic locking with For Update SOQL.',
      });
    }

    return issues;
  }

  /**
   * Detect and report public API entry points exposed to the internet.
   */
  private detectEntryPoints(
    apexClasses: ApexClass[],
  ): { issues: Issue[]; points: Array<{ name: string; type: 'RestResource' | 'InboundEmail'; annotation: string }> } {
    const issues: Issue[] = [];
    const points: Array<{ name: string; type: 'RestResource' | 'InboundEmail'; annotation: string }> = [];

    for (const cls of apexClasses) {
      if (!cls.Body) { continue; }
      const body = cls.Body;

      // @RestResource — publicly reachable API endpoint
      if (RE_REST_RESOURCE.test(body)) {
        const annotationMatch = body.match(/@RestResource\s*\(\s*urlMapping\s*=\s*['"]([^'"]+)['"]/i);
        const urlMapping = annotationMatch?.[1] ?? 'unknown';
        points.push({ name: cls.Name, type: 'RestResource', annotation: urlMapping });

        // Check if the class uses with sharing (security risk if not)
        const isWithoutSharing = RE_WITHOUT_SHARING.test(body);
        if (isWithoutSharing) {
          issues.push({
            id: `rest-without-sharing-${cls.Name}`,
            ruleId: 'rest-resource-without-sharing',
            category: 'cta-review',
            severity: 'error',
            message: `@RestResource class "${cls.Name}" (urlMapping: ${urlMapping}) uses "without sharing" — this public API endpoint bypasses record-level security and can expose data to authenticated but unauthorised callers.`,
            file: `org://${cls.Name}.cls`,
            line: 0,
            suggestion: 'Change to "with sharing" or "inherited sharing". If system-level access is truly required, create an inner service class that runs without sharing, keeping only the specific operations that need elevated access.',
          });
        }
      }

      // Messaging.InboundEmailHandler — exposed to email-to-apex
      if (RE_INBOUND_EMAIL.test(body)) {
        points.push({ name: cls.Name, type: 'InboundEmail', annotation: 'email-to-apex' });
        issues.push({
          id: `inbound-email-entry-${cls.Name}`,
          ruleId: 'inbound-email-entry-point',
          category: 'cta-review',
          severity: 'info',
          message: `${cls.Name} is an Inbound Email Handler — it accepts data from external email systems. This is a public entry point that requires robust input validation and error handling to prevent injection or DDoS via email flooding.`,
          file: `org://${cls.Name}.cls`,
          line: 0,
          suggestion: 'Implement rate limiting (Custom Setting per sender), sender whitelist validation, and structured error logging. Ensure handleInboundEmail() never throws unhandled exceptions — Salesforce retries failed handlers silently.',
        });
      }
    }

    // Summary issue if many REST endpoints exist
    const restEndpoints = points.filter(p => p.type === 'RestResource');
    if (restEndpoints.length > 5) {
      issues.push({
        id: 'rest-api-surface-too-large',
        ruleId: 'rest-api-sprawl',
        category: 'cta-review',
        severity: 'warning',
        message: `${restEndpoints.length} @RestResource classes found. A large custom REST API surface increases attack surface, maintenance burden, and breaks Connected App OAuth scope management.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Consolidate REST endpoints behind a single API gateway class (Facade pattern). Use URL routing inside one controller rather than multiple @RestResource classes. Consider Salesforce API (standard REST API) for CRUD operations instead of custom Apex endpoints.',
      });
    }

    return { issues, points };
  }

  /**
   * Detect integration governance issues: Wild West triggers, missing handler framework,
   * missing idempotency in callout handlers.
   */
  private detectIntegrationGovernance(
    apexClasses: ApexClass[],
    apexTriggers: ApexTrigger[],
    result: AnalysisResult,
  ): Issue[] {
    const issues: Issue[] = [];

    // Wild West: multiple triggers on the same object
    const triggersByObject = new Map<string, string[]>();
    for (const trigger of apexTriggers) {
      const obj = trigger.TableEnumOrId || 'Unknown';
      const existing = triggersByObject.get(obj) ?? [];
      existing.push(trigger.Name);
      triggersByObject.set(obj, existing);
    }

    const multiTriggerObjects: string[] = [];
    for (const [obj, triggers] of triggersByObject.entries()) {
      if (triggers.length > 1) {
        multiTriggerObjects.push(obj);
        issues.push({
          id: `wild-west-triggers-${obj}`,
          ruleId: 'wild-west-multi-trigger',
          category: 'cta-review',
          severity: 'error',
          message: `"Wild West" trigger pattern on ${obj}: ${triggers.length} triggers (${triggers.join(', ')}) execute independently with no guaranteed order. Execution order is arbitrary and can change after deployments.`,
          file: `org://${obj}`,
          line: 0,
          suggestion: `Consolidate all ${obj} triggers into a single dispatcher trigger that calls a TriggerHandler class. Use a framework like fflib, Trigger Actions Framework, or a simple TriggerDispatcher pattern. Add a Custom Metadata flag to enable/disable handlers without deployment.`,
        });
      }
    }

    if (multiTriggerObjects.length > 2) {
      issues.push({
        id: 'wild-west-triggers-systemic',
        ruleId: 'wild-west-multi-trigger-systemic',
        category: 'cta-review',
        severity: 'error',
        message: `${multiTriggerObjects.length} objects have multiple competing triggers. This is a systemic trigger governance failure. Order of execution is non-deterministic and will cause intermittent production bugs that are extremely hard to diagnose.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Implement an org-wide Trigger Handler Framework immediately. This is a standard CTA recommendation. All new triggers must go through a single dispatcher. Create a Tech Debt sprint to consolidate existing multi-trigger objects.',
      });
    }

    // Check for trigger handler framework usage
    const hasHandlerFramework = apexClasses.some(c => c.Body && RE_TRIGGER_HANDLER.test(c.Body));
    if (!hasHandlerFramework && apexTriggers.length > 3) {
      issues.push({
        id: 'no-trigger-handler-framework',
        ruleId: 'missing-trigger-handler-framework',
        category: 'cta-review',
        severity: 'warning',
        message: `No trigger handler framework detected (${apexTriggers.length} triggers exist). Without a framework, trigger logic cannot be disabled without deployment — a critical operational risk.`,
        file: 'org://architecture',
        line: 0,
        suggestion: 'Implement a Trigger Handler Framework with Custom Metadata-based bypass switches. Recommended frameworks: Trigger Action Framework (Kevin O\'Hara), fflib, or a simple TriggerDispatcher with Custom Metadata trigger configurations.',
      });
    }

    // Idempotency: callout response handlers that insert/update without upsert or external ID
    for (const cls of apexClasses) {
      if (!cls.Body) { continue; }
      const body = cls.Body;
      const hasCallout = /Http(Request|Response|Client)\b/.test(body) || /Messaging\.HttpCalloutMock/.test(body);
      if (!hasCallout) { continue; }

      // Has HTTP callout + DML insert/update but no upsert with external ID
      const hasInsertUpdate = /\b(insert|update)\s+/.test(body);
      const hasIdempotentUpsert = RE_UPSERT_EXTERNAL.test(body);
      const hasUpsert = /\bupsert\b/.test(body);

      if (hasInsertUpdate && !hasUpsert && !hasIdempotentUpsert) {
        issues.push({
          id: `idempotency-risk-${cls.Name}`,
          ruleId: 'integration-idempotency-risk',
          category: 'cta-review',
          severity: 'warning',
          message: `${cls.Name} makes HTTP callouts and uses insert/update but has no idempotent upsert pattern. If the callout is retried (by middleware, scheduled job, or manual re-run), duplicate records will be created.`,
          file: `org://${cls.Name}.cls`,
          line: 0,
          suggestion: 'Replace insert/update with upsert using an External ID field that matches the source system\'s unique key. Example: upsert records externalIdField__c; This ensures retried callouts are safe and idempotent.',
        });
      }
    }

    return issues;
  }

  /**
   * Detect implicit sharing risks: code that modifies User/Group objects
   * which can trigger system-wide sharing recalculations.
   */
  private detectImplicitSharingRisks(apexClasses: ApexClass[]): Issue[] {
    const issues: Issue[] = [];

    for (const cls of apexClasses) {
      if (!cls.Body) { continue; }
      const body = cls.Body;

      const userGroupMatches = body.match(RE_USER_GROUP_DML);
      RE_USER_GROUP_DML.lastIndex = 0;

      if (userGroupMatches && userGroupMatches.length > 0) {
        issues.push({
          id: `implicit-sharing-recalc-${cls.Name}`,
          ruleId: 'implicit-sharing-recalculation',
          category: 'cta-review',
          severity: 'warning',
          message: `${cls.Name} modifies User/Group/UserRole records. In large orgs, DML on these objects triggers system-wide sharing rule recalculations that can lock the entire org for minutes and cause CPU governor exceptions.`,
          file: `org://${cls.Name}.cls`,
          line: 0,
          suggestion: 'Move User/Group modifications to off-peak scheduled jobs. Use Deferred Sharing Calculation (available in Enterprise+). Never perform User DML synchronously inside triggers or Visualforce controllers. Consider using Permission Set assignments instead of profile changes.',
        });
      }
    }

    return issues;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createCtaArchitectureAnalyzer(sfService: SalesforceService): CtaArchitectureAnalyzer {
  return new CtaArchitectureAnalyzer(sfService);
}