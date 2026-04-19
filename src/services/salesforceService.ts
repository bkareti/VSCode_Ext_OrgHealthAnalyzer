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
} from '../types';
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

async function runSfJson(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync('sf', args, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function isValidApiName(value: string): boolean {
  return API_NAME_REGEX.test(value);
}

/**
 * Salesforce Service class for interacting with Salesforce orgs
 */
export class SalesforceService {
  private orgInfo: OrgInfo | null = null;
  private accessToken: string | null = null;
  private instanceUrl: string | null = null;

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
    const result = await runSfJson(['org', 'display', '--json']) as {
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
    
    return {
      id: result.result.id,
      accessToken: result.result.accessToken,
      instanceUrl: result.result.instanceUrl,
      username: result.result.username,
      alias: result.result.alias,
      apiVersion: result.result.apiVersion || '62.0',
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
          apiVersion: '62.0',
        })));
      }
      
      if (result.result?.scratchOrgs) {
        orgs.push(...result.result.scratchOrgs.map((org: Record<string, string>) => ({
          id: org.orgId,
          accessToken: '',
          instanceUrl: org.instanceUrl,
          username: org.username,
          alias: org.alias,
          apiVersion: '62.0',
        })));
      }
      
      return orgs;
    } catch (error) {
      logWarning('Failed to list orgs: ' + getErrorMessage(error));
      return [];
    }
  }

  /**
   * Execute a Tooling API query with automatic pagination
   */
  async toolingQuery<T>(query: string): Promise<T[]> {
    return withRetry(async () => {
      logDebug(`Executing Tooling API query: ${query}`);
      const allRecords: T[] = [];

      // If the caller already specified LIMIT, run one page only
      if (query.includes('LIMIT')) {
        const result = await runSfJson([
          'data', 'query', '--query', query, '--use-tooling-api', '--json',
        ]) as {
          status: number; message?: string;
          result: { records: T[]; totalSize?: number; done?: boolean };
        };
        if (result.status !== 0) {
          throw new SalesforceQueryError(result.message || 'Query failed', query);
        }
        return result.result.records as T[];
      }

      // Auto-paginate using LIMIT+OFFSET (capped at 2000 per Salesforce)
      // then fall back to smaller pages if we hit the 2000 OFFSET ceiling
      let offset = 0;
      const PAGE = TOOLING_QUERY_LIMIT;
      const MAX_OFFSET = 2000;

      while (offset <= MAX_OFFSET) {
        const paginatedQuery = `${query} LIMIT ${PAGE} OFFSET ${offset}`;
        const result = await runSfJson([
          'data', 'query', '--query', paginatedQuery, '--use-tooling-api', '--json',
        ]) as {
          status: number; message?: string;
          result: { records: T[]; totalSize?: number; done?: boolean };
        };
        if (result.status !== 0) {
          throw new SalesforceQueryError(result.message || 'Query failed', query);
        }
        const records = result.result.records as T[];
        allRecords.push(...records);

        if (records.length < PAGE) { break; }
        offset += PAGE;
        if (offset > MAX_OFFSET) {
          logWarning(`Tooling query truncated at ${allRecords.length} records (OFFSET limit). Consider adding WHERE filters.`);
          break;
        }
      }

      return allRecords;
    });
  }

  /**
   * Execute a SOQL query with automatic pagination
   */
  async query<T>(query: string): Promise<T[]> {
    return withRetry(async () => {
      logDebug(`Executing SOQL query: ${query}`);
      const allRecords: T[] = [];

      if (query.includes('LIMIT')) {
        const result = await runSfJson([
          'data', 'query', '--query', query, '--json',
        ]) as {
          status: number; message?: string;
          result: { records: T[]; totalSize?: number; done?: boolean };
        };
        if (result.status !== 0) {
          throw new SalesforceQueryError(result.message || 'Query failed', query);
        }
        return result.result.records as T[];
      }

      let offset = 0;
      const PAGE = TOOLING_QUERY_LIMIT;
      const MAX_OFFSET = 2000;

      while (offset <= MAX_OFFSET) {
        const paginatedQuery = `${query} LIMIT ${PAGE} OFFSET ${offset}`;
        const result = await runSfJson([
          'data', 'query', '--query', paginatedQuery, '--json',
        ]) as {
          status: number; message?: string;
          result: { records: T[]; totalSize?: number; done?: boolean };
        };
        if (result.status !== 0) {
          throw new SalesforceQueryError(result.message || 'Query failed', query);
        }
        const records = result.result.records as T[];
        allRecords.push(...records);

        if (records.length < PAGE) { break; }
        offset += PAGE;
        if (offset > MAX_OFFSET) {
          logWarning(`SOQL query truncated at ${allRecords.length} records (OFFSET limit). Consider adding WHERE filters.`);
          break;
        }
      }

      return allRecords;
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
    return this.toolingQuery<ApexTrigger>(
      `SELECT Id, Name, Body, TableEnumOrId, ApiVersion, Status,
              UsageBeforeInsert, UsageAfterInsert, UsageBeforeUpdate, UsageAfterUpdate,
              UsageBeforeDelete, UsageAfterDelete, UsageAfterUndelete
       FROM ApexTrigger 
       WHERE Status = 'Active' AND NamespacePrefix = null`
    );
  }

  /**
   * Get Flow definitions with resolved object API names via FlowVersion join
   */
  async getFlows(): Promise<FlowDefinition[]> {
    // Strategy: Try multiple approaches from most modern to legacy.
    // 1) Flow (Tooling) with Status = 'Active' — available in recent API versions
    // 2) FlowDefinition (Tooling) — deprecated but works on older orgs
    // In both cases, resolve trigger object via FlowVersion if needed.

    // ── Attempt 1: Modern Flow Tooling object ─────────────────────────────
    // NOTE: IsTemplate / TriggerType fields may not exist in older API versions.
    // Try progressively simpler queries: 1a → 1b → 1c before falling back.
    type FlowRow = { Id: string; DeveloperName: string; Description?: string; ProcessType?: string; TriggerType?: string };
    let flows: FlowRow[] | null = null;

    try {
      flows = await this.toolingQuery<FlowRow>(
        `SELECT Id, DeveloperName, Description, ProcessType, TriggerType
         FROM Flow
         WHERE Status = 'Active'`
      );
      logInfo(`Fetched ${flows.length} active flows via Flow (Tooling API) [1a]`);
    } catch {
      try {
        flows = await this.toolingQuery<FlowRow>(
          `SELECT Id, DeveloperName, Description, ProcessType
           FROM Flow
           WHERE Status = 'Active'`
        );
        logInfo(`Fetched ${flows.length} active flows via Flow (Tooling API) [1b]`);
      } catch {
        try {
          flows = await this.toolingQuery<FlowRow>(
            `SELECT Id, DeveloperName FROM Flow WHERE Status = 'Active'`
          );
          logInfo(`Fetched ${flows.length} active flows via Flow (Tooling API) [1c]`);
        } catch (err1c) {
          logWarning(`Flow (Tooling) query failed, trying FlowDefinition fallback: ${getErrorMessage(err1c)}`);
        }
      }
    }

    if (flows !== null) {
      if (flows.length === 0) { return []; }
      try {
        const flowIdChunks = this.chunkArray(flows.map(f => `'${f.Id}'`), 200);
        const versionMap = new Map<string, string>();
        for (const chunk of flowIdChunks) {
          const versions = await this.toolingQuery<{ Id: string; TriggerObjectOrEventReference?: string }>(
            `SELECT Id, TriggerObjectOrEventReference
             FROM FlowVersion
             WHERE Id IN (${chunk.join(',')}) LIMIT ${TOOLING_QUERY_LIMIT}`
          );
          for (const v of versions) {
            if (v.TriggerObjectOrEventReference) {
              versionMap.set(v.Id, v.TriggerObjectOrEventReference);
            }
          }
        }
        return flows.map(f => ({
          Id: f.Id,
          DeveloperName: f.DeveloperName,
          ActiveVersionId: f.Id,
          Description: f.Description,
          ProcessType: f.ProcessType,
          TriggerType: f.TriggerType,
          ObjectApiName: versionMap.get(f.Id) || undefined,
        }));
      } catch {
        return flows.map(f => ({
          Id: f.Id,
          DeveloperName: f.DeveloperName,
          ActiveVersionId: f.Id,
          Description: f.Description,
          ProcessType: f.ProcessType,
          TriggerType: f.TriggerType,
        }));
      }
    }

    // ── Attempt 2: Legacy FlowDefinition (deprecated but wider compat) ────
    try {
      const flowDefs = await this.toolingQuery<FlowDefinition>(
        `SELECT Id, DeveloperName, ActiveVersionId, Description, ProcessType
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
          const versionMap = new Map<string, string>();

          for (const chunk of versionChunks) {
            const versions = await this.toolingQuery<{
              Id: string;
              TriggerObjectOrEventReference?: string;
            }>(
              `SELECT Id, TriggerObjectOrEventReference
               FROM FlowVersion
               WHERE Id IN (${chunk.join(',')}) LIMIT ${TOOLING_QUERY_LIMIT}`
            );
            for (const v of versions) {
              if (v.TriggerObjectOrEventReference) {
                versionMap.set(v.Id, v.TriggerObjectOrEventReference);
              }
            }
          }

          for (const flow of flowDefs) {
            if (flow.ActiveVersionId && versionMap.has(flow.ActiveVersionId)) {
              flow.ObjectApiName = versionMap.get(flow.ActiveVersionId);
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

    // 2-6. Aggregate counts — all run in parallel
    // NOTE: Avoid EntityDefinition.NamespacePrefix relationship filter — it fails
    // on many orgs. Use direct NamespacePrefix = null where supported, or no filter.
    const customFieldQuery = `SELECT EntityDefinitionId, COUNT(Id) NbCustomFields FROM CustomField WHERE NamespacePrefix = null GROUP BY EntityDefinitionId`;
    const totalFieldQuery = `SELECT EntityDefinitionId, COUNT(Id) NbTotalFields FROM FieldDefinition GROUP BY EntityDefinitionId`;
    const validationQuery = `SELECT EntityDefinitionId, COUNT(Id) NbValidations FROM ValidationRule WHERE NamespacePrefix = null GROUP BY EntityDefinitionId`;
    const triggerQuery = `SELECT EntityDefinitionId, COUNT(Id) NbTriggers FROM ApexTrigger WHERE NamespacePrefix = null GROUP BY EntityDefinitionId`;
    const lookupQuery = `SELECT EntityDefinitionId, COUNT(Id) NbLookups FROM FieldDefinition WHERE DataType = 'Lookup' GROUP BY EntityDefinitionId`;
    const mdQuery = `SELECT EntityDefinitionId, COUNT(Id) NbMD FROM FieldDefinition WHERE DataType = 'MasterDetail' GROUP BY EntityDefinitionId`;

    try {
      const [entities, cfRows, tfRows, vrRows, trigRows, lookupRows, mdRows] = await Promise.all([
        this.toolingQuery<{ DurableId: string; QualifiedApiName: string; Label: string; KeyPrefix: string }>(entityQuery),
        this.toolingQuery<{ EntityDefinitionId: string; NbCustomFields: number }>(customFieldQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbCustomFields: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbTotalFields: number }>(totalFieldQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbTotalFields: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbValidations: number }>(validationQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbValidations: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbTriggers: number }>(triggerQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbTriggers: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbLookups: number }>(lookupQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbLookups: number }>),
        this.toolingQuery<{ EntityDefinitionId: string; NbMD: number }>(mdQuery).catch(() => [] as Array<{ EntityDefinitionId: string; NbMD: number }>),
      ]);

      // Build lookup maps from aggregate results (EntityDefinitionId → count)
      const cfMap = new Map(cfRows.map(r => [r.EntityDefinitionId, Number(r.NbCustomFields)]));
      const tfMap = new Map(tfRows.map(r => [r.EntityDefinitionId, Number(r.NbTotalFields)]));
      const vrMap = new Map(vrRows.map(r => [r.EntityDefinitionId, Number(r.NbValidations)]));
      const trigMap = new Map(trigRows.map(r => [r.EntityDefinitionId, Number(r.NbTriggers)]));
      const lookMap = new Map(lookupRows.map(r => [r.EntityDefinitionId, Number(r.NbLookups)]));
      const mdMap = new Map(mdRows.map(r => [r.EntityDefinitionId, Number(r.NbMD)]));

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
      // Use COUNT(Id) with an alias; some orgs need explicit LIMIT on aggregate queries
      const rows = await this.query<{ ProfileId: string; expr0: number }>(
        `SELECT ProfileId, COUNT(Id) expr0
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
      const raw = await runSfJson([
        'api', 'request', 'rest',
        `/services/data/v63.0/query/?explain=${encoded}`,
        '--json',
      ]) as { status: number; result: { sforcePerformanceLevel?: string; notes?: Array<{ description: string; fields: string[]; tableEnumOrId: string }> } };
      const r = raw.result ?? {};
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
   * Get record count for an object (approximate)
   */
  async getRecordCount(objectName: string): Promise<number> {
    try {
      if (!isValidApiName(objectName)) {
        logWarning(`Invalid object API name skipped: ${objectName}`);
        return -1;
      }

      const result = await this.query<{ expr0: number }>(
        `SELECT COUNT() FROM ${objectName} LIMIT 1`
      );
      return result.length > 0 ? result[0].expr0 : 0;
    } catch {
      return -1;
    }
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
    try {
      const rows = await this.query<{ Id: string; Name: string; LastModifiedDate: string; CreatedDate: string }>(
        `SELECT Id, Name, LastModifiedDate, CreatedDate
         FROM Dashboard
         WHERE LastModifiedDate < ${cutoff}T00:00:00Z
         ORDER BY LastModifiedDate ASC LIMIT 500`
      );
      return rows.map(r => ({ ...r, DeveloperName: r.Name }));
    } catch {
      // Fallback: try without ORDER BY (not supported on Dashboard in some editions)
      try {
        const rows = await this.query<{ Id: string; Name: string; LastModifiedDate: string; CreatedDate: string }>(
          `SELECT Id, Name, LastModifiedDate, CreatedDate
           FROM Dashboard
           WHERE LastModifiedDate < ${cutoff}T00:00:00Z LIMIT 500`
        );
        return rows.map(r => ({ ...r, DeveloperName: r.Name }));
      } catch {
        // Fallback 3: no WHERE clause — fetch all dashboards, filter in JS
        try {
          const rows = await this.query<{ Id: string; Name: string; LastModifiedDate: string; CreatedDate: string }>(
            `SELECT Id, Name, LastModifiedDate, CreatedDate FROM Dashboard LIMIT 500`
          );
          const cutoffIso = `${cutoff}T00:00:00Z`;
          return rows
            .filter(r => r.LastModifiedDate < cutoffIso)
            .map(r => ({ ...r, DeveloperName: r.Name }));
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
  async getFlexiPages(): Promise<Array<{ Id: string; DeveloperName: string; MasterLabel: string; PageType: string }>> {
    try {
      // Try with NamespacePrefix filter first
      return await this.toolingQuery<{ Id: string; DeveloperName: string; MasterLabel: string; PageType: string }>(
        `SELECT Id, DeveloperName, MasterLabel, PageType FROM FlexiPage WHERE NamespacePrefix = null LIMIT ${TOOLING_QUERY_LIMIT}`
      );
    } catch {
      try {
        // Fallback 1: query without NamespacePrefix filter
        return await this.toolingQuery<{ Id: string; DeveloperName: string; MasterLabel: string; PageType: string }>(
          `SELECT Id, DeveloperName, MasterLabel, PageType FROM FlexiPage LIMIT ${TOOLING_QUERY_LIMIT}`
        );
      } catch {
        // Fallback 2: minimal query — some orgs restrict MasterLabel or PageType
        try {
          const rows = await this.toolingQuery<{ Id: string; DeveloperName: string; MasterLabel?: string; PageType?: string }>(
            `SELECT Id, DeveloperName FROM FlexiPage LIMIT ${TOOLING_QUERY_LIMIT}`
          );
          return rows.map(r => ({ Id: r.Id, DeveloperName: r.DeveloperName, MasterLabel: r.MasterLabel || r.DeveloperName, PageType: r.PageType || 'Unknown' }));
        } catch (err3) {
          logWarning(`Could not fetch Lightning pages (FlexiPage): ${getErrorMessage(err3)}`);
          return [];
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
  async getTrustInstanceStatus(instanceName: string): Promise<{ status: string; incidents: TrustIncident[] }> {
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
            resolve({ status: json.status || 'OK', incidents });
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
