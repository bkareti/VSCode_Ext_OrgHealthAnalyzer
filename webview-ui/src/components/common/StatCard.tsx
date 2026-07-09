import SparklineChart from '@/components/charts/SparklineChart';
import SampleMark from './SampleMark';

interface Props {
  icon?: string;
  value: string | number;
  label: string;
  sub?: string;
  accent?: string; // Tailwind text color class, e.g. "text-score-good"
  /** Numeric change vs. the previous scan. Omit entirely to hide the delta row (default, unchanged behavior). */
  delta?: number;
  deltaLabel?: string;
  /** Which direction of change should render as "good" (score-good) vs "bad" (sev-error). Defaults to 'up' (higher is better). */
  deltaGoodDirection?: 'up' | 'down' | 'neutral';
  /** Renders a compact trend line under the value. Needs ≥2 real points — never pass fabricated data, unless `sample` is also set. */
  sparkline?: { value: number }[];
  sparklineColor?: string;
  /** True when delta/sparkline (or the value itself) is fabricated sample data — renders a SampleMark next to the label. */
  sample?: boolean;
  sampleNote?: string;
}

export default function StatCard({
  icon,
  value,
  label,
  sub,
  accent,
  delta,
  deltaLabel = 'vs last scan',
  deltaGoodDirection = 'up',
  sparkline,
  sparklineColor,
  sample,
  sampleNote,
}: Props) {
  const hasDelta = delta !== undefined;
  const isGood = hasDelta && deltaGoodDirection !== 'neutral' && (
    deltaGoodDirection === 'up' ? delta! > 0 : delta! < 0
  );
  const isBad = hasDelta && deltaGoodDirection !== 'neutral' && (
    deltaGoodDirection === 'up' ? delta! < 0 : delta! > 0
  );
  const deltaClass = isGood ? 'text-score-good' : isBad ? 'text-sev-error' : 'text-sf-muted';
  const arrow = hasDelta ? (delta! > 0 ? '▲' : delta! < 0 ? '▼' : '–') : '';

  return (
    <div className="flex flex-col gap-1 p-4 rounded-lg border border-sf-border bg-sf-bg-2 backdrop-blur-[8px]">
      {icon && <span className="text-lg mb-1">{icon}</span>}
      <span className={`text-2xl font-bold tabular-nums ${accent ?? 'text-sf-text'}`}>
        {value}
      </span>
      <span className="text-xs text-sf-muted flex items-center gap-1">
        {label}
        {sample && <SampleMark note={sampleNote} />}
      </span>
      {sub && <span className="text-[10px] text-sf-muted/70">{sub}</span>}
      {hasDelta && (
        <span className={`text-[10px] font-medium ${deltaClass}`}>
          {arrow} {Math.abs(delta!).toLocaleString()} {deltaLabel}
        </span>
      )}
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-1 -mx-1">
          <SparklineChart data={sparkline} color={sparklineColor ?? '#3b82f6'} height={28} />
        </div>
      )}
    </div>
  );
}
