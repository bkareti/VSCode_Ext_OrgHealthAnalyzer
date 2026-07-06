/**
 * Assessment Context types — the vendor-neutral AI payload produced by AssessmentContextService.
 *
 * Design invariant: OrgPulse owns all scoring, risk classification, and metrics.
 * AI receives ONLY this structured context — never raw source code, SOQL, or PII.
 */

// ============================================================================
// Primitive Enumerations
// ============================================================================

export type NormalizedSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type OrgComplexity = 'Small' | 'Medium' | 'Large' | 'Enterprise';

export type AutomationComplexity = 'Low' | 'Medium' | 'High';

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type TrendDirection = 'improving' | 'stable' | 'declining';

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type QuickWinPriority = 'High' | 'Medium' | 'Low';

export type QuickWinComplexity = 'Low' | 'Medium' | 'High';

/** All score dimensions produced by ScoreCalculator (13 + overall). */
export type ScoredDimensionName =
  | 'codeQuality'
  | 'automationDesign'
  | 'dataModel'
  | 'performance'
  | 'security'
  | 'testing'
  | 'integration'
  | 'architecture'
  | 'governorLimits'
  | 'licenseUtilization'
  | 'featureAdoption'
  | 'complexity'
  | 'maintainability'
  | 'overall';

// ============================================================================
// Scoring Types
// ============================================================================

/** Per-rule contribution explaining how a dimension's score was derived. */
export interface RuleContribution {
  ruleId: string;
  count: number;
  severity: 'error' | 'warning' | 'info';
  deduction: number;
}

/** A single scored dimension with full evidence. AI must use scores verbatim — never recalculate. */
export interface ScoredDimension {
  dimension: ScoredDimensionName;
  score: number;           // 0-100
  weight: number;          // percentage weight in overall
  grade: ScoreGrade;
  confidence: ConfidenceLevel;
  ruleBreakdown: RuleContribution[];
  reason: string;          // single sentence explaining the score; no PII
}

// ============================================================================
// Findings Types
// ============================================================================

/** A deduplicated, PII-free finding ready for AI consumption. */
export interface NormalizedFinding {
  ruleId: string;
  normalizedSeverity: NormalizedSeverity;
  count: number;
  message: string;          // sanitized — no file paths, class bodies, or PII
  tags: string[];
  affectedObjects: string[]; // sObject API names only (e.g. "Account__c"), not file paths
}

/** Findings grouped by domain, with severity counts. */
export interface NormalizedFindingGroup {
  domain: string;
  displayName: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topFindings: NormalizedFinding[];
}

// ============================================================================
// Quick Win Types
// ============================================================================

export interface QuickWin {
  title: string;
  category: string;
  reason: string;           // sanitized
  priority: QuickWinPriority;
  impact: string;
  complexity: QuickWinComplexity;
  affectedCount: number;
}

// ============================================================================
// Business Context Types
// ============================================================================

export interface OrgComplexityEvidence {
  activeUsers: number;
  customObjectCount: number;
  apexClassCount: number;
}

export interface AutomationComplexityEvidence {
  totalTriggers: number;
  totalFlows: number;
  multiTriggerObjects: string[];
}

export interface BusinessContext {
  orgComplexity: OrgComplexity;
  orgComplexityEvidence: OrgComplexityEvidence;
  automationComplexity: AutomationComplexity;
  automationComplexityEvidence: AutomationComplexityEvidence;
  architectureMaturityLevel: 1 | 2 | 3 | 4 | 5;
  architectureMaturityEvidence: string[];
  businessRisk: RiskLevel;
  scalabilityRisk: RiskLevel;
  complianceRisk: RiskLevel;
  complianceRiskEvidence: string[];
}

// ============================================================================
// Trend Analysis Types
// ============================================================================

export interface ScoreTrend {
  dimension: ScoredDimensionName;
  direction: TrendDirection;
  delta: number;
}

