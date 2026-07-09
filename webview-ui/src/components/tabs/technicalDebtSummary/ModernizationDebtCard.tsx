import { GlassCard, ProgressBar, SampleMark } from '@/components/common';
import { MODERNIZATION_DEBT } from './sampleData';

export default function ModernizationDebtCard() {
  const max = Math.max(...MODERNIZATION_DEBT.map((m) => m.count));

  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Modernization Debt</h3>
        <SampleMark note="Legacy-technology inventory is illustrative — OrgPulse does not yet aggregate this breakdown." />
      </div>
      <ul className="space-y-2">
        {MODERNIZATION_DEBT.map((m) => (
          <li key={m.label} className="text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sf-text">{m.label}</span>
              <span className="text-sf-muted tabular-nums">{m.count}</span>
            </div>
            <ProgressBar pct={(m.count / max) * 100} color="#ef4444" />
          </li>
        ))}
      </ul>
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View modernization details →
      </span>
    </GlassCard>
  );
}
