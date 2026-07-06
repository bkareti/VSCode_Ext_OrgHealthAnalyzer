/**
 * Service contracts for the Assessment Context Engine.
 * All sub-services implement these interfaces, enabling testability via mock substitution.
 */

import { Issue, AnalysisResult } from '../../types';
import {
  AssessmentContext,
  NormalizedFindingGroup,
  ScoredDimension,
  QuickWin,
  BusinessContext,
  TrendAnalysis,
} from '../../types/assessmentContext';

/** Deep-sanitizes a value, returning a new copy with all PII replaced. */
export interface IPiiSanitizer {
  /** Recursively deep-clones `value`, replacing PII in all string leaves. Handles circular refs. */
  sanitize<T>(value: T): T;
  /** Applies all PII replacement patterns to a single string. */
  sanitizeString(value: string): string;
}

/** Maps Issue[] to NormalizedFindingGroup[] grouped by domain. */
export interface IFindingNormalizer {
  /** Normalizes raw issues into domain-grouped, PII-free findings. Never includes file paths or source code. */
  normalize(issues: Issue[], sanitizer: IPiiSanitizer): NormalizedFindingGroup[];
}

/**
 * Produces scored dimensions from AnalysisResult.
 * IMPORTANT: reads result.scores for the 7 original dimensions — never recalculates from issues.
 * AI must receive and use these scores verbatim.
 */
export interface IScoreCalculator {
  calculate(result: AnalysisResult): ScoredDimension[];
}

/** Compares current vs previous AnalysisResult to produce structured trend data (no narrative). */
export interface ITrendAnalyzer {
  analyze(current: AnalysisResult, previous?: AnalysisResult): TrendAnalysis;
}

/** Identifies actionable quick wins from rich payloads on AnalysisResult. */
export interface IQuickWinEngine {
  /** Returns quick wins sorted by priority (High → Medium → Low). */
  identify(result: AnalysisResult, sanitizer: IPiiSanitizer): QuickWin[];
}

/** Infers business/org complexity from structural metrics — no narrative, pure thresholds. */
export interface IBusinessContextEngine {
  infer(result: AnalysisResult): BusinessContext;
}

/** Enforces a token budget by truncating/aggregating large arrays in the context. */
export interface IPayloadOptimizer {
  /** Returns a new AssessmentContext with arrays truncated to fit `budgetTokens`. */
  optimize(context: AssessmentContext, budgetTokens?: number): AssessmentContext;
  /** Estimates token count using the 4-chars-per-token approximation. */
  estimateTokens(value: unknown): number;
}

/** Orchestrates all 7 sub-services to produce the final AssessmentContext. */
export interface IAssessmentContextBuilder {
  build(snapshot: AnalysisResult, previousSnapshot?: AnalysisResult): AssessmentContext;
}

/** Main public interface for the Assessment Context Engine. */
export interface IAssessmentContextService {
  build(snapshot: AnalysisResult, previousSnapshot?: AnalysisResult): AssessmentContext;
  toJson(context: AssessmentContext): string;
  estimateTokenCount(context: AssessmentContext): number;
}
