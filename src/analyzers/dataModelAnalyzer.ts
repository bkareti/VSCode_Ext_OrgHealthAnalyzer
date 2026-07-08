/**
 * Data Model Health Analyzer - Analyzes custom fields and data model health
 */

import * as vscode from 'vscode';
import { Issue, CustomField, FieldDefinitionInfo, MetadataDependency } from '../types';
import { SalesforceService, getSalesforceService } from '../services/salesforceService';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logWarning, logDebug } from '../utils/logger';
import { AnalysisError, getErrorMessage } from '../utils/errors';

// Governor limit: maximum custom fields per SObject
const CUSTOM_FIELD_LIMIT = 800;

// ============================================================================
// Types
// ============================================================================

interface FieldUsageData {
  fieldName: string;
  objectName: string;
  isReferenced: boolean;
  referencedIn: string[];
  lastUsed?: Date;
}

interface DataModelAnalysisResult {
  issues: Issue[];
  fieldsAnalyzed: number;
  unusedFields: FieldUsageData[];
  objectsAnalyzed: number;
  /** Per-object field statistics */
  objectFieldStats: Array<{
    objectName: string;
    objectLabel: string;
    totalFields: number;
    standardFields: number;
    customFields: number;
    unusedFields: number;
    fieldsWithoutDescription: number;
    fieldTypes: Record<string, number>;
    relationshipCount: number;
    lookupFields: number;
    masterDetailFields: number;
    fieldLimitPct: number;
    /** Validation rules on this object (from EntityDefinition aggregate) */
    validationRules: number;
    /** Apex triggers on this object (from EntityDefinition aggregate) */
    triggers: number;
    /** Approximate record count (fetched after main field stats) */
    recordCount?: number;
    recordTypeCount?: number;
    pageLayoutCount?: number;
    recordPageCount?: number;
  }>;
  /** Summary counts of special object types (external, big, CMT, custom settings, events) */
  dataModelSummary?: {
    customObjectCount?: number;
    standardObjectCount?: number;
    externalObjectCount?: number;
    bigObjectCount?: number;
    customMetadataTypeCount?: number;
    customSettingCount?: number;
    platformEventCount?: number;
  };
  dataModelRecordTypeDetails?: Array<{
    objectName: string;
    objectLabel?: string;
    recordTypes: Array<{ id: string; name: string; isActive: boolean }>;
  }>;
  dataModelPageLayoutDetails?: Array<{
    objectName: string;
    pageLayouts: Array<{ id: string; name: string }>;
  }>;
  dataModelValidationRuleDetails?: Array<{
    objectName: string;
    validationRules: Array<{ id: string; name: string; active: boolean; errorMessage: string; description?: string }>;
  }>;
  dataModelRecordPageDetails?: Array<{
    objectName: string;
    objectLabel?: string;
    recordPages: Array<{ id: string; name: string; pageType: string }>;
  }>;
}

// ============================================================================
// Data Model Analyzer Class
// ============================================================================

export class DataModelAnalyzer {
  private workspaceRoot: string;
  private salesforceService: SalesforceService;
  private fieldReferences: Map<string, string[]> = new Map();

  constructor(workspaceRoot: string, salesforceService?: SalesforceService) {
    this.workspaceRoot = workspaceRoot;
    this.salesforceService = salesforceService || getSalesforceService();
  }

