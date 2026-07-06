/**
 * Single source of truth for score bands, capacity-usage bands, and their
 * labels/colors. Every tab must use these helpers — do not define local
 * score thresholds or hex literals in tab components.
 *
 * Scores (0–100, higher = better):   90 Excellent · 75 Good · 50 Fair · 25 Poor · else Critical
 * Usage  (0–100 %, higher = worse):  <50 OK · ≥50 Watch · ≥75 Warning · ≥90 Critical
 */

export interface ScoreBand {
  min: number;
  label: string;
  /** Tailwind text-color class (theme token) */
  text: string;
  /** Hex for chart libraries (recharts) only */
  hex: string;
}

export const SCORE_BANDS: ScoreBand[] = [
  { min: 90, label: 'Excellent', text: 'text-score-excellent', hex: '#22c55e' },
  { min: 75, label: 'Good',      text: 'text-score-good',      hex: '#84cc16' },
  { min: 50, label: 'Fair',      text: 'text-score-fair',      hex: '#eab308' },
  { min: 25, label: 'Poor',      text: 'text-score-poor',      hex: '#f97316' },
  { min: 0,  label: 'Critical',  text: 'text-score-critical',  hex: '#ef4444' },
];

export function scoreBand(score: number): ScoreBand {
  return SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export const scoreLabel = (s: number): string => scoreBand(s).label;
export const scoreText  = (s: number): string => scoreBand(s).text;
export const scoreHex   = (s: number): string => scoreBand(s).hex;

// ── Capacity / limit usage (higher = worse) ─────────────────────────────────

export interface UsageBand {
  min: number;
  label: string;
  text: string;
  badge: string;
  hex: string;
}

export const USAGE_BANDS: UsageBand[] = [
  { min: 90, label: 'Critical', text: 'text-sev-error',   badge: 'bg-sev-error/15 text-sev-error',     hex: '#ef4444' },
  { min: 75, label: 'Warning',  text: 'text-score-poor',  badge: 'bg-score-poor/15 text-score-poor',   hex: '#f97316' },
  { min: 50, label: 'Watch',    text: 'text-score-fair',  badge: 'bg-score-fair/15 text-score-fair',   hex: '#eab308' },
  { min: 0,  label: 'OK',       text: 'text-score-good',  badge: 'bg-score-good/15 text-score-good',   hex: '#22c55e' },
];

export function usageBand(pct: number): UsageBand {
  return USAGE_BANDS.find((b) => pct >= b.min) ?? USAGE_BANDS[USAGE_BANDS.length - 1];
}

// ── Chart palette (recharts Cells) — keep in sync with DonutChart/HBarChart ──

export const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'];

// Delta formatting for score changes between scans
export const deltaText = (d: number): string => (d > 0 ? `+${d}` : `${d}`);
export const deltaColorText = (d: number): string =>
  d > 0 ? 'text-score-good' : d < 0 ? 'text-sev-error' : 'text-sf-muted';
