import { useState } from 'react';
import { GlassCard, SampleMark, ProgressBar } from '@/components/common';
import SegmentedTabs from '@/components/common/SegmentedTabs';
import { CONSUMER_TABS, TOP_CONSUMERS, type ConsumerCategory } from './sampleData';

const SAMPLE_NOTE = 'Top-consumer breakdowns are illustrative — OrgPulse does not query per-user/per-app API call volume (no LoginHistory or usage-event tracking) today.';

export default function TopConsumersCard() {
  const [category, setCategory] = useState<ConsumerCategory>('apiUsers');
  const rows = TOP_CONSUMERS[category];

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-sf-text">Top Consumers (Today)</h3>
          <SampleMark note={SAMPLE_NOTE} />
        </div>
      </div>
      <div className="mb-3 overflow-x-auto">
        <SegmentedTabs items={CONSUMER_TABS} active={category} onChange={setCategory} variant="pill" size="sm" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-sf-border">
              <th className="text-left py-2 pr-3 text-sf-muted font-medium">Name</th>
              <th className="text-left py-2 px-2 text-sf-muted font-medium">Type</th>
              <th className="text-right py-2 px-2 text-sf-muted font-medium">Calls</th>
              <th className="text-left py-2 pl-2 text-sf-muted font-medium w-32">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors">
                <td className="py-1.5 pr-3 text-sf-text font-medium">{row.name}</td>
                <td className="py-1.5 px-2 text-sf-muted">{row.type}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-sf-text">{row.value.toLocaleString()}</td>
                <td className="py-1.5 pl-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><ProgressBar pct={row.pctOfTotal} /></div>
                    <span className="text-sf-muted tabular-nums w-8 text-right shrink-0">{row.pctOfTotal}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="text-[10px] text-sf-accent/70 mt-2 block cursor-default">View all API users →</span>
    </GlassCard>
  );
}
