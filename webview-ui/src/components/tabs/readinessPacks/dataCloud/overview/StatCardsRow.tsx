import StatCard from '@/components/common/StatCard';
import type { ReadinessPackAssessment } from '@/types';
import { dataSourcesDetected, findDimension, projectedScoreAfterFullRemediation } from '../derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

export default function StatCardsRow({ pack }: Props) {
  const sources = dataSourcesDetected(pack);
  const identityDim = findDimension(pack, 'Identity Resolution Readiness');
  const activationDim = findDimension(pack, 'Activation & Insights');
  const projected = projectedScoreAfterFullRemediation(pack);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      <StatCard
        icon="🛡️"
        value={`${pack.overallScore}/100`}
        label="Data Cloud Readiness Score"
        sub={pack.grade}
        accent="text-sf-accent"
      />
      <StatCard
        icon="🚩"
        value={pack.blockingIssues.length}
        label="Critical Gaps"
        sub="Must Fix"
        accent="text-sev-error"
      />
      <StatCard
        icon="📦"
        value="—"
        label="Data Volume Analyzed"
        sub="Total Data"
        sample
        sampleNote="No collector currently measures Data Cloud ingested data volume — this card is a placeholder until one exists."
      />
      <StatCard
        icon="🔗"
        value={`${sources.connected}/${sources.total}`}
        label="Data Sources Detected"
        sub="Connected / Configured"
      />
      <StatCard
        icon="👥"
        value={identityDim ? `${Math.round(identityDim.score)}%` : 'N/A'}
        label="Identity Resolution Score"
        sub={identityDim?.status === 'ready' ? 'Good' : identityDim?.status === 'partial' ? 'Moderate' : 'Needs Work'}
      />
      <StatCard
        icon="🚀"
        value={activationDim ? `${Math.round(activationDim.score)}%` : 'N/A'}
        label="Activation Readiness"
        sub={activationDim?.status === 'ready' ? 'Good' : activationDim?.status === 'partial' ? 'Moderate' : 'Needs Work'}
      />
      <StatCard
        icon="🎯"
        value={`${projected}%`}
        label="Estimated Readiness After Fixes"
        sub="Potential after remediation"
        accent="text-score-good"
        sample
        sampleNote="Estimated — projected from quick-win/gap remediation lift, not a scan measurement."
      />
    </div>
  );
}
