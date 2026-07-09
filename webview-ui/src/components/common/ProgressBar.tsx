import { usageBand } from '@/constants/scoring';

interface Props {
  /** 0-100. Pre-clamped by the caller if it can exceed 100. */
  pct: number;
  /** Overrides the usageBand-derived color. */
  color?: string;
  height?: 'xs' | 'sm';
}

const HEIGHT_CLASS: Record<NonNullable<Props['height']>, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
};

// Shared thin capacity/progress bar — generalizes the h-1 rounded-full
// bg-sf-bg-3 + inline-width fill idiom duplicated inline in PerfLimits.tsx's
// SimBar, OrgInfo.tsx, and Overview.tsx.
export default function ProgressBar({ pct, color, height = 'xs' }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = color ?? usageBand(pct).hex;
  return (
    <div className={`${HEIGHT_CLASS[height]} rounded-full bg-sf-bg-3 overflow-hidden`}>
      <div className="h-full rounded-full" style={{ width: `${clamped}%`, background: fill }} />
    </div>
  );
}
