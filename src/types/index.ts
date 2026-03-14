/**
 * Core types for the Salesforce Org Health Analyzer
 */

// ============================================================================
// Issue & Severity Types
// ============================================================================

export type Severity = 'error' | 'warning' | 'info';

export type IssueCategory = 
  | 'code-quality'
  | 'automation-design'
  | 'data-model'
  | 'performance';

export interface Issue {
  id: string;
  ruleId: string;
  severity: Severity;
  category: IssueCategory;
  message: string;
  description?: string;
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  object?: string;
  suggestion?: string;
  /** For future AI integration */
  aiExplanation?: string;
  aiSuggestion?: string;
}

// ============================================================================
// Analysis Result Types
// ============================================================================

export interface AnalysisResult {
  timestamp: Date;
  duration: number;
  issues: Issue[];
  summary: AnalysisSummary;
  scores: HealthScores;
  metadata: AnalysisMetadata;
}

export interface AnalysisSummary {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  byCategory: Record<IssueCategory, number>;
  byObject: Record<string, number>;
}

export interface HealthScores {
  codeQuality: number;
  automationDesign: number;
  dataModel: number;
  performance: number;
  overall: number;
}

export interface AnalysisMetadata {
  workspacePath?: string;
  orgId?: string;
  orgAlias?: string;
  apiVersion?: string;
  analyzedFiles: number;
  analyzedObjects: number;
}

// ============================================================================
// Salesforce Metadata Types
// ============================================================================

export interface ApexClass {
  Id: string;
  Name: string;
  Body: string;
  ApiVersion: number;
  Status: string;
  LengthWithoutComments?: number;
  NamespacePrefix?: string;
}

export interface ApexTrigger {
  Id: string;
  Name: string;
  Body: string;
  TableEnumOrId: string;
  ApiVersion: number;
  Status: string;
  UsageBeforeInsert?: boolean;
  UsageAfterInsert?: boolean;
  UsageBeforeUpdate?: boolean;
  UsageAfterUpdate?: boolean;
  UsageBeforeDelete?: boolean;
  UsageAfterDelete?: boolean;
  UsageAfterUndelete?: boolean;
}

export interface FlowDefinition {
  Id: string;
  DeveloperName: string;
  ActiveVersionId?: string;
  Description?: string;
  ProcessType?: string;
  TriggerType?: string;
  TriggerObjectOrEventId?: string;
}

export interface ValidationRule {
  Id: string;
  EntityDefinitionId: string;
  ValidationName: string;
  Active: boolean;
  Description?: string;
  ErrorMessage?: string;
  ErrorDisplayField?: string;
}

export interface CustomField {
  Id: string;
  DeveloperName: string;
  TableEnumOrId: string;
  FullName?: string;
  Description?: string;
  InlineHelpText?: string;
  Metadata?: Record<string, unknown>;
}

export interface EntityDefinition {
  QualifiedApiName: string;
  Label: string;
  RecordCount?: number;
  IsCustomizable?: boolean;
}

// ============================================================================
// Automation Summary Types
// ============================================================================

export interface ObjectAutomationSummary {
  objectName: string;
  triggers: number;
  flows: number;
  processBuilders: number;
  validationRules: number;
  workflowRules: number;
  totalAutomations: number;
  risks: AutomationRisk[];
}

export interface AutomationRisk {
  type: 'recursion' | 'conflict' | 'complexity' | 'deprecated';
  severity: Severity;
  message: string;
  details?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface RuleConfig {
  maxTriggersPerObject: number;
  maxFlowsPerObject: number;
  maxTriggerLines: number;
  maxClassLines: number;
  maxMethodLines: number;
  maxValidationRulesPerObject: number;
  maxProcessBuildersPerObject: number;
  enabled: string[];
}

export interface ScoringWeights {
  codeQuality: number;
  automationDesign: number;
  dataModel: number;
  performance: number;
}

export interface AnalyzerConfig {
  rules: RuleConfig;
  severity: {
    threshold: Severity;
  };
  scoring: {
    weights: ScoringWeights;
  };
  analysis: {
    includeOrgMetadata: boolean;
    largeDataVolumeThreshold: number;
  };
}

// ============================================================================
// Salesforce Connection Types
// ============================================================================

export interface OrgInfo {
  id: string;
  accessToken: string;
  instanceUrl: string;
  username: string;
  alias?: string;
  apiVersion: string;
}

export interface SalesforceQueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

// ============================================================================
// Tree View Types
// ============================================================================

export interface ResultTreeItem {
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconPath?: string;
  contextValue?: string;
  children?: ResultTreeItem[];
  issue?: Issue;
}

// ============================================================================
// Dashboard Message Types
// ============================================================================

export type DashboardMessageType = 
  | 'runAnalysis'
  | 'openFile'
  | 'exportReport'
  | 'filterByCategory'
  | 'filterBySeverity'
  | 'refresh';

export interface DashboardMessage {
  command: DashboardMessageType;
  data?: unknown;
}

export interface DashboardState {
  results: AnalysisResult | null;
  filters: {
    category: IssueCategory | 'all';
    severity: Severity | 'all';
  };
  isLoading: boolean;
}

// ============================================================================
// AI Extension Types (for future integration)
// ============================================================================

export interface AIProvider {
  explainIssue(issue: Issue): Promise<string>;
  suggestFix(issue: Issue, codeContext: string): Promise<string>;
  predictGovernorRisk(code: string): Promise<GovernorRiskPrediction>;
}

export interface GovernorRiskPrediction {
  soqlQueries: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
  dmlStatements: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
  cpuTime: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
  heapSize: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
}
