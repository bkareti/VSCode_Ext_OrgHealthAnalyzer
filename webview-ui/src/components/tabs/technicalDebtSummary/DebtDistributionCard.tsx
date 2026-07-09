import { GlassCard, SampleMark } from '@/components/common';
import DonutWithLegend from '@/components/charts/DonutWithLegend';
import { DOMAIN_TOTALS, DOMAIN_COLOR, TOTAL_DEBT_ITEMS } from './sampleData';

export default function DebtDistributionCard() {
  const data = DOMAIN_TOTALS.map((d) => ({ name: d.domain, value: d.total, color: DOMAIN_COLOR[d.domain] }));

  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Debt Distribution by Domain</h3>
        <SampleMark note="Domain taxonomy is illustrative — OrgPulse does not yet classify debt items by domain." />
      </div>
      <DonutWithLegend
        data={data}
        centerLabel={TOTAL_DEBT_ITEMS.toLocaleString()}
        centerSubLabel="Total Debt Items"
      />
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View all domains →
      </span>
    </GlassCard>
  );
}
