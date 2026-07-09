import { Badge, GlassCard, SampleMark } from '@/components/common';
import type { RiskLevelItem } from './sampleData';

const LEVEL_VARIANT: Record<RiskLevelItem['level'], 'success' | 'warning' | 'error'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'error',
};

export default function BusinessRiskSummaryCard({ risks }: { risks: RiskLevelItem[] }) {
  return (
    <GlassCard className="flex-1 min-w-64">
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Business Risk Summary</h3>
        <SampleMark />
      </div>
      <ul className="space-y-1.5">
        {risks.map((r) => (
          <li key={r.label} className="flex items-center justify-between text-[11px] text-sf-text">
            {r.label}
            <Badge variant={LEVEL_VARIANT[r.level]}>{r.level}</Badge>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
