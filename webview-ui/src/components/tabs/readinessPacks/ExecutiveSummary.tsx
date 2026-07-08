import ScoreRing from '@/components/charts/ScoreRing';
import GlassCard from '@/components/common/GlassCard';
import StatCard from '@/components/common/StatCard';
import type { ReadinessPackAssessment } from '@/types';
import { decisionLabel, riskLabel, impactFor, effortHoursFor } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

export default function ExecutiveSummary({ pack }: Props) {
  const signals = pack.signals ?? [];
  const totalChecks = signals.length;
  const criticalIssues = signals.filter((s) => impactFor(s) === 'Critical').length;
  const warnings = signals.filter((s) => s.status === 'partial').length;
  const estimatedEffortHours = signals
    .filter((s) => s.status !== 'ready')
    .reduce((sum, s) => sum + effortHoursFor(impactFor(s)), 0);
  const risk = riskLabel(pack.overallScore);
  const gapPct = Math.max(0, 100 - pack.overallScore);

  return (
    <GlassCard>
      <p className="text-[11px] font-semibold text-sf-muted uppercase tracking-wide mb-3">
        Overall {pack.packName}
      </p>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)] items-center">
        <div className="flex flex-col items-center">
          <ScoreRing score={pack.overallScore} size={132} stroke={12} />
          <div className="text-center mt-2">
            <div className="text-xs">
              <span className="font-bold text-sf-text">{decisionLabel(pack.overallScore)}</span>{' '}
              <span className="text-sf-muted">with</span>
            </div>
            <div className={`text-xs font-bold ${risk.cls}`}>{risk.label}</div>
          </div>
        </div>
        <div>
          <p className="text-xs text-sf-muted leading-relaxed mb-3">
            {gapPct === 0
              ? `Every check in ${pack.packName} is currently passing.`
              : `You are ${gapPct}% away from being fully ready for ${pack.packName}.`}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatCard label="Total Checks" value={totalChecks} />
            <StatCard label="Critical Issues" value={criticalIssues} accent={criticalIssues > 0 ? 'text-sev-error' : 'text-score-good'} />
            <StatCard label="Warnings" value={warnings} accent={warnings > 0 ? 'text-sev-warning' : 'text-score-good'} />
            <StatCard label="Estimated Effort" value={`${estimatedEffortHours}h`} accent="text-sf-accent" />
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
