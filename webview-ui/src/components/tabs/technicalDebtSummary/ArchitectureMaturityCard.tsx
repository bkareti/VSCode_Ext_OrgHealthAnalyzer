import { GlassCard, SampleMark } from '@/components/common';
import GaugeChart from '@/components/charts/GaugeChart';
import { ARCHITECTURE_MATURITY } from './sampleData';

export default function ArchitectureMaturityCard() {
  const pct = Math.round((ARCHITECTURE_MATURITY.level / ARCHITECTURE_MATURITY.levelsTotal) * 100);

  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Architecture Maturity</h3>
        <SampleMark note="Maturity level is illustrative — OrgPulse does not yet compute an architecture maturity model." />
      </div>
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <GaugeChart score={pct} size={90} stroke={10} />
        </div>
        <div>
          <p className="text-sm font-semibold text-sf-text">{ARCHITECTURE_MATURITY.label}</p>
          <p className="text-[11px] text-sf-muted">Level {ARCHITECTURE_MATURITY.level} of {ARCHITECTURE_MATURITY.levelsTotal}</p>
        </div>
      </div>
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View maturity assessment →
      </span>
    </GlassCard>
  );
}
