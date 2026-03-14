/**
 * Automation Complexity Analyzer - Analyzes automation on Salesforce objects
 */

import * as vscode from 'vscode';
import { 
  Issue, 
  ObjectAutomationSummary, 
  AutomationRisk,
  FlowDefinition,
  ValidationRule,
  ApexTrigger,
} from '../types';
import { SalesforceService, getSalesforceService } from '../services/salesforceService';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logWarning } from '../utils/logger';
import { AnalysisError, getErrorMessage } from '../utils/errors';
import { getRuleConfig } from '../utils/config';

// ============================================================================
// Types
// ============================================================================

interface AutomationAnalysisResult {
  issues: Issue[];
  summaries: ObjectAutomationSummary[];
  totalTriggers: number;
  totalFlows: number;
  totalProcessBuilders: number;
  totalValidationRules: number;
}

interface FlowMetadata extends FlowDefinition {
  TriggerObjectOrEvent?: string;
}

// ============================================================================
// Automation Analyzer Class
// ============================================================================

export class AutomationAnalyzer {
  private salesforceService: SalesforceService;

  constructor(salesforceService?: SalesforceService) {
    this.salesforceService = salesforceService || getSalesforceService();
  }

  /**
   * Analyze all automation from the connected org
   */
  async analyzeOrg(): Promise<AutomationAnalysisResult> {
    logSection('Automation Complexity Analysis');
    
    const result: AutomationAnalysisResult = {
      issues: [],
      summaries: [],
      totalTriggers: 0,
      totalFlows: 0,
      totalProcessBuilders: 0,
      totalValidationRules: 0,
    };

    try {
      // Fetch all automation metadata
      const [triggers, flows, validationRules] = await Promise.all([
        this.fetchTriggers(),
        this.fetchFlows(),
        this.fetchValidationRules(),
      ]);

      result.totalTriggers = triggers.length;
      result.totalFlows = flows.filter(f => f.ProcessType === 'AutoLaunchedFlow' || f.ProcessType === 'RecordTriggeredFlow').length;
      result.totalProcessBuilders = flows.filter(f => f.ProcessType === 'Workflow').length;
      result.totalValidationRules = validationRules.length;

      logInfo(`Found ${result.totalTriggers} triggers, ${result.totalFlows} flows, ${result.totalProcessBuilders} process builders, ${result.totalValidationRules} validation rules`);

      // Group automation by object
      const objectSummaries = this.groupByObject(triggers, flows, validationRules);
      result.summaries = objectSummaries;

      // Run automation complexity rules for each object
      for (const summary of objectSummaries) {
        const issues = ruleEngine.run(
          ['automation-complexity'],
          summary,
          { objectName: summary.objectName }
        );
        result.issues.push(...issues);
      }

      logInfo(`Found ${result.issues.length} automation issues`);
    } catch (error) {
      throw new AnalysisError(
        `Failed to analyze automation: ${getErrorMessage(error)}`,
        'AutomationAnalyzer',
        error as Error
      );
    }

    return result;
  }

