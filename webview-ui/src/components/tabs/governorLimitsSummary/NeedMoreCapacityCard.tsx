import { GlassCard } from '@/components/common';
import { NEED_MORE_CAPACITY_TIPS } from './sampleData';

export default function NeedMoreCapacityCard() {
  return (
    <GlassCard title="Need More Capacity?">
      <ul className="space-y-2">
        {NEED_MORE_CAPACITY_TIPS.map((tip) => (
          <li key={tip.title} className="text-xs py-1 border-b border-sf-border/30 last:border-0">
            <p className="text-sf-text font-medium text-[11px]">{tip.title}</p>
            <p className="text-sf-muted text-[10px] leading-snug">{tip.description}</p>
          </li>
        ))}
      </ul>
      <span className="text-[10px] text-sf-accent/70 mt-2 block cursor-default">View capacity planning guide →</span>
    </GlassCard>
  );
}
