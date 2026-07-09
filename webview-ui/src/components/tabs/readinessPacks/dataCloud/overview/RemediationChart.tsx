import GlassCard from '@/components/common/GlassCard';
import SampleMark from '@/components/common/SampleMark';
import TrendLineChart from '@/components/charts/TrendLineChart';
import type { ReadinessPackAssessment } from '@/types';
import { projectedScoreAfterQuickWins, projectedScoreAfterFullRemediation } from '../derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

export default function RemediationChart({ pack }: Props) {
  const afterQuickWins = projectedScoreAfterQuickWins(pack);
  const afterFullRemediation = projectedScoreAfterFullRemediation(pack);

  const data = [
    { label: 'Current', score: pack.overallScore },
    { label: 'After Quick Wins', score: afterQuickWins },
    { label: 'After Full Remediation', score: afterFullRemediation },
  ];

  const effort = pack.blockingIssues.length >= 5 ? 'High' : pack.blockingIssues.length >= 2 ? 'Medium' : 'Low';
  const timeline = pack.blockingIssues.length >= 5 ? '4-6 Months' : pack.blockingIssues.length >= 2 ? '2-4 Months' : '1-2 Months';
  const confidence = pack.confidence.charAt(0).toUpperCase() + pack.confidence.slice(1);

  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Readiness After Remediation</h3>
        <SampleMark note="Estimated — projected from quick-win/gap remediation lift, not a scan measurement." />
      </div>
      <TrendLineChart
        data={data}
        xKey="label"
        series={[{ key: 'score', name: 'Readiness %', color: '#22c55e' }]}
        height={160}
        yDomain={[0, 100]}
      />
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-sf-border/50 text-center">
        <div>
          <p className="text-[10px] text-sf-muted">Effort</p>
          <p className="text-xs font-semibold text-sf-text">{effort}</p>
        </div>
        <div>
          <p className="text-[10px] text-sf-muted">Timeline</p>
          <p className="text-xs font-semibold text-sf-text">{timeline}</p>
        </div>
        <div>
          <p className="text-[10px] text-sf-muted">Confidence</p>
          <p className="text-xs font-semibold text-sf-text">{confidence}</p>
        </div>
      </div>
      <p className="text-[10px] text-sf-muted/70 mt-2">
        Scores are estimated from remediation of identified gaps and quick wins — actual results depend on execution.
      </p>
    </GlassCard>
  );
}