  /**
   * Analyze data model health using object-first aggregate queries.
   * Follows the OrgCheck pattern: EntityDefinition → parallel COUNT aggregates.
   * This ensures ALL customizable objects (standard + custom) are discovered,
   * not just objects that happen to have custom fields.
   */
  async analyze(): Promise<DataModelAnalysisResult> {
    logSection('Data Model Health Analysis');

    const result: DataModelAnalysisResult = {
      issues: [],
      fieldsAnalyzed: 0,
      unusedFields: [],
      objectsAnalyzed: 0,
      objectFieldStats: [],
    };

    try {
      // Step 1: scan workspace for custom field references (Object.Field__c)
      await this.scanWorkspaceForFieldReferences();

      // Step 2: object-first aggregate fetch + type counts + metadata detail fetches in parallel
      const [objectCounts, typeCounts, rawRecordTypes, rawPageLayouts, rawFlexiPages, rawValidationRules] = await Promise.all([
        this.salesforceService.getObjectDataModelCounts(),
        this.salesforceService.getDataModelTypeCounts().catch(() => null),
        this.salesforceService.getRecordTypes().catch(() => []),
        this.salesforceService.getPageLayouts().catch(() => []),
        this.salesforceService.getFlexiPages().catch(() => []),
        this.salesforceService.getValidationRules().catch(() => []),
      ]);
      logInfo(`Found ${objectCounts.length} customizable objects via EntityDefinition`);

      result.objectsAnalyzed = objectCounts.length;
      result.dataModelSummary = {
        customObjectCount: objectCounts.filter(o => o.objectName.endsWith('__c')).length,
        standardObjectCount: objectCounts.filter(o =>
          !o.objectName.endsWith('__c') &&
          !o.objectName.endsWith('__e') &&
          !o.objectName.endsWith('__b') &&
          !o.objectName.endsWith('__mdt') &&
          !o.objectName.endsWith('__ka')
        ).length,
        ...(typeCounts ?? {}),
      };

      // Step 2b: build DurableId → objectName map from objectCounts (used for FlexiPage resolution)
      const durableIdToObjName = new Map<string, string>();
      for (const obj of objectCounts) {
        durableIdToObjName.set(obj.durableId, obj.objectName);
        // Tooling API EntityDefinitionId fields sometimes store the 15-char prefix
        if (obj.durableId.length > 15) { durableIdToObjName.set(obj.durableId.slice(0, 15), obj.objectName); }
      }

      // Step 2c: group metadata detail fetches by object for per-object counts and detail views
      // Record Types: keyed by SobjectType
      const recordTypesByObj = new Map<string, Array<{ id: string; name: string; isActive: boolean }>>();
      for (const rt of rawRecordTypes) {
        const key = rt.SobjectType;
        if (!recordTypesByObj.has(key)) { recordTypesByObj.set(key, []); }
        recordTypesByObj.get(key)!.push({ id: rt.Id, name: rt.Name, isActive: rt.IsActive });
      }

      // Page Layouts: keyed by TableEnumOrId (object API name or KeyPrefix)
      const pageLayoutsByObj = new Map<string, Array<{ id: string; name: string }>>();
      for (const pl of rawPageLayouts) {
        const key = pl.TableEnumOrId;
        if (!pageLayoutsByObj.has(key)) { pageLayoutsByObj.set(key, []); }
        pageLayoutsByObj.get(key)!.push({ id: pl.Id, name: pl.Name });
      }

      // Validation Rules: keyed by EntityDefinition.QualifiedApiName (available via Tooling API join)
      const validationRulesByObj = new Map<string, Array<{ id: string; name: string; active: boolean; errorMessage: string; description?: string }>>();
      for (const vr of rawValidationRules) {
        const objName = vr.EntityDefinition?.QualifiedApiName ?? vr.EntityDefinitionId;
        if (!validationRulesByObj.has(objName)) { validationRulesByObj.set(objName, []); }
        validationRulesByObj.get(objName)!.push({
          id: vr.Id,
          name: vr.ValidationName,
          active: vr.Active,
          errorMessage: vr.ErrorMessage ?? '',
          description: vr.Description,
        });
      }

      // Lightning Record Pages: filter to RecordPage type, key by resolved object name
      const recordPagesByObj = new Map<string, Array<{ id: string; name: string; pageType: string }>>();
      for (const fp of rawFlexiPages) {
        if (fp.PageType && fp.PageType !== 'RecordPage') { continue; }
        if (!fp.EntityDefinitionId) { continue; }
        const objName = durableIdToObjName.get(fp.EntityDefinitionId) ?? durableIdToObjName.get(fp.EntityDefinitionId.slice(0, 15)) ?? '';
        if (!objName) { continue; }
        if (!recordPagesByObj.has(objName)) { recordPagesByObj.set(objName, []); }
        recordPagesByObj.get(objName)!.push({ id: fp.Id, name: fp.MasterLabel, pageType: fp.PageType ?? 'RecordPage' });
      }

      logInfo(`Metadata groups: ${recordTypesByObj.size} objects with record types, ${pageLayoutsByObj.size} with layouts, ${validationRulesByObj.size} with validation rules, ${recordPagesByObj.size} with record pages`);

      // Step 2c: accurate unused-field detection via the Dependency API
      // (MetadataComponentDependency). Falls back to workspace-reference
      // estimation per object when the Dependency API is unavailable/empty.
      const unusedInfo = await this.computeUnusedFieldsFromDependencies();

      for (const obj of objectCounts) {
        result.fieldsAnalyzed += obj.customFields;

        // Step 3: unused custom fields. Prefer accurate Dependency-API data;
        // otherwise estimate from workspace references (legacy heuristic).
        let unusedCount: number;
        if (unusedInfo.available) {
          unusedCount = unusedInfo.byObject.get(obj.objectName)?.count ?? 0;
        } else {
          const objPrefix = obj.objectName.toLowerCase() + '.';
          const referencedForObj = Array.from(this.fieldReferences.keys()).filter(
            k => k.startsWith(objPrefix) && k.endsWith('__c')
          ).length;
          unusedCount = Math.max(0, obj.customFields - referencedForObj);
        }

        // Step 4: build objectFieldStats entry
        result.objectFieldStats.push({
          objectName: obj.objectName,
          objectLabel: obj.objectLabel,
          totalFields: obj.totalFields,
          standardFields: obj.standardFields,
          customFields: obj.customFields,
          unusedFields: unusedCount,
          fieldsWithoutDescription: 0, // not available from aggregate queries
          fieldTypes: {
            ...(obj.formulaFields   > 0 ? { Formula: obj.formulaFields }       : {}),
            ...(obj.encryptedFields > 0 ? { EncryptedText: obj.encryptedFields } : {}),
          },
          relationshipCount: obj.lookupFields + obj.masterDetailFields,
          lookupFields: obj.lookupFields,
          masterDetailFields: obj.masterDetailFields,
          fieldLimitPct: obj.fieldLimitPct,
          validationRules: obj.validationRules,
          triggers: obj.triggers,
          recordTypeCount: recordTypesByObj.get(obj.objectName)?.length ?? 0,
          pageLayoutCount: pageLayoutsByObj.get(obj.objectName)?.length ?? 0,
          recordPageCount: recordPagesByObj.get(obj.objectName)?.length ?? 0,
        });

        // Step 5: emit data-model issues
        // Isolated custom objects (no relationships)
        if (obj.lookupFields + obj.masterDetailFields === 0 && obj.objectName.endsWith('__c')) {
          result.issues.push({
            id: `dm-isolated-${obj.objectName}`,
            ruleId: 'isolated-custom-object',
            severity: 'info',
            category: 'data-model',
            message: `${obj.objectName} has no lookup or master-detail relationships`,
            description: 'Custom objects without relationships may indicate orphaned data or an incomplete data model.',
            suggestion: 'Verify whether this object should be related to other entities via Lookup or Master-Detail.',
            object: obj.objectName,
          });
        }

        // Over-coupled objects (>15 relationships)
        if (obj.lookupFields + obj.masterDetailFields > 15) {
          result.issues.push({
            id: `dm-overcoupled-${obj.objectName}`,
            ruleId: 'over-coupled-object',
            severity: 'warning',
            category: 'data-model',
            message: `${obj.objectName} has ${obj.lookupFields + obj.masterDetailFields} relationships — potential coupling risk`,
            description: 'Objects with many relationships increase SOQL complexity and trigger/flow execution scope.',
            suggestion: 'Consider junction objects or polymorphic lookups to reduce direct coupling.',
            object: obj.objectName,
          });
        }

        // Field sprawl — approaching governor limit
        if (obj.customFields > 400) {
          const severity = obj.customFields > 600 ? 'error' : 'warning';
          result.issues.push({
            id: `dm-field-limit-${obj.objectName}`,
            ruleId: 'field-limit-risk',
            severity,
            category: 'data-model',
            message: `${obj.objectName} has ${obj.customFields} custom fields (${obj.fieldLimitPct}% of the 800-field limit)`,
            description: 'Objects approaching the 800-custom-field governor limit risk deployment failures when adding new fields.',
            suggestion: 'Audit unused fields for removal. Move rarely-used fields to a related extension object.',
            object: obj.objectName,
          });
        }
      }

      // Surface accurate unused-field findings (one summary issue per object so
      // the issue list / score is not flooded with one item per field).
      if (unusedInfo.available) {
        result.unusedFields = unusedInfo.total;
        for (const [objectName, info] of unusedInfo.byObject) {
          if (info.count === 0) { continue; }
          const preview = info.names.slice(0, 20).join(', ');
          const more = info.names.length > 20 ? `, …(+${info.names.length - 20} more)` : '';
          result.issues.push({
            id: `dm-unused-fields-${objectName}`,
            ruleId: 'unused-fields',
            severity: 'info',
            category: 'data-model',
            message: `${objectName}: ${info.count} custom field${info.count === 1 ? '' : 's'} appear unused (no metadata dependencies)`,
            description: `These custom fields have no references in Apex, flows, layouts, reports, or other metadata according to the Salesforce Dependency API: ${preview}${more}.`,
            suggestion: 'Confirm the fields are not used by external integrations or hard-coded references, then remove them to reduce data-model bloat.',
            object: objectName,
          });
        }
      }

      // Fetch record counts in parallel batches of 20 (one COUNT(Id) query per object).
      // Done after the main loop so it does not block objectFieldStats construction.
      try {
        const names = result.objectFieldStats.map(o => o.objectName);
        const countMap = await this.salesforceService.getObjectRecordCountsBatch(names);
        for (const stat of result.objectFieldStats) {
          const c = countMap.get(stat.objectName);
          if (c !== undefined && c >= 0) { stat.recordCount = c; }
        }
        logInfo(`Record counts fetched for ${countMap.size} objects`);
      } catch (e) {
        logWarning(`Record count fetch failed, skipping: ${getErrorMessage(e)}`);
      }

      // Filter: keep ALL custom objects; standard objects only if they have
      // custom fields, triggers, or validation rules (flows are merged in the dashboard).
      result.objectFieldStats = result.objectFieldStats.filter(o =>
        o.objectName.endsWith('__c') ||
        o.customFields > 0 ||
        o.triggers > 0 ||
        o.validationRules > 0
      );

      // Sort: custom objects first, then by custom field count descending
      result.objectFieldStats.sort((a, b) => {
        const aCustom = a.objectName.endsWith('__c') ? 1 : 0;
        const bCustom = b.objectName.endsWith('__c') ? 1 : 0;
        if (aCustom !== bCustom) { return bCustom - aCustom; }
        return b.customFields - a.customFields;
      });

      // Populate detail arrays for sub-tab views
      result.dataModelRecordTypeDetails = Array.from(recordTypesByObj.entries()).map(([objectName, recordTypes]) => {
        const stat = result.objectFieldStats.find(s => s.objectName === objectName);
        return { objectName, objectLabel: stat?.objectLabel, recordTypes };
      });

      result.dataModelPageLayoutDetails = Array.from(pageLayoutsByObj.entries()).map(([objectName, pageLayouts]) => ({
        objectName,
        pageLayouts,
      }));

      result.dataModelValidationRuleDetails = Array.from(validationRulesByObj.entries()).map(([objectName, validationRules]) => ({
        objectName,
        validationRules,
      }));

      result.dataModelRecordPageDetails = Array.from(recordPagesByObj.entries()).map(([objectName, recordPages]) => {
        const stat = result.objectFieldStats.find(s => s.objectName === objectName);
        return { objectName, objectLabel: stat?.objectLabel, recordPages };
      });

      logInfo(`Data model: ${result.objectsAnalyzed} objects, ${result.fieldsAnalyzed} custom fields analysed`);
    } catch (error) {
      throw new AnalysisError(
        `Failed to analyze data model: ${getErrorMessage(error)}`,
        'DataModelAnalyzer',
        error as Error
      );
    }

    return result;
  }

