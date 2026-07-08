import { useState, type ReactNode } from 'react';
import GlassCard from './GlassCard';
import SampleMark from './SampleMark';
import Tooltip from './Tooltip';
import { cn } from '@/lib/cn';

interface Props {
  title?: string;
  infoTooltip?: string;
  headerRight?: ReactNode;
  sample?: boolean;
  sampleNote?: string;
  summary: ReactNode;
  expandLabel?: string;
  collapseLabel?: string;
  details?: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
  dense?: boolean;
  /** Puts the expand/collapse toggle in the header row instead of below the summary (e.g. "Top Unused Feature Licenses"). */
  toggleInHeader?: boolean;
}

// Single shared primitive for every "View X →" card in this app: a summary
// block that's always visible, plus an optional details block revealed via a
// local text-link toggle — the same "View all N →" / "▴ Show fewer" idiom
// already used by GovernorLimits.tsx and readinessPacks/ChecksTable.tsx, just
// generalized to reveal an entire block instead of extra table rows.
export default function ExpandableCard({
  title,
  infoTooltip,
  headerRight,
  sample,
  sampleNote,
  summary,
  expandLabel = 'View details',
  collapseLabel = 'Show less',
  details,
  defaultExpanded = false,
  className,
  dense,
  toggleInHeader,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleButton = details && (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      className="text-[11px] font-semibold text-sf-accent hover:underline shrink-0 whitespace-nowrap"
    >
      {expanded ? `▴ ${collapseLabel}` : `${expandLabel} →`}
    </button>
  );

  const hasHeader = title || headerRight || (toggleInHeader && toggleButton);

  return (
    <GlassCard className={cn(dense ? 'p-3' : undefined, className)}>
      {hasHeader && (
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {title && <h3 className="text-xs font-semibold text-sf-text truncate">{title}</h3>}
            {infoTooltip && (
              <Tooltip content={infoTooltip}>
                <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
              </Tooltip>
            )}
            {sample && <SampleMark note={sampleNote} />}
          </div>
          {toggleInHeader ? toggleButton : headerRight}
        </div>
      )}

      {summary}

      {details && !toggleInHeader && (
        <div className="border-t border-sf-border/50 mt-3 pt-2">
          {toggleButton}
        </div>
      )}

      {details && expanded && (
        <div className="mt-3 animate-[slideInUp_0.2s_ease]">
          {details}
        </div>
      )}
    </GlassCard>
  );
}
