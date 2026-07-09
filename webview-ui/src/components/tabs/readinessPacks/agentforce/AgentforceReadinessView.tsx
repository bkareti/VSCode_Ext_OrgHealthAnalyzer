import type { AnalysisResult, FutureReadinessReport, ReadinessPackAssessment } from '@/types';
import StatCardsRow from './overview/StatCardsRow';
import CapabilityTable from './overview/CapabilityTable';
import ReadinessBreakdownDonut from './overview/ReadinessBreakdownDonut';
import AgentforceAIInsights from './overview/AgentforceAIInsights';
import ReadyGapsOpportunitiesRow from './overview/ReadyGapsOpportunitiesRow';
import ChecklistTable from './overview/ChecklistTable';
import RoadmapTimeline from './overview/RoadmapTimeline';
import RemediationChart from './overview/RemediationChart';

interface Props {
  pack: ReadinessPackAssessment;
  report: FutureReadinessReport;
  results: AnalysisResult | null;
}

export default function AgentforceReadinessView({ pack, report, results }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <StatCardsRow pack={pack} report={report} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <CapabilityTable pack={pack} />
        <ReadinessBreakdownDonut pack={pack} />
        <AgentforceAIInsights pack={pack} results={results} />
      </div>

      <ReadyGapsOpportunitiesRow pack={pack} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <ChecklistTable pack={pack} />
        <div className="flex flex-col gap-4 min-w-0">
          <RoadmapTimeline roadmap={report.roadmap} />
          <RemediationChart pack={pack} />
        </div>
      </div>
    </div>
  );
}
