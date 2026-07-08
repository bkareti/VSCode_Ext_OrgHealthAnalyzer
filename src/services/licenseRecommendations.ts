import type { AnalysisResult, LicenseRecommendationCard, LicenseRecommendationsReport } from '../types';

/**
 * Deterministic base for the "AI License Recommendations" cards on the Org
 * Info → Clouds & Licenses tab. Every `value` here is computed from real
 * `AnalysisResult` fields wherever a backend concept exists; the dollar
 * "savings" figures are always sample (no license pricing data exists
 * anywhere in the app), so every card carries `sample: true`. The optional
 * AI narrative layer (`aiService.synthesizeLicenseRecommendations`) only adds
 * evidence-cited text on top of these numbers — it never recalculates them.
 */
export function buildLicenseRecommendationsBase(result: AnalysisResult): LicenseRecommendationsReport {
  const licenses = result.licenseSummary ?? [];
  const featureLicenses = result.featureLicenses ?? [];
  const dormantUsers = result.userSummary?.dormantUsers;

  const totalLic = licenses.reduce((s, l) => s + l.totalLicenses, 0);
  const usedLic = licenses.reduce((s, l) => s + l.usedLicenses, 0);
  // Mirrors the KPI donut's fixed sample ratio for the "Unassigned" slice —
  // there is no real "unassigned seat" concept on UserLicense.
  const unassignedSample = Math.round(Math.max(totalLic - usedLic, 0) * 0.218);

  const underutilizedFeatureCount = featureLicenses.filter(
    (fl) => fl.totalLicenses > 0 && fl.usedLicenses / fl.totalLicenses < 0.5,
  ).length;

  const cards: LicenseRecommendationCard[] = [
    {
      id: 'surrender-unused',
      title: 'Surrender Unused Licenses',
      icon: '✅',
      impact: 'High',
      value: totalLic > 0 ? unassignedSample : 146,
      valueLabel: 'Licenses can be surrendered',
      savingsLabel: 'Est. Annual Savings',
      savingsValue: '$194,580',
      sample: true,
    },
    {
      id: 'reclaim-inactive',
      title: 'Reclaim Inactive User Licenses',
      icon: '⚠️',
      impact: 'High',
      value: dormantUsers ?? 238,
      valueLabel: 'Users inactive > 180 days',
      savingsLabel: 'Est. Annual Savings',
      savingsValue: '$112,420',
      sample: true,
    },
    {
      id: 'optimize-feature',
      title: 'Optimize Feature Licenses',
      icon: '📊',
      impact: 'Medium',
      value: featureLicenses.length > 0 ? underutilizedFeatureCount : 92,
      valueLabel: 'Feature licenses underutilized',
      savingsLabel: 'Est. Annual Savings',
      savingsValue: '$86,360',
      sample: true,
    },
    {
      id: 'rightsize-permset',
      title: 'Right-size Permission Set Licenses',
      icon: '🔧',
      impact: 'Medium',
      value: 44,
      valueLabel: 'Permission set licenses available',
      savingsLabel: 'Potential Savings',
      savingsValue: '$23,980',
      sample: true,
    },
    {
      id: 'plan-future',
      title: 'Plan Future Needs',
      icon: '📈',
      impact: 'Insight',
      value: '+120',
      valueLabel: 'Licenses may be needed in next 90 days',
      savingsLabel: 'Based on growth trend and usage',
      sample: true,
    },
  ];

  return { generatedAt: new Date().toISOString(), cards };
}
