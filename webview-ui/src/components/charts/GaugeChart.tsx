interface Props {
  score: number;        // 0–100
  size?: number;        // px, default 200
  stroke?: number;      // arc width, default 18
  statusLabel?: string; // e.g. "Moderate Health"
  delta?: number;       // ±pts vs previous scan
}

// Five colored bands across the 180° sweep (red → orange → yellow → lime → green)
const BANDS = [
  { start: 180, end: 216, color: '#ef4444' },
  { start: 216, end: 252, color: '#f97316' },
  { start: 252, end: 288, color: '#eab308' },
  { start: 288, end: 324, color: '#84cc16' },
  { start: 324, end: 360, color: '#22c55e' },
];

const SCORE_COLOR = (s: number) =>
  s >= 90 ? '#22c55e' : s >= 75 ? '#84cc16' : s >= 50 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export default function GaugeChart({ score, size = 200, stroke = 18, statusLabel, delta }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = (size - stroke) / 2;

  const START_DEG = 180;
  const END_DEG   = 360;
  const fillEnd   = START_DEG + (score / 100) * 180;

  const color = SCORE_COLOR(score);
  const deltaColor = delta === undefined ? '' : delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#6b7280';
  const deltaArrow = delta === undefined ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '→';

  // Visible height: crop the bottom half of the SVG circle
  const visH = size / 2 + stroke / 2 + 8;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <div className="relative" style={{ width: size, height: visH }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible' }}
        >
          {/* Rainbow band segments — always fully visible as background track */}
          {BANDS.map((band) => (
            <path
              key={band.start}
              d={arcPath(cx, cy, r, band.start, band.end - 0.5)}
              fill="none"
              stroke={band.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
            />
          ))}

          {/* Dark overlay dims the "not-yet-reached" portion */}
          {fillEnd < END_DEG - 1 && (
            <path
              d={arcPath(cx, cy, r, fillEnd, END_DEG)}
              fill="none"
              stroke="rgba(0,0,0,0.58)"
              strokeWidth={stroke}
              strokeLinecap="butt"
              style={{ transition: 'all 0.8s cubic-bezier(0.4,0,0.2,1)' }}
            />
          )}

          {/* Thin end-cap dots to clean up band joins */}
          <circle cx={polarToCartesian(cx, cy, r, START_DEG).x} cy={polarToCartesian(cx, cy, r, START_DEG).y} r={stroke / 2} fill="#ef4444" />
          <circle cx={polarToCartesian(cx, cy, r, END_DEG).x}   cy={polarToCartesian(cx, cy, r, END_DEG).y}   r={stroke / 2} fill="#22c55e" />
        </svg>

        {/* Centered score overlay */}
        <div
          className="absolute flex flex-col items-center justify-end"
          style={{ inset: 0, paddingBottom: 2 }}
        >
          <span className="text-3xl font-bold tabular-nums leading-none" style={{ color }}>
            {Math.round(score)}
          </span>
          <span className="text-[11px] text-sf-muted mt-0.5">/100</span>
        </div>
      </div>

      {/* Labels below the arc */}
      <div className="flex flex-col items-center gap-0.5 mt-1">
        {statusLabel && (
          <span className="text-xs font-semibold" style={{ color }}>{statusLabel}</span>
        )}
        {delta !== undefined && (
          <span className="text-[11px]" style={{ color: deltaColor }}>
            {deltaArrow} {Math.abs(delta)} pts vs last scan
          </span>
        )}
      </div>
    </div>
  );
}
