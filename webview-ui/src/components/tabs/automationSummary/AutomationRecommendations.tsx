import { AIRecommendations } from '@/components/common';
import { AUTOMATION_RECOMMENDATIONS } from './sampleData';

export default function AutomationRecommendations() {
  return (
    <div>
      <AIRecommendations
        cards={AUTOMATION_RECOMMENDATIONS}
        infoTooltip="Recommendations are illustrative sample data — OrgPulse does not yet compute these from real metadata, logs, or telemetry."
      />
      <p className="text-[11px] text-sf-muted mt-2 flex items-center justify-between flex-wrap gap-2">
        <span>ℹ Recommendations are based on metadata analysis, logs, and runtime telemetry. Implementing them can improve performance, reliability, and user experience.</span>
        <span className="text-sf-accent font-semibold whitespace-nowrap cursor-default">View all recommendations →</span>
      </p>
    </div>
  );
}
