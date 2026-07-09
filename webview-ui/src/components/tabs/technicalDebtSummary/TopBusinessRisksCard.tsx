import { GlassCard, Badge, SampleMark } from '@/components/common';
import { TOP_BUSINESS_RISKS, type BusinessRisk } from './sampleData';

const LEVEL_VARIANT: Record<BusinessRisk['level'], 'error' | 'warning' | 'success'> = {
  High: 'error',
  Medium: 'warning',
  Low: 'success',
};

export default function TopBusinessRisksCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Top Business Risks</h3>
        <SampleMark note="Business-risk ratings are illustrative — OrgPulse does not yet derive business risk from technical debt." />
      </div>
      <ul className="space-y-1.5">
        {TOP_BUSINESS_RISKS.map((risk) => (
          <li key={risk.label} className="flex items-center justify-between gap-2 text-xs py-0.5">
            <span className="text-sf-text">{risk.label}</span>
            <Badge variant={LEVEL_VARIANT[risk.level]}>{risk.level}</Badge>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
