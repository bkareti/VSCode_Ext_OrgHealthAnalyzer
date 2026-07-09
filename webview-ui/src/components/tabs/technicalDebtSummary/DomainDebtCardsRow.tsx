import { GlassCard, SampleMark } from '@/components/common';
import { DOMAIN_BREAKDOWN, DOMAIN_COLOR, type DomainBreakdown } from './sampleData';

const DOT_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' } as const;

function DomainDebtCard({ d }: { d: DomainBreakdown }) {
  return (
    <div className="rounded-lg border border-sf-border bg-sf-bg-2 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOMAIN_COLOR[d.domain] }} />
        <span className="text-[11px] font-semibold text-sf-text truncate">{d.domain}</span>
      </div>
      <span className="text-xl font-bold text-sf-text tabular-nums">{d.total}</span>
      <div className="flex items-center gap-2 flex-wrap">
        {(['critical', 'high', 'medium', 'low'] as const).map((tier) => (
          <span key={tier} className="flex items-center gap-1 text-[10px] text-sf-muted tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DOT_COLOR[tier] }} />
            {d[tier]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DomainDebtCardsRow() {
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-sf-text">Debt by Domain</h3>
          <SampleMark note="Domain classification and severity breakdown are illustrative — OrgPulse does not yet track debt by domain." />
        </div>
        <span className="text-[11px] font-semibold text-sf-accent cursor-default">View all categories →</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {DOMAIN_BREAKDOWN.map((d) => (
          <DomainDebtCard key={d.domain} d={d} />
        ))}
      </div>
    </GlassCard>
  );
}
