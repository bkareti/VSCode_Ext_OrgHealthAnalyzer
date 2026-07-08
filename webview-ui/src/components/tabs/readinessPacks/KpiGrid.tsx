import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import type { ReadinessPackAssessment } from '@/types';
import { kpiSignals, impactFor, IMPACT_TEXT_CLASS } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

/** Curated highest-impact signals shown as compact tiles — real score + real evidence, no invented numbers. */
export default function KpiGrid({ pack }: Props) {
  const signals = kpiSignals(pack, 6);
  if (signals.length === 0) { return null; }

  return (
    <GlassCard>
      <h3 className="text-xs font-semibold text-sf-text mb-3">Key Readiness Signals</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {signals.map((s) => (
          <StatCard
            key={s.id}
            label={s.label ?? s.id}
            value={`${s.score}/100`}
            sub={s.evidence[0]}
            accent={IMPACT_TEXT_CLASS[impactFor(s)]}
          />
        ))}
      </div>
      <p className="mt-3 text-[10px] text-sf-muted">
        Signals are calculated from your live org data and indicate readiness in this capability.
      </p>
    </GlassCard>
  );
}
