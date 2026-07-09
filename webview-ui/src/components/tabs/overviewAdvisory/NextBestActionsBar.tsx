import { GlassCard } from '@/components/common';
import { cn } from '@/lib/cn';
import { DisabledWithSoon } from './SoonBadge';
import type { NextBestAction } from './sampleData';

function ActionCard({ icon, title, subtitle, highlighted }: NextBestAction) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border bg-sf-bg-2 text-left min-w-40',
        highlighted ? 'border-sf-accent' : 'border-sf-border'
      )}
    >
      <span className="text-base shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-sf-text truncate">{title}</p>
        <p className="text-[9px] text-sf-muted truncate">{subtitle}</p>
      </div>
    </div>
  );
}

export default function NextBestActionsBar({ actions }: { actions: NextBestAction[] }) {
  return (
    <GlassCard className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-lg">🎯</span>
        <div>
          <p className="text-xs font-semibold text-sf-text">Next Best Actions</p>
          <p className="text-[10px] text-sf-muted">Choose an action below to get started.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {actions.map((a) => (
          <DisabledWithSoon key={a.title}>
            <ActionCard {...a} />
          </DisabledWithSoon>
        ))}
      </div>
    </GlassCard>
  );
}
