/**
 * Salesforce Service - Handles connections and API calls to Salesforce
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as vscode from 'vscode';
import {
  OrgInfo,
  ApexClass,
  ApexTrigger,
  FlowDefinition,
  ValidationRule,
  CustomField,
  EntityDefinition,
  FieldDefinitionInfo,
  ApexCodeCoverage,
  PermissionSetInfo,
  NamedCredentialInfo,
  ConnectedAppInfo,
  CustomMetadataTypeInfo,
  PlatformEventInfo,
  UserInfo,
  ProfileInfo,
  RoleInfo,
  PackageInfo,
  VisualforceInfo,
  CustomLabelInfo,
  LicenseSummary,
  FeatureLicenseSummary,
  AppSummaryItem,
  TrustIncident,
  QueryExplainResult,
  OrgLimitInfo,
  MetadataDependency,
  OrgExtendedDetails,
  EnvironmentsSummary,
  IntegrationsSummary,
  PackageTypeSummary,
  AppTypeSummary,
} from '../types';
import { DataCloudIdentityCounts } from '../types/futureReadiness';
import {
  SalesforceAuthError,
  SalesforceConnectionError,
  SalesforceQueryError,
  withRetry,
  getErrorMessage,
} from '../utils/errors';
import { logInfo, logError, logDebug, logWarning } from '../utils/logger';

const execFileAsync = promisify(execFile);
const API_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*(?:__[A-Za-z0-9_]+)*$/;
const TOOLING_QUERY_LIMIT = 2000;

// Reuse TCP connections across the ~60-90 REST calls a single scan makes.
// Without keep-alive, every query pays a fresh TLS handshake; with it, the
// whole scan rides a handful of pooled sockets.
const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

/**
 * Fallback Salesforce API version used only until the org's real version is
 * resolved at connect time. Keep this current with recent Salesforce releases;
 * the live org version always takes precedence (see SalesforceService.apiVersion).
 */
const DEFAULT_API_VERSION = '63.0';

async function runSfJson(args: string[], targetOrg?: string): Promise<unknown> {
  // Multi-org: scope the command to a specific authenticated org via the CLI's
  // SF_TARGET_ORG env var. When unset, the CLI uses the configured default org.
  const env = targetOrg ? { ...process.env, SF_TARGET_ORG: targetOrg } : process.env;
  try {
    const { stdout } = await execFileAsync('sf', args, { maxBuffer: 50 * 1024 * 1024, env });
    return JSON.parse(stdout);
  } catch (execErr: unknown) {
    // The sf CLI writes structured error JSON to stdout even when it exits non-zero.
    // Extract the Salesforce error message so logs show the real cause, not just "Command failed: sf ...".
    const err = execErr as { stdout?: string; stderr?: string; message?: string };
    let sfDetail = '';
    if (err.stdout?.trim()) {
      try {
        const parsed = JSON.parse(err.stdout) as { message?: string; name?: string };
        sfDetail = parsed.message || parsed.name || '';
      } catch { sfDetail = err.stdout.slice(0, 400); }
    }
    if (!sfDetail && err.stderr?.trim()) { sfDetail = err.stderr.slice(0, 400); }
    throw new Error(sfDetail || err.message || 'sf command failed');
  }
}

function isValidApiName(value: string): boolean {
  return API_NAME_REGEX.test(value);
}

/** Normalise an API version string (e.g. "62", "62.0") to the "62.0" form. */
function normalizeApiVersion(raw: string | undefined | null): string {
  const value = (raw ?? '').trim();
  if (!value) { return DEFAULT_API_VERSION; }
  return /^\d+$/.test(value) ? `${value}.0` : value;
}

/**
 * Salesforce Service class for interacting with Salesforce orgs
 */
export class SalesforceService {
  private orgInfo: OrgInfo | null = null;
  private accessToken: string | null = null;
  private instanceUrl: string | null = null;
  /** Resolved from the connected org at connect() time; falls back to DEFAULT_API_VERSION. */
  private apiVersion: string = DEFAULT_API_VERSION;

  /**
   * @param targetOrg Username or alias of the org to target. When omitted, the
   *   SF CLI's configured default org is used.
   */
  constructor(private readonly targetOrg?: string) {}

  /** Run an `sf` JSON command scoped to this instance's target org. */
  private sf(args: string[]): Promise<unknown> {
    return runSfJson(args, this.targetOrg);
  }

