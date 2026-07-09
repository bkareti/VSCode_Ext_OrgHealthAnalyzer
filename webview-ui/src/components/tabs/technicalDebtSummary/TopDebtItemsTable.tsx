import { GlassCard, Badge, SampleMark } from '@/components/common';
import { TOP_DEBT_ITEMS, DOMAIN_COLOR, type TopDebtItem } from './sampleData';

const SEVERITY_VARIANT: Record<TopDebtItem['severity'], 'error' | 'warning' | 'default'> = {
  Critical: 'error',
  High: 'warning',
  Medium: 'default',
};

const IMPACT_VARIANT: Record<TopDebtItem['impact'], 'error' | 'warning'> = {
  High: 'error',
  Medium: 'warning',
};

const EFFORT_VARIANT: Record<TopDebtItem['effort'], 'success' | 'warning' | 'error'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'error',
};

export default function TopDebtItemsTable() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Top Technical Debt Items</h3>
        <SampleMark note="Domain/Severity/Impact/Effort columns are illustrative — OrgPulse's real debt items don't carry this classification yet." />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-sf-border">
              <th className="text-left py-1.5 pr-2 text-sf-muted font-medium">#</th>
              <th className="text-left py-1.5 px-2 text-sf-muted font-medium">Issue</th>
              <th className="text-left py-1.5 px-2 text-sf-muted font-medium">Domain</th>
              <th className="text-center py-1.5 px-2 text-sf-muted font-medium">Severity</th>
              <th className="text-center py-1.5 px-2 text-sf-muted font-medium">Impact</th>
              <th className="text-center py-1.5 px-2 text-sf-muted font-medium">Effort</th>
              <th className="text-right py-1.5 px-2 text-sf-muted font-medium">Instances</th>
              <th className="text-right py-1.5 pl-2 text-sf-muted font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {TOP_DEBT_ITEMS.map((item, i) => (
              <tr key={item.issue} className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors">
                <td className="py-1.5 pr-2 text-sf-muted tabular-nums">{i + 1}</td>
                <td className="py-1.5 px-2 text-sf-text font-medium truncate max-w-48">{item.issue}</td>
                <td className="py-1.5 px-2 text-sf-muted">
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DOMAIN_COLOR[item.domain] }} />
                    {item.domain}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center"><Badge variant={SEVERITY_VARIANT[item.severity]}>{item.severity}</Badge></td>
                <td className="py-1.5 px-2 text-center"><Badge variant={IMPACT_VARIANT[item.impact]}>{item.impact}</Badge></td>
                <td className="py-1.5 px-2 text-center"><Badge variant={EFFORT_VARIANT[item.effort]}>{item.effort}</Badge></td>
                <td className="py-1.5 px-2 text-right text-sf-text tabular-nums">{item.instances}</td>
                <td className="py-1.5 pl-2 text-right">
                  <span className="text-[11px] font-semibold text-sf-accent cursor-default">View</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View all technical debt items →
      </span>
    </GlassCard>
  );
}
