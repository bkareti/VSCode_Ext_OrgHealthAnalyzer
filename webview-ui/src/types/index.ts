// Re-exports from the extension host types — single source of truth stays in src/types/index.ts
export type {
  Severity,
  IssueCategory,
  Issue,
  AnalysisResult,
  OrgLimitInfo,
  LimitsSimulatorClassData,
  AnalysisSummary,
  HealthScores,
  AnalysisMetadata,
  UserGovernanceSummary,
  ProfileSecuritySummary,
  StaleMetadataItem,
  StaleMetadataSummary,
  OrgInventorySummary,
  ObjectAutomationSummary,
  AutomationRisk,
  DashboardMessageType,
  DashboardMessage,
  DashboardState,
  DependencyNodeType,
  DependencyNode,
  DependencyEdge,
  DependencyGraph,
  DebtCategory,
  DebtItem,
  DebtSummary,
  TransactionMetric,
  ScaleCenterMetrics,
  SlowQuery,
  TrendPoint,
  GovernorRiskDetail,
  LwcIssueType,
  LwcComponentInfo,
  LwcSummary,
  CTAVerdict,
  CtaDomainFinding,
  ArchitectureMaturity,
  BusinessImpactSummary,
  OrgProfile,
  HealthScoreBreakdownItem,
  TopCriticalIssue,
  RiskHeatmapCell,
  RiskAnalysis,
  BenchmarkItem,
  AIInsights,
  ArchitectureObservation,
  QuickWinItem,
  StrategicItem,
  Recommendations,
  CostOfInaction,
  FinalRecommendation,
  CTAReview,
  QueryExplainResult,
  LicenseSummary,
  GovernorRiskPrediction,
  FeatureLicenseSummary,
  TrustIncident,
  AppSummaryItem,
  OrgDetailsInfo,
  OrgExtendedDetails,
  CloudStatus,
  PackageTypeSummary,
  AppTypeSummary,
  EnvironmentsSummary,
  IntegrationsSummary,
  OrgQuickFacts,
  OrgInfoData,
  ScanHistoryEntry,
  SecurityCollectorSnapshot,
} from '../../../src/types/index';

// Architect Recommendations — evidence-cited pointer sections (shared across Future Readiness pilot and future tabs)
export type {
  RecommendationPriority,
  ArchitectRecommendationPoint,
  ArchitectRecommendationSection,
} from '../../../src/types/architectRecommendations';

// Future Readiness Assessment types
export type {
  PackId,
  ReadinessStatus,
  GapSeverity,
  EffortLevel,
  ReadinessTrendDirection,
  ReadinessSignal,
  ReadinessDimensionScore,
  ReadinessGap,
  StrategicInitiative,
  RoadmapHorizon,
  RoadmapItem,
  RoadmapPhase,
  ReadinessTrend,
  PackNarrative,
  FutureReadinessNarrative,
  ReadinessPackAssessment,
  FutureReadinessResult,
  FutureReadinessReport,
  ProfileIpRangeInfo,
  ConnectedAppInfo,
} from '../../../src/types/futureReadiness';

// License Recommendations — AI-enriched card data for the Clouds & Licenses tab
export type {
  LicenseImpact,
  LicenseCardId,
  LicenseRecommendationCard,
  LicenseRecommendationsReport,
} from '../../../src/types/licenseRecommendations';

// Org Info Recommendations — AI-enriched card data for the Overview tab
export type {
  OrgInfoImpact,
  OrgInfoCardId,
  OrgInfoRecommendationCard,
  OrgInfoRecommendationsReport,
} from '../../../src/types/orgInfoRecommendations';

// Security Recommendations — deterministic card data for the Security tab
export type {
  SecurityImpact,
  SecurityRecommendationCard,
  SecurityRecommendationsReport,
} from '../../../src/types/securityRecommendations';

// Governor Limits Recommendations — AI-enriched card data for the Governor Limits → Summary tab
export type {
  GovernorLimitsImpact,
  GovernorLimitsCardId,
  GovernorLimitsRecommendationCard,
  GovernorLimitsRecommendationsReport,
} from '../../../src/types/governorLimitsRecommendations';

// Data Cloud Insights — AI-enriched insight cards for the Data Cloud Readiness → Overview sub-tab
export type {
  DataCloudInsightType,
  DataCloudInsightCard,
  DataCloudInsightsReport,
} from '../../../src/types/dataCloudInsights';

// Agentforce Insights — AI-enriched insight cards for the Agentforce Readiness → Overview panel
export type {
  AgentforceInsightType,
  AgentforceInsightCard,
  AgentforceInsightsReport,
} from '../../../src/types/agentforceInsights';
