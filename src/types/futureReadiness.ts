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

export interface PlatformFeatureFlags {
  dataCloudEnabled: boolean;
  einsteinFeatures: string[];
  agentforceLicensed: boolean;
  enhancedDomainEnabled?: boolean;
  edition: string;
}

/** Bundle of new-collector outputs; every field is optional/best-effort. */
export interface ReadinessCollectorData {
  duplicateRules?: DuplicateRuleInfo[];
  matchingRules?: MatchingRuleInfo[];
  remoteSites?: RemoteSiteDetail[];
  certificates?: CertificateDetail[];
  platformFeatures?: PlatformFeatureFlags;
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
