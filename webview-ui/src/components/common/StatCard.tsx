interface Props {
  icon?: string;
  value: string | number;
  label: string;
  sub?: string;
  accent?: string; // Tailwind text color class, e.g. "text-score-good"
}

export default function StatCard({ icon, value, label, sub, accent }: Props) {
  return (
    <div className="flex flex-col gap-1 p-4 rounded-lg border border-sf-border bg-sf-bg-2 backdrop-blur-[8px]">
      {icon && <span className="text-lg mb-1">{icon}</span>}
      <span className={`text-2xl font-bold tabular-nums ${accent ?? 'text-sf-text'}`}>
        {value}
      </span>
      <span className="text-xs text-sf-muted">{label}</span>
      {sub && <span className="text-[10px] text-sf-muted/70">{sub}</span>}
    </div>
  );
}
