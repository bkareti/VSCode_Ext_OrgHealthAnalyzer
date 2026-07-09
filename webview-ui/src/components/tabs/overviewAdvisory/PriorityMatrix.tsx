import { GlassCard, SampleMark } from '@/components/common';
import type { PriorityQuadrant } from './sampleData';

const QUADRANT_STYLE: Record<PriorityQuadrant['id'], string> = {
  'do-first':       'bg-score-good/15 border-score-good/30',
  'strategic-bets': 'bg-sf-accent/15 border-sf-accent/30',
  'quick-wins':     'bg-amber-500/15 border-amber-500/30',
  'consider-later': 'bg-sf-bg-3 border-sf-border',
};

/** 2x2 investment quadrant grid — distinct from RiskMatrix's 3x3 likelihood/impact grid. */
export default function PriorityMatrix({ quadrants }: { quadrants: PriorityQuadrant[] }) {
  const byId = new Map(quadrants.map((q) => [q.id, q]));
  const order: PriorityQuadrant['id'][] = ['do-first', 'strategic-bets', 'quick-wins', 'consider-later'];

  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Investment Priority Matrix</h3>
        <SampleMark />
      </div>
      <div className="flex gap-2">
        <span className="shrink-0 flex flex-col items-center justify-center text-[9px] text-sf-muted uppercase tracking-wide rotate-180 [writing-mode:vertical-lr]">
          High Impact ↔ Low Impact
        </span>
        <div className="flex-1">
          <div className="grid grid-cols-2 gap-1.5">
            {order.map((id) => {
              const q = byId.get(id);
              if (!q) return null;
              return (
                <div key={id} className={`min-h-[64px] rounded border p-2 ${QUADRANT_STYLE[id]}`}>
                  <p className="text-[11px] font-semibold text-sf-text">{q.label}</p>
                  <p className="text-[9px] text-sf-muted leading-snug">{q.sub}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-center text-[9px] tracking-wider text-sf-muted uppercase">
            Low Effort ↔ High Effort
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
