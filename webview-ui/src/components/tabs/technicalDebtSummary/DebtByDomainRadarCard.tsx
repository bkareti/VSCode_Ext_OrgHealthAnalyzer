import { GlassCard, SampleMark } from '@/components/common';
import RadarChart from '@/components/charts/RadarChart';
import { DOMAIN_RADAR } from './sampleData';

export default function DebtByDomainRadarCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Debt by Domain (Score)</h3>
        <SampleMark note="Domain scores are illustrative — OrgPulse does not yet compute a per-domain debt score." />
      </div>
      <RadarChart data={DOMAIN_RADAR} color="#3b82f6" />
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View domain details →
      </span>
    </GlassCard>
  );
}
