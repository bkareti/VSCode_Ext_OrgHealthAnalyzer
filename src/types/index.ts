/**
 * Core types for the Salesforce Org Health Analyzer
 */

import type { FutureReadinessReport } from './futureReadiness';

// Re-export Future Readiness types so consumers (incl. the webview) can import from '@/types'.
export * from './futureReadiness';

// ============================================================================
// Issue & Severity Types
// ============================================================================

export type Severity = 'error' | 'warning' | 'info';

export type IssueCategory = 
  | 'code-quality'
  | 'automation-design'
  | 'data-model'
  | 'performance'
  | 'security'
  | 'testing'
  | 'integration'
  | 'lwc-quality'
  | 'governor-limits'
  | 'technical-debt'
  | 'dependencies'
  | 'user-governance'
  | 'profile-security'
  | 'stale-metadata'
  | 'org-inventory'
  | 'aura-quality'
  | 'cta-review';

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
  /** Dependency graph between Apex classes, triggers, flows */
  dependencyGraph?: DependencyGraph;
  /** Technical debt summary with sprint plan */
  debtSummary?: DebtSummary;
  /** Scale Center / EventLogFile performance metrics */
  scaleCenterMetrics?: ScaleCenterMetrics;
  /** Historical trend data points for score tracking */
  trends?: TrendPoint[];
  /** Governor limit risk predictions per class */
  governorRisks?: GovernorRiskDetail[];
  /** LWC component issues summary */
  lwcSummary?: LwcSummary;
  /** User governance summary */
  userSummary?: UserGovernanceSummary;
  /** Profile/permission-set security summary */
  profileSummary?: ProfileSecuritySummary;
  /** Stale metadata inventory */
  staleMetadata?: StaleMetadataSummary;
  /** Org-wide inventory (packages, VF pages, labels, etc.) */
  orgInventory?: OrgInventorySummary;
  /** Per-object data model field statistics */
  dataModelStats?: Array<{
    objectName: string;
    /** Human-readable label (e.g. "Account" for Account) */
    objectLabel?: string;
    totalFields: number;
    /** Standard (non-custom) field count */
    standardFields?: number;
    /** Custom field count (___c fields) */
    customFields?: number;
    unusedFields: number;
    fieldsWithoutDescription: number;
    fieldTypes: Record<string, number>;
    relationshipCount?: number;
    lookupFields?: number;
    masterDetailFields?: number;
    recordCount?: number;
    /** Custom fields as % of the 800-field governor limit */
    fieldLimitPct?: number;
    /** Apex triggers on this object (from EntityDefinition aggregate) */
    triggers?: number;
    /** Validation rules on this object (from EntityDefinition aggregate) */
    validationRules?: number;
  }>;
  /** Summary of special org object types (external, big objects, CMTs, custom settings) */
  dataModelSummary?: {
    customObjectCount?: number;
    standardObjectCount?: number;
    externalObjectCount?: number;
    bigObjectCount?: number;
    customMetadataTypeCount?: number;
    customSettingCount?: number;
    platformEventCount?: number;
  };
  /** Per-object automation counts (triggers, flows, validations) */
  automationSummary?: {
    objectMap: Record<string, { triggers: number; flows: number; validations: number; total: number }>;
    /** Record-triggered + auto-launched flows (legacy meaning, kept for back-compat) */
    totalFlows: number;
    totalTriggers: number;
    totalValidationRules: number;
    /** Screen flows (ProcessType = Flow) */
    totalScreenFlows?: number;
    /** Scheduled-triggered flows */
    totalScheduledFlows?: number;
    /** Platform-event-triggered flows */
    totalEventFlows?: number;
    /** Process Builders (ProcessType = Workflow) — deprecated automation */
    totalProcessBuilders?: number;
    /** Classic Workflow Rules (WorkflowRule object) */
    totalWorkflowRules?: number;
    flowInventory: Array<{ name: string; processType: string; objectApiName: string; isActive: boolean }>;
    /** Classic Workflow Rule inventory */
    workflowInventory?: Array<{ name: string; objectApiName: string; isActive?: boolean }>;
  };
  /** Org-wide test coverage summary (from ApexCodeCoverageAggregate) */
  testCoverageSummary?: {
    averageCoverage: number;
    totalClasses: number;
    classesBelow75: number;
    zeroCoverageCount: number;
    /** Per-class coverage breakdown, sorted worst-first */
    classCoverageDetails?: Array<{ name: string; pct: number; type: 'Class' | 'Trigger' }>;
  };
  /** Apex code inventory: component counts + code-size usage */
  codeInventory?: {
    apexClasses: number;
    apexTriggers: number;
    batchClasses: number;
    queueableClasses: number;
    schedulableClasses: number;
    /** Active scheduled Apex jobs (CronTrigger) */
    scheduledJobs: number;
    /** Sum of LengthWithoutComments across classes + trigger body length */
    apexCodeChars: number;
    /** Per-namespace Apex code character limit (~6,000,000) */
    apexCodeCharLimit: number;
  };
  /** CTA-level AI architectural review — populated by synthesizeCtaReview() */
  ctaReview?: CTAReview;
  /** Future Readiness assessment (AI/Agentforce, Data Cloud, Hyperforce) — deterministic scores + optional AI narrative */
  futureReadiness?: FutureReadinessReport;
  /** License usage summary from UserLicense */
  licenseSummary?: LicenseSummary[];
  /** Feature license summary from FeatureLicense object */
  featureLicenses?: FeatureLicenseSummary[];
  /** Query explain results (live org selectivity checks) */
  queryExplainResults?: QueryExplainResult[];
  /** Extended org details: edition, instance, trust status, release, apps */
  orgDetails?: OrgDetailsInfo;
  /** Rich org info data for the Org Info dashboard tab */
  orgInfoData?: OrgInfoData;
  /** Live record counts per sObject from LDV analysis */
  objectRecordCounts?: Record<string, number>;
  /** Public API entry points detected in Apex (RestResource, InboundEmail) */
  entryPoints?: Array<{ name: string; type: 'RestResource' | 'InboundEmail'; annotation: string }>;
  /** Pre-computed Limits Simulator base data per class (used by dashboard simulator) */
  limitsSimulatorData?: LimitsSimulatorClassData[];
  /** Live org governor-limit utilisation from the REST /limits endpoint */
  orgLimits?: OrgLimitInfo[];
}

