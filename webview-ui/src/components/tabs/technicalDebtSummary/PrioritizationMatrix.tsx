import { GlassCard, SampleMark } from '@/components/common';
import { PRIORITIZATION_MATRIX } from './sampleData';

const QUADRANTS = [
  { label: 'Quick Wins', sub: '(Do First)',              value: PRIORITIZATION_MATRIX.quickWins, style: 'bg-score-good/15 border-score-good/30 text-score-good' },
  { label: 'Strategic',  sub: '(Difficult but Valuable)', value: PRIORITIZATION_MATRIX.strategic, style: 'bg-sev-warning/15 border-sev-warning/30 text-sev-warning' },
  { label: 'Cleanup',    sub: '(Low Impact)',             value: PRIORITIZATION_MATRIX.cleanup,   style: 'bg-sf-bg-3 border-sf-border text-sf-text' },
  { label: 'Long Term',  sub: '(Monitor)',                value: PRIORITIZATION_MATRIX.longTerm,  style: 'bg-sf-bg-3 border-sf-border text-sf-text' },
];

export default function PrioritizationMatrix() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">AI Prioritization Matrix</h3>
        <SampleMark note="Effort/impact scoring is illustrative — OrgPulse does not yet compute a prioritization matrix." />
      </div>
      <div className="flex gap-1.5">
        <div className="flex shrink-0 flex-col items-center justify-center">
          <span className="rotate-180 text-[9px] tracking-wider text-sf-muted uppercase [writing-mode:vertical-lr]">
            Low Effort · High Effort
          </span>
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-2 gap-1.5">
            {QUADRANTS.map((q) => (
              <div key={q.label} className={`rounded border p-2.5 flex flex-col items-center justify-center gap-0.5 ${q.style}`}>
                <span className="text-xl font-bold tabular-nums">{q.value}</span>
                <span className="text-[10px] font-semibold text-center leading-tight">{q.label}</span>
                <span className="text-[9px] text-sf-muted text-center leading-tight">{q.sub}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[9px] tracking-wider text-sf-muted uppercase">
            Low Impact · High Impact
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
