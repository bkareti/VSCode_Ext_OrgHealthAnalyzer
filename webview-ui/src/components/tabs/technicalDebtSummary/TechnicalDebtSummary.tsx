import StatCardRow from './StatCardRow';
import DebtDistributionCard from './DebtDistributionCard';
import DebtBySeverityCard from './DebtBySeverityCard';
import DebtByDomainRadarCard from './DebtByDomainRadarCard';
import AICtoSummaryCard from './AICtoSummaryCard';
import TopBusinessRisksCard from './TopBusinessRisksCard';
import ArchitectureMaturityCard from './ArchitectureMaturityCard';
import PrioritizationMatrix from './PrioritizationMatrix';
import DomainDebtCardsRow from './DomainDebtCardsRow';
import TopDebtItemsTable from './TopDebtItemsTable';
import ModernizationDebtCard from './ModernizationDebtCard';
import QuickWinsListCard from './QuickWinsListCard';
import TechnicalDebtRecommendations from './TechnicalDebtRecommendations';

export default function TechnicalDebtSummary() {
  return (
    <div className="space-y-4">
      <StatCardRow />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DebtDistributionCard />
            <DebtBySeverityCard />
            <DebtByDomainRadarCard />
          </div>

          <DomainDebtCardsRow />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TopDebtItemsTable />
            <ModernizationDebtCard />
            <QuickWinsListCard />
          </div>
        </div>

        <div className="space-y-4">
          <AICtoSummaryCard />
          <TopBusinessRisksCard />
          <ArchitectureMaturityCard />
          <PrioritizationMatrix />
        </div>
      </div>

      <TechnicalDebtRecommendations />
    </div>
  );
}
