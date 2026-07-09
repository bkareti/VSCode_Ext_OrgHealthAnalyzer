import { GlassCard, SampleMark, Badge } from '@/components/common';
import { QUICK_WINS } from './sampleData';

const SAMPLE_NOTE = 'These cleanup opportunities are illustrative — OrgPulse does not yet scan for stale files, debug logs, or unused reports on this tab.';

export default function QuickWinsCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Quick Wins (Cleanup Opportunities)</h3>
        <SampleMark note={SAMPLE_NOTE} />
      </div>
      <ul className="space-y-1.5">
        {QUICK_WINS.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-2 text-xs py-1 border-b border-sf-border/30 last:border-0">
            <div className="flex items-start gap-1.5 min-w-0">
              <span className="text-score-good shrink-0 mt-0.5">✓</span>
              <div className="min-w-0">
                <p className="text-sf-text text-[11px] leading-snug">{item.title}</p>
                <p className="text-sf-muted text-[10px] leading-snug">{item.savingsLabel}</p>
              </div>
            </div>
            <Badge variant={item.priority === 'High' ? 'warning' : 'info'} className="shrink-0">{item.priority}</Badge>
          </li>
        ))}
      </ul>
      <span className="text-[10px] text-sf-accent/70 mt-2 block cursor-default">View all quick wins →</span>
    </GlassCard>
  );
}
