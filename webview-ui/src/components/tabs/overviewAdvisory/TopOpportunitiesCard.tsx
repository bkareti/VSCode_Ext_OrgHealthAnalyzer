import { Badge, GlassCard, SampleMark } from '@/components/common';
import RankedListItem from './RankedListItem';
import type { OpportunityItem } from './sampleData';

const IMPACT_VARIANT: Record<OpportunityItem['impact'], 'error' | 'warning'> = {
  High: 'error',
  Medium: 'warning',
};

const EFFORT_VARIANT: Record<OpportunityItem['effort'], 'error' | 'warning' | 'success'> = {
  High: 'error',
  Medium: 'warning',
  Low: 'success',
};

const INDEX_COLOR = 'bg-score-good/15 text-score-good';

export default function TopOpportunitiesCard({
  opportunities,
}: {
  opportunities: OpportunityItem[];
}) {
  return (
    <GlassCard>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-sf-text">Top Opportunities (High Impact)</h3>
          <SampleMark />
        </div>
        <span className="cursor-default text-[10px] text-sf-accent hover:underline">
          View all opportunities →
        </span>
      </div>
      <div className="mb-0.5 flex items-center gap-3">
        <span className="w-5 shrink-0" />
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-3">
          <div className="w-16 text-center text-[9px] tracking-wide text-sf-muted uppercase">
            Impact
          </div>
          <div className="w-16 text-center text-[9px] tracking-wide text-sf-muted uppercase">
            Effort
          </div>
        </div>
      </div>
      <ul>
        {opportunities.map((o, i) => (
          <RankedListItem
            key={o.title}
            index={i + 1}
            colorClass={INDEX_COLOR}
            title={o.title}
            description={o.description}
            rightColumns={[
              {
                label: 'Impact',
                value: <Badge variant={IMPACT_VARIANT[o.impact]}>{o.impact}</Badge>,
                colClassName: 'w-16',
              },
              {
                label: 'Effort',
                value: <Badge variant={EFFORT_VARIANT[o.effort]}>{o.effort}</Badge>,
                colClassName: 'w-16',
              },
            ]}
          />
        ))}
      </ul>
    </GlassCard>
  );
}
