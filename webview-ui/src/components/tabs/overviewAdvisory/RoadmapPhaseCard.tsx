import { useState } from 'react';
import { Badge, GlassCard } from '@/components/common';
import type { RoadmapPhaseData } from './sampleData';

const COLLAPSED_COUNT = 3;

const LEVEL_VARIANT: Record<RoadmapPhaseData['effort'], 'success' | 'warning' | 'error'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'error',
};

const THEME = {
  green: { title: 'text-score-good', bullet: 'text-score-good', iconBg: 'bg-score-good/15' },
  blue: { title: 'text-sf-accent', bullet: 'text-sf-accent', iconBg: 'bg-sf-accent/15' },
  purple: { title: 'text-chart-2', bullet: 'text-chart-2', iconBg: 'bg-chart-2/15' },
  orange: { title: 'text-sev-warning', bullet: 'text-sev-warning', iconBg: 'bg-sev-warning/15' },
} as const;

export default function RoadmapPhaseCard({
  phase,
  subtitle,
  icon,
  theme,
  items,
  effort,
  impact,
}: RoadmapPhaseData) {
  const t = THEME[theme];
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > COLLAPSED_COUNT;
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <GlassCard className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${t.iconBg}`}
        >
          {icon}
        </span>
        <p className={`text-xs leading-tight font-semibold ${t.title}`}>
          {phase} – {subtitle}
        </p>
      </div>
      <ul className="flex-1 space-y-1">
        {visible.map((item) => (
          <li key={item} className="flex items-start gap-1.5 text-[10px] leading-snug text-sf-text">
            <span className={`mt-0.5 shrink-0 ${t.bullet}`}>{theme === 'orange' ? '→' : '✓'}</span>
            {item}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={`mt-1.5 text-left text-[9px] font-medium hover:underline ${t.title}`}
        >
          {expanded ? 'Show less ↑' : `+${items.length - COLLAPSED_COUNT} more ↓`}
        </button>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-sf-border/30 pt-2">
        <span className="flex items-center gap-1 text-[9px] text-sf-muted">
          Effort:{' '}
          <Badge variant={LEVEL_VARIANT[effort]} className="px-1 py-0 text-[9px]">
            {effort}
          </Badge>
        </span>
        <span className="flex items-center gap-1 text-[9px] text-sf-muted">
          Impact:{' '}
          <Badge variant={LEVEL_VARIANT[impact]} className="px-1 py-0 text-[9px]">
            {impact}
          </Badge>
        </span>
      </div>
    </GlassCard>
  );
}