/** A single live org limit (used vs max) from the REST /limits endpoint. */
export interface OrgLimitInfo {
  /** Limit key, e.g. "DailyApiRequests", "DataStorageMB" */
  name: string;
  /** Human-friendly label derived from the key */
  label: string;
  max: number;
  remaining: number;
  used: number;
  /** Percentage of the limit consumed (0–100) */
  usedPct: number;
}

/** Per-class data for the Limits Simulator */
export interface LimitsSimulatorClassData {
  className: string;
  file: string;
  /** Baseline SOQL count (static analysis) */
  baseSoql: number;
  /** SOQL queries inside loops (multiplied by data volume) */
  loopSoql: number;
  /** Baseline DML count */
  baseDml: number;
  /** DML statements inside loops */
  loopDml: number;
  /** Estimated base CPU time ms */
  baseCpuMs: number;
  /** Additional CPU per 1000 records in loops */
  cpuPerKRecords: number;
  /** Estimated base heap bytes */
  baseHeapBytes: number;
  /** Additional heap per 1000 records */
  heapPerKRecords: number;
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
  security: number;
  testing: number;
  integration: number;
  overall: number;
  /** New dimension scores (optional, 0-100) */
  governorLimits?: number;
  lwcQuality?: number;
  technicalDebt?: number;
  userGovernance?: number;
  profileSecurity?: number;
}

