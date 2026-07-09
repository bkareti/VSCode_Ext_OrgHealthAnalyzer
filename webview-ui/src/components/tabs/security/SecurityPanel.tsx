import type { ReactNode } from 'react';
import GlassCard from '@/components/common/GlassCard';
import SampleMark from '@/components/common/SampleMark';
import Tooltip from '@/components/common/Tooltip';

interface Props {
  title: string;
  infoTooltip?: string;
  sample?: boolean;
  sampleNote?: string;
  children: ReactNode;
  linkLabel?: string;
  onLinkClick?: () => void;
  className?: string;
}

// GlassCard + a title row (with optional sample/info marks) + an optional
// bottom "View X →" link that navigates to a deep-dive sub-tab. Visually
// mirrors ExpandableCard's toggle-below-summary treatment, but the link
// switches sub-tabs instead of expanding in place, since every "View X"
// affordance in the mockup points at one of the Security tab's other 7 tabs.
export default function SecurityPanel({ title, infoTooltip, sample, sampleNote, children, linkLabel, onLinkClick, className }: Props) {
  return (
    <GlassCard className={className}>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
        {infoTooltip && (
          <Tooltip content={infoTooltip}>
            <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
          </Tooltip>
        )}
        {sample && <SampleMark note={sampleNote} />}
      </div>
      {children}
      {linkLabel && onLinkClick && (
        <div className="border-t border-sf-border/50 mt-3 pt-2">
          <button
            type="button"
            onClick={onLinkClick}
            className="text-[11px] font-semibold text-sf-accent hover:underline"
          >
            {linkLabel} →
          </button>
        </div>
      )}
    </GlassCard>
  );
}
