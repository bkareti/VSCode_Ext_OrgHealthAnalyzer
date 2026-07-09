import { useState, useMemo } from 'react';
import { GlassCard, SampleMark } from '@/components/common';
import SegmentedTabs from '@/components/common/SegmentedTabs';
import TrendLineChart from '@/components/charts/TrendLineChart';
import { USAGE_TREND_TABS, usageTrendSeries, type UsageTrendCategory } from './sampleData';

const SAMPLE_NOTE = 'This 30-day trend is illustrative — OrgPulse does not persist daily limit-usage snapshots yet, only the current period.';

export default function UsageTrendsCard() {
  const [category, setCategory] = useState<UsageTrendCategory>('api');
  const data = useMemo(() => usageTrendSeries(category), [category]);

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-sf-text">Usage Trends (30 Days)</h3>
          <SampleMark note={SAMPLE_NOTE} />
        </div>
        <SegmentedTabs items={USAGE_TREND_TABS} active={category} onChange={setCategory} variant="pill" size="sm" />
      </div>
      <TrendLineChart
        data={data}
        xKey="date"
        series={[
          { key: 'usage', name: 'Daily Usage %', color: '#3b82f6' },
          { key: 'avg7d', name: '7 Day Average', color: '#8b5cf6', dashed: true },
        ]}
        yDomain={[0, 100]}
        yTickFormatter={(n) => `${n}%`}
        height={220}
      />
      <span className="text-[10px] text-sf-accent/70 mt-2 block cursor-default">View all trend analytics →</span>
    </GlassCard>
  );
}