export interface AnalysisMetadata {
  workspacePath?: string;
  orgId?: string;
  orgAlias?: string;
  orgUsername?: string;
  apiVersion?: string;
  analyzedFiles: number;
  analyzedObjects: number;
  analyzedClasses?: number;
  analyzedTriggers?: number;
  analyzedFlows?: number;
  analyzedComponents?: number;
  /** Count of LWC components analyzed */
  analyzedLwcComponents?: number;
  /** Salesforce edition (e.g. Enterprise, Developer, Unlimited) */
  orgEdition?: string;
  /** Count of active users analyzed */
  analyzedUsers?: number;
  /** Count of profiles analyzed */
  analyzedProfiles?: number;
  /** Count of installed packages */
  installedPackages?: number;
  /** Human-readable names of analysis steps that failed (partial results). */
  warnings?: string[];
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
  // Resolved from FlowVersion join
  ObjectApiName?: string;
}

export interface FlowVersion {
  Id: string;
  FlowDefinitionId: string;
  ProcessType?: string;
  TriggerObjectOrEventReference?: string;
  StartElementReference?: string;
  Metadata?: {
    start?: {
      object?: string;
    };
  };
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
  EntityDefinition?: { QualifiedApiName: string; Label: string };
  FullName?: string;
  Description?: string;
  InlineHelpText?: string;
  DataType?: string;
  Metadata?: Record<string, unknown>;
}

export interface EntityDefinition {
  QualifiedApiName: string;
  Label: string;
  KeyPrefix?: string;
  DurableId?: string;
  RecordCount?: number;
  IsCustomizable?: boolean;
}

export interface FieldDefinitionInfo {
  QualifiedApiName: string;
  DataType: string;
  RelationshipName?: string;
  IsIndexed?: boolean;
  EntityDefinition?: { QualifiedApiName: string };
}

// ============================================================================
// New Metadata Types
// ============================================================================

export interface ApexCodeCoverage {
  ApexClassOrTrigger: { Name: string; Type: string };
  ApexClassOrTriggerId: string;
  NumLinesCovered: number;
  NumLinesUncovered: number;
  Coverage?: { coveredLines: number[]; uncoveredLines: number[] };
}

export interface PermissionSetInfo {
  Id: string;
  Name: string;
  Label: string;
  IsCustom?: boolean;
  PermissionsModifyAllData?: boolean;
  PermissionsViewAllData?: boolean;
  ProfileId?: string;
  /** Populated at runtime — active user count assigned this permission set */
  _userCount?: number;
}

export interface PermissionSetGroupInfo {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  Status: string;
  /** Populated at runtime — active user count assigned this group */
  _userCount?: number;
}

export interface NamedCredentialInfo {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  PrincipalType?: string;
  Protocol?: string;
  Endpoint?: string;
}

export interface ConnectedAppInfo {
  Id: string;
  Name: string;
  OptionsAllowAdminApprovedUsersOnly?: boolean;
  MobileSessionTimeout?: string;
  PinLength?: string;
}

export interface CustomMetadataTypeInfo {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  Description?: string;
}

export interface PlatformEventInfo {
  Id: string;
  QualifiedApiName: string;
  Label: string;
  PublishBehavior?: string;
}

// ============================================================================
// User Governance Types
// ============================================================================

export interface UserInfo {
  Id: string;
  Name: string;
  Username: string;
  IsActive: boolean;
  ProfileId: string;
  Profile?: { Name: string };
  UserType?: string;
  LastLoginDate?: string;
  CreatedDate?: string;
  FederationIdentifier?: string;
}

export interface ProfileInfo {
  Id: string;
  Name: string;
  UserType?: string;
  PermissionsModifyAllData?: boolean;
  PermissionsViewAllData?: boolean;
  PermissionsManageUsers?: boolean;
  PermissionsAuthorApex?: boolean;
  PermissionsCustomizeApplication?: boolean;
  Description?: string;
  /** Populated at runtime — active user count for this profile */
  _userCount?: number;
}

export interface RoleInfo {
  Id: string;
  Name: string;
  DeveloperName: string;
  ParentRoleId?: string;
  OpportunityAccessForAccountOwner?: string;
}

export interface UserGovernanceSummary {
  totalActiveUsers: number;
  totalInactiveUsers: number;
  neverLoggedIn: number;
  dormantUsers: number;        // active but no login in 90+ days
  superAdmins: number;         // Modify All Data
  profileDistribution: Array<{ profileName: string; count: number }>;
  usersByType: Record<string, number>;
  roleHierarchyDepth: number;
}