  /**
   * Per-run fetch memoization. A SalesforceService is created once per scan,
   * so caching for the instance lifetime == caching for the run. Several
   * analyzers independently fetch the same metadata (triggers, custom fields,
   * permission sets, dependencies); this collapses those into a single fetch.
   * The in-flight promise is cached, so concurrent callers also share one fetch.
   */
  private memoCache = new Map<string, Promise<unknown>>();
  private memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.memoCache.get(key);
    if (hit) { return hit as Promise<T>; }
    const p = fn();
    this.memoCache.set(key, p);
    return p;
  }

  /**
   * GET a Salesforce REST resource directly over HTTPS (no `sf` CLI spawn).
   * `path` may include a query string (e.g. `/query/?explain=...`).
   */
  private sfRestGet<T>(path: string): Promise<T> {
    return this.restRequest<T>('GET', path);
  }

  /**
   * Core direct-HTTPS request against the connected org. Replaces per-query
   * `sf` CLI spawns — the dominant cost of a full scan. Uses the access token
   * captured at connect() and a keep-alive socket pool.
   *
   * On HTTP 401 (expired token) it refreshes once via `sf org display` — which
   * silently re-mints the access token — then retries the request a single time.
   */
  private async restRequest<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    if (!this.accessToken || !this.instanceUrl) {
      await this.connect();
    }
    const url = new URL(path, this.instanceUrl!);
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    return new Promise<T>((resolve, reject) => {
      const req = https.request(
        url,
        {
          method,
          agent: keepAliveAgent,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
            ...(payload ? { 'Content-Type': 'application/json' } : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            const text = Buffer.concat(chunks).toString('utf8');

            // Expired token → refresh via the CLI once, then retry.
            if (status === 401 && !retried) {
              this.getOrgInfo()
                .then((info) => {
                  this.accessToken = info.accessToken;
                  this.instanceUrl = info.instanceUrl;
                  return this.restRequest<T>(method, path, body, true);
                })
                .then(resolve, reject);
              return;
            }

            if (status >= 200 && status < 300) {
              if (!text) { resolve(undefined as unknown as T); return; }
              try { resolve(JSON.parse(text) as T); }
              catch { reject(new Error(`Non-JSON response (${status}) from ${path}: ${text.slice(0, 300)}`)); }
              return;
            }

            // Salesforce REST errors come back as [{ errorCode, message }].
            let detail = text.slice(0, 400);
            try {
              const parsed = JSON.parse(text) as unknown;
              if (Array.isArray(parsed) && (parsed[0] as { message?: string })?.message) {
                const e = parsed[0] as { errorCode?: string; message?: string };
                detail = `${e.errorCode ?? ''} ${e.message ?? ''}`.trim();
              } else if ((parsed as { message?: string })?.message) {
                detail = (parsed as { message: string }).message;
              }
            } catch { /* keep raw text */ }
            reject(new SalesforceQueryError(`Salesforce REST ${status}: ${detail}`, path));
          });
        },
      );
      req.on('error', reject);
      if (payload) { req.write(payload); }
      req.end();
    });
  }

  /**
   * Run a SOQL/Tooling query over REST and follow `nextRecordsUrl` to collect
   * every page. Native cursor pagination — no LIMIT/OFFSET ceiling (the old CLI
   * path silently truncated at OFFSET 2000).
   */
  private async restQueryAll<T>(soql: string, tooling: boolean): Promise<T[]> {
    if (!this.accessToken) { await this.connect(); }
    const queryPath = tooling ? this.restPath('tooling/query') : this.restPath('query');
    const all: T[] = [];
    let path: string | null = `${queryPath}?q=${encodeURIComponent(soql)}`;
    while (path) {
      const page: { records: T[]; done?: boolean; nextRecordsUrl?: string; totalSize?: number } =
        await this.restRequest('GET', path);
      if (Array.isArray(page.records)) { all.push(...page.records); }
      path = page.done === false && page.nextRecordsUrl ? page.nextRecordsUrl : null;
    }
    return all;
  }

  /**
   * Run several read-only queries in ONE HTTP round-trip via the Composite
   * Batch API. Each sub-response is returned independently so callers keep
   * per-query resilience. Returns null in a slot whose sub-request errored.
   */
  private async compositeQuery(
    soqls: string[],
  ): Promise<Array<{ records: unknown[]; totalSize?: number } | null>> {
    if (!this.accessToken) { await this.connect(); }
    const v = this.apiVersion;
    const batchRequests = soqls.map((soql) => ({
      method: 'GET',
      url: `/services/data/v${v}/query/?q=${encodeURIComponent(soql)}`,
    }));
    const res = await this.restRequest<{
      hasErrors: boolean;
      results: Array<{ statusCode: number; result: unknown }>;
    }>('POST', this.restPath('composite/batch'), { batchRequests });
    return res.results.map((r) =>
      r.statusCode >= 200 && r.statusCode < 300
        ? (r.result as { records: unknown[]; totalSize?: number })
        : null,
    );
  }

  /**
   * Fetch the real, current access token via `sf org auth show-access-token`.
   * Returns null if the command is unavailable (older CLI) or fails — the caller
   * then falls back to the (possibly redacted) `org display` token.
   * Newer `sf` CLI versions redact the access token in `org display` output.
   */
  private async fetchAccessToken(): Promise<string | null> {
    try {
      const r = await this.sf(['org', 'auth', 'show-access-token', '--json']) as {
        status: number;
        result?: { accessToken?: string } | string;
      };
      if (r.status !== 0) { return null; }
      const tok = typeof r.result === 'string' ? r.result : r.result?.accessToken;
      return tok || null;
    } catch {
      return null;
    }
  }

  /** The Salesforce API version resolved from the connected org (e.g. "62.0"). */
  getApiVersion(): string {
    return this.apiVersion;
  }

  /** Build a versioned REST resource path, e.g. restPath('limits') → /services/data/v62.0/limits */
  restPath(resource: string): string {
    const clean = resource.replace(/^\/+/, '');
    return `/services/data/v${this.apiVersion}/${clean}`;
  }

  /**
   * Initialize connection to the default Salesforce org
   */
  async connect(): Promise<OrgInfo> {
    try {
      logInfo('Connecting to Salesforce org...');
      
      const orgInfo = await this.getOrgInfo();
      this.orgInfo = orgInfo;
      this.accessToken = orgInfo.accessToken;
      this.instanceUrl = orgInfo.instanceUrl;
      
      logInfo(`Connected to org: ${orgInfo.username} (${orgInfo.alias || 'no alias'})`);
      return orgInfo;
    } catch (error) {
      const message = getErrorMessage(error);
      logError('Failed to connect to Salesforce org', error as Error);
      
      if (message.includes('No default') || message.includes('not authenticated')) {
        throw new SalesforceAuthError(
          'No default Salesforce org found. Please authenticate using: sf org login web',
          { originalError: message }
        );
      }
      
      throw new SalesforceConnectionError(message);
    }
  }

  /**
   * Get current org information from SF CLI
   */
  async getOrgInfo(): Promise<OrgInfo> {
    const result = await this.sf(['org', 'display', '--json']) as {
      status: number;
      message?: string;
      result: {
        id: string;
        accessToken: string;
        instanceUrl: string;
        username: string;
        alias?: string;
        apiVersion?: string;
      };
    };

    if (result.status !== 0) {
      throw new SalesforceAuthError(result.message || 'Failed to get org info');
    }

    // Capture the org's real API version as the single source of truth for all
    // versioned REST calls (replaces previously hardcoded version strings).
    this.apiVersion = normalizeApiVersion(result.result.apiVersion);

    // Newer `sf` CLI redacts the access token in `org display` output. Fetch the
    // real, current token via `org auth show-access-token`, which also refreshes
    // if stale. Fall back to the display token for older CLIs that don't redact.
    const realToken = await this.fetchAccessToken();
    const accessToken =
      realToken && realToken.startsWith('00D') ? realToken : result.result.accessToken;

    return {
      id: result.result.id,
      accessToken,
      instanceUrl: result.result.instanceUrl,
      username: result.result.username,
      alias: result.result.alias,
      apiVersion: this.apiVersion,
    };
  }

  /**
   * List all authenticated orgs
   */
  async listOrgs(): Promise<OrgInfo[]> {
    try {
      const result = await runSfJson(['org', 'list', '--json']) as {
        result?: {
          nonScratchOrgs?: Record<string, string>[];
          scratchOrgs?: Record<string, string>[];
        };
      };
      
      const orgs: OrgInfo[] = [];
      
      if (result.result?.nonScratchOrgs) {
        orgs.push(...result.result.nonScratchOrgs.map((org: Record<string, string>) => ({
          id: org.orgId,
          accessToken: '',
          instanceUrl: org.instanceUrl,
          username: org.username,
          alias: org.alias,
          apiVersion: DEFAULT_API_VERSION,
        })));
      }
      
      if (result.result?.scratchOrgs) {
        orgs.push(...result.result.scratchOrgs.map((org: Record<string, string>) => ({
          id: org.orgId,
          accessToken: '',
          instanceUrl: org.instanceUrl,
          username: org.username,
          alias: org.alias,
          apiVersion: DEFAULT_API_VERSION,
        })));
      }
      
      return orgs;
    } catch (error) {
      logWarning('Failed to list orgs: ' + getErrorMessage(error));
      return [];
    }
  }

  /**
   * Execute a Tooling API query with automatic pagination via native REST cursor.
   * Replaces the old LIMIT/OFFSET + CLI-spawn approach — no 2000-record ceiling.
   */
  async toolingQuery<T>(query: string): Promise<T[]> {
    return withRetry(async () => {
      logDebug(`Executing Tooling API query: ${query}`);
      return this.restQueryAll<T>(query, true);
    });
  }

  /**
   * Execute a SOQL query with automatic pagination via native REST cursor.
   * Replaces the old LIMIT/OFFSET + CLI-spawn approach — no 2000-record ceiling.
   */
  async query<T>(query: string): Promise<T[]> {
    return withRetry(async () => {
      logDebug(`Executing SOQL query: ${query}`);
      return this.restQueryAll<T>(query, false);
    });
  }

  /**
   * Get all active Apex classes from the org
   */
  async getApexClasses(): Promise<ApexClass[]> {
    return this.toolingQuery<ApexClass>(
      `SELECT Id, Name, Body, ApiVersion, Status, LengthWithoutComments, NamespacePrefix 
       FROM ApexClass 
       WHERE Status = 'Active' AND NamespacePrefix = null`
    );
  }

  /**
   * Get all active Apex triggers from the org
   */
  async getApexTriggers(): Promise<ApexTrigger[]> {
    return this.memo('apexTriggers', () => this.toolingQuery<ApexTrigger>(
      `SELECT Id, Name, Body, TableEnumOrId, ApiVersion, Status,
              UsageBeforeInsert, UsageAfterInsert, UsageBeforeUpdate, UsageAfterUpdate,
              UsageBeforeDelete, UsageAfterDelete, UsageAfterUndelete
       FROM ApexTrigger
       WHERE Status = 'Active' AND NamespacePrefix = null`
    ));
  }

  /**
   * Get Flow definitions with resolved object API names via FlowVersion join
   */
  async getFlows(): Promise<FlowDefinition[]> {
    // Strategy: Try multiple approaches from most modern to legacy.
    // 1) FlowDefinitionView (Data API) — multi-row queryable, no metadata-field limits
    // 2) FlowDefinition (Tooling) — deprecated but works on older orgs;
    //    resolve trigger object / process type via FlowVersion.

    // ── Attempt 1: FlowDefinitionView (Data API) ──────────────────────────
    // FlowDefinitionView is a standard, multi-row-queryable object that exposes
    // the flow's API name, process type, trigger type, description, and trigger
    // object directly — no metadata/FullName fields (which are restricted to a
    // single row) and no FlowVersion join required.
    try {
      type FlowViewRow = {
        DurableId: string; ApiName: string; Label?: string;
        ProcessType?: string; TriggerType?: string; IsActive?: boolean;
        Description?: string; TriggerObjectOrEventLabel?: string; LastModifiedDate?: string;
      };
      const views = await this.query<FlowViewRow>(
        `SELECT DurableId, ApiName, Label, ProcessType, TriggerType, IsActive,
                Description, TriggerObjectOrEventLabel, LastModifiedDate
         FROM FlowDefinitionView
         WHERE IsActive = true`
      );
      logInfo(`Fetched ${views.length} active flows via FlowDefinitionView`);
      return views.map(v => ({
        Id: v.DurableId,
        DeveloperName: v.ApiName,
        ActiveVersionId: v.DurableId,
        Description: v.Description,
        ProcessType: v.ProcessType,
        TriggerType: v.TriggerType,
        ObjectApiName: v.TriggerObjectOrEventLabel || undefined,
      }));
    } catch (viewErr) {
      logWarning(`FlowDefinitionView query failed, trying FlowDefinition fallback: ${getErrorMessage(viewErr)}`);
    }

    // ── Attempt 2: Legacy FlowDefinition (deprecated but wider compat) ────
    // NOTE: FlowDefinition has no ProcessType column (that lives on Flow), so we
    // only select fields it actually exposes and resolve the rest via FlowVersion.
    try {
      const flowDefs = await this.toolingQuery<FlowDefinition>(
        `SELECT Id, DeveloperName, ActiveVersionId, Description
         FROM FlowDefinition
         WHERE ActiveVersionId != null`
      );

      if (flowDefs.length === 0) {
        return flowDefs;
      }

      // Resolve object names from active FlowVersion records
      const versionIds = flowDefs
        .filter(f => f.ActiveVersionId)
        .map(f => `'${f.ActiveVersionId}'`);

      if (versionIds.length > 0) {
        try {
          const versionChunks = this.chunkArray(versionIds, 200);
          const versionMap = new Map<string, { object?: string; processType?: string }>();

          for (const chunk of versionChunks) {
            const versions = await this.toolingQuery<{
              Id: string;
              TriggerObjectOrEventReference?: string;
              ProcessType?: string;
            }>(
              `SELECT Id, TriggerObjectOrEventReference, ProcessType
               FROM FlowVersion
               WHERE Id IN (${chunk.join(',')}) LIMIT ${TOOLING_QUERY_LIMIT}`
            );
            for (const v of versions) {
              versionMap.set(v.Id, {
                object: v.TriggerObjectOrEventReference,
                processType: v.ProcessType,
              });
            }
          }

          for (const flow of flowDefs) {
            const v = flow.ActiveVersionId ? versionMap.get(flow.ActiveVersionId) : undefined;
            if (v) {
              flow.ObjectApiName = v.object ?? flow.ObjectApiName;
              flow.ProcessType = v.processType ?? flow.ProcessType;
            }
          }
        } catch (err) {
          logWarning(`Could not resolve FlowVersion objects: ${getErrorMessage(err)}`);
        }
      }

      return flowDefs;
    } catch (fallbackErr) {
      logWarning(`Failed to fetch flows (both Flow and FlowDefinition failed): ${getErrorMessage(fallbackErr)}`);
      return [];
    }
  }

  /**
   * Get all active Validation Rules from the org with resolved object API names
   */
  async getValidationRules(): Promise<ValidationRule[]> {
    // EntityDefinitionId on ValidationRule is the 15-char prefix of the object's EntityDefinition ID
    // We join via EntityDefinition to get the QualifiedApiName
    // NamespacePrefix = null ensures we only return customer (non-packaged) validation rules
    return this.toolingQuery<ValidationRule>(
      `SELECT Id, EntityDefinitionId, ValidationName, Active, Description, ErrorMessage,
              EntityDefinition.QualifiedApiName
       FROM ValidationRule
       WHERE Active = true AND NamespacePrefix = null`
    );
  }

  /**
   * Get custom fields with resolved object API names
   */
  async getCustomFields(): Promise<CustomField[]> {
    try {
      // Attempt the full query with EntityDefinition join first
      return await this.toolingQuery<CustomField>(
        `SELECT Id, DeveloperName, TableEnumOrId, FullName, Description, DataType,
                EntityDefinition.QualifiedApiName, EntityDefinition.Label
         FROM CustomField
         WHERE NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch {
      // Fallback 1: query without the EntityDefinition join
      try {
        return await this.toolingQuery<CustomField>(
          `SELECT Id, DeveloperName, TableEnumOrId, FullName, Description, DataType
           FROM CustomField
           WHERE NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
        );
      } catch {
        // Fallback 2: query without NamespacePrefix filter (filter in JS)
        try {
          const all = await this.toolingQuery<CustomField & { NamespacePrefix?: string }>(
            `SELECT Id, DeveloperName, TableEnumOrId, FullName, Description, DataType, NamespacePrefix
             FROM CustomField LIMIT ${TOOLING_QUERY_LIMIT}`
          );
          return all.filter(f => !f.NamespacePrefix);
        } catch {
          // Fallback 3: absolute minimum — just enough to count fields
          try {
            return await this.toolingQuery<CustomField>(
              `SELECT Id, DeveloperName, TableEnumOrId FROM CustomField LIMIT ${TOOLING_QUERY_LIMIT}`
            );
          } catch (err4) {
            logWarning(`Could not fetch custom fields: ${getErrorMessage(err4)}`);
            return [];
          }
        }
      }
    }
  }

  /**
   * Query the Tooling API `MetadataComponentDependency` object (the Dependency
   * API). Each row means "MetadataComponent references RefMetadataComponent".
   *
   * Constraints (Salesforce): only the `=` / `!=` / `AND` / `OR` operators are
   * allowed in the WHERE clause, and you cannot filter on MetadataComponentName
   * or RefMetadataComponentName. Results page via toolingQuery (~2000–4000 rows);
   * very large orgs may truncate. Returns [] if the Dependency API is unavailable.
   *
   * @param where Optional WHERE clause body (without the `WHERE` keyword), e.g.
   *              `RefMetadataComponentType = 'CustomField'`.
   */
  async getMetadataComponentDependencies(where?: string): Promise<MetadataDependency[]> {
    const base =
      `SELECT MetadataComponentId, MetadataComponentName, MetadataComponentType, ` +
      `RefMetadataComponentId, RefMetadataComponentName, RefMetadataComponentType ` +
      `FROM MetadataComponentDependency`;
    const query = where ? `${base} WHERE ${where}` : base;
    try {
      return await this.toolingQuery<MetadataDependency>(query);
    } catch (err) {
      logWarning(`MetadataComponentDependency query failed: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Active scheduled Apex jobs (CronTrigger, JobType '7' = Scheduled Apex).
   * Uses the Data API. Returns [] on failure.
   */
  async getScheduledApexJobs(): Promise<Array<{ name: string; state: string; nextFireTime?: string }>> {
    try {
      const rows = await this.query<{
        State?: string;
        NextFireTime?: string;
        CronJobDetail?: { Name?: string };
      }>(
        `SELECT Id, State, NextFireTime, CronJobDetail.Name, CronJobDetail.JobType ` +
        `FROM CronTrigger WHERE CronJobDetail.JobType = '7'`
      );
      return rows.map(r => ({
        name: r.CronJobDetail?.Name || 'Scheduled Job',
        state: r.State || 'UNKNOWN',
        nextFireTime: r.NextFireTime,
      }));
    } catch (err) {
      logWarning(`getScheduledApexJobs failed: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Classic Workflow Rules (WorkflowRule Tooling object). Active status is not
   * a bulk-queryable column, so it is omitted. Returns [] on failure.
   */
  async getWorkflowRules(): Promise<Array<{ name: string; objectApiName: string }>> {
    try {
      const rows = await this.toolingQuery<{ Name?: string; TableEnumOrId?: string }>(
        `SELECT Id, Name, TableEnumOrId FROM WorkflowRule`
      );
      return rows.map(r => ({
        name: r.Name || 'Workflow Rule',
        objectApiName: r.TableEnumOrId || '',
      }));
    } catch (err) {
      logWarning(`getWorkflowRules failed: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Entity Definitions (SObject metadata)
   */
  async getEntityDefinitions(objectNames?: string[]): Promise<EntityDefinition[]> {
    // NamespacePrefix = null restricts to customer-owned custom objects only (excludes managed packages)
    let query = `SELECT QualifiedApiName, Label, KeyPrefix, DurableId, IsCustomizable FROM EntityDefinition WHERE IsCustomizable = true AND NamespacePrefix = null`;

    if (objectNames && objectNames.length > 0) {
      const validNames = objectNames.filter(isValidApiName);
      if (validNames.length > 0) {
        const names = validNames.map((name) => `'${name}'`).join(',');
        query += ` AND QualifiedApiName IN (${names})`;
      }
      if (validNames.length !== objectNames.length) {
        logWarning('Some invalid object API names were ignored in EntityDefinition query.');
      }
    }

    return this.toolingQuery<EntityDefinition>(query);
  }

  /**
   * Fetch all org objects + aggregate field/automation counts in parallel.
   * Uses the OrgCheck-validated approach: EntityDefinition for object list,
   * then aggregate COUNT GROUP BY queries for each metadata type.
   * Returns an array of per-object stats ready for dataModelStats.
   */
  async getObjectDataModelCounts(): Promise<Array<{
    objectName: string;
    objectLabel: string;
    durableId: string;
    keyPrefix: string;
    customFields: number;
    totalFields: number;
    standardFields: number;
    validationRules: number;
    triggers: number;
    lookupFields: number;
    masterDetailFields: number;
    fieldLimitPct: number;
    formulaFields: number;
    encryptedFields: number;
  }>> {
    // 1. Object list — all customisable objects including standard ones
    // NOTE: NamespacePrefix = null on EntityDefinition is UNRELIABLE via Tooling API
    // (returns 0 rows on many org types/editions). Instead, fetch all customisable
    // objects and filter out managed-package objects in JavaScript.
    const entityQuery = `SELECT DurableId, QualifiedApiName, Label, KeyPrefix
       FROM EntityDefinition
       WHERE IsCustomizable = true
       AND KeyPrefix != null
       LIMIT 2000`;

    // 2-6. Aggregate counts — all run in parallel.
    // IMPORTANT: LIMIT 2000 is added explicitly to prevent toolingQuery from
    // appending "LIMIT x OFFSET y" for pagination — OFFSET is unsupported on
    // aggregate queries in many org editions and would silently return [] via .catch.
    // 2000 grouped rows is sufficient for any real org (one row per EntityDefinitionId).
    // NamespacePrefix = null excludes managed-package metadata for cleaner counts.
    const customFieldQuery = `SELECT EntityDefinitionId, COUNT(Id) NbCustomFields FROM CustomField WHERE NamespacePrefix = null GROUP BY EntityDefinitionId LIMIT 2000`;
    // FieldDefinition aggregates REQUIRE a filter — an unfiltered GROUP BY is rejected
    // by the Tooling API (returns 0 rows), which previously zeroed out every Standard
    // Fields count. EntityDefinition.IsCustomizable = true is the proven-working filter
    // (see getFieldDefinitions). Fallback keeps the unfiltered form for odd editions.
    const totalFieldQuery         = `SELECT EntityDefinitionId, COUNT(Id) NbTotalFields FROM FieldDefinition WHERE EntityDefinition.IsCustomizable = true GROUP BY EntityDefinitionId LIMIT 2000`;
    const totalFieldFallbackQuery = `SELECT EntityDefinitionId, COUNT(Id) NbTotalFields FROM FieldDefinition GROUP BY EntityDefinitionId LIMIT 2000`;
    const validationQuery  = `SELECT EntityDefinitionId, COUNT(Id) NbValidations FROM ValidationRule WHERE NamespacePrefix = null GROUP BY EntityDefinitionId LIMIT 2000`;
    const triggerQuery     = `SELECT EntityDefinitionId, COUNT(Id) NbTriggers FROM ApexTrigger WHERE NamespacePrefix = null GROUP BY EntityDefinitionId LIMIT 2000`;
    const lookupQuery      = `SELECT EntityDefinitionId, COUNT(Id) NbLookups FROM FieldDefinition WHERE DataType = 'Lookup' GROUP BY EntityDefinitionId LIMIT 2000`;
    const mdQuery          = `SELECT EntityDefinitionId, COUNT(Id) NbMD FROM FieldDefinition WHERE DataType = 'MasterDetail' GROUP BY EntityDefinitionId LIMIT 2000`;
    const formulaQuery     = `SELECT EntityDefinitionId, COUNT(Id) NbFormula FROM FieldDefinition WHERE IsCalculated = true AND EntityDefinition.IsCustomizable = true GROUP BY EntityDefinitionId LIMIT 2000`;
    const encryptedQuery   = `SELECT EntityDefinitionId, COUNT(Id) NbEncrypted FROM FieldDefinition WHERE DataType = 'EncryptedText' AND EntityDefinition.IsCustomizable = true GROUP BY EntityDefinitionId LIMIT 2000`;

    // Helper: run a query with NamespacePrefix=null filter; if the filtered query
    // returns 0 rows (some org editions reject the filter), retry without it.
    const queryWithNsFallback = async <T extends { EntityDefinitionId: string }>(
      filteredQ: string, fallbackQ: string
    ): Promise<T[]> => {
      try {
        const rows = await this.toolingQuery<T>(filteredQ);
        if (rows.length > 0) { return rows; }
        logWarning(`Aggregate query returned 0 rows with NamespacePrefix filter — retrying without it`);
        return await this.toolingQuery<T>(fallbackQ);
      } catch {
        try { return await this.toolingQuery<T>(fallbackQ); } catch { return []; }
      }
    };

    try {
      const [entities, cfRows, tfRows, vrRows, trigRows, lookupRows, mdRows, formulaRows, encryptedRows] = await Promise.all([
        this.toolingQuery<{ DurableId: string; QualifiedApiName: string; Label: string; KeyPrefix: string }>(entityQuery),
        queryWithNsFallback<{ EntityDefinitionId: string; NbCustomFields: number }>(
          customFieldQuery,
          `SELECT EntityDefinitionId, COUNT(Id) NbCustomFields FROM CustomField GROUP BY EntityDefinitionId LIMIT 2000`
        ),
        queryWithNsFallback<{ EntityDefinitionId: string; NbTotalFields: number }>(
          totalFieldQuery,
          totalFieldFallbackQuery
        ),
        queryWithNsFallback<{ EntityDefinitionId: string; NbValidations: number }>(
          validationQuery,
          `SELECT EntityDefinitionId, COUNT(Id) NbValidations FROM ValidationRule GROUP BY EntityDefinitionId LIMIT 2000`
        ),
        queryWithNsFallback<{ EntityDefinitionId: string; NbTriggers: number }>(
          triggerQuery,
          `SELECT EntityDefinitionId, COUNT(Id) NbTriggers FROM ApexTrigger GROUP BY EntityDefinitionId LIMIT 2000`
        ),
        this.toolingQuery<{ EntityDefinitionId: string; NbLookups: number }>(lookupQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbLookups: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbMD: number }>(mdQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbMD: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbFormula: number }>(formulaQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbFormula: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbEncrypted: number }>(encryptedQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbEncrypted: number }>),
      ]);

      // Build lookup maps from aggregate results (EntityDefinitionId → count)
      const cfMap        = new Map(cfRows.map(r => [r.EntityDefinitionId, Number(r.NbCustomFields)]));
      const tfMap        = new Map(tfRows.map(r => [r.EntityDefinitionId, Number(r.NbTotalFields)]));
      const vrMap        = new Map(vrRows.map(r => [r.EntityDefinitionId, Number(r.NbValidations)]));
      const trigMap      = new Map(trigRows.map(r => [r.EntityDefinitionId, Number(r.NbTriggers)]));
      const lookMap      = new Map(lookupRows.map(r => [r.EntityDefinitionId, Number(r.NbLookups)]));
      const mdMap        = new Map(mdRows.map(r => [r.EntityDefinitionId, Number(r.NbMD)]));
      const formulaMap   = new Map(formulaRows.map(r => [r.EntityDefinitionId, Number(r.NbFormula)]));
      const encryptedMap = new Map(encryptedRows.map(r => [r.EntityDefinitionId, Number(r.NbEncrypted)]));

      // Filter out managed-package objects in JavaScript.
      // Managed-package custom objects have a namespace prefix: ns__ObjectName__c
      // Standard objects (Account, Contact, etc.) and unmanaged custom objects pass through.
      const filteredEntities = entities.filter(e => {
        const name = e.QualifiedApiName;
        // Custom objects from managed packages have pattern: namespace__Name__c
        // Unmanaged custom objects: Name__c (no double-underscore before __c)
        if (name.endsWith('__c')) {
          const withoutSuffix = name.slice(0, -3); // remove __c
          return !withoutSuffix.includes('__');      // no namespace prefix
        }
        // Standard objects, __mdt, __e, __b — keep them all (non-managed)
        if (name.endsWith('__mdt') || name.endsWith('__e') || name.endsWith('__b')) {
          const withoutSuffix = name.replace(/__(?:mdt|e|b)$/, '');
          return !withoutSuffix.includes('__');
        }
        return true; // Standard objects always pass
      });

      logInfo(`EntityDefinition: ${entities.length} total, ${filteredEntities.length} after filtering managed packages`);

      // NOTE: EntityDefinitionId on child objects is a 15-char prefix of DurableId.
      // DurableId format is "<KeyPrefix><EntityId>" — we match by checking both
      // the full DurableId and its 15-char prefix against the map keys.
      // Helper: look up a map by full DurableId OR 15-char prefix OR KeyPrefix-prefix
      const mapGet = (map: Map<string, number>, durableId: string): number => {
        if (map.has(durableId)) { return map.get(durableId)!; }
        const id15 = durableId.slice(0, 15);
        if (map.has(id15)) { return map.get(id15)!; }
        // Some orgs store EntityDefinitionId as the 18-char ID padded differently
        // Try iterating keys that start with the same prefix (first 3 chars = KeyPrefix)
        const prefix3 = durableId.slice(0, 3);
        for (const [k, v] of map) {
          if (k.startsWith(prefix3) && (k === durableId || k.slice(0, 15) === id15)) { return v; }
        }
        return 0;
      };

      return filteredEntities.map(e => {
        // Aggregate rows use EntityDefinitionId which matches DurableId exactly in Tooling API
        const id = e.DurableId;
        const cf = mapGet(cfMap, id);
        const tf = mapGet(tfMap, id);
        const std = Math.max(0, tf - cf);
        const vr = mapGet(vrMap, id);
        const trig = mapGet(trigMap, id);
        const lu = mapGet(lookMap, id);
        const md = mapGet(mdMap, id);
        const formula    = mapGet(formulaMap, id);
        const encrypted  = mapGet(encryptedMap, id);
        return {
          objectName: e.QualifiedApiName,
          objectLabel: e.Label,
          durableId: id,
          keyPrefix: e.KeyPrefix,
          customFields: cf,
          totalFields: tf,
          standardFields: std,
          validationRules: vr,
          triggers: trig,
          lookupFields: lu,
          masterDetailFields: md,
          fieldLimitPct: Math.round((cf / 800) * 100),
          formulaFields: formula,
          encryptedFields: encrypted,
        };
      });
    } catch (err) {
      logWarning(`getObjectDataModelCounts failed: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Build a map of EntityDefinition ID prefix → QualifiedApiName
   */
  async getEntityDefinitionMap(): Promise<Map<string, string>> {
    const defs = await this.getEntityDefinitions();
    const map = new Map<string, string>();
    for (const def of defs) {
      // EntityDefinitionId stored on VR/CustomField is first 15 chars of the ID
      // EntityDefinition rows have a full 18-char Id - we index by QualifiedApiName
      // The actual ID-to-name mapping requires fetching EntityDefinition with Id
      map.set(def.QualifiedApiName, def.QualifiedApiName);
    }
    return map;
  }

  /**
   * Get Field Definitions with relationship metadata and indexing info.
   * Returns real Lookup / MasterDetail data per object — much richer than
   * the DataType string on CustomField.
   */
  async getFieldDefinitions(): Promise<FieldDefinitionInfo[]> {
    try {
      // Attempt 1: filter by IsCustomizable (avoids NamespacePrefix which fails on many orgs)
      return await this.toolingQuery<FieldDefinitionInfo>(
        `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName, DataType,
                RelationshipName, IsIndexed
         FROM FieldDefinition
         WHERE EntityDefinition.IsCustomizable = true
           AND DataType IN ('Lookup', 'MasterDetail')
         LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch {
      try {
        // Attempt 2: minimal query without any relationship filter
        return await this.toolingQuery<FieldDefinitionInfo>(
          `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName, DataType,
                  RelationshipName, IsIndexed
           FROM FieldDefinition
           WHERE DataType IN ('Lookup', 'MasterDetail')
           LIMIT ${TOOLING_QUERY_LIMIT}`
        );
      } catch (err) {
        logWarning(`Could not fetch FieldDefinitions: ${getErrorMessage(err)}`);
        return [];
      }
    }
  }

  /**
   * Count users assigned to each profile.
   */
  async getProfileUserCounts(): Promise<Array<{ ProfileId: string; userCount: number }>> {
    try {
      // Leave the COUNT unaliased — Salesforce returns it as the reserved `expr0`
      // key; explicitly aliasing to `expr0` is rejected ("alias is reserved").
      const rows = await this.query<{ ProfileId: string; expr0: number }>(
        `SELECT ProfileId, COUNT(Id)
         FROM User
         WHERE IsActive = true AND UserType = 'Standard'
         GROUP BY ProfileId
         LIMIT 500`
      );
      return rows.map(r => ({ ProfileId: r.ProfileId, userCount: Number(r.expr0) }));
    } catch {
      // Fallback: just fetch active users and count in-memory
      try {
        const users = await this.query<{ ProfileId: string }>(
          `SELECT ProfileId FROM User WHERE IsActive = true AND UserType = 'Standard' LIMIT 2000`
        );
        const countMap = new Map<string, number>();
        for (const u of users) {
          countMap.set(u.ProfileId, (countMap.get(u.ProfileId) ?? 0) + 1);
        }
        return Array.from(countMap.entries()).map(([ProfileId, userCount]) => ({ ProfileId, userCount }));
      } catch (err2) {
        logWarning(`Could not fetch profile user counts: ${getErrorMessage(err2)}`);
        return [];
      }
    }
  }

  /**
   * Explain a SOQL query using the Tooling API explain endpoint.
   * Returns selectivity notes and whether a full table scan would be used.
   */
  async explainQuery(soql: string): Promise<QueryExplainResult> {
    try {
      const encoded = encodeURIComponent(soql);
      const r = await this.sfRestGet<{
        sforcePerformanceLevel?: string;
        notes?: Array<{ description: string; fields: string[]; tableEnumOrId: string }>;
      }>(`${this.restPath('query')}/?explain=${encoded}`);
      const notes = r.notes ?? [];
      return {
        soql,
        sforcePerformanceLevel: r.sforcePerformanceLevel ?? 'Unknown',
        notes,
        isFullTableScan: notes.some(n => n.description?.toLowerCase().includes('full table scan')),
      };
    } catch (err) {
      logWarning(`Could not explain query: ${getErrorMessage(err)}`);
      return { soql, sforcePerformanceLevel: 'Unknown', notes: [], isFullTableScan: false };
    }
  }

  /**
   * Fetch live governor-limit utilisation from the REST /limits endpoint.
   * Returns daily API requests, data/file storage, async/bulk limits, etc.,
   * each as used/max with a consumed percentage. Best-effort: returns [] on error.
   */
  async getOrgLimits(): Promise<OrgLimitInfo[]> {
    try {
      const result = await this.sfRestGet<Record<string, { Max?: number; Remaining?: number }>>(
        this.restPath('limits'),
      );
      const limits: OrgLimitInfo[] = [];
      for (const [name, value] of Object.entries(result)) {
        const max = Number(value?.Max ?? 0);
        const remaining = Number(value?.Remaining ?? 0);
        if (!Number.isFinite(max) || max <= 0) { continue; }
        const used = Math.max(0, max - remaining);
        limits.push({
          name,
          label: name.replace(/([a-z])([A-Z])/g, '$1 $2'),
          max,
          remaining,
          used,
          usedPct: Math.round((used / max) * 100),
        });
      }
      // Surface the most-consumed limits first.
      limits.sort((a, b) => b.usedPct - a.usedPct);
      return limits;
    } catch (err) {
      logWarning(`Could not fetch org limits: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Fetch user license utilisation from UserLicense object.
   */
  async getUserLicenseSummary(): Promise<LicenseSummary[]> {
    try {
      const rows = await this.query<{ Name: string; TotalLicenses: number; UsedLicenses: number }>(
        `SELECT Name, TotalLicenses, UsedLicenses FROM UserLicense ORDER BY UsedLicenses DESC LIMIT 50`
      );
      return rows.map(r => ({
        name: r.Name,
        totalLicenses: r.TotalLicenses,
        usedLicenses: r.UsedLicenses,
        usedPct: r.TotalLicenses > 0 ? Math.round((r.UsedLicenses / r.TotalLicenses) * 100) : 0,
      }));
    } catch (err) {
      logWarning(`Could not fetch UserLicense summary: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Apex code coverage summary from the org
   */
  async getApexCodeCoverage(): Promise<ApexCodeCoverage[]> {
    return this.toolingQuery<ApexCodeCoverage>(
      `SELECT ApexClassOrTrigger.Name, ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered
       FROM ApexCodeCoverageAggregate
       ORDER BY NumLinesUncovered DESC LIMIT ${TOOLING_QUERY_LIMIT}`
    );
  }

  /**
   * Get Permission Sets from the org
   */
  async getPermissionSets(): Promise<PermissionSetInfo[]> {
    return this.toolingQuery<PermissionSetInfo>(
      `SELECT Id, Name, Label, IsCustom, PermissionsModifyAllData, PermissionsViewAllData
       FROM PermissionSet
       WHERE IsCustom = true AND NamespacePrefix = null`
    );
  }

  /**
   * Get Permission Set Groups from the org (modern permission model).
   * Status of 'Outdated' means the group's aggregate permissions need
   * recalculation — a real governance signal. Best-effort: returns [] on error.
   */
  async getPermissionSetGroups(): Promise<Array<{ Id: string; DeveloperName: string; MasterLabel: string; Status: string }>> {
    try {
      return await this.query<{ Id: string; DeveloperName: string; MasterLabel: string; Status: string }>(
        `SELECT Id, DeveloperName, MasterLabel, Status FROM PermissionSetGroup WHERE NamespacePrefix = null`
      );
    } catch (err) {
      logWarning(`Could not fetch Permission Set Groups: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Count active users assigned to each Permission Set and Permission Set Group.
   * Assigning a group creates a PermissionSetAssignment row with PermissionSetGroupId
   * populated, so we count both dimensions. Best-effort: returns empty maps on error.
   */
  async getPermissionSetAssignmentCounts(): Promise<{
    bySet: Map<string, number>;
    byGroup: Map<string, number>;
  }> {
    const bySet = new Map<string, number>();
    const byGroup = new Map<string, number>();
    try {
      const setRows = await this.query<{ PermissionSetId: string; expr0: number }>(
        `SELECT PermissionSetId, COUNT(AssigneeId)
         FROM PermissionSetAssignment
         WHERE Assignee.IsActive = true
         GROUP BY PermissionSetId
         LIMIT 2000`
      );
      for (const r of setRows) {
        if (r.PermissionSetId) { bySet.set(r.PermissionSetId, Number(r.expr0)); }
      }
    } catch (err) {
      logWarning(`Could not fetch Permission Set assignment counts: ${getErrorMessage(err)}`);
    }
    try {
      const groupRows = await this.query<{ PermissionSetGroupId: string; expr0: number }>(
        `SELECT PermissionSetGroupId, COUNT(AssigneeId)
         FROM PermissionSetAssignment
         WHERE Assignee.IsActive = true AND PermissionSetGroupId != null
         GROUP BY PermissionSetGroupId
         LIMIT 2000`
      );
      for (const r of groupRows) {
        if (r.PermissionSetGroupId) { byGroup.set(r.PermissionSetGroupId, Number(r.expr0)); }
      }
    } catch (err) {
      logWarning(`Could not fetch Permission Set Group assignment counts: ${getErrorMessage(err)}`);
    }
    return { bySet, byGroup };
  }

  /**
   * Get Named Credentials from the org
   */
  async getNamedCredentials(): Promise<NamedCredentialInfo[]> {
    return this.toolingQuery<NamedCredentialInfo>(
      `SELECT Id, DeveloperName, MasterLabel, PrincipalType, Protocol, Endpoint
       FROM NamedCredential`
    );
  }

  /**
   * Get Connected Apps from the org
   */
  async getConnectedApps(): Promise<ConnectedAppInfo[]> {
    try {
      return await this.toolingQuery<ConnectedAppInfo>(
        `SELECT Id, Name, OptionsAllowAdminApprovedUsersOnly
         FROM ConnectedApplication LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch {
      logWarning('Could not fetch Connected Apps');
      return [];
    }
  }

  /**
   * Get Custom Metadata Types from the org
   */
  async getCustomMetadataTypes(): Promise<CustomMetadataTypeInfo[]> {
    try {
      return await this.toolingQuery<CustomMetadataTypeInfo>(
        `SELECT Id, DeveloperName, MasterLabel, Description
         FROM CustomObject
         WHERE IsCustomMetadata = true AND NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch {
      // Fallback: use EntityDefinition to find __mdt objects (not all orgs support IsCustomMetadata filter)
      try {
        const rows = await this.toolingQuery<{ Id: string; QualifiedApiName: string; Label: string }>(
          `SELECT Id, QualifiedApiName, Label
           FROM EntityDefinition
           WHERE QualifiedApiName LIKE '%__mdt' AND NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
        );
        return rows.map(r => ({
          Id: r.Id,
          DeveloperName: r.QualifiedApiName.replace('__mdt', ''),
          MasterLabel: r.Label,
          Description: '',
        }));
      } catch (err2) {
        logWarning(`Could not fetch Custom Metadata Types: ${getErrorMessage(err2)}`);
        return [];
      }
    }
  }

  /**
   * Get Platform Events from the org
   */
  async getPlatformEvents(): Promise<PlatformEventInfo[]> {
    try {
      return await this.toolingQuery<PlatformEventInfo>(
        `SELECT Id, QualifiedApiName, Label
         FROM EntityDefinition
         WHERE QualifiedApiName LIKE '%__e' LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch {
      logWarning('Could not fetch Platform Events');
      return [];
    }
  }

  /**
   * Get record count for an object using COUNT(Id) which populates the records array.
   * SELECT COUNT() returns totalSize in the response header (empty records[]), so we use
   * COUNT(Id) which returns a single row with the count in the aliased column.
   */
  async getRecordCount(objectName: string): Promise<number> {
    try {
      if (!isValidApiName(objectName)) {
        logWarning(`Invalid object API name skipped: ${objectName}`);
        return -1;
      }

      const result = await this.query<{ cnt: number }>(
        `SELECT COUNT(Id) cnt FROM ${objectName}`
      );
      return result.length > 0 ? Number(result[0].cnt) : 0;
    } catch {
      return -1;
    }
  }

  /**
   * Fetch record counts for multiple objects in parallel batches.
   * Runs BATCH_SIZE queries concurrently, then moves to the next batch.
   * Returns a Map of objectName → count; objects with errors are omitted.
   */
  async getObjectRecordCountsBatch(objectNames: string[]): Promise<Map<string, number>> {
    const BATCH_SIZE = 20;
    const result = new Map<string, number>();

    for (let i = 0; i < objectNames.length; i += BATCH_SIZE) {
      const batch = objectNames.slice(i, i + BATCH_SIZE);
      const counts = await Promise.all(batch.map(name => this.getRecordCount(name)));
      for (let j = 0; j < batch.length; j++) {
        const c = counts[j];
        if (c >= 0) { result.set(batch[j], c); }
      }
    }

    return result;
  }

  /**
   * Get active users from the org
   */
  async getActiveUsers(): Promise<UserInfo[]> {
    try {
      return await this.query<UserInfo>(
        `SELECT Id, Name, Username, IsActive, ProfileId, Profile.Name, UserType, LastLoginDate, CreatedDate, FederationIdentifier
         FROM User
         WHERE IsActive = true AND UserType IN ('Standard', 'PowerPartner', 'CsnOnly', 'PowerCustomerSuccess', 'CustomerSuccess')
         ORDER BY LastLoginDate ASC NULLS FIRST LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch active users: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get all users (active + inactive) for dormancy analysis
   */
  async getAllUsers(): Promise<UserInfo[]> {
    try {
      return await this.query<UserInfo>(
        `SELECT Id, Name, Username, IsActive, ProfileId, Profile.Name, UserType, LastLoginDate, CreatedDate
         FROM User
         WHERE UserType IN ('Standard', 'PowerPartner', 'CsnOnly', 'PowerCustomerSuccess', 'CustomerSuccess')
         ORDER BY IsActive DESC, LastLoginDate ASC NULLS FIRST LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch all users: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Profiles with key dangerous permissions
   */
  async getProfilesWithPermissions(): Promise<ProfileInfo[]> {
    try {
      // Profile is a standard CRM object — use REST query, NOT Tooling API
      return await this.query<ProfileInfo>(
        `SELECT Id, Name, UserType,
                PermissionsModifyAllData, PermissionsViewAllData,
                PermissionsManageUsers, PermissionsAuthorApex,
                PermissionsCustomizeApplication
         FROM Profile
         WHERE UserType = 'Standard'
         ORDER BY Name LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch profiles: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Role Hierarchy
   */
  async getUserRoles(): Promise<RoleInfo[]> {
    try {
      return await this.query<RoleInfo>(
        `SELECT Id, Name, DeveloperName, ParentRoleId, OpportunityAccessForAccountOwner
         FROM UserRole
         ORDER BY Name LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch user roles: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get installed managed packages
   */
  async getInstalledPackages(): Promise<PackageInfo[]> {
    try {
      return await this.toolingQuery<PackageInfo>(
        `SELECT Id, SubscriberPackageId,
                SubscriberPackage.Name, SubscriberPackage.NamespacePrefix,
                SubscriberPackageVersion.Id, SubscriberPackageVersion.Name,
                SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion,
                SubscriberPackageVersion.PatchVersion
         FROM InstalledSubscriberPackage
         ORDER BY SubscriberPackage.Name LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch installed packages: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get stale reports (not modified in 180+ days)
   */
  async getStaleReports(): Promise<Array<{ Id: string; Name: string; DeveloperName: string; LastModifiedDate: string; CreatedDate: string; FolderName?: string }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 180);
      const cutoff = cutoffDate.toISOString().split('T')[0];
      return await this.query<{ Id: string; Name: string; DeveloperName: string; LastModifiedDate: string; CreatedDate: string; FolderName?: string }>(
        `SELECT Id, Name, DeveloperName, LastModifiedDate, CreatedDate
         FROM Report
         WHERE LastModifiedDate < ${cutoff}T00:00:00Z
         ORDER BY LastModifiedDate ASC LIMIT 500`
      );
    } catch (err) {
      logWarning(`Could not fetch stale reports: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get stale dashboards (not modified in 180+ days)
   */
  async getStaleDashboards(): Promise<Array<{ Id: string; Name: string; DeveloperName: string; LastModifiedDate: string; CreatedDate: string }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 180);
    const cutoff = cutoffDate.toISOString().split('T')[0];
    // Dashboard has no `Name` field — the display name is `Title` and the API
    // name is `DeveloperName`. Map Title → the returned `Name` for consumers.
    type DashRow = { Id: string; Title: string; DeveloperName: string; LastModifiedDate: string; CreatedDate: string };
    const toResult = (r: DashRow) => ({
      Id: r.Id, Name: r.Title, DeveloperName: r.DeveloperName,
      LastModifiedDate: r.LastModifiedDate, CreatedDate: r.CreatedDate,
    });
    try {
      const rows = await this.query<DashRow>(
        `SELECT Id, Title, DeveloperName, LastModifiedDate, CreatedDate
         FROM Dashboard
         WHERE LastModifiedDate < ${cutoff}T00:00:00Z
         ORDER BY LastModifiedDate ASC LIMIT 500`
      );
      return rows.map(toResult);
    } catch {
      // Fallback: try without ORDER BY (not supported on Dashboard in some editions)
      try {
        const rows = await this.query<DashRow>(
          `SELECT Id, Title, DeveloperName, LastModifiedDate, CreatedDate
           FROM Dashboard
           WHERE LastModifiedDate < ${cutoff}T00:00:00Z LIMIT 500`
        );
        return rows.map(toResult);
      } catch {
        // Fallback 3: no WHERE clause — fetch all dashboards, filter in JS
        try {
          const rows = await this.query<DashRow>(
            `SELECT Id, Title, DeveloperName, LastModifiedDate, CreatedDate FROM Dashboard LIMIT 500`
          );
          const cutoffIso = `${cutoff}T00:00:00Z`;
          return rows
            .filter(r => r.LastModifiedDate < cutoffIso)
            .map(toResult);
        } catch (err3) {
          logWarning(`Could not fetch stale dashboards: ${getErrorMessage(err3)}`);
          return [];
        }
      }
    }
  }

  /**
   * Get Visualforce Pages from the org
   */
  async getVisualforcePages(): Promise<VisualforceInfo[]> {
    try {
      return await this.toolingQuery<VisualforceInfo>(
        `SELECT Id, Name, MasterLabel, ApiVersion, Description, ControllerType, IsAvailableInTouch
         FROM ApexPage
         WHERE NamespacePrefix = null
         ORDER BY Name LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch Visualforce pages: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Custom Labels from the org
   */
  async getCustomLabels(): Promise<CustomLabelInfo[]> {
    try {
      return await this.toolingQuery<CustomLabelInfo>(
        `SELECT Id, Name, MasterLabel, Value, Language, Category
         FROM ExternalString
         WHERE NamespacePrefix = null
         ORDER BY Category, Name LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch custom labels: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Record Types (active, non-managed)
   */
  async getRecordTypes(): Promise<Array<{ Id: string; Name: string; SobjectType: string; IsActive: boolean }>> {
    try {
      return await this.toolingQuery<{ Id: string; Name: string; SobjectType: string; IsActive: boolean }>(
        `SELECT Id, Name, SobjectType, IsActive FROM RecordType WHERE IsActive = true AND NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch record types: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Page Layouts (non-managed)
   */
  async getPageLayouts(): Promise<Array<{ Id: string; Name: string; TableEnumOrId: string }>> {
    try {
      return await this.toolingQuery<{ Id: string; Name: string; TableEnumOrId: string }>(
        `SELECT Id, Name, TableEnumOrId FROM Layout WHERE NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch (err) {
      logWarning(`Could not fetch page layouts: ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get Lightning/Flexi Pages (non-managed)
   */
  async getFlexiPages(): Promise<Array<{ Id: string; DeveloperName: string; MasterLabel: string; PageType: string; EntityDefinitionId?: string }>> {
    try {
      // Try with EntityDefinitionId + NamespacePrefix filter (best data for object association)
      return await this.toolingQuery<{ Id: string; DeveloperName: string; MasterLabel: string; PageType: string; EntityDefinitionId?: string }>(
        `SELECT Id, DeveloperName, MasterLabel, PageType, EntityDefinitionId FROM FlexiPage WHERE NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch {
      try {
        // Fallback 1: without NamespacePrefix filter
        return await this.toolingQuery<{ Id: string; DeveloperName: string; MasterLabel: string; PageType: string; EntityDefinitionId?: string }>(
          `SELECT Id, DeveloperName, MasterLabel, PageType, EntityDefinitionId FROM FlexiPage LIMIT ${TOOLING_QUERY_LIMIT}`
        );
      } catch {
        try {
          // Fallback 2: without EntityDefinitionId (some API versions don't expose it)
          return await this.toolingQuery<{ Id: string; DeveloperName: string; MasterLabel: string; PageType: string }>(
            `SELECT Id, DeveloperName, MasterLabel, PageType FROM FlexiPage WHERE NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
          );
        } catch {
          // Fallback 3: minimal query — some orgs restrict MasterLabel or PageType
          try {
            const rows = await this.toolingQuery<{ Id: string; DeveloperName: string; MasterLabel?: string; PageType?: string }>(
              `SELECT Id, DeveloperName FROM FlexiPage LIMIT ${TOOLING_QUERY_LIMIT}`
            );
            return rows.map(r => ({ Id: r.Id, DeveloperName: r.DeveloperName, MasterLabel: r.MasterLabel || r.DeveloperName, PageType: r.PageType || 'Unknown' }));
          } catch (err4) {
            logWarning(`Could not fetch Lightning pages (FlexiPage): ${getErrorMessage(err4)}`);
            return [];
          }
        }
      }
    }
  }

  /**
   * Check if connected to an org
   */
  isConnected(): boolean {
    return this.orgInfo !== null;
  }

  /**
   * Get feature licenses (FeatureLicense object — available in all org types)
   */
  async getFeatureLicenses(): Promise<FeatureLicenseSummary[]> {
    try {
      const rows = await this.query<{ MasterLabel: string; Status: string; TotalLicenses: number; UsedLicenses: number }>(
        // ORDER BY is not supported on FeatureLicense in some orgs — remove it
        `SELECT MasterLabel, Status, TotalLicenses, UsedLicenses FROM FeatureLicense LIMIT 200`
      );
      return rows.map(r => ({
        name: r.MasterLabel,
        status: r.Status,
        totalLicenses: r.TotalLicenses ?? 0,
        usedLicenses: r.UsedLicenses ?? 0,
      }));
    } catch (err) {
      // FeatureLicense is not available on all org editions (Developer, Scratch) — suppress to debug
      logDebug(`Could not fetch feature licenses (not available on this org edition): ${getErrorMessage(err)}`);
      return [];
    }
  }

  /**
   * Get installed apps (Console + Standard) from AppDefinition (Tooling) with AppMenuItem fallback
   */
  async getInstalledApps(): Promise<AppSummaryItem[]> {
    try {
      // Try Tooling API AppDefinition first
      const rows = await this.toolingQuery<{ Label: string; DeveloperName: string; IsNavPersonalizationDisabled?: boolean; NavType?: string }>(
        `SELECT Label, DeveloperName, NavType FROM AppDefinition ORDER BY Label LIMIT 500`
      );
      return rows.map(r => ({
        label: r.Label || r.DeveloperName,
        type: r.NavType || 'Standard',
        isActive: true,
      }));
    } catch {
      // Fallback: AppMenuItem (available via REST Data API)
      try {
        const rows = await this.query<{ Label: string; Type: string; IsVisible: boolean }>(
          `SELECT Label, Type, IsVisible FROM AppMenuItem WHERE IsVisible = true ORDER BY Label LIMIT 500`
        );
        return rows.map(r => ({
          label: r.Label,
          type: r.Type || 'Standard',
          isActive: r.IsVisible,
        }));
      } catch (err2) {
        logWarning(`Could not fetch apps: ${getErrorMessage(err2)}`);
        return [];
      }
    }
  }

  /**
   * Fetch Salesforce Trust instance status from status.salesforce.com (public API, no auth needed)
   * Returns status for the specific instance this org is on.
   */
  async getTrustInstanceStatus(instanceName: string): Promise<{ status: string; incidents: TrustIncident[]; releaseNumber?: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ status: 'Unknown', incidents: [] }), 8000);
      const key = instanceName.toUpperCase();
      const url = `https://api.status.salesforce.com/v1/instances/${key}/status`;
      https.get(url, { headers: { 'User-Agent': 'OrgPulse-VSCode-Ext/1.5' } }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const json = JSON.parse(data) as {
              status?: string;
              releaseVersion?: string;
              releaseNumber?: string;
              Incidents?: Array<{ id: string; message: { content: string }; severity: string; affectedComponents: Array<{ name: string }>; createdAt: string; status: string }>;
              MaintenanceWindows?: unknown[];
            };
            const incidents: TrustIncident[] = (json.Incidents || []).map(inc => ({
              id: inc.id,
              message: inc.message?.content || '',
              severity: inc.severity || 'Unknown',
              affectedComponents: (inc.affectedComponents || []).map(c => c.name),
              createdAt: inc.createdAt || '',
              status: inc.status || 'active',
            }));
            // releaseNumber is the Salesforce CD build (e.g. "246.8"); releaseVersion
            // is the human name (e.g. "Spring '24 Patch 14.2"). Prefer the number.
            const releaseNumber = json.releaseNumber || json.releaseVersion || undefined;
            resolve({ status: json.status || 'OK', incidents, releaseNumber });
          } catch {
            resolve({ status: 'Unknown', incidents: [] });
          }
        });
        res.on('error', () => { clearTimeout(timeout); resolve({ status: 'Unknown', incidents: [] }); });
      }).on('error', () => { clearTimeout(timeout); resolve({ status: 'Unknown', incidents: [] }); });
    });
  }

  /**
   * Get org edition and name from Organization sObject
   */
  async getOrgEdition(): Promise<{ name: string; instanceName: string; orgType: string }> {
    try {
      const rows = await this.query<{ Name: string; InstanceName: string; OrganizationType: string }>(
        `SELECT Name, InstanceName, OrganizationType FROM Organization LIMIT 1`
      );
      const org = rows[0];
      return {
        name: org?.Name || '',
        instanceName: org?.InstanceName || '',
        orgType: org?.OrganizationType || '',
      };
    } catch (err) {
      logWarning(`Could not fetch org edition: ${getErrorMessage(err)}`);
      return { name: '', instanceName: '', orgType: '' };
    }
  }

  /**
   * Fetch Salesforce release schedule for a given instance from status.salesforce.com
   */
  async getNextReleaseInfo(instanceName: string): Promise<{ name: string; date: string } | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 8000);
      const key = instanceName.toUpperCase();
      const url = `https://api.status.salesforce.com/v1/instances/${key}/maintenances?limit=5`;
      https.get(url, { headers: { 'User-Agent': 'OrgPulse-VSCode-Ext/1.5' } }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const arr = JSON.parse(data) as Array<{ name?: string; message?: { content?: string }; plannedStartTime?: string; plannedEndTime?: string; status?: string }>;
            // Find the next upcoming scheduled maintenance that looks like a release
            const upcoming = arr
              .filter(m => m.status === 'Scheduled' || m.status === 'InProgress')
              .sort((a, b) => (a.plannedStartTime || '') < (b.plannedStartTime || '') ? -1 : 1);
            if (upcoming.length > 0) {
              resolve({ name: upcoming[0].name || upcoming[0].message?.content || 'Scheduled Maintenance', date: upcoming[0].plannedStartTime || '' });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
        res.on('error', () => { clearTimeout(timeout); resolve(null); });
      }).on('error', () => { clearTimeout(timeout); resolve(null); });
    });
  }

  /**
   * Get current org info
   */
  getCurrentOrg(): OrgInfo | null {
    return this.orgInfo;
  }

  /**
   * Disconnect from the org
   */
  disconnect(): void {
    this.orgInfo = null;
    this.accessToken = null;
    this.instanceUrl = null;
    logInfo('Disconnected from Salesforce org');
  }

  /** COUNT() query shorthand — returns the totalSize of a SELECT COUNT() result. */
  async queryCount(soql: string): Promise<number> {
    const path = `${this.restPath('query')}?q=${encodeURIComponent(soql)}`;
    const res = await this.restRequest<{ totalSize?: number }>('GET', path);
    return res.totalSize ?? 0;
  }

  /** Return counts of special Salesforce object types for the Data Model tab. */
  async getDataModelTypeCounts(): Promise<{
    externalObjectCount: number;
    bigObjectCount: number;
    customMetadataTypeCount: number;
    customSettingCount: number;
    platformEventCount: number;
  }> {
    const queries = [
      'SELECT COUNT() FROM ExternalObject',
      "SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName LIKE '%__b'",
      "SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName LIKE '%__mdt'",
      'SELECT COUNT() FROM EntityDefinition WHERE IsCustomSetting = true',
      "SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName LIKE '%__e'",
    ];
    try {
      const [ext, big, mdt, cs, pe] = await this.compositeQuery(queries);
      return {
        externalObjectCount:     ext?.totalSize ?? 0,
        bigObjectCount:          big?.totalSize ?? 0,
        customMetadataTypeCount: mdt?.totalSize ?? 0,
        customSettingCount:      cs?.totalSize  ?? 0,
        platformEventCount:      pe?.totalSize  ?? 0,
      };
    } catch (err) {
      logWarning(`Composite type-count query failed, falling back: ${getErrorMessage(err)}`);
      const [ext, big, mdt, cs, pe] = await Promise.allSettled([
        this.queryCount('SELECT COUNT() FROM ExternalObject'),
        this.queryCount("SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName LIKE '%__b'"),
        this.queryCount("SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName LIKE '%__mdt'"),
        this.queryCount('SELECT COUNT() FROM EntityDefinition WHERE IsCustomSetting = true'),
        this.queryCount("SELECT COUNT() FROM EntityDefinition WHERE QualifiedApiName LIKE '%__e'"),
      ]);
      return {
        externalObjectCount:     ext.status === 'fulfilled' ? ext.value : 0,
        bigObjectCount:          big.status === 'fulfilled' ? big.value : 0,
        customMetadataTypeCount: mdt.status === 'fulfilled' ? mdt.value : 0,
        customSettingCount:      cs.status  === 'fulfilled' ? cs.value  : 0,
        platformEventCount:      pe.status  === 'fulfilled' ? pe.value  : 0,
      };
    }
  }

  /** Return Data Cloud identity-graph object counts (Individual / ContactPoint* / Contact) in one composite call. */
  async getDataCloudIdentityCounts(): Promise<DataCloudIdentityCounts> {
    const queries = [
      'SELECT COUNT() FROM Individual',
      'SELECT COUNT() FROM ContactPointEmail',
      'SELECT COUNT() FROM ContactPointPhone',
      'SELECT COUNT() FROM ContactPointAddress',
      'SELECT COUNT() FROM Contact',
      'SELECT COUNT() FROM Contact WHERE Email != null',
    ];
    try {
      const [ind, cpe, cpp, cpa, cTotal, cEmail] = await this.compositeQuery(queries);
      return {
        individualCount:          ind?.totalSize ?? 0,
        contactPointEmailCount:   cpe?.totalSize ?? 0,
        contactPointPhoneCount:   cpp?.totalSize ?? 0,
        contactPointAddressCount: cpa?.totalSize ?? 0,
        contactTotalCount:        cTotal?.totalSize ?? 0,
        contactWithEmailCount:    cEmail?.totalSize ?? 0,
      };
    } catch (err) {
      logWarning(`Composite Data Cloud identity-count query failed, falling back: ${getErrorMessage(err)}`);
      const results = await Promise.allSettled(queries.map((q) => this.queryCount(q)));
      const val = (r: PromiseSettledResult<number>) => (r.status === 'fulfilled' ? r.value : 0);
      const [ind, cpe, cpp, cpa, cTotal, cEmail] = results;
      return {
        individualCount:          val(ind),
        contactPointEmailCount:   val(cpe),
        contactPointPhoneCount:   val(cpp),
        contactPointAddressCount: val(cpa),
        contactTotalCount:        val(cTotal),
        contactWithEmailCount:    val(cEmail),
      };
    }
  }

  /** Expanded Organization sObject query — superset of getOrgEdition(). */
  async getOrgExtendedDetails(): Promise<OrgExtendedDetails & { name: string; instanceName: string; orgType: string }> {
    try {
      type OrgRow = {
        Name: string; InstanceName: string; OrganizationType: string;
        CreatedDate?: string; IsSandbox?: boolean;
        TimeZoneSidKey?: string; LanguageLocaleKey?: string;
        DefaultCurrencyIsoCode?: string; DefaultLocaleSidKey?: string;
        Division?: string; PrimaryContact?: string; Phone?: string; Fax?: string;
        Street?: string; City?: string; State?: string; PostalCode?: string; Country?: string;
        FiscalYearStartMonth?: number; NamespacePrefix?: string;
        MonthlyPageViewsUsed?: number; MonthlyPageViewsEntitlement?: number;
      };
      // DefaultCurrencyIsoCode only exists on Organization when multi-currency is
      // enabled. Query the always-present fields first so a single-currency org
      // doesn't lose the entire extended-details payload; then try to enrich with
      // the currency separately.
      const rows = await this.query<OrgRow>(
        `SELECT Name, InstanceName, OrganizationType, CreatedDate, IsSandbox,
                TimeZoneSidKey, LanguageLocaleKey, DefaultLocaleSidKey,
                Division, PrimaryContact, Phone, Fax,
                Street, City, State, PostalCode, Country,
                FiscalYearStartMonth, NamespacePrefix,
                MonthlyPageViewsUsed, MonthlyPageViewsEntitlement
         FROM Organization LIMIT 1`
      );
      const org = rows[0];
      if (org && org.DefaultCurrencyIsoCode === undefined) {
        try {
          const currencyRows = await this.query<{ DefaultCurrencyIsoCode?: string }>(
            `SELECT DefaultCurrencyIsoCode FROM Organization LIMIT 1`
          );
          if (currencyRows[0]?.DefaultCurrencyIsoCode) {
            org.DefaultCurrencyIsoCode = currencyRows[0].DefaultCurrencyIsoCode;
          }
        } catch {
          // Single-currency org: field not available, leave currency undefined.
        }
      }
      const instanceName = org?.InstanceName || '';
      const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const addressParts = [org?.Street, org?.City, org?.State, org?.PostalCode, org?.Country]
        .map(p => (p || '').trim()).filter(Boolean);
      return {
        name: org?.Name || '',
        instanceName,
        orgType: org?.OrganizationType || '',
        createdDate: org?.CreatedDate,
        timezone: org?.TimeZoneSidKey,
        language: org?.LanguageLocaleKey,
        currency: org?.DefaultCurrencyIsoCode,
        defaultLocale: org?.DefaultLocaleSidKey,
        division: org?.Division,
        primaryContact: org?.PrimaryContact,
        phone: org?.Phone,
        fax: org?.Fax,
        address: addressParts.length ? addressParts.join(', ') : undefined,
        fiscalYearStartMonth: typeof org?.FiscalYearStartMonth === 'number' ? MONTHS[org.FiscalYearStartMonth] : undefined,
        namespacePrefix: org?.NamespacePrefix || undefined,
        monthlyPageViewsUsed: org?.MonthlyPageViewsUsed,
        monthlyPageViewsEntitlement: org?.MonthlyPageViewsEntitlement,
        isHyperforce: /^(GSI|AUS|IND|JPN|SGP|FRA|DEU|GBR|CAN|BRA)\w/i.test(instanceName),
        isSandbox: org?.IsSandbox ?? false,
        dataCenter: instanceName,
      };
    } catch (err) {
      logWarning(`Could not fetch org extended details: ${getErrorMessage(err)}`);
      const fallback = await this.getOrgEdition();
      return { ...fallback };
    }
  }

  /** Count sandboxes by type and scratch orgs. Best-effort — returns zeros on any error. */
  async getEnvironmentsSummary(): Promise<EnvironmentsSummary> {
    const result: EnvironmentsSummary = {
      production: 1, fullSandboxes: 0, partialSandboxes: 0,
      developerSandboxes: 0, scratchOrgs: 0, total: 1,
    };
    try {
      const rows = await this.query<{ LicenseType: string }>(
        `SELECT LicenseType FROM SandboxInfo LIMIT 2000`
      );
      for (const r of rows) {
        const lt = (r.LicenseType || '').toUpperCase();
        if (lt === 'FULL') { result.fullSandboxes++; }
        else if (lt === 'PARTIAL') { result.partialSandboxes++; }
        else { result.developerSandboxes++; }
      }
    } catch { /* SandboxInfo not available in all orgs/editions */ }
    try {
      const scratchRows = await this.query<{ Id: string }>(`SELECT Id FROM ActiveScratchOrg LIMIT 200`);
      result.scratchOrgs = scratchRows.length;
    } catch { /* Dev Hub only */ }
    result.total = result.production + result.fullSandboxes + result.partialSandboxes +
      result.developerSandboxes + result.scratchOrgs;
    return result;
  }

  /** Count integration components (Named Creds, Connected Apps, etc.). Each query is independently best-effort. */
  async getIntegrationsSummary(): Promise<IntegrationsSummary> {
    const [nc, ca, ec, rs, ap, cert] = await Promise.allSettled([
      this.queryCount('SELECT COUNT() FROM NamedCredential'),
      this.queryCount('SELECT COUNT() FROM ConnectedApplication'),
      this.toolingQuery<{ Id: string }>('SELECT Id FROM ExternalCredential LIMIT 200').then(r => r.length),
      this.toolingQuery<{ Id: string }>('SELECT Id FROM RemoteProxy LIMIT 500').then(r => r.length),
      this.queryCount('SELECT COUNT() FROM AuthProvider'),
      this.toolingQuery<{ Id: string }>('SELECT Id FROM Certificate LIMIT 200').then(r => r.length),
    ]);
    const get = (r: PromiseSettledResult<number>) => r.status === 'fulfilled' ? r.value : 0;
    const namedCredentials = get(nc);
    const connectedApps = get(ca);
    const externalCredentials = get(ec);
    const remoteSites = get(rs);
    const authProviders = get(ap);
    const certificates = get(cert);
    return {
      namedCredentials, connectedApps, externalCredentials,
      remoteSites, authProviders, certificates,
      total: namedCredentials + connectedApps + externalCredentials + remoteSites + authProviders + certificates,
    };
  }

  /** Batch COUNT queries for Quick Facts counters not available from other analyzers. */
  async getQuickFactsCounts(): Promise<{
    roles: number; publicGroups: number; queues: number; permissionSetGroups: number;
    customObjects: number | null; flows: number | null;
  }> {
    // NOTE: EntityDefinition does not support aggregate COUNT(); the COUNT()-able
    // metrics go through compositeQuery, while custom objects / flows are fetched
    // as row lists and counted in JS (null ⇒ org rejected the query / unavailable).
    const queries = [
      'SELECT COUNT() FROM UserRole',
      "SELECT COUNT() FROM Group WHERE Type = 'Regular'",
      "SELECT COUNT() FROM Group WHERE Type = 'Queue'",
      'SELECT COUNT() FROM PermissionSetGroup',
    ];

    // Custom objects: count all customizable objects ending in __c (incl. managed
    // packages, matching Object Manager). Flows: one FlowDefinition per flow.
    const customObjectsP = this.toolingQuery<{ QualifiedApiName: string }>(
      `SELECT QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true AND KeyPrefix != null LIMIT 5000`
    ).then(rows => rows.filter(r => (r.QualifiedApiName || '').endsWith('__c')).length)
     .catch(() => null);
    const flowsP = this.toolingQuery<{ Id: string }>(`SELECT Id FROM FlowDefinition LIMIT 5000`)
      .then(rows => rows.length)
      .catch(() => null);

    let base: { roles: number; publicGroups: number; queues: number; permissionSetGroups: number };
    try {
      const [roles, grp, que, psg] = await this.compositeQuery(queries);
      base = {
        roles: roles?.totalSize ?? 0,
        publicGroups: grp?.totalSize ?? 0,
        queues: que?.totalSize ?? 0,
        permissionSetGroups: psg?.totalSize ?? 0,
      };
    } catch {
      const [roles, grp, que, psg] = await Promise.allSettled(queries.map(q => this.queryCount(q)));
      const get = (r: PromiseSettledResult<number>) => r.status === 'fulfilled' ? r.value : 0;
      base = { roles: get(roles), publicGroups: get(grp), queues: get(que), permissionSetGroups: get(psg) };
    }
    const [customObjects, flows] = await Promise.all([customObjectsP, flowsP]);
    return { ...base, customObjects, flows };
  }

  /** Classify installed packages into Managed / Unlocked / Local by namespace presence. */
  classifyPackages(packages: PackageInfo[]): PackageTypeSummary {
    let managed = 0, unlocked = 0, local = 0;
    for (const pkg of packages) {
      const ns = pkg.SubscriberPackage?.NamespacePrefix;
      if (ns && ns.trim()) { managed++; }
      else if (pkg.SubscriberPackageVersion) { unlocked++; }
      else { local++; }
    }
    return { managed, unlocked, local, total: managed + unlocked + local };
  }

  /** Classify existing apps by type and count experience sites. */
  async getAppTypeSummary(existingApps: AppSummaryItem[]): Promise<AppTypeSummary> {
    const consoleApps = existingApps.filter(a =>
      a.type === 'ServiceDesk' || a.type === 'Console' ||
      (a.type || '').toLowerCase().includes('console')
    ).length;
    const lightningApps = existingApps.length - consoleApps;
    let experienceSites = 0;
    try {
      const sites = await this.query<{ Id: string }>(`SELECT Id FROM Network WHERE Status = 'Live' LIMIT 200`);
      experienceSites = sites.length;
    } catch {
      try {
        const sites = await this.toolingQuery<{ Id: string }>('SELECT Id FROM ExperienceSite LIMIT 200');
        experienceSites = sites.length;
      } catch { /* not available */ }
    }
    let connectedApps = 0;
    try { connectedApps = await this.queryCount('SELECT COUNT() FROM ConnectedApplication'); } catch { /* ok */ }
    return { lightningApps, experienceSites, consoleApps, connectedApps, mobileApps: 0, omniStudioApps: 0, total: lightningApps + experienceSites + consoleApps + connectedApps };
  }

  /**
   * Split an array into chunks of the given size
   */
  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}

// Singleton instance
let salesforceServiceInstance: SalesforceService | null = null;

/**
 * Get the Salesforce service singleton
 */
export function getSalesforceService(): SalesforceService {
  if (!salesforceServiceInstance) {
    salesforceServiceInstance = new SalesforceService();
  }
  return salesforceServiceInstance;
}

/**
 * Check if SF CLI is installed
 */
export async function isSfCliInstalled(): Promise<boolean> {
  try {
    await execFileAsync('sf', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Show prompt to install SF CLI if not installed
 */
export async function ensureSfCli(): Promise<boolean> {
  const isInstalled = await isSfCliInstalled();

  if (!isInstalled) {
    const action = await vscode.window.showErrorMessage(
      'Salesforce CLI (sf) is not installed. Please install it to use org metadata features.',
      'Install Instructions',
      'Continue Without Org'
    );

    if (action === 'Install Instructions') {
      vscode.env.openExternal(vscode.Uri.parse('https://developer.salesforce.com/tools/salesforcecli'));
    }

    return false;
  }

  return true;
}

/**
 * Check if the Salesforce Code Analyzer plugin is installed.
 *
 * We inspect the installed plugin list rather than invoking `sf code-analyzer
 * --version`: on older CLIs an unknown command triggers an interactive
 * "Did you mean…?" prompt that blocks (or, with stdin closed, can exit 0 and
 * falsely report success). Listing plugins is prompt-free and unambiguous.
 */
export async function isCodeAnalyzerInstalled(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('sf', ['plugins'], { timeout: 15000 });
    return /code-analyzer/i.test(stdout);
  } catch {
    return false;
  }
}

/**
 * Check if a Java runtime is available (required by the PMD and Graph Engine engines).
 */
export async function isJavaInstalled(): Promise<boolean> {
  try {
    // `java -version` writes to stderr and exits 0 when present.
    await execFileAsync('java', ['-version']);
    return true;
  } catch {
    return false;
  }
}

let codeAnalyzerHintShown = false;

/**
 * Verify the Code Analyzer prerequisites (plugin + Java). On the first missing
 * prerequisite per session, surface a non-blocking hint with install links.
 * Returns true only when both are present.
 */
export async function ensureCodeAnalyzer(): Promise<boolean> {
  const [hasPlugin, hasJava] = await Promise.all([
    isCodeAnalyzerInstalled(),
    isJavaInstalled(),
  ]);

  if (hasPlugin && hasJava) {
    return true;
  }

  if (!codeAnalyzerHintShown) {
    codeAnalyzerHintShown = true;
    const missing = !hasPlugin && !hasJava
      ? 'the Salesforce Code Analyzer plugin and a Java runtime'
      : !hasPlugin
        ? 'the Salesforce Code Analyzer plugin'
        : 'a Java runtime (required by the PMD/Graph Engine engines)';
    const action = await vscode.window.showWarningMessage(
      `Salesforce Code Analyzer is enabled but ${missing} ${(!hasPlugin && !hasJava) ? 'are' : 'is'} not available. ` +
        'Falling back to built-in rules for code analysis.',
      'Setup Instructions',
      'Dismiss'
    );
    if (action === 'Setup Instructions') {
      vscode.env.openExternal(vscode.Uri.parse('https://developer.salesforce.com/docs/platform/salesforce-code-analyzer/guide/install.html'));
    }
  }

  return false;
}
