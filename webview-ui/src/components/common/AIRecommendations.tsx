import { GlassCard, ExpandableCard, Badge, Tooltip } from '@/components/common';

export type RecommendationImpact = 'High' | 'Medium' | 'Low';

export interface RecommendationCardData {
  id: string;
  icon: string;
  title: string;
  impact: RecommendationImpact;
  description: string;
  detailLabel?: string;
  detailValue?: string;
  /** True when this card is fabricated sample data — renders a SampleMark. */
  sample?: boolean;
}

interface Props {
  title?: string;
  infoTooltip?: string;
  cards: RecommendationCardData[];
  className?: string;
}

const IMPACT_VARIANT: Record<RecommendationImpact, 'error' | 'warning' | 'info'> = {
  High: 'error',
  Medium: 'warning',
  Low: 'info',
};

const ICON_BG = 'rgba(59,130,246,.15)';

function RecommendationCard({ card }: { card: RecommendationCardData }) {
  return (
    <ExpandableCard
      dense
      sample={card.sample}
      expandLabel="View recommendation"
      summary={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: ICON_BG }}>
              {card.icon}
            </div>
            <Badge variant={IMPACT_VARIANT[card.impact]}>{card.impact} Impact</Badge>
          </div>
          <span className="text-[11px] font-semibold text-sf-text leading-tight">{card.title}</span>
          <span className="text-[11px] text-sf-muted leading-relaxed">{card.description}</span>
          {card.detailLabel && card.detailValue && (
            <div className="pt-1.5 mt-0.5 border-t border-sf-border/50">
              <span className="text-[10px] text-sf-muted block">{card.detailLabel}</span>
              <span className="text-xs font-semibold text-sf-text">{card.detailValue}</span>
            </div>
          )}
        </div>
      }
      details={<p className="text-[11px] text-sf-text-2 leading-relaxed">{card.description}</p>}
    />
  );
}

/**
 * Generic "AI Insights & Recommendations" card grid: icon, impact badge, title,
 * description, and a detail metric line, each expandable to a "View recommendation"
 * affordance. Shared across dashboard tabs — pass tab-specific cards as data.
 */
export default function AIRecommendations({ title = 'AI Insights & Recommendations', infoTooltip, cards, className }: Props) {
  if (cards.length === 0) return null;

  return (
    <GlassCard className={className}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
        {infoTooltip && (
          <Tooltip content={infoTooltip}>
            <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
          </Tooltip>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((card) => (
          <RecommendationCard key={card.id} card={card} />
        ))}
      </div>
    </GlassCard>
  );
}
