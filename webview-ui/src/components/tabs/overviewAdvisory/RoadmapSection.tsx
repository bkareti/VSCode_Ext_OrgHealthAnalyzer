import { Fragment } from 'react';
import { SampleMark } from '@/components/common';
import RoadmapPhaseCard from './RoadmapPhaseCard';
import type { RoadmapPhaseData } from './sampleData';

export default function RoadmapSection({ phases }: { phases: RoadmapPhaseData[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <h3 className="text-xs font-semibold text-sf-text">Recommended Roadmap</h3>
        <SampleMark />
      </div>
      <div className="flex items-stretch gap-0">
        {phases.map((p, i) => (
          <Fragment key={p.phase}>
            <div className="min-w-0 flex-1">
              <RoadmapPhaseCard {...p} />
            </div>
            {i < phases.length - 1 && (
              <div className="flex shrink-0 items-start justify-center px-1 pt-3 text-xs text-sf-muted">
                →
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
