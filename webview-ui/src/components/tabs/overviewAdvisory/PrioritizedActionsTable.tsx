import { Badge, GlassCard, SampleMark } from '@/components/common';
import type { ActionRow } from './sampleData';

const IMPACT_VARIANT: Record<ActionRow['impact'], 'error' | 'warning'> = {
  High: 'error',
  Medium: 'warning',
};

const EFFORT_VARIANT: Record<ActionRow['effort'], 'error' | 'warning' | 'success'> = {
  High: 'error',
  Medium: 'warning',
  Low: 'success',
};

export default function PrioritizedActionsTable({ actions }: { actions: ActionRow[] }) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-sf-text">AI Prioritized Actions (Top 8)</h3>
          <SampleMark />
        </div>
        <span className="text-[10px] text-sf-accent hover:underline cursor-default">View full list →</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] min-w-[560px]">
          <thead>
            <tr className="text-[9px] text-sf-muted uppercase tracking-wide">
              <th className="text-left font-medium pb-1.5">#</th>
              <th className="text-left font-medium pb-1.5">Action</th>
              <th className="text-left font-medium pb-1.5">Category</th>
              <th className="text-left font-medium pb-1.5">Impact</th>
              <th className="text-left font-medium pb-1.5">Effort</th>
              <th className="text-right font-medium pb-1.5">Score Gain</th>
              <th className="text-left font-medium pb-1.5">Target Date</th>
              <th className="text-left font-medium pb-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.rank} className="border-t border-sf-border/30">
                <td className="py-1.5 text-sf-muted tabular-nums">{a.rank}</td>
                <td className="py-1.5 text-sf-text">{a.action}</td>
                <td className="py-1.5 text-sf-muted">{a.category}</td>
                <td className="py-1.5"><Badge variant={IMPACT_VARIANT[a.impact]}>{a.impact}</Badge></td>
                <td className="py-1.5"><Badge variant={EFFORT_VARIANT[a.effort]}>{a.effort}</Badge></td>
                <td className="py-1.5 text-right text-score-good font-medium tabular-nums">+{a.scoreGain}</td>
                <td className="py-1.5 text-sf-muted whitespace-nowrap">{a.targetDate}</td>
                <td className="py-1.5"><Badge>{a.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
