/**
 * Salesforce Service - Handles connections and API calls to Salesforce
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import {
  OrgInfo,
  ApexClass,
  ApexTrigger,
  FlowDefinition,
  ValidationRule,
  CustomField,
  EntityDefinition,
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

async function runSfJson(args: string[]): Promise<unknown> {
  const { stdout } = await execFileAsync('sf', args, { maxBuffer: 10 * 1024 * 1024 });
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
      
      // Try to get org info from SF CLI
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
      apiVersion: result.result.apiVersion || '60.0',
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
          apiVersion: '60.0',
        })));
      }
      
      if (result.result?.scratchOrgs) {
        orgs.push(...result.result.scratchOrgs.map((org: Record<string, string>) => ({
          id: org.orgId,
          accessToken: '',
          instanceUrl: org.instanceUrl,
          username: org.username,
          alias: org.alias,
          apiVersion: '60.0',
        })));
      }
      
      return orgs;
    } catch (error) {
      logWarning('Failed to list orgs: ' + getErrorMessage(error));
      return [];
    }
  }

  /**
   * Execute a Tooling API query
   */
  async toolingQuery<T>(query: string): Promise<T[]> {
    return withRetry(async () => {
      logDebug(`Executing Tooling API query: ${query}`);

      const result = await runSfJson([
        'data',
        'query',
        '--query',
        query,
        '--use-tooling-api',
        '--json',
      ]) as {
        status: number;
        message?: string;
        result: { records: T[] };
      };
      
      if (result.status !== 0) {
        throw new SalesforceQueryError(result.message || 'Query failed', query);
      }
      
      return result.result.records as T[];
    });
  }

  /**
   * Execute a SOQL query
   */
  async query<T>(query: string): Promise<T[]> {
    return withRetry(async () => {
      logDebug(`Executing SOQL query: ${query}`);

      const result = await runSfJson([
        'data',
        'query',
        '--query',
        query,
        '--json',
      ]) as {
        status: number;
        message?: string;
        result: { records: T[] };
      };
      
      if (result.status !== 0) {
        throw new SalesforceQueryError(result.message || 'Query failed', query);
      }
      
      return result.result.records as T[];
    });
  }

  /**
   * Get all Apex classes from the org
   */
  async getApexClasses(): Promise<ApexClass[]> {
    return this.toolingQuery<ApexClass>(
      `SELECT Id, Name, Body, ApiVersion, Status, LengthWithoutComments, NamespacePrefix 
       FROM ApexClass 
       WHERE Status = 'Active' AND NamespacePrefix = null`
    );
  }

  /**
   * Get all Apex triggers from the org
   */
  async getApexTriggers(): Promise<ApexTrigger[]> {
    return this.toolingQuery<ApexTrigger>(
      `SELECT Id, Name, Body, TableEnumOrId, ApiVersion, Status,
              UsageBeforeInsert, UsageAfterInsert, UsageBeforeUpdate, UsageAfterUpdate,
              UsageBeforeDelete, UsageAfterDelete, UsageAfterUndelete
       FROM ApexTrigger 
       WHERE Status = 'Active'`
    );
  }

  /**
   * Get all Flow definitions from the org
   */
  async getFlows(): Promise<FlowDefinition[]> {
    return this.toolingQuery<FlowDefinition>(
      `SELECT Id, DeveloperName, ActiveVersionId, Description, ProcessType, TriggerType
       FROM FlowDefinition 
       WHERE ActiveVersionId != null`
    );
  }

  /**
   * Get all Validation Rules from the org
   */
  async getValidationRules(): Promise<ValidationRule[]> {
    return this.toolingQuery<ValidationRule>(
      `SELECT Id, EntityDefinitionId, ValidationName, Active, Description, ErrorMessage
       FROM ValidationRule 
       WHERE Active = true`
    );
  }

  /**
   * Get all Custom Fields from the org
   */
  async getCustomFields(): Promise<CustomField[]> {
    return this.toolingQuery<CustomField>(
      `SELECT Id, DeveloperName, TableEnumOrId, FullName, Description
       FROM CustomField`
    );
  }

  /**
   * Get Entity Definitions (SObject metadata)
   */
  async getEntityDefinitions(objectNames?: string[]): Promise<EntityDefinition[]> {
    let query = `SELECT QualifiedApiName, Label, IsCustomizable FROM EntityDefinition WHERE IsCustomizable = true`;
    
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
   * Get record count for an object (approximate)
   */
  async getRecordCount(objectName: string): Promise<number> {
    try {
      if (!isValidApiName(objectName)) {
        logWarning(`Invalid object API name skipped: ${objectName}`);
        return -1;
      }

      const result = await this.query<{ expr0: number }>(
        `SELECT COUNT() FROM ${objectName}`
      );
      return result.length > 0 ? result[0].expr0 : 0;
    } catch {
      // Object might not be queryable
      return -1;
    }
  }

  /**
   * Check if connected to an org
   */
  isConnected(): boolean {
    return this.orgInfo !== null;
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
