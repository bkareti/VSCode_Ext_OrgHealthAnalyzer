/**
 * Query Risk Analyzer - Analyzes SOQL queries for performance issues
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Issue, EntityDefinition } from '../types';
import { SalesforceService, getSalesforceService } from '../services/salesforceService';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logDebug, logWarning } from '../utils/logger';
import { AnalysisError, getErrorMessage } from '../utils/errors';
import { getConfig } from '../utils/config';

// ============================================================================
// Types
// ============================================================================

interface QueryData {
  query: string;
  filePath: string;
  line: number;
  column: number;
  objectName?: string;
}

interface QueryAnalysisResult {
  issues: Issue[];
  queriesAnalyzed: number;
  filesAnalyzed: number;
  highRiskQueries: QueryData[];
}

interface ObjectRecordCount {
  objectName: string;
  recordCount: number;
  isLargeDataVolume: boolean;
}

// ============================================================================
// Query Analyzer Class
// ============================================================================

export class QueryAnalyzer {
  private workspaceRoot: string;
  private salesforceService: SalesforceService;
  private objectRecordCounts: Map<string, number> = new Map();
  private largeDataVolumeThreshold: number;

  constructor(workspaceRoot: string, salesforceService?: SalesforceService) {
    this.workspaceRoot = workspaceRoot;
    this.salesforceService = salesforceService || getSalesforceService();
    this.largeDataVolumeThreshold = getConfig().analysis.largeDataVolumeThreshold;
  }

  /**
   * Analyze all SOQL queries in the workspace
   */
  async analyzeWorkspace(): Promise<QueryAnalysisResult> {
    logSection('Query Risk Analysis');
    
    const result: QueryAnalysisResult = {
      issues: [],
      queriesAnalyzed: 0,
      filesAnalyzed: 0,
      highRiskQueries: [],
    };

    try {
      // Find all Apex files
      const apexFiles = await this.findApexFiles();
      logInfo(`Scanning ${apexFiles.length} files for SOQL queries`);

      for (const file of apexFiles) {
        const queries = await this.extractQueriesFromFile(file);
        result.filesAnalyzed++;
        
        for (const query of queries) {
          result.queriesAnalyzed++;
          
          // Run query rules
          const issues = ruleEngine.run(
            ['non-selective-query'],
            query,
            { filePath: query.filePath }
          );
          
          result.issues.push(...issues);

          // Check for high-risk queries
          if (this.isHighRiskQuery(query)) {
            result.highRiskQueries.push(query);
          }
        }
      }

      logInfo(`Analyzed ${result.queriesAnalyzed} queries in ${result.filesAnalyzed} files`);
    } catch (error) {
      throw new AnalysisError(
        `Failed to analyze queries: ${getErrorMessage(error)}`,
        'QueryAnalyzer',
        error as Error
      );
    }

    return result;
  }

  /**
   * Analyze queries with org context (record counts)
   */
  async analyzeWithOrgContext(): Promise<QueryAnalysisResult> {
    logSection('Query Risk Analysis (with Org Context)');
    
    // First, run basic analysis
    const result = await this.analyzeWorkspace();

    try {
      // Get record counts for relevant objects
      const objectNames = this.extractObjectNames(result.highRiskQueries.map(q => q.query));
      
      for (const objectName of objectNames) {
        const count = await this.salesforceService.getRecordCount(objectName);
        if (count >= 0) {
          this.objectRecordCounts.set(objectName, count);
        }
      }

      // Add large data volume warnings
      for (const query of result.highRiskQueries) {
        const objectName = this.extractObjectFromQuery(query.query);
        const recordCount = this.objectRecordCounts.get(objectName);
        
        if (recordCount && recordCount > this.largeDataVolumeThreshold) {
          result.issues.push({
            id: `ldv-${result.issues.length}`,
            ruleId: 'large-data-volume',
            severity: 'warning',
            category: 'performance',
            message: `Query on large data volume object: ${objectName}`,
            description: `${objectName} has approximately ${recordCount.toLocaleString()} records. Ensure query is selective.`,
            file: query.filePath,
            line: query.line,
            column: query.column,
            object: objectName,
            suggestion: 'Add indexed fields to WHERE clause for better performance',
          });
        }
      }
    } catch (error) {
      logWarning(`Could not get org context: ${getErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Extract queries from a file
   */
  private async extractQueriesFromFile(fileUri: vscode.Uri): Promise<QueryData[]> {
    const queries: QueryData[] = [];
    
    try {
      const content = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(content).toString('utf8');
      const lines = text.split('\n');
      
      // Match SOQL queries
      const pattern = /\[\s*SELECT\s+[\s\S]*?\s+FROM\s+(\w+)[\s\S]*?\]/gi;
      let match;
      
      while ((match = pattern.exec(text)) !== null) {
        // Calculate line number
        let charCount = 0;
        let lineNum = 0;
        
        for (let i = 0; i < lines.length; i++) {
          if (charCount + lines[i].length >= match.index) {
            lineNum = i;
            break;
          }
          charCount += lines[i].length + 1;
        }
        
        queries.push({
          query: match[0],
          filePath: fileUri.fsPath,
          line: lineNum + 1,
          column: match.index - charCount + 1,
          objectName: match[1],
        });
      }
    } catch (error) {
      logDebug(`Error reading file ${fileUri.fsPath}: ${getErrorMessage(error)}`);
    }
    
    return queries;
  }

  /**
   * Check if a query is high risk
   */
  private isHighRiskQuery(query: QueryData): boolean {
    const upperQuery = query.query.toUpperCase();
    
    // No WHERE clause and no LIMIT
    if (!upperQuery.includes('WHERE') && !upperQuery.includes('LIMIT')) {
      return true;
    }
    
    // Common non-selective patterns
    const nonSelectivePatterns = [
      /WHERE\s+\w+\s*!=\s*/i,  // Not equals
      /WHERE\s+\w+\s+NOT\s+IN/i,  // NOT IN
      /WHERE\s+\w+\s+LIKE\s+'%/i,  // Leading wildcard
    ];
    
    for (const pattern of nonSelectivePatterns) {
      if (pattern.test(query.query)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract object names from queries
   */
  private extractObjectNames(queries: string[]): string[] {
    const objects = new Set<string>();
    
    for (const query of queries) {
      const match = query.match(/FROM\s+(\w+)/i);
      if (match) {
        objects.add(match[1]);
      }
    }
    
    return Array.from(objects);
  }

  /**
   * Extract object name from a query
   */
  private extractObjectFromQuery(query: string): string {
    const match = query.match(/FROM\s+(\w+)/i);
    return match ? match[1] : 'Unknown';
  }

  /**
   * Find all Apex files
   */
  private async findApexFiles(): Promise<vscode.Uri[]> {
    const patterns = [
      '**/force-app/**/*.cls',
      '**/force-app/**/*.trigger',
      '**/src/**/*.cls',
      '**/src/**/*.trigger',
    ];

    const files: vscode.Uri[] = [];
    
    for (const pattern of patterns) {
      const found = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
      files.push(...found);
    }

    // Deduplicate
    const uniquePaths = new Set<string>();
    return files.filter(f => {
      if (uniquePaths.has(f.fsPath)) {
        return false;
      }
      uniquePaths.add(f.fsPath);
      return true;
    });
  }

  /**
   * Get indexed fields for an object
   */
  async getIndexedFields(objectName: string): Promise<string[]> {
    // Standard indexed fields
    const standardIndexed = ['Id', 'Name', 'OwnerId', 'CreatedDate', 'LastModifiedDate'];
    
    // Note: Would need to query EntityParticle for IsIndexed field for complete list
    return standardIndexed;
  }

  /**
   * Check query selectivity
   */
  checkSelectivity(query: string, indexedFields: string[]): {
    isSelective: boolean;
    reason?: string;
  } {
    const upperQuery = query.toUpperCase();
    
    // Check if filtering on indexed fields
    for (const field of indexedFields) {
      const pattern = new RegExp(`WHERE[^)]*\\b${field}\\s*=`, 'i');
      if (pattern.test(query)) {
        return { isSelective: true };
      }
    }
    
    // Check for potentially selective patterns
    if (/WHERE[^)]*\bId\s*(=|IN)/i.test(query)) {
      return { isSelective: true };
    }
    
    // Check for common non-selective patterns
    if (!upperQuery.includes('WHERE')) {
      return { 
        isSelective: false, 
        reason: 'No WHERE clause' 
      };
    }
    
    return { 
      isSelective: false, 
      reason: 'No indexed field in filter' 
    };
  }

  /**
   * Format query for display
   */
  formatQuery(query: string): string {
    // Clean up query for display
    return query
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100) + (query.length > 100 ? '...' : '');
  }
}

/**
 * Create a query analyzer
 */
export function createQueryAnalyzer(
  salesforceService?: SalesforceService
): QueryAnalyzer | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }
  
  return new QueryAnalyzer(workspaceFolders[0].uri.fsPath, salesforceService);
}
