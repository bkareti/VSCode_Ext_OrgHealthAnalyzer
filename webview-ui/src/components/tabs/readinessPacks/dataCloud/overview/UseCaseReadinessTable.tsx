import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import ProgressBar from '@/components/common/ProgressBar';
import SampleMark from '@/components/common/SampleMark';
import { DATA_CLOUD_USE_CASES, type DataCloudUseCase } from '../sampleData';

const STATUS_VARIANT: Record<DataCloudUseCase['status'], 'success' | 'info' | 'warning' | 'error'> = {
  Ready: 'success',
  Good: 'info',
  Moderate: 'warning',
  'At Risk': 'error',
};

export default function UseCaseReadinessTable() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Data Cloud Use Case Readiness</h3>
        <SampleMark note="Illustrative — no collector currently computes a per-use-case readiness percentage." />
      </div>
      <div className="flex flex-col gap-2">
        {DATA_CLOUD_USE_CASES.map((uc) => (
          <div key={uc.name} className="flex items-center gap-2">
            <span className="text-[11px] text-sf-text-2 flex-1 min-w-0 truncate">{uc.name}</span>
            <div className="w-20 shrink-0">
              <ProgressBar pct={uc.readinessPct} height="sm" />
            </div>
            <span className="text-[11px] text-sf-muted tabular-nums w-9 text-right shrink-0">{uc.readinessPct}%</span>
            <Badge variant={STATUS_VARIANT[uc.status]} className="shrink-0">{uc.status}</Badge>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
