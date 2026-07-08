type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface Props {
  label: string;
  used: number;
  total: number;
  unit?: string;
}

const RISK = (pct: number): RiskLevel =>
  pct >= 90 ? 'critical' : pct >= 75 ? 'high' : pct >= 50 ? 'medium' : 'low';

const RISK_COLOR: Record<RiskLevel, string> = {
  low:      '#22c55e',
  medium:   '#eab308',
  high:     '#f97316',
  critical: '#ef4444',
};

const RISK_BADGE: Record<RiskLevel, string> = {
  low:      'bg-score-good/15      text-score-good',
  medium:   'bg-score-fair/15     text-score-fair',
  high:     'bg-score-poor/15     text-score-poor',
  critical: 'bg-score-critical/15 text-score-critical',
};

export default function GovernorGauge({ label, used, total, unit = '' }: Props) {
  const pct   = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const risk  = RISK(pct);
  const color = RISK_COLOR[risk];
  const size  = 80;
  const stroke = 7;
  const r     = (size - stroke) / 2;
  const circ  = 2 * Math.PI * r;
  const fill  = circ * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-2 p-3 rounded-lg border border-sf-border bg-sf-bg-2">
      {/* Gauge */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={fill}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold tabular-nums" style={{ color }}>{Math.round(pct)}%</span>
        </div>
      </div>

      {/* Label + risk badge */}
      <div className="text-center space-y-1">
        <p className="text-[11px] text-sf-text font-medium">{label}</p>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${RISK_BADGE[risk]}`}>
          {risk.charAt(0).toUpperCase() + risk.slice(1)}
        </span>
        <p className="text-[10px] text-sf-muted tabular-nums">
          {used.toLocaleString()}{unit} / {total.toLocaleString()}{unit}
        </p>
      </div>
    </div>
  );
}
