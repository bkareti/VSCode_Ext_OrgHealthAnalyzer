import { GlassCard, SampleMark } from '@/components/common';
import ScoreRing from '@/components/charts/ScoreRing';
import type { VerdictData } from './sampleData';

export default function OverallVerdictCard({ verdict }: { verdict: VerdictData }) {
  return (
    <GlassCard className="flex-1 min-w-64">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-lg">🛡️</span>
        <h3 className="text-xs font-semibold text-sf-text">Overall Verdict</h3>
        <SampleMark />
      </div>
      <p className="text-[13px] font-semibold text-score-good leading-snug mb-1.5">
        {verdict.headline}
      </p>
      <p className="text-[11px] text-sf-muted leading-snug mb-3">{verdict.description}</p>
      <div className="flex items-center gap-4">
        <ScoreRing score={verdict.score} size={72} stroke={8} grade="/100" />
        <div>
          <p className="text-[10px] text-sf-muted uppercase tracking-wide leading-tight">
            {verdict.scoreLabel}
          </p>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-sf-text leading-tight">{verdict.maturity}</p>
          <p className="text-[10px] text-sf-muted leading-tight">Architecture Maturity</p>
        </div>
      </div>
    </GlassCard>
  );
}
