import { useState } from 'react';
import SegmentedTabs from '@/components/common/SegmentedTabs';
import type { AnalysisResult, FutureReadinessReport, ReadinessPackAssessment } from '@/types';
import StatCardsRow from './overview/StatCardsRow';
import DimensionTable from './overview/DimensionTable';
import ReadinessBreakdownDonut from './overview/ReadinessBreakdownDonut';
import DataCloudAIInsights from './overview/DataCloudAIInsights';
import ReadyGapsOpportunitiesRow from './overview/ReadyGapsOpportunitiesRow';
import UseCaseReadinessTable from './overview/UseCaseReadinessTable';
import ChecklistTable from './overview/ChecklistTable';
import RoadmapTimeline from './overview/RoadmapTimeline';
import RemediationChart from './overview/RemediationChart';
import DimensionDetailView from './DimensionDetailView';
import { DATA_CLOUD_SUBTABS, type DataCloudSubtab } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
  report: FutureReadinessReport;
  results: AnalysisResult | null;
}

type SubTab = 'overview' | DataCloudSubtab;

const SUBTAB_ITEMS: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  ...DATA_CLOUD_SUBTABS.map((s) => ({ id: s, label: s })),
];

function Overview({ pack, report, results }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <StatCardsRow pack={pack} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <DimensionTable pack={pack} />
          <ReadyGapsOpportunitiesRow pack={pack} />
          <ChecklistTable pack={pack} />
          <RoadmapTimeline roadmap={report.roadmap} />
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <ReadinessBreakdownDonut pack={pack} />
          <DataCloudAIInsights pack={pack} results={results} />
          <UseCaseReadinessTable />
          <RemediationChart pack={pack} />
        </div>
      </div>
    </div>
  );
}

export default function DataCloudReadinessView({ pack, report, results }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('overview');

  return (
    <div className="flex flex-col gap-4">
      <SegmentedTabs items={SUBTAB_ITEMS} active={subTab} onChange={setSubTab} size="sm" variant="pill" />
      {subTab === 'overview' ? (
        <Overview pack={pack} report={report} results={results} />
      ) : (
        <DimensionDetailView pack={pack} subtab={subTab} />
      )}
    </div>
  );
}
