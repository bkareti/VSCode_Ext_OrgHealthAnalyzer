import { GlassCard, ExpandableCard, Badge, Tooltip } from '@/components/common';
import type { SecurityImpact, SecurityRecommendationCard } from '@/types';

interface Props {
  cards: SecurityRecommendationCard[];
}

const IMPACT_VARIANT: Record<SecurityImpact, 'error' | 'warning' | 'info' | 'default'> = {
  High: 'error',
  Medium: 'warning',
  Low: 'info',
  Insight: 'default',
};

const ICON_BG_FALLBACK = 'rgba(139,92,246,.15)';

function fmt(n: number | string): string {
  return typeof n === 'number' ? n.toLocaleString() : n;
}

function RecommendationCard({ card }: { card: SecurityRecommendationCard }) {
  return (
    <ExpandableCard
      dense
      sample={card.sample}
      sampleNote={card.sample ? 'This recommendation is illustrative — the underlying metric isn\'t tracked by OrgPulse yet.' : undefined}
      summary={
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: ICON_BG_FALLBACK }}>
              {card.icon}
            </div>
            <Badge variant={IMPACT_VARIANT[card.impact]}>{card.impact === 'Insight' ? 'Insight' : `${card.impact} Impact`}</Badge>
          </div>
          <span className="text-[10px] font-semibold text-sf-text leading-tight">{card.title}</span>
          <span className="text-xl font-bold text-sf-text tabular-nums">{fmt(card.value)}</span>
          <span className="text-[11px] text-sf-muted leading-tight">{card.valueLabel}</span>
          <div className="pt-1.5 mt-0.5 border-t border-sf-border/50">
            <span className="text-[10px] text-sf-muted block">{card.detailLabel}</span>
            {card.detailValue && <span className="text-xs font-semibold text-sf-text">{card.detailValue}</span>}
          </div>
        </div>
      }
    />
  );
}

export default function SecurityRecommendations({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">AI Security Recommendations</h3>
        <Tooltip content="Card values are computed deterministically by OrgPulse from detected issues and collected org signals — nothing here is AI-generated.">
          <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
        </Tooltip>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {cards.map((card) => (
          <RecommendationCard key={card.id} card={card} />
        ))}
      </div>
    </GlassCard>
  );
}
