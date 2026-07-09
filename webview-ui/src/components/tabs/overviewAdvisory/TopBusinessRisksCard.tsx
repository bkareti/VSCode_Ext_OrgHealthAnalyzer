import { Badge, GlassCard, SampleMark } from '@/components/common';
import RankedListItem from './RankedListItem';
import type { RiskItem } from './sampleData';

const IMPACT_VARIANT: Record<RiskItem['impact'], 'error' | 'warning'> = {
  High: 'error',
  Medium: 'warning',
};

const TREND_COLOR: Record<RiskItem['trend'], string> = {
  Worsening: 'text-sev-error',
  'No Change': 'text-sf-muted',
  'Slightly Improving': 'text-score-good',
};

const INDEX_COLOR = 'bg-sev-error/15 text-sev-error';

export default function TopBusinessRisksCard({ risks }: { risks: RiskItem[] }) {
  return (
    <GlassCard>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-sf-text">Top Business Risks (Must Address)</h3>
          <SampleMark />
        </div>
        <span className="cursor-default text-[10px] text-sf-accent hover:underline">
          View all risks →
        </span>
      </div>
      <div className="mb-0.5 flex items-center gap-3">
        <span className="w-5 shrink-0" />
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-3">
          <div className="w-16 text-center text-[9px] tracking-wide text-sf-muted uppercase">
            Impact
          </div>
          <div className="w-28 text-center text-[9px] tracking-wide text-sf-muted uppercase">
            Trend
          </div>
        </div>
      </div>
      <ul>
        {risks.map((r, i) => (
          <RankedListItem
            key={r.title}
            index={i + 1}
            colorClass={INDEX_COLOR}
            title={r.title}
            description={r.description}
            rightColumns={[
              {
                label: 'Impact',
                value: <Badge variant={IMPACT_VARIANT[r.impact]}>{r.impact}</Badge>,
                colClassName: 'w-16',
              },
              {
                label: 'Trend',
                value: (
                  <span className={`text-[10px] font-medium ${TREND_COLOR[r.trend]}`}>
                    {r.trend}
                  </span>
                ),
                colClassName: 'w-28',
              },
            ]}
          />
        ))}
      </ul>
    </GlassCard>
  );
}
