import { useState } from 'react';
import GlassCard from '@/components/common/GlassCard';
import ProgressBar from '@/components/common/ProgressBar';
import type { ReadinessPackAssessment } from '@/types';
import { capabilityRows } from '../derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

const VISIBLE_COUNT = 7;

const SCORE_COLOR = (s: number) =>
  s >= 90 ? '#22c55e' : s >= 75 ? '#84cc16' : s >= 50 ? '#eab308' : s >= 25 ? '#f97316' : '#ef4444';

function statusLabel(score: number): { label: string; cls: string } {
  if (score >= 80) { return { label: 'Good', cls: 'text-score-good' }; }
  if (score >= 50) { return { label: 'Moderate', cls: 'text-sev-warning' }; }
  return { label: 'Needs Attention', cls: 'text-sev-error' };
}

export default function CapabilityTable({ pack }: Props) {
  const [showAll, setShowAll] = useState(false);
  const rows = capabilityRows(pack);
  const visible = showAll ? rows : rows.slice(0, VISIBLE_COUNT);

  return (
    <GlassCard title="Readiness by Capability">
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              {['Capability Area', 'Score', 'Status', 'What it means'].map((h) => (
                <th key={h} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sf-muted border-b border-sf-border/60 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const status = statusLabel(row.score);
              return (
                <tr key={row.dimension} className={i % 2 ? 'bg-sf-glass-stripe' : ''}>
                  <td className="px-2 py-2 text-xs text-sf-text align-top whitespace-nowrap">{row.displayLabel}</td>
                  <td className="px-2 py-2 align-top" style={{ minWidth: 120 }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-sf-text tabular-nums shrink-0">{Math.round(row.score)}%</span>
                      <ProgressBar pct={row.score} color={SCORE_COLOR(row.score)} height="sm" />
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.cls}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-sf-muted align-top" style={{ maxWidth: 320 }}>{row.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > VISIBLE_COUNT && (
        <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '▴ Show fewer' : 'View all capability details →'}
        </button>
      )}
    </GlassCard>
  );
}
