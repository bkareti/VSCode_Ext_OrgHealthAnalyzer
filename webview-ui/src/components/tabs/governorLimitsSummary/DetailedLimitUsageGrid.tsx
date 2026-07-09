import { GlassCard } from '@/components/common';

export type LimitCategoryTarget = 'api' | 'storage' | 'apex' | 'messaging' | 'data';

const TILES: { label: string; icon: string; target: LimitCategoryTarget }[] = [
  { label: 'API Limits', icon: '🔌', target: 'api' },
  { label: 'Storage Limits', icon: '💾', target: 'storage' },
  { label: 'Async Limits', icon: '⚙️', target: 'apex' },
  { label: 'Email Limits', icon: '✉️', target: 'messaging' },
  { label: 'Event Limits', icon: '📡', target: 'messaging' },
  { label: 'Search Limits', icon: '🔍', target: 'api' },
  { label: 'Callout Limits', icon: '☎️', target: 'api' },
  { label: 'Other Limits', icon: '📋', target: 'data' },
];

interface Props {
  onJumpToCategory: (target: LimitCategoryTarget) => void;
}

// Maps the mockup's 8 illustrative tile labels onto this tab's existing 5
// category sub-tabs (api/storage/apex/messaging/data) — the closest matching
// CATEGORY_KEYWORDS group in GovernorLimits.tsx for each.
export default function DetailedLimitUsageGrid({ onJumpToCategory }: Props) {
  return (
    <GlassCard title="Detailed Limit Usage">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TILES.map((tile) => (
          <button
            key={tile.label}
            type="button"
            onClick={() => onJumpToCategory(tile.target)}
            className="flex flex-col items-start gap-1 p-3 rounded-lg border border-sf-border bg-sf-bg-2 hover:bg-sf-bg-3 hover:border-sf-accent/40 transition-colors text-left"
          >
            <span className="text-base">{tile.icon}</span>
            <span className="text-[11px] font-medium text-sf-text">{tile.label}</span>
            <span className="text-[10px] text-sf-accent">View details →</span>
          </button>
        ))}
      </div>
    </GlassCard>
  );
}
