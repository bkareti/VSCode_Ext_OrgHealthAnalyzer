import { GlassCard, SampleMark } from '@/components/common';
import { deltaText, deltaColorText } from '@/constants/scoring';
import type { WhatChangedRow } from './sampleData';

export default function WhatChangedTable({ rows }: { rows: WhatChangedRow[] }) {
  return (
    <GlassCard className="flex-1 min-w-64">
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">What Changed Since Last Scan</h3>
        <SampleMark />
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] text-sf-muted uppercase tracking-wide">
            <th className="text-left font-medium pb-1.5">Area</th>
            <th className="text-right font-medium pb-1.5">Change</th>
            <th className="text-right font-medium pb-1.5">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.area} className="border-t border-sf-border/30">
              <td className="py-1.5 text-sf-text">{r.area}</td>
              <td className={`py-1.5 text-right font-semibold tabular-nums ${deltaColorText(r.deltaPts)}`}>
                {deltaText(r.deltaPts)} pts
              </td>
              <td className={`py-1.5 text-right ${r.trend === 'up' ? 'text-score-good' : 'text-sev-error'}`}>
                {r.trend === 'up' ? '▲' : '▼'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}
