import SparklineChart from './SparklineChart';

interface Props {
  label: string;
  score: number;
  icon?: string;
  delta?: number;                   // ±pts vs previous scan
  sparklineData?: { value: number }[];
  onClick?: () => void;
}

const scoreColor = (s: number) =>
  s >= 90 ? '#22c55e' : s >= 75 ? '#84cc16' : s >= 50 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';

const scoreGrade = (s: number) =>
  s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 50 ? 'C' : s >= 25 ? 'D' : 'F';

const statusLabel = (s: number) =>
  s >= 90 ? 'Excellent' : s >= 75 ? 'Good' : s >= 50 ? 'Needs Attention' : s >= 25 ? 'Poor' : 'Critical';

export default function CategoryScoreCard({ label, score, icon, delta, sparklineData, onClick }: Props) {
  const color = scoreColor(score);
  const grade = scoreGrade(score);

  const deltaColor = delta === undefined ? '' : delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#6b7280';
  const deltaArrow = delta === undefined ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 p-3 rounded-lg border border-sf-border bg-sf-bg-2 hover:border-sf-accent hover:-translate-y-0.5 transition-all text-left w-full"
    >
      {/* Header: icon + label + grade */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-sm">{icon}</span>}
          <span className="text-[11px] text-sf-text font-medium leading-tight">{label}</span>
        </div>
        <span className="text-sm font-bold" style={{ color }}>{grade}</span>
      </div>

      {/* Score number + delta indicator */}
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-lg font-bold tabular-nums leading-none" style={{ color }}>
          {Math.round(score)}<span className="text-[10px] text-sf-muted font-normal">/100</span>
        </span>
        {delta !== undefined && (
          <span className="text-[10px] tabular-nums" style={{ color: deltaColor }}>
            {deltaArrow} {Math.abs(delta)} pts
          </span>
        )}
      </div>

      {/* Status label */}
      <span className="text-[10px] text-sf-muted">{statusLabel(score)}</span>

      {/* Inline sparkline */}
      {sparklineData && sparklineData.length >= 2 && (
        <SparklineChart data={sparklineData} color={color} height={28} showDots={false} />
      )}
    </button>
  );
}
