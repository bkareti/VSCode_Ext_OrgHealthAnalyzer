import { StatCard } from '@/components/common';
import type { OrgLimitInfo } from '@/types';
import { capacityScore, capacityScoreLabel, limitsAtRisk, findLimit, fmtStorageMB } from './derivations';
import { sampleSparkline, sampleAvgLabel } from './sampleData';

const TREND_NOTE = 'Trend sparkline is illustrative — OrgPulse only captures a point-in-time snapshot of limit usage, not history across scans.';

export default function StatCardRow({ limits }: { limits: OrgLimitInfo[] }) {
  const score = capacityScore(limits);
  const atRisk = limitsAtRisk(limits);
  const riskLabel = atRisk.length >= 8 ? 'Critical' : atRisk.length >= 3 ? 'Approaching Limit' : 'Low Risk';

  const apiCalls = findLimit(limits, 'DailyApiRequests');
  const dataStorage = findLimit(limits, 'DataStorageMB');
  const fileStorage = findLimit(limits, 'FileStorageMB');
  const asyncApex = findLimit(limits, 'DailyAsyncApexExecutions');
  const platEvents = findLimit(limits, 'HourlyPublishedPlatformEvents');
  const email = findLimit(limits, 'DailySingleEmail');

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <StatCard
        icon="🛡️" value={`${score}/100`} label="Platform Capacity Score" sub={capacityScoreLabel(score)}
        sparkline={sampleSparkline(score, 1)} sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="⚠️" value={atRisk.length} label="Limits at Risk" sub={riskLabel}
        sparkline={sampleSparkline(atRisk.length, 2)} sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="🔌" value={`${apiCalls?.usedPct ?? 0}%`} label="Daily API Utilization" sub={sampleAvgLabel(apiCalls?.usedPct ?? 0, 3)}
        sparkline={sampleSparkline(apiCalls?.usedPct ?? 0, 3)} sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="💾" value={fmtStorageMB(dataStorage?.used ?? 0)} label="Data Storage Used"
        sub={`${dataStorage?.usedPct ?? 0}% of ${fmtStorageMB(dataStorage?.max ?? 0)}`}
        sparkline={sampleSparkline(dataStorage?.usedPct ?? 0, 4)} sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="📁" value={`${fileStorage?.usedPct ?? 0}%`} label="File Storage Used" sub={`of ${fmtStorageMB(fileStorage?.max ?? 0)}`}
        sparkline={sampleSparkline(fileStorage?.usedPct ?? 0, 5)} sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="⚙️" value={`${asyncApex?.usedPct ?? 0}%`} label="Async Processing" sub={sampleAvgLabel(asyncApex?.usedPct ?? 0, 6)}
        sparkline={sampleSparkline(asyncApex?.usedPct ?? 0, 6)} sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="📡" value={`${platEvents?.usedPct ?? 0}%`} label="Platform Events Usage" sub={sampleAvgLabel(platEvents?.usedPct ?? 0, 7)}
        sparkline={sampleSparkline(platEvents?.usedPct ?? 0, 7)} sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="✉️" value={`${email?.usedPct ?? 0}%`} label="Email Usage" sub={sampleAvgLabel(email?.usedPct ?? 0, 8)}
        sparkline={sampleSparkline(email?.usedPct ?? 0, 8)} sample sampleNote={TREND_NOTE}
      />
    </div>
  );
}
