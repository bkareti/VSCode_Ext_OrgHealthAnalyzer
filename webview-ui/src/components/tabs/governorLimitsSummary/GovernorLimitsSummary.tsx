import type { AnalysisResult, OrgLimitInfo } from '@/types';
import StatCardRow from './StatCardRow';
import CapacityHealthTable from './CapacityHealthTable';
import UsageTrendsCard from './UsageTrendsCard';
import LimitForecastCard from './LimitForecastCard';
import TopConsumersCard from './TopConsumersCard';
import StorageBreakdownCard from './StorageBreakdownCard';
import LargestObjectsCard from './LargestObjectsCard';
import QuickWinsCard from './QuickWinsCard';
import DetailedLimitUsageGrid, { type LimitCategoryTarget } from './DetailedLimitUsageGrid';
import NeedMoreCapacityCard from './NeedMoreCapacityCard';
import GovernorLimitsRecommendations from './GovernorLimitsRecommendations';

interface Props {
  results: AnalysisResult;
  limits: OrgLimitInfo[];
  onJumpToCategory: (target: LimitCategoryTarget) => void;
}

export default function GovernorLimitsSummary({ results, limits, onJumpToCategory }: Props) {
  return (
    <div className="space-y-4">
      <StatCardRow limits={limits} />

      <CapacityHealthTable limits={limits} />

      <UsageTrendsCard />

      <LimitForecastCard />

      <TopConsumersCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StorageBreakdownCard limits={limits} />
        <LargestObjectsCard results={results} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuickWinsCard />
        <NeedMoreCapacityCard />
      </div>

      <DetailedLimitUsageGrid onJumpToCategory={onJumpToCategory} />

      <GovernorLimitsRecommendations results={results} />
    </div>
  );
}
