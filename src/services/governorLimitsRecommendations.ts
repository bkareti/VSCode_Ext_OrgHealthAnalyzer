import type { AnalysisResult, GovernorLimitsRecommendationCard, GovernorLimitsRecommendationsReport, OrgLimitInfo } from '../types';

/**
 * Deterministic base for the "AI Recommendations" cards on the Governor
 * Limits → Summary tab. Every value here is computed from real `orgLimits`
 * data already surfaced on that tab — nothing is fabricated, so every card
 * carries `sample: false`. The optional AI narrative layer
 * (`aiService.synthesizeGovernorLimitsRecommendations`) only adds
 * evidence-cited text on top of these numbers — it never recalculates them.
 */
export function buildGovernorLimitsRecommendationsBase(result: AnalysisResult): GovernorLimitsRecommendationsReport {
  const limits: OrgLimitInfo[] = result.orgLimits ?? [];
  const find = (name: string) => limits.find((l) => l.name === name);

  const penalty = limits.reduce((sum, l) => {
    if (l.usedPct >= 90) { return sum + 12; }
    if (l.usedPct >= 75) { return sum + 6; }
    if (l.usedPct >= 50) { return sum + 2; }
    return sum;
  }, 0);
  const capacityScore = Math.max(0, Math.round(100 - penalty));
  const atRisk = limits.filter((l) => l.usedPct >= 50).sort((a, b) => b.usedPct - a.usedPct);

  const fileStorage = find('FileStorageMB');
  const dataStorage = find('DataStorageMB');
  const highestStorage = [fileStorage, dataStorage]
    .filter((l): l is OrgLimitInfo => !!l)
    .sort((a, b) => b.usedPct - a.usedPct)[0];

  const apiCalls = find('DailyApiRequests');
  const asyncApex = find('DailyAsyncApexExecutions');

  const capacityImpact = capacityScore < 50 ? 'High' : capacityScore < 75 ? 'Medium' : 'Low';
  const storageImpact = (highestStorage?.usedPct ?? 0) >= 90 ? 'High' : (highestStorage?.usedPct ?? 0) >= 75 ? 'Medium' : 'Low';
  const apiImpact = (apiCalls?.usedPct ?? 0) >= 90 ? 'High' : (apiCalls?.usedPct ?? 0) >= 75 ? 'Medium' : 'Low';
  const asyncImpact = (asyncApex?.usedPct ?? 0) >= 90 ? 'High' : (asyncApex?.usedPct ?? 0) >= 75 ? 'Medium' : 'Low';
  const riskImpact = atRisk.length >= 8 ? 'High' : atRisk.length >= 3 ? 'Medium' : 'Low';

  const cards: GovernorLimitsRecommendationCard[] = [
    {
      id: 'capacity-score',
      title: 'Platform Capacity',
      icon: '🛡️',
      impact: capacityImpact,
      value: capacityScore,
      valueLabel: `Overall capacity score across ${limits.length} tracked limit${limits.length === 1 ? '' : 's'}`,
      detailLabel: 'Recommended Range',
      detailValue: '75-100',
      sample: false,
    },
    {
      id: 'storage-headroom',
      title: 'Storage Headroom',
      icon: '💾',
      impact: storageImpact,
      value: highestStorage?.usedPct ?? 0,
      valueLabel: highestStorage ? `of allocated ${highestStorage.label.toLowerCase()} used` : 'No storage limit data available',
      detailLabel: 'Headroom Remaining',
      detailValue: highestStorage ? `${100 - highestStorage.usedPct}% free` : 'N/A',
      sample: false,
    },
    {
      id: 'api-trajectory',
      title: 'API Utilization',
      icon: '🔌',
      impact: apiImpact,
      value: apiCalls?.usedPct ?? 0,
      valueLabel: 'of daily API request limit used',
      detailLabel: 'Guidance',
      detailValue: 'Monitor integration call volume',
      sample: false,
    },
    {
      id: 'async-processing',
      title: 'Async Processing',
      icon: '⚙️',
      impact: asyncImpact,
      value: asyncApex?.usedPct ?? 0,
      valueLabel: 'of daily async Apex executions used',
      detailLabel: 'Guidance',
      detailValue: asyncImpact === 'Low' ? 'Healthy headroom' : 'Review scheduled/batch job volume',
      sample: false,
    },
    {
      id: 'forecast-risk',
      title: 'Limits at Risk',
      icon: '⚠️',
      impact: riskImpact,
      value: atRisk.length,
      valueLabel: 'limits at or above 50% consumed',
      detailLabel: 'Highest Consumption',
      detailValue: atRisk[0] ? `${atRisk[0].label} (${atRisk[0].usedPct}%)` : 'None',
      sample: false,
    },
  ];

  return { generatedAt: new Date().toISOString(), cards };
}
