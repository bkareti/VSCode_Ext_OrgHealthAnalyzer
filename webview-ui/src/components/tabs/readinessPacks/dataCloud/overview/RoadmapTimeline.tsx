import GlassCard from '@/components/common/GlassCard';
import type { RoadmapPhase } from '@/types';
import { dataCloudRoadmapPhases } from '../derivations';

interface Props {
  roadmap: RoadmapPhase[];
}

export default function RoadmapTimeline({ roadmap }: Props) {
  const phases = dataCloudRoadmapPhases(roadmap);

  return (
    <GlassCard title="Recommended Roadmap">
      <div className="relative pl-7">
        <div className="absolute left-[13px] top-1 bottom-1 w-px bg-sf-border" />
        {phases.map((phase, i) => (
          <div key={phase.label} className="mb-4 relative last:mb-0">
            <div className="absolute -left-7 top-0 w-6 h-6 rounded-full bg-sf-accent/15 border border-sf-accent/30 flex items-center justify-center text-[11px] font-bold text-sf-accent">
              {i + 1}
            </div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-sf-text">{phase.label}</span>
              <span className="text-[10px] font-bold text-sf-muted bg-sf-bg-3 rounded-full px-1.5 py-0.5 shrink-0">
                {phase.items.length} Action{phase.items.length === 1 ? '' : 's'}
              </span>
            </div>
            {phase.items.length === 0 ? (
              <p className="text-[11px] text-sf-muted">No actions in this phase.</p>
            ) : (
              <ul className="space-y-1">
                {phase.items.map((item, j) => (
                  <li key={j} className="text-[11px] text-sf-text-2 leading-snug">• {item.title}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
