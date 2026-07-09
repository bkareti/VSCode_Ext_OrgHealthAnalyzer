import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import SampleMark from '@/components/common/SampleMark';
import { DonutWithLegend } from '@/components/charts';
import { COMPLIANCE_SAMPLE } from './sampleData';

export default function ComplianceTab() {
  const data = [
    { name: 'Compliant',     value: COMPLIANCE_SAMPLE.compliantPct,    color: '#22c55e' },
    { name: 'Warning',       value: COMPLIANCE_SAMPLE.warningPct,      color: '#f59e0b' },
    { name: 'Non-Compliant', value: COMPLIANCE_SAMPLE.nonCompliantPct, color: '#ef4444' },
  ];

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-xs font-semibold text-sf-text">Compliance Score</h3>
          <SampleMark note="No compliance framework/scoring exists in OrgPulse yet — this is illustrative only." />
        </div>
        <DonutWithLegend
          data={data}
          height={180}
          centerLabel={`${COMPLIANCE_SAMPLE.score}%`}
          centerSubLabel="Compliant"
          valueFormatter={(n) => `${n}%`}
          showPercent={false}
        />
      </GlassCard>

      <GlassCard title="Compliance Breakdown">
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Compliant — {COMPLIANCE_SAMPLE.compliantPct}%</Badge>
          <Badge variant="warning">Warning — {COMPLIANCE_SAMPLE.warningPct}%</Badge>
          <Badge variant="error">Non-Compliant — {COMPLIANCE_SAMPLE.nonCompliantPct}%</Badge>
        </div>
        <p className="text-[11px] text-sf-muted mt-3">
          OrgPulse doesn't map org configuration to a specific compliance framework (SOC 2, GDPR, HIPAA, etc.) today.
          This panel is a placeholder for a future dedicated compliance assessment.
        </p>
      </GlassCard>
    </div>
  );
}
