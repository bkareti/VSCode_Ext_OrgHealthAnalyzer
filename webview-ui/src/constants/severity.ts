import type { Severity } from '@/types';

export const SEV_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export const SEV_COLOR: Record<Severity, string> = {
  error:   'var(--color-sev-error)',
  warning: 'var(--color-sev-warning)',
  info:    'var(--color-sev-info)',
};

export const SEV_LABEL: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

export const SEV_CLASS: Record<Severity, string> = {
  error:   'bg-sev-error/15   text-sev-error   border-sev-error/30',
  warning: 'bg-sev-warning/15 text-sev-warning border-sev-warning/30',
  info:    'bg-sev-info/15    text-sev-info    border-sev-info/30',
};

export const SCORE_THRESHOLDS = {
  EXCELLENT: 90,
  GOOD:      75,
  FAIR:      60,
  POOR:      40,
} as const;

export const PAGE_SIZE = 10;
