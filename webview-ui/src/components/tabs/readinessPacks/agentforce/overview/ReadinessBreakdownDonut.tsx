import GlassCard from '@/components/common/GlassCard';
import DonutWithLegend from '@/components/charts/DonutWithLegend';
import type { ReadinessPackAssessment } from '@/types';
import { criticalGapCount, readinessStatusCounts, projectedScoreAfterFullRemediation } from '../derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

const STATUS_COLORS = { ready: '#22c55e', partial: '#eab308', blocked: '#ef4444', na: '#64748b' };

export default function ReadinessBreakdownDonut({ pack }: Props) {
  const counts = readinessStatusCounts(pack);
  const projected = projectedScoreAfterFullRemediation(pack);
  const gaps = criticalGapCount(pack);

  const data = [
    { name: 'Ready', value: counts.ready, color: STATUS_COLORS.ready },
    { name: 'Partially Ready', value: counts.partial, color: STATUS_COLORS.partial },
    { name: 'Not Ready', value: counts.blocked, color: STATUS_COLORS.blocked },
    { name: 'Not Applicable', value: counts.na, color: STATUS_COLORS.na },
  ].filter((d) => d.value > 0);

  return (
    <GlassCard title="Overall Readiness Breakdown">
      <DonutWithLegend
        data={data}
        height={140}
        layout="side"
        centerLabel={`${counts.total}`}
        centerSubLabel="Total Checks"
      />
      <p className="text-[11px] text-sf-muted mt-3 pt-2 border-t border-sf-border/50">
        Address the {gaps} critical gap{gaps === 1 ? '' : 's'} to improve your readiness from {pack.overallScore}% to
        an estimated {projected}%.
      </p>
    </GlassCard>
  );
}