  /**
   * Analyze local metadata only (without org connection)
   */
  async analyzeLocal(): Promise<DataModelAnalysisResult> {
    logSection('Data Model Analysis (Local Only)');
    
    const result: DataModelAnalysisResult = {
      issues: [],
      fieldsAnalyzed: 0,
      unusedFields: [],
      objectsAnalyzed: 0,
      objectFieldStats: [],
    };

    try {
      // Scan for field references
      await this.scanWorkspaceForFieldReferences();
      
      // Find custom field metadata files
      const fieldFiles = await vscode.workspace.findFiles(
        '**/objects/**/fields/*.field-meta.xml',
        '**/node_modules/**'
      );

      logInfo(`Found ${fieldFiles.length} field metadata files`);

      for (const file of fieldFiles) {
        const pathParts = file.fsPath.split('/');
        const objectIndex = pathParts.indexOf('objects');
        
        if (objectIndex >= 0 && pathParts.length > objectIndex + 1) {
          const objectName = pathParts[objectIndex + 1];
          const fieldFileName = pathParts[pathParts.length - 1];
          const fieldName = fieldFileName.replace('.field-meta.xml', '');
          
          result.fieldsAnalyzed++;
          
          const fieldKey = `${objectName}.${fieldName}`.toLowerCase();
          const references = this.fieldReferences.get(fieldKey) || [];
          
          if (references.length === 0 && fieldName.endsWith('__c')) {
            result.unusedFields.push({
              fieldName,
              objectName,
              isReferenced: false,
              referencedIn: [],
            });
          }
        }
      }

      // Create issues for unused fields
      for (const field of result.unusedFields) {
        result.issues.push({
          id: `unused-field-${result.issues.length}`,
          ruleId: 'unused-fields',
          severity: 'info',
          category: 'data-model',
          message: `Field ${field.objectName}.${field.fieldName} appears unused`,
          description: 'This field is not referenced in any Apex code in the workspace.',
          object: field.objectName,
          suggestion: 'Verify usage in reports, page layouts, flows, and external systems before removing',
        });
      }

      logInfo(`Found ${result.unusedFields.length} potentially unused fields`);
    } catch (error) {
      logWarning(`Local data model analysis failed: ${getErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Scan workspace for field references
   */
  private async scanWorkspaceForFieldReferences(): Promise<void> {
    logDebug('Scanning workspace for field references...');
    
    this.fieldReferences.clear();
    
    try {
      // Scan Apex files
      const apexFiles = await vscode.workspace.findFiles(
        '{**/force-app/**/*.cls,**/force-app/**/*.trigger,**/src/**/*.cls}',
        '**/node_modules/**'
      );

      for (const file of apexFiles) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(content).toString('utf8').toLowerCase();
        
        // Find field references (simplified pattern)
        // Matches patterns like: account.custom_field__c, obj.field__c
        const fieldPattern = /(\w+)\.(\w+__c)/gi;
        let match;
        
        while ((match = fieldPattern.exec(text)) !== null) {
          const fieldKey = `${match[1]}.${match[2]}`.toLowerCase();
          
          if (!this.fieldReferences.has(fieldKey)) {
            this.fieldReferences.set(fieldKey, []);
          }
          
          const refs = this.fieldReferences.get(fieldKey)!;
          if (!refs.includes(file.fsPath)) {
            refs.push(file.fsPath);
          }
        }
      }

      // Scan Flow files
      const flowFiles = await vscode.workspace.findFiles(
        '**/flows/*.flow-meta.xml',
        '**/node_modules/**'
      );

      for (const file of flowFiles) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(content).toString('utf8').toLowerCase();
        
        // Find field references in flows
        const fieldPattern = /field>(\w+__c)</gi;
        let match;
        
        while ((match = fieldPattern.exec(text)) !== null) {
          // Flow field references don't include object name, so we can't map them precisely
          // This is a limitation of local analysis
        }
      }

      logDebug(`Found references to ${this.fieldReferences.size} unique fields`);
    } catch (error) {
      logWarning(`Failed to scan for field references: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Fetch custom fields from org
   */
  private async fetchCustomFields(): Promise<CustomField[]> {
    try {
      return await this.salesforceService.getCustomFields();
    } catch (error) {
      logWarning(`Failed to fetch custom fields: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Accurate unused custom-field detection using the Salesforce Dependency API
   * (MetadataComponentDependency). A field is considered "used" when something
   * references it (it appears as a RefMetadataComponent of type CustomField),
   * when one of its name variants matches a referenced component, or when it is
   * referenced in the local workspace. Returns available=false when the
   * Dependency API yields no data, so the caller falls back to estimation.
   */
  private async computeUnusedFieldsFromDependencies(): Promise<{
    byObject: Map<string, { count: number; names: string[] }>;
    total: FieldUsageData[];
    available: boolean;
  }> {
    const byObject = new Map<string, { count: number; names: string[] }>();
    const total: FieldUsageData[] = [];

    let fields: CustomField[];
    let deps: MetadataDependency[];
    try {
      [fields, deps] = await Promise.all([
        this.salesforceService.getCustomFields(),
        this.salesforceService.getMetadataComponentDependencies("RefMetadataComponentType = 'CustomField'"),
      ]);
    } catch (error) {
      logWarning(`Dependency-based unused-field detection unavailable: ${getErrorMessage(error)}`);
      return { byObject, total, available: false };
    }

    // No dependency rows → can't reliably tell used from unused (the Dependency
    // API may be disabled); let the caller fall back to estimation.
    if (fields.length === 0 || deps.length === 0) {
      return { byObject, total, available: false };
    }

    const referencedIds = new Set(deps.map(d => d.RefMetadataComponentId));
    const referencedNames = new Set(
      deps.map(d => (d.RefMetadataComponentName || '').toLowerCase()).filter(Boolean)
    );

    for (const field of fields) {
      const objectName = field.EntityDefinition?.QualifiedApiName || field.TableEnumOrId;
      const dev = (field.DeveloperName || '').toLowerCase();
      const full = (field.FullName || '').toLowerCase();
      const nameCandidates = [dev, dev ? `${dev}__c` : '', full].filter(Boolean);

      const idReferenced = referencedIds.has(field.Id);
      const nameReferenced = nameCandidates.some(c => referencedNames.has(c));
      const workspaceKey = `${objectName}.${field.DeveloperName}__c`.toLowerCase();
      const workspaceReferenced = this.fieldReferences.has(workspaceKey);

      if (idReferenced || nameReferenced || workspaceReferenced) {
        continue; // field is used
      }

      const fieldName = field.FullName?.split('.').pop() || `${field.DeveloperName}__c`;
      total.push({ fieldName, objectName, isReferenced: false, referencedIn: [] });
      const entry = byObject.get(objectName) || { count: 0, names: [] };
      entry.count += 1;
      entry.names.push(fieldName);
      byObject.set(objectName, entry);
    }

    logInfo(`Dependency API: ${total.length} unused custom fields across ${byObject.size} objects`);
    return { byObject, total, available: true };
  }

  /**
   * Group fields by object using resolved EntityDefinition QualifiedApiName
   */
  private groupFieldsByObject(fields: CustomField[]): Map<string, CustomField[]> {
    const grouped = new Map<string, CustomField[]>();
    
    for (const field of fields) {
      // Prefer the joined EntityDefinition.QualifiedApiName over the raw TableEnumOrId
      const objectName = (field.EntityDefinition?.QualifiedApiName) || field.TableEnumOrId;
      
      if (!grouped.has(objectName)) {
        grouped.set(objectName, []);
      }
      
      grouped.get(objectName)!.push(field);
    }
    
    return grouped;
  }

  /**
   * Check for duplicate fields (similar names)
   */
  findDuplicateFields(fields: CustomField[]): Array<{ field1: string; field2: string; similarity: number }> {
    const duplicates: Array<{ field1: string; field2: string; similarity: number }> = [];
    
    for (let i = 0; i < fields.length; i++) {
      for (let j = i + 1; j < fields.length; j++) {
        const similarity = this.calculateSimilarity(
          fields[i].DeveloperName,
          fields[j].DeveloperName
        );
        
        if (similarity > 0.8) {
          duplicates.push({
            field1: fields[i].DeveloperName,
            field2: fields[j].DeveloperName,
            similarity,
          });
        }
      }
    }
    
    return duplicates;
  }

  /**
   * Calculate string similarity (Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) {
      return 1.0;
    }
    
    const distance = this.levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    return matrix[str1.length][str2.length];
  }

  /**
   * Format unused field report
   */
  formatUnusedFieldReport(unusedFields: FieldUsageData[]): string {
    if (unusedFields.length === 0) {
      return 'No unused fields detected.';
    }

    const lines = ['Unused Fields:', ''];
    
    // Group by object
    const byObject = new Map<string, FieldUsageData[]>();
    for (const field of unusedFields) {
      if (!byObject.has(field.objectName)) {
        byObject.set(field.objectName, []);
      }
      byObject.get(field.objectName)!.push(field);
    }

    for (const [objectName, fields] of byObject) {
      lines.push(`${objectName}:`);
      for (const field of fields) {
        lines.push(`  - ${field.fieldName}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Create a data model analyzer
 */
export function createDataModelAnalyzer(
  salesforceService?: SalesforceService
): DataModelAnalyzer | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }
  
  return new DataModelAnalyzer(workspaceFolders[0].uri.fsPath, salesforceService);
}
