import { useState } from 'react';
import GlassCard from '@/components/common/GlassCard';
import ProgressBar from '@/components/common/ProgressBar';
import type { ReadinessPackAssessment } from '@/types';

interface Props {
  pack: ReadinessPackAssessment;
}

const VISIBLE_COUNT = 5;

const SCORE_COLOR = (s: number) =>
  s >= 90 ? '#22c55e' : s >= 75 ? '#84cc16' : s >= 50 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';

export default function DimensionTable({ pack }: Props) {
  const [showAll, setShowAll] = useState(false);
  const dimensions = pack.dimensions;
  const visible = showAll ? dimensions : dimensions.slice(0, VISIBLE_COUNT);

  return (
    <GlassCard title="Readiness by Dimension">
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              {['Dimension', 'Score', 'Status', 'What it means'].map((h) => (
                <th key={h} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sf-muted border-b border-sf-border/60 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((dim, i) => (
              <tr key={dim.dimension} className={i % 2 ? 'bg-sf-glass-stripe' : ''}>
                <td className="px-2 py-2 text-xs text-sf-text align-top whitespace-nowrap">{dim.dimension}</td>
                <td className="px-2 py-2 text-xs font-semibold text-sf-text align-top tabular-nums">{Math.round(dim.score)}%</td>
                <td className="px-2 py-2 align-top" style={{ minWidth: 100 }}>
                  <ProgressBar pct={dim.score} color={SCORE_COLOR(dim.score)} height="sm" />
                </td>
                <td className="px-2 py-2 text-[11px] text-sf-muted align-top" style={{ maxWidth: 320 }}>{dim.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dimensions.length > VISIBLE_COUNT && (
        <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '▴ Show fewer' : `View all ${dimensions.length} dimensions →`}
        </button>
      )}
    </GlassCard>
  );
}
