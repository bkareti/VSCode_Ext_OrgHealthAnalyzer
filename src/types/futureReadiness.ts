/**
 * Future Readiness Assessment types.
 *
 * A consulting-grade engine that scores whether the org is ready to adopt three
 * future Salesforce capabilities: AI / Agentforce, Data Cloud, and Hyperforce.
 *
 * Design invariant (inherited from the Assessment Context Engine):
 * OrgPulse owns ALL scoring, gap, and risk classification. AI receives only a
 * structured, PII-free context and writes narrative — it NEVER calculates scores.
 */

import type { QuickWin, ScoreGrade, ConfidenceLevel } from './assessmentContext';

// ============================================================================
// Primitives
// ============================================================================

/** The readiness packs shipped in V1. New packs extend this union + the PACKS registry. */
export type PackId = 'ai-agentforce' | 'data-cloud' | 'hyperforce';

/** Outcome of a single readiness check / dimension. */
export type ReadinessStatus = 'ready' | 'partial' | 'blocked' | 'na';

export type GapSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type EffortLevel = 'Low' | 'Medium' | 'High';

export type ReadinessTrendDirection = 'improving' | 'stable' | 'declining';

// ============================================================================
// Signals & scored dimensions
// ============================================================================

/** Raw output of a ReadinessCheck, before aggregation into a dimension score. */
export interface ReadinessSignal {
  id: string;
  packId: PackId;
  /** Display name of the sub-dimension this signal contributes to. */
  dimension: string;
  status: ReadinessStatus;
  /** 0-100 score for this signal. */
  score: number;
  /** Relative weight of this signal within its dimension. */
  weight: number;
  /** PII-free evidence strings (sObject API names, counts, metrics only). */
  evidence: string[];
  recommendation?: string;
}

/** An aggregated, scored sub-dimension of a pack. */
export interface ReadinessDimensionScore {
  dimension: string;
  score: number;          // 0-100
  weight: number;         // percentage weight within the pack
  grade: ScoreGrade;
  confidence: ConfidenceLevel;
  status: ReadinessStatus;
  evidence: string[];
  reason: string;         // single-sentence, PII-free explanation
}

// ============================================================================
// Gaps, recommendations, roadmap
// ============================================================================

export interface ReadinessGap {
  title: string;
  severity: GapSeverity;
  /** Which dimension / domain the gap belongs to. */
  area: string;
  whyItMatters: string;
  evidence: string[];
  recommendation?: string;
}

export interface StrategicInitiative {
  title: string;
  area: string;
  impact: string;
  effort: EffortLevel;
  timeline: string;       // e.g. "Next quarter"
}

export type RoadmapHorizon = 'Now' | 'Next' | 'Later';

export interface RoadmapItem {
  title: string;
  packId: PackId;
  area: string;
  effort: EffortLevel;
  impact: string;
}

export interface RoadmapPhase {
  horizon: RoadmapHorizon;
  label: string;          // e.g. "0-30 days"
  items: RoadmapItem[];
}

// ============================================================================
// Historical comparison
// ============================================================================

export interface ReadinessTrend {
  packId: PackId | 'overall';
  current: number;
  previous: number;
  delta: number;
  direction: ReadinessTrendDirection;
}

// ============================================================================
// Narrative (AI-authored — optional)
// ============================================================================

export interface PackNarrative {
  currentMaturity: string;
  businessImpact: string;
  summary: string;
}

export interface FutureReadinessNarrative {
  executiveSummary: string;
  overallMaturity: string;
}

// ============================================================================
// Pack assessment & top-level result
// ============================================================================

export interface ReadinessPackAssessment {
  packId: PackId;
  packName: string;
  overallScore: number;   // 0-100
  grade: ScoreGrade;
  confidence: ConfidenceLevel;
  /** 1 = Ad Hoc … 5 = Optimised. */
  maturityLevel: 1 | 2 | 3 | 4 | 5;
  dimensions: ReadinessDimensionScore[];
  strengths: string[];
  blockingIssues: ReadinessGap[];
  quickWins: QuickWin[];
  strategicInitiatives: StrategicInitiative[];
  /** AI narrative — undefined on the deterministic build; filled by synthesizeFutureReadiness. */
  narrative?: PackNarrative;
}

/** The deterministic assessment produced entirely by OrgPulse (no AI). */
export interface FutureReadinessResult {
  packs: ReadinessPackAssessment[];
  overall: { score: number; grade: ScoreGrade };
  roadmap: RoadmapPhase[];
  historical: ReadinessTrend[];
  generatedAt: string;    // ISO-8601
}

/** The deterministic result plus optional AI narrative. Persisted on AnalysisResult. */
export interface FutureReadinessReport extends FutureReadinessResult {
  narrative?: FutureReadinessNarrative;
  modelUsed?: string;
}

// ============================================================================
// Collector output (minimal new metadata — never customer record data)
// ============================================================================

export interface DuplicateRuleInfo {
  developerName: string;
  sobjectType: string;
  isActive: boolean;
}

export interface MatchingRuleInfo {
  developerName: string;
  sobjectType: string;
  /** e.g. 'Active' | 'Inactive' | 'Deploying'. */
  status: string;
}

export interface RemoteSiteDetail {
  name: string;
  endpoint: string;
  isActive: boolean;
  /** True when the endpoint uses http:// (insecure). */
  isHttp: boolean;
}

export interface CertificateDetail {
  name: string;
  expirationDate?: string;
  keySize?: number;
  daysUntilExpiry?: number;
}

/** Data Cloud identity-graph object counts (Data API, single composite/batch round-trip). */
export interface DataCloudIdentityCounts {
  individualCount: number;
  contactPointEmailCount: number;
  contactPointPhoneCount: number;
  contactPointAddressCount: number;
  contactTotalCount: number;
  contactWithEmailCount: number;
}

