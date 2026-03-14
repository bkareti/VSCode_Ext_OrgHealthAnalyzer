/**
 * Apex Code Analyzer - Analyzes Apex classes and triggers for code quality issues
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Issue, ApexClass, ApexTrigger } from '../types';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logDebug } from '../utils/logger';
import { AnalysisError, getErrorMessage } from '../utils/errors';

// ============================================================================
// Types
// ============================================================================

interface ApexFileData {
  content: string;
  filePath: string;
  fileName: string;
  isClass: boolean;
  isTrigger: boolean;
}

interface ApexAnalysisResult {
  issues: Issue[];
  filesAnalyzed: number;
  classesAnalyzed: number;
  triggersAnalyzed: number;
}

// ============================================================================
// Apex Analyzer Class
// ============================================================================

export class ApexAnalyzer {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Analyze all Apex files in the workspace
   */
  async analyzeWorkspace(): Promise<ApexAnalysisResult> {
    logSection('Apex Code Analysis');
    
    const result: ApexAnalysisResult = {
      issues: [],
      filesAnalyzed: 0,
      classesAnalyzed: 0,
      triggersAnalyzed: 0,
    };

    try {
      // Find all Apex files
      const apexFiles = await this.findApexFiles();
      logInfo(`Found ${apexFiles.length} Apex files`);

      // Analyze each file
      for (const file of apexFiles) {
        const fileIssues = await this.analyzeFile(file);
        result.issues.push(...fileIssues);
        result.filesAnalyzed++;
        
        if (file.fsPath.endsWith('.cls')) {
          result.classesAnalyzed++;
        } else if (file.fsPath.endsWith('.trigger')) {
          result.triggersAnalyzed++;
        }
      }

      logInfo(`Analyzed ${result.filesAnalyzed} files, found ${result.issues.length} issues`);
    } catch (error) {
      throw new AnalysisError(
        `Failed to analyze Apex files: ${getErrorMessage(error)}`,
        'ApexAnalyzer',
        error as Error
      );
    }

    return result;
  }

  /**
   * Analyze a single Apex file
   */
  async analyzeFile(fileUri: vscode.Uri): Promise<Issue[]> {
    try {
      const content = await this.readFile(fileUri);
      const fileName = path.basename(fileUri.fsPath);
      const isClass = fileName.endsWith('.cls');
      const isTrigger = fileName.endsWith('.trigger');

      const fileData: ApexFileData = {
        content,
        filePath: fileUri.fsPath,
        fileName,
        isClass,
        isTrigger,
      };

      logDebug(`Analyzing ${fileName}`);

      // Run code quality rules
      const ruleIds = [
        'soql-in-loop',
        'dml-in-loop',
        'hardcoded-id',
        'trigger-size',
        'trigger-logic',
        'missing-bulkification',
        'class-size',
      ];

      return ruleEngine.run(ruleIds, fileData, { filePath: fileUri.fsPath });
    } catch (error) {
      logDebug(`Error analyzing file ${fileUri.fsPath}: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Analyze Apex from org metadata
   */
  async analyzeFromOrg(classes: ApexClass[], triggers: ApexTrigger[]): Promise<ApexAnalysisResult> {
    logSection('Apex Code Analysis (Org Metadata)');
    
    const result: ApexAnalysisResult = {
      issues: [],
      filesAnalyzed: 0,
      classesAnalyzed: classes.length,
      triggersAnalyzed: triggers.length,
    };

    // Analyze classes
    for (const cls of classes) {
      if (cls.Body) {
        const fileData: ApexFileData = {
          content: cls.Body,
          filePath: `org://${cls.Name}.cls`,
          fileName: `${cls.Name}.cls`,
          isClass: true,
          isTrigger: false,
        };

        const issues = ruleEngine.run(
          ['soql-in-loop', 'dml-in-loop', 'hardcoded-id', 'class-size'],
          fileData,
          { filePath: fileData.filePath }
        );
        result.issues.push(...issues);
        result.filesAnalyzed++;
      }
    }

    // Analyze triggers
    for (const trigger of triggers) {
      if (trigger.Body) {
        const fileData: ApexFileData = {
          content: trigger.Body,
          filePath: `org://${trigger.Name}.trigger`,
          fileName: `${trigger.Name}.trigger`,
          isClass: false,
          isTrigger: true,
        };

        const issues = ruleEngine.run(
          ['soql-in-loop', 'dml-in-loop', 'hardcoded-id', 'trigger-size', 'trigger-logic', 'missing-bulkification'],
          fileData,
          { filePath: fileData.filePath, objectName: trigger.TableEnumOrId }
        );
        result.issues.push(...issues);
        result.filesAnalyzed++;
      }
    }

    logInfo(`Analyzed ${result.filesAnalyzed} org files, found ${result.issues.length} issues`);
    return result;
  }

  /**
   * Find all Apex files in the workspace
   */
  private async findApexFiles(): Promise<vscode.Uri[]> {
    // Search in common SFDX project locations
    const patterns = [
      '**/force-app/**/*.cls',
      '**/force-app/**/*.trigger',
      '**/src/**/*.cls',
      '**/src/**/*.trigger',
      '**/*.cls',
      '**/*.trigger',
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
   * Read file content
   */
  private async readFile(uri: vscode.Uri): Promise<string> {
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('utf8');
  }

  /**
   * Extract object names from triggers
   */
  extractTriggerObjects(content: string): string[] {
    const pattern = /trigger\s+\w+\s+on\s+(\w+)/gi;
    const objects: string[] = [];
    let match;
    
    while ((match = pattern.exec(content)) !== null) {
      objects.push(match[1]);
    }
    
    return objects;
  }

  /**
   * Extract SOQL queries from Apex code
   */
  extractSoqlQueries(content: string): Array<{ query: string; line: number; column: number }> {
    const queries: Array<{ query: string; line: number; column: number }> = [];
    const pattern = /\[\s*SELECT\s+[\s\S]*?\s+FROM\s+\w+[\s\S]*?\]/gi;
    const lines = content.split('\n');
    
    let match;
    while ((match = pattern.exec(content)) !== null) {
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
        line: lineNum + 1,
        column: match.index - charCount + 1,
      });
    }
    
    return queries;
  }

  /**
   * Check separation of concerns patterns
   */
  checkSeparationOfConcerns(fileName: string): { 
    isController: boolean; 
    isService: boolean; 
    isDomain: boolean;
    isHandler: boolean;
    isSelector: boolean;
  } {
    const name = fileName.toLowerCase();
    
    return {
      isController: name.includes('controller') || name.endsWith('ctrl.cls'),
      isService: name.includes('service') || name.includes('svc'),
      isDomain: name.includes('domain') || name.includes('do'),
      isHandler: name.includes('handler') || name.includes('triggerhandler'),
      isSelector: name.includes('selector') || name.includes('query'),
    };
  }
}

/**
 * Create an Apex analyzer for the current workspace
 */
export function createApexAnalyzer(): ApexAnalyzer | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }
  
  return new ApexAnalyzer(workspaceFolders[0].uri.fsPath);
}
