interface Props {
  score: number;       // 0–100
  size?: number;       // px, default 120
  stroke?: number;     // ring width, default 10
  label?: string;
  grade?: string;
}

const SCORE_COLOR = (s: number) =>
  s >= 90 ? '#22c55e' : s >= 75 ? '#84cc16' : s >= 50 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';

export default function ScoreRing({ score, size = 120, stroke = 10, label, grade }: Props) {
  const r   = (size - stroke) / 2;
  const cx  = size / 2;
  const cy  = size / 2;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - score / 100);
  const color = SCORE_COLOR(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
          />
          {/* Fill */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={fill}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>

        {/* Centre text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums" style={{ color }}>{Math.round(score)}</span>
          {grade && <span className="text-xs font-semibold text-sf-muted">{grade}</span>}
        </div>
      </div>
      {label && <span className="text-[11px] text-sf-muted text-center">{label}</span>}
    </div>
  );
}