// ============================================================================
// Profile Security Types
// ============================================================================

export interface ProfileSecuritySummary {
  totalProfiles: number;
  systemAdminProfiles: number;
  profilesWithModifyAll: number;
  profilesWithViewAll: number;
  profilesWithAuthorApex: number;
  overprivilegedCount: number;   // profiles with 3+ dangerous permissions
  profileList: ProfileInfo[];
  /** Custom permission sets with dangerous-permission flags + user counts */
  permissionSetList?: PermissionSetInfo[];
  /** Permission set groups with status + user counts */
  permissionSetGroupList?: PermissionSetGroupInfo[];
}

// ============================================================================
// Stale Metadata Types
// ============================================================================

export interface StaleMetadataItem {
  id: string;
  name: string;
  type: 'report' | 'dashboard' | 'custom-field' | 'apex-class' | 'flow' | 'validation-rule' | 'email-template';
  lastModifiedDate?: string;
  lastModifiedBy?: string;
  createdDate?: string;
  ageInDays?: number;
  usageCount?: number;
  objectName?: string;
}

export interface StaleMetadataSummary {
  staleReports: StaleMetadataItem[];
  staleDashboards: StaleMetadataItem[];
  unusedCustomFields: StaleMetadataItem[];
  totalStaleItems: number;
  estimatedCleanupHours: number;
}

// ============================================================================
// Org Inventory Types
// ============================================================================

export interface PackageInfo {
  Id: string;
  SubscriberPackageId?: string;
  SubscriberPackage?: { Name: string; NamespacePrefix: string };
  SubscriberPackageVersion?: {
    Id: string;
    Name: string;
    MajorVersion: number;
    MinorVersion: number;
    PatchVersion: number;
  };
}

export interface VisualforceInfo {
  Id: string;
  Name: string;
  MasterLabel?: string;
  ApiVersion: number;
  Description?: string;
  ControllerType?: string;
  IsAvailableInTouch?: boolean;
}

export interface CustomLabelInfo {
  Id: string;
  Name: string;
  MasterLabel?: string;
  Value?: string;
  Language?: string;
  Category?: string;
}

