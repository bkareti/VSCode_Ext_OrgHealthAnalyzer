import ArchitectRecommendations from '@/components/common/ArchitectRecommendations';
import type { ReadinessPackAssessment } from '@/types';
import ExecutiveSummary from './ExecutiveSummary';
import PillarGrid from './PillarGrid';
import ChecksTable from './ChecksTable';
import KpiGrid from './KpiGrid';
import RoadmapSidebar from './RoadmapSidebar';
import { buildFallbackSections, buildFallbackSummary, totalEffortHours } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
  /** Concrete model name/id that generated this report's narrative, if any. */
  modelUsed?: string;
}

/** Shared layout for a single readiness pack (Data Cloud / Agentforce / Hyperforce). */
export default function ReadinessPackView({ pack, modelUsed }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <ExecutiveSummary pack={pack} />
          <PillarGrid pack={pack} />
          <ChecksTable pack={pack} />
          <KpiGrid pack={pack} />
        </div>
        <div className="flex flex-col gap-4">
          <RoadmapSidebar pack={pack} />
        </div>
      </div>
      <ArchitectRecommendations
        sections={pack.narrative?.sections}
        fallbackSections={buildFallbackSections(pack)}
        summary={pack.narrative?.summary ?? buildFallbackSummary(pack)}
        effortHours={totalEffortHours(pack)}
        modelUsed={modelUsed}
      />
    </div>
  );
}
