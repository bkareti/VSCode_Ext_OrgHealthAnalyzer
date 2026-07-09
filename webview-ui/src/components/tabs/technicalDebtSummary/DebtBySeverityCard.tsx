import { GlassCard, SampleMark } from '@/components/common';
import ColumnChart from '@/components/charts/ColumnChart';
import { SEVERITY_TOTALS } from './sampleData';

export default function DebtBySeverityCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Debt by Severity</h3>
        <SampleMark note="Severity tiers are illustrative — OrgPulse does not yet assign Critical/High/Medium/Low severity to debt items." />
      </div>
      <ColumnChart data={SEVERITY_TOTALS} multiColor />
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View all debt by severity →
      </span>
    </GlassCard>
  );
}
