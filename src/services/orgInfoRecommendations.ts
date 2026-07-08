import type { AnalysisResult, OrgInfoRecommendationCard, OrgInfoRecommendationsReport } from '../types';

/**
 * Deterministic base for the "AI Recommendations" cards on the Org Info →
 * Overview tab. Every value here is computed from real `AnalysisResult`
 * fields already surfaced on that tab (license utilization, storage,
 * clouds, integrations, API version) — nothing is fabricated, so every
 * card carries `sample: false`. The optional AI narrative layer
 * (`aiService.synthesizeOrgInfoRecommendations`) only adds evidence-cited
 * text on top of these numbers — it never recalculates them.
 */
export function buildOrgInfoRecommendationsBase(result: AnalysisResult): OrgInfoRecommendationsReport {
  const licenses = result.licenseSummary ?? [];
  const allocatedLicenses = licenses.filter((l) => l.totalLicenses > 0);
  const totalLic = allocatedLicenses.reduce((s, l) => s + l.totalLicenses, 0);
  const usedLic = allocatedLicenses.reduce((s, l) => s + l.usedLicenses, 0);
  const licUtilPct = totalLic > 0 ? Math.round((usedLic / totalLic) * 100) : 0;

  const ext = result.orgInfoData?.extended;
  const storageUsedMB = ext?.storageUsedMB ?? 0;
  const storageLimitMB = ext?.storageLimitMB ?? 0;
  const storagePct = storageLimitMB > 0 ? Math.round((storageUsedMB / storageLimitMB) * 100) : 0;

  const clouds = result.orgInfoData?.clouds ?? [];
  const cloudsEnabled = clouds.filter((c) => c.enabled).length;
  const cloudsDisabled = clouds.length - cloudsEnabled;

  const integrationsTotal = result.orgInfoData?.integrations?.total ?? 0;

  const orgType = result.orgDetails?.orgType ?? 'Unknown';
  const apiVersion = result.orgDetails?.apiVersion ?? 'Unknown';
  const nextRelease = result.orgDetails?.nextReleaseName;

  const licenseImpact = licUtilPct >= 90 ? 'High' : licUtilPct < 50 && totalLic > 0 ? 'Medium' : 'Low';
  const storageImpact = storagePct > 80 ? 'High' : storagePct > 60 ? 'Medium' : 'Low';

  const cards: OrgInfoRecommendationCard[] = [
    {
      id: 'license-utilization',
      title: 'License Utilization',
      icon: '📊',
      impact: licenseImpact,
      value: licUtilPct,
      valueLabel: `Utilization across ${allocatedLicenses.length} license type${allocatedLicenses.length === 1 ? '' : 's'}`,
      detailLabel: 'Recommended Range',
      detailValue: '70–90%',
      sample: false,
    },
    {
      id: 'storage-headroom',
      title: 'Storage Headroom',
      icon: '💾',
      impact: storageImpact,
      value: storagePct,
      valueLabel: 'of allocated data storage used',
      detailLabel: 'Headroom Remaining',
      detailValue: storageLimitMB > 0 ? `${100 - storagePct}% free` : 'N/A',
      sample: false,
    },
    {
      id: 'cloud-adoption',
      title: 'Cloud Adoption',
      icon: '☁️',
      impact: 'Insight',
      value: clouds.length > 0 ? `${cloudsEnabled} / ${clouds.length}` : 'N/A',
      valueLabel: 'clouds enabled of licensed clouds',
      detailLabel: 'Not Yet Enabled',
      detailValue: `${cloudsDisabled} cloud${cloudsDisabled === 1 ? '' : 's'}`,
      sample: false,
    },
    {
      id: 'integration-footprint',
      title: 'Integration Footprint',
      icon: '🔗',
      impact: 'Insight',
      value: integrationsTotal,
      valueLabel: 'named credentials, connected apps & remote sites configured',
      detailLabel: 'Guidance',
      detailValue: 'Review unused connections periodically',
      sample: false,
    },
    {
      id: 'platform-currency',
      title: 'Platform Currency',
      icon: '🚀',
      impact: 'Insight',
      value: apiVersion,
      valueLabel: nextRelease ? `Current release: ${nextRelease}` : 'API version',
      detailLabel: 'Edition',
      detailValue: orgType,
      sample: false,
    },
  ];

  return { generatedAt: new Date().toISOString(), cards };
}
