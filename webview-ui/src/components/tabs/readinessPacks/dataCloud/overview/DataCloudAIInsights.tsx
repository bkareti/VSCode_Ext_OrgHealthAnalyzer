import { useState } from 'react';
import { GlassCard, Button, ModelLimitErrorBanner, Tooltip } from '@/components/common';
import { useDataCloudInsightsStore } from '@/store/slices/dataCloudInsightsStore';
import { useVSCode } from '@/hooks/useVSCode';
import type { AnalysisResult, DataCloudInsightType, ReadinessPackAssessment } from '@/types';
import { buildDataCloudInsightsFallback } from '../fallbackInsights';

interface Props {
  pack: ReadinessPackAssessment;
  results: AnalysisResult | null;
}

const TYPE_STYLE: Record<DataCloudInsightType, { border: string; bg: string }> = {
  warning: { border: 'border-l-sev-error', bg: 'bg-sev-error/5' },
  info: { border: 'border-l-sev-info', bg: 'bg-sev-info/5' },
  success: { border: 'border-l-score-good', bg: 'bg-score-good/5' },
  opportunity: { border: 'border-l-sf-accent', bg: 'bg-sf-accent/5' },
};

const VISIBLE_COUNT = 4;

/**
 * Custom "AI Insights" panel for Data Cloud Readiness → Overview. Deliberately
 * does NOT reuse the shared AIRecommendations.tsx card-grid component (mockup
 * calls for a compact bulleted-insight list instead) — but reuses the same
 * postMessage/store AI-call mechanism as every other tab (Governor Limits,
 * Org Info, License Recommendations, etc.).
 */
export default function DataCloudAIInsights({ pack, results }: Props) {
  const [showAll, setShowAll] = useState(false);
  const storeReport = useDataCloudInsightsStore((s) => s.report);
  const loading = useDataCloudInsightsStore((s) => s.loading);
  const error = useDataCloudInsightsStore((s) => s.error);
  const { postMessage } = useVSCode();

  const report = storeReport ?? results?.dataCloudInsights ?? buildDataCloudInsightsFallback(pack);
  const insights = report.insights;
  const isAi = !!report.modelUsed;
  const hasNarrative = insights.some((c) => !!c.evidencePoints?.length);
  const visible = showAll ? insights : insights.slice(0, VISIBLE_COUNT);

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-sf-text">AI Insights</h3>
          <Tooltip content="Insight titles/descriptions are computed deterministically by OrgPulse from real readiness scores; narrative evidence is AI-authored once generated.">
            <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
          </Tooltip>
          <span className={isAi ? 'px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-purple-500/20 text-purple-400' : 'px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-sf-bg-3 text-sf-muted'}>
            {isAi ? 'AI' : 'Beta'}
          </span>
        </div>
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={() => postMessage({ command: 'runDataCloudInsights', force: hasNarrative })}
        >
          {hasNarrative ? 'Regenerate' : 'Generate'}
        </Button>
      </div>

      {error && (
        <div className="mb-3">
          <ModelLimitErrorBanner
            message={error}
            onRetry={() => postMessage({ command: 'runDataCloudInsights', force: hasNarrative })}
          />
        </div>
      )}

      {insights.length === 0 ? (
        <p className="text-xs text-sf-muted py-2">No insights available yet — run a full analysis first.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((insight) => (
            <div
              key={insight.id}
              className={`border-l-2 rounded-r-md px-2.5 py-2 ${TYPE_STYLE[insight.type].border} ${TYPE_STYLE[insight.type].bg}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{insight.icon}</span>
                <span className="text-xs font-semibold text-sf-text">{insight.title}</span>
              </div>
              <p className="text-[11px] text-sf-muted mt-0.5 leading-snug">{insight.description}</p>
              {insight.evidencePoints && insight.evidencePoints.length > 0 && (
                <p className="text-[10px] text-sf-muted/80 italic mt-1">{insight.evidencePoints[0].text}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {insights.length > VISIBLE_COUNT && (
        <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '▴ Show fewer' : `View full insights →`}
        </button>
      )}
    </GlassCard>
  );
}
