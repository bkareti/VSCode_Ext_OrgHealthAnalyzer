/**
 * Service contracts for the Future Readiness engine.
 * Every component sits behind an interface so packs and the orchestrator can be
 * unit-tested with mock substitution (same pattern as the Assessment Context Engine).
 */

import { AnalysisResult } from '../../types';
import { QuickWin, ScoreGrade, ConfidenceLevel } from '../../types/assessmentContext';
import {
  PackId,
  ReadinessSignal,
  ReadinessStatus,
  ReadinessDimensionScore,
  ReadinessGap,
  ReadinessPackAssessment,
  FutureReadinessResult,
  FutureReadinessContext,
  ReadinessCollectorData,
  ReadinessTrend,
  RoadmapPhase,
  StrategicInitiative,
} from '../../types/futureReadiness';

/** The full input a pack evaluates: the main analysis result + minimal new-collector data. */
export interface ReadinessInput {
  result: AnalysisResult;
  collectors: ReadinessCollectorData;
}

/** The raw result of evaluating a single ReadinessCheck. */
export interface ReadinessCheckOutcome {
  status: ReadinessStatus;
  /** 0-100 for this check. Ignored when status is 'na'. */
  score: number;
  evidence: string[];
  recommendation?: string;
}

/** One deterministic readiness check. Never calls AI; pure function of the input. */
export interface ReadinessCheck {
  id: string;
  /** Display name of the sub-dimension this check rolls up into. */
  dimension: string;
  /** Relative weight of this check within its dimension. */
  weight: number;
  /** Short human-readable title for UI display, e.g. "Duplicate Rules on key objects". */
  label?: string;
  /** Evergreen, static one-sentence explanation shown regardless of pass/fail status. */
  whyItMatters?: string;
  evaluate(input: ReadinessInput): ReadinessCheckOutcome;
}

/** A readiness pack (AI/Agentforce, Data Cloud, Hyperforce, …). */
export interface IReadinessPack {
  readonly id: PackId;
  readonly name: string;
  readonly checks: ReadinessCheck[];
  assess(input: ReadinessInput): ReadinessPackAssessment;
}

/** Runs a pack's checks and produces signals. */
export interface IReadinessRuleEngine {
  run(pack: IReadinessPack, input: ReadinessInput): ReadinessSignal[];
}

export interface PackScore {
  score: number;
  grade: ScoreGrade;
  confidence: ConfidenceLevel;
  maturityLevel: 1 | 2 | 3 | 4 | 5;
}

/** Deterministic scoring. AI is never involved here. */
export interface IReadinessScoreCalculator {
  scoreDimensions(signals: ReadinessSignal[]): ReadinessDimensionScore[];
  packScore(dimensions: ReadinessDimensionScore[]): PackScore;
}

export interface IGapAnalyzer {
  analyze(packId: PackId, signals: ReadinessSignal[]): ReadinessGap[];
}

export interface IRecommendationEngine {
  quickWins(packId: PackId, signals: ReadinessSignal[]): QuickWin[];
  strategicInitiatives(gaps: ReadinessGap[]): StrategicInitiative[];
}

export interface IRoadmapBuilder {
  build(assessments: ReadinessPackAssessment[]): RoadmapPhase[];
}

export interface IEvidenceBuilder {
  /** Deduplicate, trim, and strip any residual PII/path-like content from evidence strings. */
  clean(evidence: string[]): string[];
}

/** A minimal persisted snapshot used for historical comparison. */
export interface FutureReadinessSnapshot {
  generatedAt: string;
  overall: number;
  packScores: Partial<Record<PackId, number>>;
}

/** Storage adapter for prior snapshots (globalState in production, in-memory in tests). */
export interface IReadinessSnapshotStore {
  load(): FutureReadinessSnapshot | undefined;
  save(snapshot: FutureReadinessSnapshot): void;
}

export interface IHistoricalComparisonService {
  /** Compares the current result to the last stored snapshot (empty when none). */
  compare(current: FutureReadinessResult): ReadinessTrend[];
  /** Persists the current result as the new snapshot. */
  record(current: FutureReadinessResult): void;
}

export interface IFutureReadinessService {
  /** Runs all packs deterministically and assembles the full result (no AI). */
  assess(input: ReadinessInput): FutureReadinessResult;
  /** Builds the privacy-safe AI context from a computed result + the source analysis. */
  buildContext(result: FutureReadinessResult, analysis: AnalysisResult): FutureReadinessContext;
}
