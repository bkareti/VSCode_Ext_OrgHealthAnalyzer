/**
 * Data Model Health Analyzer - Analyzes custom fields and data model health
 */

import * as vscode from 'vscode';
import { Issue, CustomField } from '../types';
import { SalesforceService, getSalesforceService } from '../services/salesforceService';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logWarning, logDebug } from '../utils/logger';
import { AnalysisError, getErrorMessage } from '../utils/errors';

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
   * Analyze data model health
   */
  async analyze(): Promise<DataModelAnalysisResult> {
    logSection('Data Model Health Analysis');
    
    const result: DataModelAnalysisResult = {
      issues: [],
      fieldsAnalyzed: 0,
      unusedFields: [],
      objectsAnalyzed: 0,
    };

    try {
      // First, scan workspace for field references
      await this.scanWorkspaceForFieldReferences();
      
      // Get custom fields from org
      const customFields = await this.fetchCustomFields();
      logInfo(`Found ${customFields.length} custom fields`);

      // Group fields by object
      const fieldsByObject = this.groupFieldsByObject(customFields);
      result.objectsAnalyzed = fieldsByObject.size;

      // Analyze each field
      for (const [objectName, fields] of fieldsByObject) {
        for (const field of fields) {
          result.fieldsAnalyzed++;
          
          const fieldKey = `${objectName}.${field.DeveloperName}__c`;
          const references = this.fieldReferences.get(fieldKey.toLowerCase()) || [];
          
          const fieldData: FieldUsageData = {
            fieldName: `${field.DeveloperName}__c`,
            objectName,
            isReferenced: references.length > 0,
            referencedIn: references,
          };

          if (!fieldData.isReferenced) {
            result.unusedFields.push(fieldData);
            
            // Run unused field rule
            const issues = ruleEngine.run(
              ['unused-fields'],
              fieldData,
              { objectName }
            );
            result.issues.push(...issues);
          }
        }
      }

      logInfo(`Analyzed ${result.fieldsAnalyzed} fields, found ${result.unusedFields.length} potentially unused`);
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
   * Group fields by object
   */
  private groupFieldsByObject(fields: CustomField[]): Map<string, CustomField[]> {
    const grouped = new Map<string, CustomField[]>();
    
    for (const field of fields) {
      const objectName = field.TableEnumOrId;
      
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
