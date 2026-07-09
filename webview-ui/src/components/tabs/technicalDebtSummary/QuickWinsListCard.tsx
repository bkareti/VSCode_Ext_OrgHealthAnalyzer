import { GlassCard, Badge, SampleMark } from '@/components/common';
import { QUICK_WINS } from './sampleData';

const IMPACT_VARIANT = { High: 'error', Medium: 'warning', Low: 'success' } as const;

export default function QuickWinsListCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Quick Wins (High Impact, Low Effort)</h3>
        <SampleMark note="Quick-win items are illustrative — OrgPulse does not yet compute this specific cleanup list." />
      </div>
      <ul>
        {QUICK_WINS.map((w) => (
          <li key={w.title} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-sf-border/30 last:border-0">
            <span className="text-sf-text">{w.title}</span>
            <Badge variant={IMPACT_VARIANT[w.impact]}>{w.impact}</Badge>
          </li>
        ))}
      </ul>
      <span className="mt-2 inline-block text-[11px] font-semibold text-sf-accent cursor-default">
        View all quick wins →
      </span>
    </GlassCard>
  );
}