export interface OrgInventorySummary {
  installedPackages: PackageInfo[];
  visualforcePages: VisualforceInfo[];
  customLabels: CustomLabelInfo[];
  apexClassCount: number;
  apexTriggerCount: number;
  flowCount: number;
  customObjectCount: number;
  standardObjectCount: number;
  customFieldCount: number;
  permissionSetCount: number;
  validationRuleCount: number;
  profileCount: number;
  recordTypeCount: number;
  pageLayoutCount: number;
  flexiPageCount: number;
  totalComponents: number;
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
  security: number;
  testing: number;
  integration: number;
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
  | 'explainIssue'
  | 'generateAiPdfReport'
  | 'filterByCategory'
  | 'filterBySeverity'
  | 'runCtaReview'
  | 'runFutureReadiness'
  | 'setSecurityMode'
  | 'cancelAnalysis'
  | 'refresh'
  | 'exportDataModelCsv'
  | 'exportCtaHtml'
  | 'exportCodeQualityCsv'
  | 'askArchitect'
  | 'getModels'
  | 'authorizeClaude'
  | 'disconnectClaude'
  | 'ready';

export interface DashboardMessage {
  command: DashboardMessageType;
  data?: unknown;
  model?: string;
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
// Dependency Graph Types
// ============================================================================

export type DependencyNodeType = 'apex-class' | 'apex-trigger' | 'flow' | 'object' | 'lwc' | 'aura' | 'visualforce' | 'validation-rule';

export interface DependencyNode {
  id: string;
  label: string;
  type: DependencyNodeType;
  apiName?: string;
  /** Number of incoming references (fan-in) */
  fanIn?: number;
  /** Number of outgoing references (fan-out) */
  fanOut?: number;
  /** Risk: high fan-in = central, changes break many things */
  centrality?: number;
}

export interface DependencyEdge {
  from: string;  // DependencyNode.id
  to: string;    // DependencyNode.id
  type: 'calls' | 'extends' | 'implements' | 'references' | 'triggers' | 'invokes';
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  /** Total transitive dependency depth */
  maxDepth?: number;
  /** Circular dependency chains found */
  circularDependencies?: string[][];
}

/**
 * A single row from the Tooling API `MetadataComponentDependency` object:
 * "MetadataComponent depends on (references) RefMetadataComponent".
 */
export interface MetadataDependency {
  MetadataComponentId: string;
  MetadataComponentName: string;
  MetadataComponentType: string;
  RefMetadataComponentId: string;
  RefMetadataComponentName: string;
  RefMetadataComponentType: string;
}

// ============================================================================
// Technical Debt Types
// ============================================================================

export type DebtCategory = 'outdated-api' | 'missing-documentation' | 'todo-fixme' | 'complexity' | 'test-debt' | 'naming' | 'dead-code';

export interface DebtItem {
  id: string;
  category: DebtCategory;
  file?: string;
  line?: number;
  description: string;
  estimatedHours: number;
  priority: 'quick-win' | 'medium' | 'large';
  tags: string[];
}

export interface DebtSummary {
  totalHours: number;
  /** Items solvable in < 1 hour */
  quickWins: DebtItem[];
  /** Items 1-4 hours */
  mediumItems: DebtItem[];
  /** Items > 4 hours */
  largeItems: DebtItem[];
  byCategory: Record<DebtCategory, number>;
  /** Estimated sprint cycles to resolve (assuming 2-week sprints, 20% capacity) */
  sprintCycles: number;
}

// ============================================================================
// Scale Center / Performance Metrics Types
// ============================================================================

export interface TransactionMetric {
  transactionName: string;
  avgSoqlCount: number;
  maxSoqlCount: number;
  avgDmlCount: number;
  avgCpuMs: number;
  avgHeapBytes: number;
  callCount: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

export interface ScaleCenterMetrics {
  /** Metrics per transaction type */
  transactions: TransactionMetric[];
  /** Async Apex queue depth */
  asyncQueueDepth?: number;
  /** AsyncApex failure rate % */
  asyncFailureRate?: number;
  /** Storage used in MB */
  storageMB?: number;
  /** Storage limit in MB */
  storageLimitMB?: number;
  /** Bulk job failures in last 7 days */
  bulkJobFailures?: number;
  /** Whether the org supports Scale Center (Enterprise/Unlimited only) */
  isAvailable: boolean;
  /** Message when not available */
  unavailableReason?: string;
  /** Top slow SOQL queries from EventLogFile */
  slowQueries?: SlowQuery[];
}

export interface SlowQuery {
  query: string;
  avgRows: number;
  avgMs: number;
  count: number;
  className?: string;
}

// ============================================================================
// Scan History Types
// ============================================================================

export interface ScanHistoryEntry {
  timestamp: string;
  orgId: string;
  orgName: string;
  scores: HealthScores;
  issueSummary: {
    total: number;
    error: number;
    warning: number;
    info: number;
  };
  duration: number;
}

// ============================================================================
// Trend Data Types
// ============================================================================

export interface TrendPoint {
  timestamp: string;
  overall: number;
  codeQuality: number;
  automationDesign: number;
  performance: number;
  security: number;
  testing: number;
}

// ============================================================================
// Governor Limit Detail Types
// ============================================================================

export interface GovernorRiskDetail {
  className: string;
  file?: string;
  prediction: GovernorRiskPrediction;
  /** Top offending patterns found */
  patterns: string[];
}

// ============================================================================
// LWC Types
// ============================================================================

export type LwcIssueType =
  | 'missing-error-boundary'
  | 'deprecated-api'
  | 'wire-adapter-misuse'
  | 'accessibility'
  | 'component-complexity'
  | 'missing-documentation'
  | 'security'
  | 'performance';

export interface LwcComponentInfo {
  name: string;
  path: string;
  hasTemplate: boolean;
  hasController: boolean;
  hasTests: boolean;
  hasCss: boolean;
  templateLines: number;
  controllerLines: number;
  /** Number of wire decorators */
  wireCount: number;
  /** Uses @api properties */
  hasPublicApi: boolean;
  issues: string[];
}

export interface LwcSummary {
  totalComponents: number;
  componentsWithTests: number;
  componentsWithA11yIssues: number;
  componentList: LwcComponentInfo[];
  /** LWC component count fetched directly from the org (when workspace scan finds nothing) */
  orgComponentCount?: number;
  /** Aura component count fetched from the org */
  orgAuraComponentCount?: number;
}

// ============================================================================
// AI Extension Types (for future integration)
// ============================================================================

export interface AIProvider {
  explainIssue(issue: Issue): Promise<string>;
  suggestFix(issue: Issue, codeContext: string): Promise<string>;
  predictGovernorRisk(code: string): Promise<GovernorRiskPrediction>;
}

// ============================================================================
// CTA Review Types — AI Architectural Intelligence (v1.9.2 — 12-Section Report)
// ============================================================================

/** Verdict returned by the CTA AI review */
export type CTAVerdict = 'Go' | 'Conditional Go' | 'No-Go';

/** CTA domain finding for a single architectural domain */
export interface CtaDomainFinding {
  /** One of 5 CTA domains */
  domain: 'System Architecture' | 'Security' | 'Data Architecture' | 'Integration' | 'Solution Architecture';
  /** Pass | Warning | Fail */
  status: 'Pass' | 'Warning' | 'Fail';
  /** One-paragraph CTA-level analysis */
  analysis: string;
  /** 1-3 specific risks identified */
  risks: string[];
  /** Concrete recommended actions */
  recommendations: string[];
}

/** A single config-first opportunity where standard platform replaces custom code */
export interface ConfigFirstOpportunity {
  customPattern: string;
  standardFeature: string;
  effort: 'Low' | 'Medium' | 'High';
  benefit: string;
}

// ── New v1.9.2 sub-interfaces ────────────────────────────────────────────────

/** Architecture maturity classification (Level 1 = Ad Hoc → Level 5 = Optimised) */
export interface ArchitectureMaturity {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;   // e.g. "Managed", "Defined"
  summary: string; // 1-2 sentences explaining the rating
}

/** Business impact summary across revenue, operations, and compliance */
export interface BusinessImpactSummary {
  revenueRisk: string;
  operationalRisk: string;
  complianceRisk: string;
  overallSeverity: 'Low' | 'Medium' | 'High' | 'Critical';
}

/** High-level characterisation of the org footprint */
export interface OrgProfile {
  complexity: 'Simple' | 'Moderate' | 'Complex' | 'Enterprise';
  userScale: string;
  integrationFootprint: string;
  customizationLevel: string;
}

/** Health score breakdown per area with trend and key finding */
export interface HealthScoreBreakdownItem {
  area: string;
  score: number;
  maxScore: number;
  trend: 'improving' | 'stable' | 'declining';
  keyFinding: string;
}

/** One of the top 10 critical issues identified by the review */
export interface TopCriticalIssue {
  rank: number;
  title: string;
  severity: 'Critical' | 'High';
  domain: string;
  impact: string;
  remediation: string;
  effortEstimate: string;
}

/** Likelihood × Impact risk analysis per domain */
export interface RiskHeatmapCell {
  domain: string;
  likelihood: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High';
}

export interface RiskAnalysis {
  probabilityOfIncident: string;
  timeToRisk: string;
  riskHeatmap: RiskHeatmapCell[];
}

/** Benchmark comparison of an org metric vs industry averages */
export interface BenchmarkItem {
  metric: string;
  orgValue: string;
  industryAvg: string;
  topQuartile: string;
  status: 'Below' | 'At' | 'Above';
}

/** AI-generated insights: hidden risks, predictions, unusual patterns */
export interface AIInsights {
  hiddenRisks: string[];
  predictions: string[];
  unusualPatterns: string[];
}

/** SWOT-style architecture observation */
export interface ArchitectureObservation {
  observation: string;
  classification: 'Strength' | 'Weakness' | 'Opportunity' | 'Threat';
}

/** Quick win (deliverable in 1-2 sprints) */
export interface QuickWinItem {
  action: string;
  effort: 'Low' | 'Medium' | 'High';
  impact: string;
}

/** Strategic recommendation with roadmap timeline */
export interface StrategicItem {
  action: string;
  timeline: string;   // e.g. "Q2 2026", "6-12 months"
  effort: 'Low' | 'Medium' | 'High';
  impact: string;
}

export interface Recommendations {
  quickWins: QuickWinItem[];
  strategic: StrategicItem[];
}

/** Cost of inaction analysis */
export interface CostOfInaction {
  financialImpact: string;
  technicalDebtGrowth: string;
  risks: string[];
}

/** Final CTA-style closing recommendation */
export interface FinalRecommendation {
  summary: string;
  nextSteps: string[];
  proposedTimeline: string;
}

// ────────────────────────────────────────────────────────────────────────────

/** Full CTA-grade architectural review produced by AI synthesis (v1.9.2 — 12 sections) */
export interface CTAReview {
  // ── Section 1: Verdict ──────────────────────────────────────────────────
  verdict: CTAVerdict;

