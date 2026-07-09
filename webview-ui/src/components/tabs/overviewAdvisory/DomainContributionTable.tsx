import { GlassCard, ProgressBar, SampleMark } from '@/components/common';
import { scoreHex } from '@/constants/scoring';
import type { DomainRow } from './sampleData';

interface Props {
  rows: DomainRow[];
  total: { score: number; weightPct: number; weightedScore: number; contributionPct: number };
}

export default function DomainContributionTable({ rows, total }: Props) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-sf-text">Domain Contribution to Health Score</h3>
          <SampleMark />
        </div>
        <span className="text-[10px] text-sf-accent hover:underline cursor-default">View details →</span>
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-[9px] text-sf-muted uppercase tracking-wide">
            <th className="text-left font-medium pb-1.5">Domain</th>
            <th className="text-left font-medium pb-1.5">Score</th>
            <th className="text-right font-medium pb-1.5">Weight</th>
            <th className="text-right font-medium pb-1.5">Weighted</th>
            <th className="text-right font-medium pb-1.5">Contribution</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domain} className="border-t border-sf-border/30">
              <td className="py-1.5 text-sf-text">{r.domain}</td>
              <td className="py-1.5 w-28">
                <div className="flex items-center gap-1.5">
                  <span className="tabular-nums text-sf-text">{r.score}</span>
                  <div className="flex-1"><ProgressBar pct={r.score} color={scoreHex(r.score)} /></div>
                </div>
              </td>
              <td className="py-1.5 text-right text-sf-muted tabular-nums">{r.weight}%</td>
              <td className="py-1.5 text-right text-sf-text tabular-nums">{r.weightedScore}</td>
              <td className="py-1.5 text-right text-sf-text tabular-nums">{r.contributionPct}%</td>
            </tr>
          ))}
          <tr className="border-t border-sf-border font-semibold">
            <td className="py-1.5 text-sf-text">Total</td>
            <td className="py-1.5 text-sf-text tabular-nums">{total.score}</td>
            <td className="py-1.5 text-right text-sf-text tabular-nums">{total.weightPct}%</td>
            <td className="py-1.5 text-right text-sf-text tabular-nums">{total.weightedScore}</td>
            <td className="py-1.5 text-right text-sf-text tabular-nums">{total.contributionPct}%</td>
          </tr>
        </tbody>
      </table>
    </GlassCard>
  );
}
