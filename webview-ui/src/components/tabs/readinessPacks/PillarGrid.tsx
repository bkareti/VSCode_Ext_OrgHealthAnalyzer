import ScoreRing from '@/components/charts/ScoreRing';
import GlassCard from '@/components/common/GlassCard';
import type { ReadinessPackAssessment } from '@/types';
import { issueCountForDimension, pillarStatusLabel, PILLAR_STATUS_CLASS } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

/** "Readiness by Pillar" — one card per dimension. Deliberately has no icon. */
export default function PillarGrid({ pack }: Props) {
  return (
    <GlassCard>
      <h3 className="text-xs font-semibold text-sf-text mb-3">Readiness by Pillar</h3>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
        {pack.dimensions.map((d) => {
          const issues = issueCountForDimension(pack, d.dimension);
          return (
            <div
              key={d.dimension}
              className="flex flex-col items-center text-center gap-1.5 rounded-lg border border-sf-border/60 bg-sf-glass-soft p-3"
            >
              <ScoreRing score={d.score} size={54} stroke={6} />
              <span className="text-[10px] font-semibold text-sf-text leading-tight">{d.dimension}</span>
              <span className={`text-[10px] font-semibold ${PILLAR_STATUS_CLASS[d.status]}`}>
                {pillarStatusLabel(d.status)}
              </span>
              <span className="text-[9px] text-sf-muted">
                {issues === 0 ? 'No issues' : `${issues} Issue${issues > 1 ? 's' : ''}`}
              </span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