  /**
   * Analyze automation from local workspace (metadata files)
   */
  async analyzeWorkspace(): Promise<AutomationAnalysisResult> {
    logSection('Automation Analysis (Local Metadata)');
    
    const result: AutomationAnalysisResult = {
      issues: [],
      summaries: [],
      totalTriggers: 0,
      totalFlows: 0,
      totalProcessBuilders: 0,
      totalValidationRules: 0,
    };

    try {
      // Find trigger files in workspace
      const triggerFiles = await vscode.workspace.findFiles(
        '**/triggers/*.trigger',
        '**/node_modules/**'
      );
      
      // Find flow files
      const flowFiles = await vscode.workspace.findFiles(
        '**/flows/*.flow-meta.xml',
        '**/node_modules/**'
      );

      result.totalTriggers = triggerFiles.length;
      result.totalFlows = flowFiles.length;

      // Parse trigger files to extract object names
      const triggersByObject = new Map<string, number>();
      
      for (const file of triggerFiles) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = Buffer.from(content).toString('utf8');
        
        // Extract object name from trigger definition
        const match = text.match(/trigger\s+\w+\s+on\s+(\w+)/i);
        if (match) {
          const objectName = match[1];
          triggersByObject.set(objectName, (triggersByObject.get(objectName) || 0) + 1);
        }
      }

      // Create summaries for objects with triggers
      for (const [objectName, count] of triggersByObject) {
        const summary: ObjectAutomationSummary = {
          objectName,
          triggers: count,
          flows: 0, // Would need to parse flow metadata to get this
          processBuilders: 0,
          validationRules: 0,
          workflowRules: 0,
          totalAutomations: count,
          risks: [],
        };

        result.summaries.push(summary);

        // Run rules
        const issues = ruleEngine.run(
          ['automation-complexity'],
          summary,
          { objectName }
        );
        result.issues.push(...issues);
      }

      logInfo(`Found ${result.totalTriggers} triggers locally`);
    } catch (error) {
      logWarning(`Workspace automation analysis failed: ${getErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Fetch triggers from org
   */
  private async fetchTriggers(): Promise<ApexTrigger[]> {
    try {
      return await this.salesforceService.getApexTriggers();
    } catch (error) {
      logWarning(`Failed to fetch triggers: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Fetch flows from org
   */
  private async fetchFlows(): Promise<FlowMetadata[]> {
    try {
      const flows = await this.salesforceService.getFlows();
      return flows as FlowMetadata[];
    } catch (error) {
      logWarning(`Failed to fetch flows: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Fetch validation rules from org
   */
  private async fetchValidationRules(): Promise<ValidationRule[]> {
    try {
      return await this.salesforceService.getValidationRules();
    } catch (error) {
      logWarning(`Failed to fetch validation rules: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * Group automation by object
   */
  private groupByObject(
    triggers: ApexTrigger[],
    flows: FlowMetadata[],
    validationRules: ValidationRule[]
  ): ObjectAutomationSummary[] {
    const objectMap = new Map<string, ObjectAutomationSummary>();

    // Process triggers
    for (const trigger of triggers) {
      const objectName = trigger.TableEnumOrId;
      const summary = this.getOrCreateSummary(objectMap, objectName);
      summary.triggers++;
      summary.totalAutomations++;
    }

    // Process flows
    for (const flow of flows) {
      // Try to determine the object from flow metadata
      const objectName = flow.TriggerObjectOrEvent || flow.TriggerObjectOrEventId || 'Unknown';
      
      if (objectName !== 'Unknown') {
        const summary = this.getOrCreateSummary(objectMap, objectName);
        
        if (flow.ProcessType === 'Workflow') {
          summary.processBuilders++;
        } else {
          summary.flows++;
        }
        summary.totalAutomations++;
      }
    }

    // Process validation rules
    for (const rule of validationRules) {
      const objectName = rule.EntityDefinitionId;
      const summary = this.getOrCreateSummary(objectMap, objectName);
      summary.validationRules++;
    }

    // Calculate risks for each summary
    const config = getRuleConfig();
    for (const summary of objectMap.values()) {
      summary.risks = this.calculateRisks(summary, config);
    }

    return Array.from(objectMap.values());
  }

  /**
   * Get or create summary for an object
   */
  private getOrCreateSummary(
    map: Map<string, ObjectAutomationSummary>,
    objectName: string
  ): ObjectAutomationSummary {
    if (!map.has(objectName)) {
      map.set(objectName, {
        objectName,
        triggers: 0,
        flows: 0,
        processBuilders: 0,
        validationRules: 0,
        workflowRules: 0,
        totalAutomations: 0,
        risks: [],
      });
    }
    return map.get(objectName)!;
  }

  /**
   * Calculate automation risks for an object
   */
  private calculateRisks(
    summary: ObjectAutomationSummary,
    config: ReturnType<typeof getRuleConfig>
  ): AutomationRisk[] {
    const risks: AutomationRisk[] = [];

    // Multiple triggers risk
    if (summary.triggers > config.maxTriggersPerObject) {
      risks.push({
        type: 'conflict',
        severity: 'error',
        message: `Multiple triggers (${summary.triggers}) can cause execution order issues`,
        details: 'Salesforce does not guarantee trigger execution order',
      });
    }

    // Too many flows risk
    if (summary.flows > config.maxFlowsPerObject) {
      risks.push({
        type: 'complexity',
        severity: 'warning',
        message: `High number of flows (${summary.flows}) increases complexity`,
        details: 'Consider consolidating flows to reduce maintenance overhead',
      });
    }

    // Process Builder deprecation risk
    if (summary.processBuilders > 0) {
      risks.push({
        type: 'deprecated',
        severity: 'warning',
        message: `Process Builders (${summary.processBuilders}) are deprecated`,
        details: 'Migrate to Flows for better performance and support',
      });
    }

    // Recursion risk (multiple automations updating same object)
    if (summary.totalAutomations > 3) {
      risks.push({
        type: 'recursion',
        severity: 'warning',
        message: `High automation count (${summary.totalAutomations}) increases recursion risk`,
        details: 'Ensure proper recursion prevention is implemented',
      });
    }

    return risks;
  }

  /**
   * Format automation summary for display
   */
  formatSummary(summary: ObjectAutomationSummary): string {
    const lines = [
      `Object: ${summary.objectName}`,
      '',
      'Automation Summary:',
      `  Triggers: ${summary.triggers}`,
      `  Flows: ${summary.flows}`,
      `  Process Builders: ${summary.processBuilders}`,
      `  Validation Rules: ${summary.validationRules}`,
      `  Total: ${summary.totalAutomations}`,
    ];

    if (summary.risks.length > 0) {
      lines.push('', 'Risks:');
      for (const risk of summary.risks) {
        lines.push(`  ⚠ ${risk.message}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Create an automation analyzer
 */
export function createAutomationAnalyzer(
  salesforceService?: SalesforceService
): AutomationAnalyzer {
  return new AutomationAnalyzer(salesforceService);
}