  // ── Section 2: Executive Summary ────────────────────────────────────────
  executiveSummary: string;

  // ── Section 3: Architecture Maturity ────────────────────────────────────
  architectureMaturity?: ArchitectureMaturity;

  // ── Section 4: Business Impact Summary ──────────────────────────────────
  businessImpactSummary?: BusinessImpactSummary;

  // ── Section 5: Org Profile ──────────────────────────────────────────────
  orgProfile?: OrgProfile;

  // ── Section 6: Health Score Breakdown ───────────────────────────────────
  healthScoreBreakdown?: HealthScoreBreakdownItem[];

  // ── Section 7: Top 10 Critical Issues ───────────────────────────────────
  topCriticalIssues?: TopCriticalIssue[];

  // ── Section 8: Risk Analysis ─────────────────────────────────────────────
  riskAnalysis?: RiskAnalysis;

  // ── Section 9: Benchmark Comparison ─────────────────────────────────────
  benchmarkComparison?: BenchmarkItem[];

  // ── Section 10: Domain Findings (5 CTA domains) ─────────────────────────
  domainFindings: CtaDomainFinding[];

  // ── Section 11: AI Insights ──────────────────────────────────────────────
  aiInsights?: AIInsights;

  // ── Section 12: Architecture Observations (SWOT) ─────────────────────────
  architectureObservations?: ArchitectureObservation[];

