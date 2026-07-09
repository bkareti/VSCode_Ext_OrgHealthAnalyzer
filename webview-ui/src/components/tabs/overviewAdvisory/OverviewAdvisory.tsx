import PageHeader from './PageHeader';
import OverallVerdictCard from './OverallVerdictCard';
import KeyTakeawaysCard from './KeyTakeawaysCard';
import WhatChangedTable from './WhatChangedTable';
import BusinessRiskSummaryCard from './BusinessRiskSummaryCard';
import ReadinessForecastCard from './ReadinessForecastCard';
import TopBusinessRisksCard from './TopBusinessRisksCard';
import TopOpportunitiesCard from './TopOpportunitiesCard';
import AiAdvisorOpinionCard from './AiAdvisorOpinionCard';
import RoadmapSection from './RoadmapSection';
import PriorityMatrix from './PriorityMatrix';
import PrioritizedActionsTable from './PrioritizedActionsTable';
import HealthScoreTrendCard from './HealthScoreTrendCard';
import DomainContributionTable from './DomainContributionTable';
import NextBestActionsBar from './NextBestActionsBar';
import {
  VERDICT,
  KEY_TAKEAWAYS,
  WHAT_CHANGED_ROWS,
  BUSINESS_RISK_SUMMARY,
  READINESS_FORECAST,
  FORECAST_STATS,
  TOP_BUSINESS_RISKS,
  TOP_OPPORTUNITIES,
  AI_ADVISOR_OPINION,
  ROADMAP_PHASES,
  PRIORITY_QUADRANTS,
  PRIORITIZED_ACTIONS,
  HEALTH_SCORE_TREND,
  DOMAIN_CONTRIBUTION,
  DOMAIN_CONTRIBUTION_TOTAL,
  NEXT_BEST_ACTIONS,
} from './sampleData';

export default function OverviewAdvisory() {
  return (
    <div className="p-6 space-y-4">
      <PageHeader />

      {/* Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-stretch">
        <OverallVerdictCard verdict={VERDICT} />
        <KeyTakeawaysCard takeaways={KEY_TAKEAWAYS} />
        <WhatChangedTable rows={WHAT_CHANGED_ROWS} />
        <BusinessRiskSummaryCard risks={BUSINESS_RISK_SUMMARY} />
        <ReadinessForecastCard points={READINESS_FORECAST} stats={FORECAST_STATS} />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TopBusinessRisksCard risks={TOP_BUSINESS_RISKS} />
        <TopOpportunitiesCard opportunities={TOP_OPPORTUNITIES} />
        <AiAdvisorOpinionCard {...AI_ADVISOR_OPINION} />
      </div>

      {/* Row 3 */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 items-start">
        <RoadmapSection phases={ROADMAP_PHASES} />
        <PriorityMatrix quadrants={PRIORITY_QUADRANTS} />
      </div>

      {/* Row 4 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
        <PrioritizedActionsTable actions={PRIORITIZED_ACTIONS} />
        <HealthScoreTrendCard data={HEALTH_SCORE_TREND} />
        <DomainContributionTable rows={DOMAIN_CONTRIBUTION} total={DOMAIN_CONTRIBUTION_TOTAL} />
      </div>

      {/* Row 5 */}
      <NextBestActionsBar actions={NEXT_BEST_ACTIONS} />
    </div>
  );
}
