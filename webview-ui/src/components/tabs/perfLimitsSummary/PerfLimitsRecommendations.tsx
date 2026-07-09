import { AIRecommendations } from '@/components/common';
import { PERF_RECOMMENDATIONS } from './sampleData';

export default function PerfLimitsRecommendations() {
  return (
    <div>
      <AIRecommendations
        cards={PERF_RECOMMENDATIONS}
        infoTooltip="Recommendations are illustrative sample data — OrgPulse does not yet compute these from real metadata, logs, or telemetry."
      />
      <p className="text-[11px] text-sf-muted mt-2 flex items-center justify-between flex-wrap gap-2">
        <span>ℹ AI recommendations are based on metadata analysis, logs, and runtime telemetry. Implementing recommendations can significantly improve performance and user experience.</span>
        <span className="text-sf-accent font-semibold whitespace-nowrap cursor-default">View all recommendations →</span>
      </p>
    </div>
  );
}