export interface PlatformFeatureFlags {
  dataCloudEnabled: boolean;
  einsteinFeatures: string[];
  agentforceLicensed: boolean;
  enhancedDomainEnabled?: boolean;
  /** True when org-wide MFA enforcement is active (Organization.IsMfaRequired). */
  mfaRequired?: boolean;
  /** True when the Einstein Trust Layer feature license is active. */
  trustLayerEnabled?: boolean;
  edition: string;
}

/** A profile that carries at least one Login IP Range restriction. */
export interface ProfileIpRangeInfo {
  profileId: string;
  rangeCount: number;
}

/** Summary of a Connected App: name + whether its StartUrl uses a hardcoded instance URL. */
export interface ConnectedAppInfo {
  name: string;
  hasHardcodedInstanceUrl: boolean;  /**
   * IpRelaxation setting: 'Relaxed' | 'WhitelistedIp' | 'NetworkBased' | 'ThirdPartyMfa'.
   * Any value other than 'Relaxed' means the app enforces IP restrictions that must be
   * updated for Hyperforce IP blocks.
   */
  ipRelaxation?: string;}

/** Installed managed / unmanaged package (for Hyperforce compatibility review). */
export interface InstalledPackageInfo {
  name: string;
  namespacePrefix?: string;
}

/** Bundle of new-collector outputs; every field is optional/best-effort. */
export interface ReadinessCollectorData {
  duplicateRules?: DuplicateRuleInfo[];
  matchingRules?: MatchingRuleInfo[];
  remoteSites?: RemoteSiteDetail[];
  certificates?: CertificateDetail[];
  platformFeatures?: PlatformFeatureFlags;
  /** Profiles with Login IP Ranges — IP blocks change on Hyperforce. */
  profileIpRanges?: ProfileIpRangeInfo[];
  /** Connected Apps with URL metadata for Hyperforce callback review. */
  connectedApps?: ConnectedAppInfo[];
  /** Installed packages to verify against the Hyperforce-compatible ISV list. */
  installedPackages?: InstalledPackageInfo[];
  /** Count of org-level trusted IP ranges (Network Access) — must be updated for Hyperforce IP blocks. */
  orgNetworkAccessRangeCount?: number;
  /** Count of Custom Labels whose Value contains a hardcoded Salesforce instance URL. */
  hardcodedCustomLabelCount?: number;
  /** Count of live Experience Cloud sites — each site domain must be updated on Hyperforce. */
  experienceCloudSiteCount?: number;
  /** Count of org-wide email addresses using Salesforce-hosted domains that change with Enhanced Domains. */
  orgWideEmailDomainIssueCount?: number;
  // ── Agentforce-specific collectors ──────────────────────────────────────
  /** Count of active Prompt Templates (0 = Agentforce has no AI content generation capability). */
  promptTemplateCount?: number;
  /** Count of online/published Knowledge articles (used for Agentforce grounding). */
  knowledgeArticleCount?: number;
  /** Count of active Autolaunched (invocable) flows — Agentforce can only invoke these. */
  autolaunchedFlowCount?: number;
  /** Count of active Apex classes containing @InvocableMethod — usable as Agentforce actions. */
  invocableApexCount?: number;
  /** Count of key standard objects (Account, Contact, Case, Opportunity, Lead) with Private OWD. */
  privateOwdObjectCount?: number;
  /** Count of custom fields on key objects whose API name suggests PII (SSN, CreditCard, etc.). */
  piiSensitiveFieldCount?: number;
  // ── Data Cloud-specific collectors ──────────────────────────────────────
  /** Individual/ContactPoint/Contact counts for identity-resolution readiness (single composite call). */
  dataCloudIdentityCounts?: DataCloudIdentityCounts;
  /** Count of Data Cloud Data Stream definitions (Tooling API) — 0 means no ingestion configured. */
  dataStreamCount?: number;
  /** Count of Data Cloud CRM/data connectors (Tooling API) — 0 means no connector to Data Cloud is set up. */
  dataConnectorCount?: number;
  /** Count of Calculated Insights defined in Data Cloud (Tooling API). */
  calculatedInsightCount?: number;
  /** Count of Data Cloud Segments defined (Tooling API). */
  dataSegmentCount?: number;
  /** Count of Data Cloud Data Spaces configured (Tooling API) — multi-tenant/governance partitioning. */
  dataSpaceCount?: number;
}

// ============================================================================
// Privacy-safe AI context
// ============================================================================

export interface ReadinessContextDimension {
  dimension: string;
  score: number;
  status: ReadinessStatus;
  reason: string;
  evidence: string[];
}

export interface ReadinessContextGap {
  title: string;
  severity: GapSeverity;
  area: string;
  whyItMatters: string;
}

export interface ReadinessContextPack {
  packId: PackId;
  packName: string;
  overallScore: number;
  grade: ScoreGrade;
  maturityLevel: number;
  dimensions: ReadinessContextDimension[];
  blockingIssues: ReadinessContextGap[];
  strengths: string[];
}

/**
 * The complete, privacy-safe payload sent to the AI for narrative synthesis.
 * NEVER includes source code, SOQL, file paths, PII, or unmasked org IDs.
 */
export interface FutureReadinessContext {
  generatedAt: string;
  orgProfile: {
    complexity: string;
    activeUsers: number;
    isHyperforce: boolean;
    edition: string;
  };
  overall: { score: number; grade: ScoreGrade };
  packs: ReadinessContextPack[];
  roadmap: RoadmapPhase[];
  historical: ReadinessTrend[];
}