  // ── Section 13: Recommendations ──────────────────────────────────────────
  recommendations?: Recommendations;

  // ── Section 14: Cost of Inaction ─────────────────────────────────────────
  costOfInaction?: CostOfInaction;

  // ── Section 15: Final CTA Recommendation ─────────────────────────────────
  finalRecommendation?: FinalRecommendation;

  // ── Legacy fields (kept for backward compat — pre-v1.9.2 cached reviews) ─
  /** @deprecated Use topCriticalIssues instead */
  criticalRisks?: Array<{ risk: string; impact: string; mitigation: string }>;
  /** @deprecated Use recommendations.quickWins instead */
  quickWins?: string[];
  /** @deprecated Use recommendations instead */
  configFirstOpportunities?: ConfigFirstOpportunity[];

  // ── Metadata ──────────────────────────────────────────────────────────────
  modelUsed: string;
  generatedAt: string;
}

/** Live query selectivity result from Tooling API /query/?explain */
export interface QueryExplainResult {
  soql: string;
  /** 'Optimal' | 'Good' | 'Unacceptable' */
  sforcePerformanceLevel: string;
  /** Notes from the explain response */
  notes: Array<{ description: string; fields: string[]; tableEnumOrId: string }>;
  isFullTableScan: boolean;
}

/** UserLicense row from SOQL */
export interface LicenseSummary {
  name: string;
  totalLicenses: number;
  usedLicenses: number;
  usedPct: number;
}

export interface GovernorRiskPrediction {
  soqlQueries: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
  dmlStatements: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
  cpuTime: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
  heapSize: { estimated: number; limit: number; risk: 'low' | 'medium' | 'high' };
}

// ============================================================================
// Org Details / Org Info tab types
// ============================================================================

export interface FeatureLicenseSummary {
  name: string;
  status: string;
  totalLicenses: number;
  usedLicenses: number;
}

export interface TrustIncident {
  id: string;
  message: string;
  severity: string;
  affectedComponents: string[];
  createdAt: string;
  status: string; // 'active' | 'resolved'
}

export interface AppSummaryItem {
  label: string;
  type: string; // 'Classic' | 'ServiceDesk' | 'Aloha' | 'Standard' | 'Console'
  isActive: boolean;
}

export interface OrgDetailsInfo {
  orgId: string;
  orgName: string;
  orgType: string;         // e.g. Enterprise, Developer, Unlimited, Sandbox
  instanceName: string;   // e.g. NA1, EU15, CS87
  instanceUrl: string;
  apiVersion: string;
  username: string;
  alias?: string;
  /** Salesforce Trust status for the instance */
  trustStatus?: 'OK' | 'Informational' | 'Major Incident' | 'Minor Incident' | 'Maintenance' | 'Unknown';
  trustIncidents: TrustIncident[];
  /** Next planned release date for this instance (from Salesforce release calendar) */
  nextReleaseName?: string;
  nextReleaseDate?: string;
  /** Salesforce feature licenses */
  featureLicenses: FeatureLicenseSummary[];
  /** All apps in the org */
  apps: AppSummaryItem[];
  consoleAppCount: number;
  standardAppCount: number;
}

// ============================================================================
// Org Info Extended Types (rich Org Info dashboard tab)
// ============================================================================

export interface OrgExtendedDetails {
  createdDate?: string;
  myDomain?: string;
  loginUrl?: string;
  timezone?: string;
  language?: string;
  currency?: string;
  isHyperforce?: boolean;
  isSandbox?: boolean;
  buildVersion?: string;
  defaultLocale?: string;
  division?: string;
  primaryContact?: string;
  phone?: string;
  fax?: string;
  address?: string;
  fiscalYearStartMonth?: string;
  namespacePrefix?: string;
  monthlyPageViewsUsed?: number;
  monthlyPageViewsEntitlement?: number;
  dataCenter?: string;
  storageUsedMB?: number;
  storageLimitMB?: number;
  storageUsedPct?: number;
  currentRelease?: string;
}

export interface CloudStatus {
  name: string;
  key: string;
  enabled: boolean;
}

export interface PackageTypeSummary {
  managed: number;
  unlocked: number;
  local: number;
  total: number;
}

export interface AppTypeSummary {
  lightningApps: number;
  experienceSites: number;
  consoleApps: number;
  connectedApps: number;
  mobileApps: number;
  omniStudioApps: number;
  total: number;
}

export interface EnvironmentsSummary {
  production: number;
  fullSandboxes: number;
  partialSandboxes: number;
  developerSandboxes: number;
  scratchOrgs: number;
  total: number;
}

export interface IntegrationsSummary {
  namedCredentials: number;
  connectedApps: number;
  externalCredentials: number;
  remoteSites: number;
  authProviders: number;
  certificates: number;
  total: number;
}

export interface OrgQuickFacts {
  /** null ⇒ the connected org did not return this metric (shown as N/A) */
  customObjects: number | null;
  users: number;
  roles: number;
  profiles: number;
  permissionSets: number;
  permissionSetGroups: number;
  publicGroups: number;
  queues: number;
  /** null ⇒ the connected org did not return this metric (shown as N/A) */
  flows: number | null;
  apexClasses: number;
  triggers: number;
  lwcComponents: number;
}

export interface OrgInfoData {
  extended?: OrgExtendedDetails;
  clouds?: CloudStatus[];
  packagesByType?: PackageTypeSummary;
  appsByType?: AppTypeSummary;
  environments?: EnvironmentsSummary;
  integrations?: IntegrationsSummary;
  quickFacts?: OrgQuickFacts;
  activeUsers?: number;
  activeLicenses?: number;
  totalLicenses?: number;
}
