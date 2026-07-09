import { GlassCard, SampleMark } from '@/components/common';
import DonutWithLegend from '@/components/charts/DonutWithLegend';
import type { OrgLimitInfo } from '@/types';
import { storageBreakdown, fmtStorageMB } from './derivations';
import { BIG_OBJECTS_STORAGE_MB } from './sampleData';

const SAMPLE_NOTE = 'File Storage and Data Storage totals are real; "Big Objects" is illustrative — OrgPulse does not query Big Object storage consumption today.';

export default function StorageBreakdownCard({ limits }: { limits: OrgLimitInfo[] }) {
  const { fileStorageMB, dataStorageMB } = storageBreakdown(limits);
  const total = fileStorageMB + dataStorageMB + BIG_OBJECTS_STORAGE_MB;

  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Storage Breakdown</h3>
        <SampleMark note={SAMPLE_NOTE} />
      </div>
      <DonutWithLegend
        data={[
          { name: 'File Storage', value: fileStorageMB, color: '#3b82f6' },
          { name: 'Data Storage', value: dataStorageMB, color: '#22c55e' },
          { name: 'Big Objects', value: BIG_OBJECTS_STORAGE_MB, color: '#f59e0b' },
        ]}
        centerLabel={fmtStorageMB(total)}
        centerSubLabel="Total"
        valueFormatter={(mb) => fmtStorageMB(mb)}
      />
    </GlassCard>
  );
}
