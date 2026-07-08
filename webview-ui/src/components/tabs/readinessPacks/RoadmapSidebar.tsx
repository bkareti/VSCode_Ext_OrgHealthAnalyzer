import GlassCard from '@/components/common/GlassCard';
import type { ReadinessPackAssessment, GapSeverity } from '@/types';
import { roadmapTiers, effortHoursFor, totalEffortHours } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

const TIER_COLOR: Record<GapSeverity, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
};

const TIER_SUBTITLE: Record<GapSeverity, string> = {
  Critical: 'Do First',
  High: 'Next Priority',
  Medium: 'Improve Next',
  Low: 'Enhance Over Time',
};

/** Groups pack.blockingIssues (already severity-classified) into 4 tiers — one pack, not aggregated. */
export default function RoadmapSidebar({ pack }: Props) {
  const tiers = roadmapTiers(pack).filter((t) => t.items.length > 0);
  const total = totalEffortHours(pack);

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Readiness Roadmap</h3>
        <span className="text-[10px] text-sf-muted">(Recommended order)</span>
      </div>

      {tiers.length === 0 ? (
        <p className="text-xs text-sf-muted">No blocking issues detected. 🎉</p>
      ) : (
        <div className="relative pl-4">
          <div className="absolute left-[5px] top-1 bottom-1 w-px bg-sf-border" />
          {tiers.map((tier) => (
            <div key={tier.severity} className="mb-4 relative last:mb-0">
              <div
                className="absolute -left-4 top-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: TIER_COLOR[tier.severity] }}
              />
              <div
                className="text-[11px] font-bold uppercase tracking-wide mb-1.5"
                style={{ color: TIER_COLOR[tier.severity] }}
              >
                {tier.severity}{' '}
                <span className="text-sf-muted font-medium normal-case">({TIER_SUBTITLE[tier.severity]})</span>
              </div>
              {tier.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 py-1.5 border-b border-sf-border/40 last:border-0"
                >
                  <span className="text-[11px] text-sf-text">{item.title}</span>
                  <span className="text-[10px] text-sf-muted shrink-0">{effortHoursFor(tier.severity)} Hrs</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 mt-1 border-t border-sf-border">
        <span className="text-[11px] font-semibold text-sf-accent">Total Estimated Effort</span>
        <span className="text-xs font-bold text-sf-text">{total > 0 ? `~${total} Hours` : 'None'}</span>
      </div>
    </GlassCard>
  );
}
