import { useState } from 'react';
import { GlassCard, SampleMark } from '@/components/common';
import SparklineChart from '@/components/charts/SparklineChart';
import { usageBand } from '@/constants/scoring';
import type { OrgLimitInfo } from '@/types';
import { capacityHealthRows } from './derivations';
import { sampleSparkline } from './sampleData';

const TREND_NOTE = 'Trend sparklines are illustrative — OrgPulse only captures a point-in-time snapshot of limit usage, not history across scans.';

export default function CapacityHealthTable({ limits }: { limits: OrgLimitInfo[] }) {
  const [expanded, setExpanded] = useState(false);
  const all = capacityHealthRows(limits, limits.length);
  const visible = expanded ? all : all.slice(0, 10);

  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Capacity Health (Overview)</h3>
        <SampleMark note={TREND_NOTE} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-sf-border">
              <th className="text-left py-2 pr-3 text-sf-muted font-medium">Limit Category</th>
              <th className="text-right py-2 px-2 text-sf-muted font-medium">Used</th>
              <th className="text-left py-2 px-2 text-sf-muted font-medium">Trend (7 Days)</th>
              <th className="text-center py-2 pl-2 text-sf-muted font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const band = usageBand(row.usedPct);
              return (
                <tr key={row.name} className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors">
                  <td className="py-1.5 pr-3 text-sf-text font-medium truncate max-w-48">{row.label}</td>
                  <td className={`py-1.5 px-2 text-right font-semibold tabular-nums ${band.text}`}>{row.usedPct}%</td>
                  <td className="py-1.5 px-2 w-24">
                    <SparklineChart data={sampleSparkline(row.usedPct, i + 1)} color={band.hex} height={24} />
                  </td>
                  <td className="py-1.5 pl-2 text-center">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${band.badge}`}>
                      {band.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {all.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-[11px] text-sf-accent hover:underline"
        >
          {expanded ? 'Show less' : 'View all daily limits details →'}
        </button>
      )}
    </GlassCard>
  );
}
