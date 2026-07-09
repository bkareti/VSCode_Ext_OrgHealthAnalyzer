import StatCard from '@/components/common/StatCard';
import type { FutureReadinessReport, ReadinessPackAssessment } from '@/types';
import {
  criticalGapCount,
  findDimension,
  platformReadinessScore,
  automationReadinessScore,
  projectedScoreAfterFullRemediation,
  scoreDelta,
} from '../derivations';

interface Props {
  pack: ReadinessPackAssessment;
  report: FutureReadinessReport;
}

function readinessLabel(score: number): string {
  if (score >= 80) { return 'Ready'; }
  if (score >= 50) { return 'Partially Ready'; }
  return 'Not Ready';
}

export default function StatCardsRow({ pack, report }: Props) {
  const dataDim = findDimension(pack, 'Data & Metadata Quality');
  const platform = platformReadinessScore(pack);
  const automation = automationReadinessScore(pack);
  const projected = projectedScoreAfterFullRemediation(pack);
  const delta = scoreDelta(report);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      <StatCard
        icon="🤖"
        value={`${pack.overallScore}/100`}
        label="Agentforce Readiness Score"
        sub={readinessLabel(pack.overallScore)}
        accent="text-sf-accent"
        delta={delta}
      />
      <StatCard
        icon="🚩"
        value={criticalGapCount(pack)}
        label="Critical Gaps"
        sub="Must Fix"
        accent="text-sev-error"
        sample
        sampleNote="Trend vs last scan is illustrative — only the overall score has a tracked historical delta today."
      />
      <StatCard
        icon="🗄️"
        value={dataDim ? `${Math.round(dataDim.score)}%` : 'N/A'}
        label="Data Readiness"
        sub={dataDim?.status === 'ready' ? 'Good' : dataDim?.status === 'partial' ? 'Moderate' : 'Needs Attention'}
        sample
        sampleNote="Trend vs last scan is illustrative — only the overall score has a tracked historical delta today."
      />
      <StatCard
        icon="🧩"
        value={`${platform}%`}
        label="Platform Readiness"
        sub={platform >= 80 ? 'Good' : platform >= 50 ? 'Moderate' : 'Needs Attention'}
        sample
        sampleNote="Trend vs last scan is illustrative — only the overall score has a tracked historical delta today."
      />
      <StatCard
        icon="⚙️"
        value={`${automation}%`}
        label="Automation Readiness"
        sub={automation >= 80 ? 'Good' : automation >= 50 ? 'Moderate' : 'Needs Attention'}
        sample
        sampleNote="Trend vs last scan is illustrative — only the overall score has a tracked historical delta today."
      />
      <StatCard
        icon="🎯"
        value={`${projected}%`}
        label="Estimated Readiness"
        sub="After Remediation"
        accent="text-score-good"
        sample
        sampleNote="Estimated — projected from gap/quick-win remediation lift, not a scan measurement."
      />
    </div>
  );
}
