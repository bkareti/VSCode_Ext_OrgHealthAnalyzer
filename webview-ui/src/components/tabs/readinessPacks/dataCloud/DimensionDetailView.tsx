import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import ScoreRing from '@/components/charts/ScoreRing';
import type { ReadinessPackAssessment } from '@/types';
import { STATUS_LABEL } from '../derivations';
import { dimensionsForSubtab, signalsForSubtab, type DataCloudSubtab } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
  subtab: DataCloudSubtab;
}

export default function DimensionDetailView({ pack, subtab }: Props) {
  const dimensions = dimensionsForSubtab(pack, subtab);
  const signals = signalsForSubtab(pack, subtab);

  if (dimensions.length === 0) {
    return (
      <GlassCard>
        <p className="text-xs text-sf-muted py-4 text-center">No {subtab} data available in this report.</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dimensions.map((dim) => (
          <GlassCard key={dim.dimension}>
            <div className="flex items-center gap-3">
              <ScoreRing score={dim.score} size={64} stroke={6} grade={dim.grade} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sf-text">{dim.dimension}</p>
                <p className="text-[11px] text-sf-muted mt-1 leading-snug">{dim.reason}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard title={`${subtab} — Checks`}>
        {signals.length === 0 ? (
          <p className="text-xs text-sf-muted py-2">No individual checks recorded for this dimension.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  {['Check', 'Status', 'Why It Matters'].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sf-muted border-b border-sf-border/60 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.map((signal, i) => {
                  const status = STATUS_LABEL[signal.status];
                  return (
                    <tr key={signal.id} className={i % 2 ? 'bg-sf-glass-stripe' : ''}>
                      <td className="px-2 py-2 text-xs text-sf-text align-top whitespace-nowrap">{signal.label ?? signal.id}</td>
                      <td className="px-2 py-2 align-top"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-2 py-2 text-[11px] text-sf-muted align-top" style={{ maxWidth: 380 }}>{signal.whyItMatters}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