export interface TrendAnalysis {
  hasPreviousSnapshot: boolean;
  snapshotDeltaDays: number;
  newFindingCount: number;
  resolvedFindingCount: number;
  scoreTrends: ScoreTrend[];
}

// ============================================================================
// Domain Summary Types
// ============================================================================

export interface SecuritySummary {
  overprivilegedProfileCount: number;
  apexWithoutSharingCount: number;
  superAdminCount: number;
  publicApiEntryPoints: number;
  idempotencyGapCount: number;
}

export interface PerformanceSummary {
  fullTableScanCount: number;
  soqlInLoopCount: number;
  dmlInLoopCount: number;
  ldvObjectCount: number;
  ldvObjects: string[];        // sObject API names only
  asyncAntiPatternCount: number;
  multiTriggerObjectCount: number;
}

export interface ArchitectureSummary {
  totalCustomObjects: number;
  totalCustomFields: number;
  totalApexClasses: number;
  totalFlows: number;
  totalTriggers: number;
  workflowRulesToMigrate: number;
  processBuilderCount: number;
  circularDependencyCount: number;
  deprecatedApiUsageCount: number;
}

export interface TestCoverageSummary {
  averageCoverage: number;
  classesBelow75Pct: number;
  zeroCoverageCount: number;
}

export interface LicenseUtilizationItem {
  licenseName: string;
  totalLicenses: number;
  usedPct: number;
}

export interface GovernorLimitItem {
  limitName: string;
  usedPct: number;
}

export interface GovernorLimitsSummary {
  limitsNearThreshold: GovernorLimitItem[];   // usedPct >= 70
  highRiskClassCount: number;
}

// ============================================================================
// Metadata Coverage / Scan Metadata
// ============================================================================

/** Flags indicating which rich payloads were available at context-build time. */
export interface MetadataCoverage {
  hasDataModelStats: boolean;
  hasAutomationSummary: boolean;
  hasTestCoverage: boolean;
  hasLicenseSummary: boolean;
  hasQueryExplain: boolean;
  hasOrgLimits: boolean;
  hasStaleMetadata: boolean;
  hasOrgInventory: boolean;
  hasUserGovernance: boolean;
  hasProfileSecurity: boolean;
  hasScaleCenter: boolean;
  hasDependencyGraph: boolean;
  hasGovernorRisks: boolean;
  hasTrends: boolean;
  hasRecordCounts: boolean;
  hasEntryPoints: boolean;
}

export interface ScanMetadata {
  timestamp: string;      // ISO-8601
  durationMs: number;
  orgId: string;          // masked (only first 3 chars visible)
  apiVersion: string;
  modelTarget: string;    // which AI model this context will be sent to
  analyzersRan: string[];
  tokenEstimate: number;
}

// ============================================================================
// Optimizer Report
// ============================================================================

export interface PayloadOptimizerReport {
  estimatedTokens: number;
  budget: number;
  truncationsApplied: string[];
}

// ============================================================================
// Top-level AssessmentContext
// ============================================================================

/**
 * The complete, privacy-safe, vendor-neutral AI payload.
 *
 * NEVER includes: source code, SOQL, file paths, emails, phone numbers,
 * unmasked org IDs, secrets, customer record data, or any PII/PHI/PCI.
 *
 * Compatible with Claude, GPT, Gemini, Mistral, and Llama.
 */
export interface AssessmentContext {
  scanMetadata: ScanMetadata;
  metadataCoverage: MetadataCoverage;
  scores: ScoredDimension[];
  findings: NormalizedFindingGroup[];
  businessContext: BusinessContext;
  quickWins: QuickWin[];
  trends: TrendAnalysis;
  securitySummary: SecuritySummary;
  performanceSummary: PerformanceSummary;
  architectureSummary: ArchitectureSummary;
  testCoverageSummary: TestCoverageSummary;
  licenseUtilizationSummary: LicenseUtilizationItem[];
  governorLimitsSummary: GovernorLimitsSummary;
  optimizerReport: PayloadOptimizerReport;
}
