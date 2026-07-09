import { GlassCard, SampleMark } from '@/components/common';
import type { AnalysisResult } from '@/types';
import { largestObjectsByRecordCount } from './derivations';
import { estimateStorageMB } from './sampleData';

const SIZE_SAMPLE_NOTE = 'Records are real; Size is illustrative — OrgPulse does not query per-object storage bytes today.';

export default function LargestObjectsCard({ results }: { results: AnalysisResult }) {
  const rows = largestObjectsByRecordCount(results, 10);

  return (
    <GlassCard>
      <h3 className="text-xs font-semibold text-sf-text mb-3">Largest Objects by Storage</h3>
      {rows.length === 0 ? (
        <p className="text-[11px] text-sf-muted">No object record-count data available for this org.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-sf-border">
                <th className="text-left py-2 pr-3 text-sf-muted font-medium">Object</th>
                <th className="text-right py-2 px-2 text-sf-muted font-medium">Records</th>
                <th className="text-right py-2 pl-2 text-sf-muted font-medium">
                  <span className="inline-flex items-center gap-1">Size <SampleMark note={SIZE_SAMPLE_NOTE} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.objectName} className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors">
                  <td className="py-1.5 pr-3 text-sf-text font-medium">{row.objectLabel}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-sf-text">{row.recordCount.toLocaleString()}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-sf-muted">{estimateStorageMB(row.recordCount).toLocaleString()} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <span className="text-[10px] text-sf-accent/70 mt-2 block cursor-default">View all objects →</span>
    </GlassCard>
  );
}
