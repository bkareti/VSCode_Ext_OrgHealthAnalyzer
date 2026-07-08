import { useMemo } from 'react';
import { useThemeStore } from '@/store/slices/themeStore';

export interface ChartTheme {
  text: string;
  textMuted: string;
  muted: string;
  border: string;
  bg2: string;
  bg3: string;
  accent: string;
  tooltipBg: string;
  chartColors: string[];
  scoreColors: { excellent: string; good: string; fair: string; poor: string; critical: string };
  severityColors: { error: string; warning: string; info: string };
}

const DARK_FALLBACK: ChartTheme = {
  text: '#cccccc',
  textMuted: '#9d9d9d',
  muted: '#6b6b6b',
  border: 'rgba(255,255,255,0.08)',
  bg2: '#252526',
  bg3: '#2d2d30',
  accent: '#007fd4',
  tooltipBg: '#252526',
  chartColors: ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'],
  scoreColors: { excellent: '#22c55e', good: '#84cc16', fair: '#eab308', poor: '#f97316', critical: '#ef4444' },
  severityColors: { error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' },
};

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') { return fallback; }
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Recharts renders `fill`/`stroke` as raw SVG presentation attributes rather
// than inline styles, so `var(--x)` references don't reliably resolve there.
// We resolve the literal color values here instead, and re-run on theme
// toggle since `getComputedStyle` is a point-in-time read.
export function useChartTheme(): ChartTheme {
  const theme = useThemeStore((s) => s.theme);

  return useMemo<ChartTheme>(() => ({
    text: cssVar('--color-sf-text', DARK_FALLBACK.text),
    textMuted: cssVar('--color-sf-text-2', DARK_FALLBACK.textMuted),
    muted: cssVar('--color-sf-muted', DARK_FALLBACK.muted),
    border: cssVar('--color-sf-border', DARK_FALLBACK.border),
    bg2: cssVar('--color-sf-bg-2', DARK_FALLBACK.bg2),
    bg3: cssVar('--color-sf-bg-3', DARK_FALLBACK.bg3),
    accent: cssVar('--color-sf-accent', DARK_FALLBACK.accent),
    tooltipBg: cssVar('--color-sf-bg-2', DARK_FALLBACK.tooltipBg),
    chartColors: [1, 2, 3, 4, 5, 6, 7].map((i) => cssVar(`--color-chart-${i}`, DARK_FALLBACK.chartColors[i - 1])),
    scoreColors: {
      excellent: cssVar('--color-score-excellent', DARK_FALLBACK.scoreColors.excellent),
      good: cssVar('--color-score-good', DARK_FALLBACK.scoreColors.good),
      fair: cssVar('--color-score-fair', DARK_FALLBACK.scoreColors.fair),
      poor: cssVar('--color-score-poor', DARK_FALLBACK.scoreColors.poor),
      critical: cssVar('--color-score-critical', DARK_FALLBACK.scoreColors.critical),
    },
    severityColors: {
      error: cssVar('--color-sev-error', DARK_FALLBACK.severityColors.error),
      warning: cssVar('--color-sev-warning', DARK_FALLBACK.severityColors.warning),
      info: cssVar('--color-sev-info', DARK_FALLBACK.severityColors.info),
    },
    // `theme` isn't read in this body — it's a re-render trigger so the
    // getComputedStyle reads above happen again after data-theme flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [theme]);
}
