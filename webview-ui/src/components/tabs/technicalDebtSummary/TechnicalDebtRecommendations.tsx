import { AIRecommendations } from '@/components/common';
import { TECHNICAL_DEBT_RECOMMENDATIONS } from './sampleData';

export default function TechnicalDebtRecommendations() {
  return (
    <AIRecommendations
      title="AI Recommendations (Prioritized for Maximum Impact)"
      cards={TECHNICAL_DEBT_RECOMMENDATIONS}
      infoTooltip="Recommendations are illustrative sample data — OrgPulse does not yet compute these from real metadata analysis."
    />
  );
}
