import { Issue } from '../../../types';
import { ReadinessCheckOutcome, ReadinessInput } from '../interfaces';

export function getIssues(input: ReadinessInput): Issue[] {
  return input.result.issues ?? [];
}

export function countIssues(input: ReadinessInput, pred: (i: Issue) => boolean): number {
  return getIssues(input).filter(pred).length;
}

function clamp(n: number): number {
  if (Number.isNaN(n)) { return 0; }
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function statusFromScore(score: number): 'ready' | 'partial' | 'blocked' {
  if (score >= 80) { return 'ready'; }
  if (score >= 50) { return 'partial'; }
  return 'blocked';
}

/** Build a scored outcome; status is derived from the score band. */
export function outcome(score: number, evidence: string[], recommendation?: string): ReadinessCheckOutcome {
  const s = clamp(score);
  return { status: statusFromScore(s), score: s, evidence, recommendation };
}

/** A 'not applicable' outcome — the required metadata was unavailable. */
export function na(reason: string): ReadinessCheckOutcome {
  return { status: 'na', score: 0, evidence: [reason] };
}

/** Maps a "bad out of total" ratio to a 0-100 score (fewer bad → higher). */
export function inverseRatioScore(bad: number, total: number): number {
  if (total <= 0) { return 100; }
  return clamp(100 - (bad / total) * 100);
}

/** Maps a "good out of total" ratio to a score in [floor, 100]. */
export function coverageScore(good: number, total: number, floor = 40): number {
  if (total <= 0) { return floor; }
  return clamp(floor + (good / total) * (100 - floor));
}
