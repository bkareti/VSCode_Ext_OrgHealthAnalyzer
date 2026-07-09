import { GlassCard, SampleMark } from '@/components/common';
import TrendLineChart from '@/components/charts/TrendLineChart';
import type { HealthTrendPoint } from './sampleData';

const SERIES = [
  { key: 'overall',         name: 'Overall',         color: '#3b82f6' },
  { key: 'architecture',    name: 'Architecture',    color: '#8b5cf6' },
  { key: 'security',        name: 'Security',        color: '#22c55e' },
  { key: 'codeQuality',     name: 'Code Quality',    color: '#f59e0b' },
  { key: 'futureReadiness', name: 'Future Readiness', color: '#ec4899' },
];

export default function HealthScoreTrendCard({ data }: { data: HealthTrendPoint[] }) {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Health Score Trend (Last 12 Scans)</h3>
        <SampleMark />
      </div>
      <TrendLineChart
        data={data}
        xKey="month"
        series={SERIES}
        height={200}
        yDomain={[0, 100]}
      />
    </GlassCard>
  );
}
