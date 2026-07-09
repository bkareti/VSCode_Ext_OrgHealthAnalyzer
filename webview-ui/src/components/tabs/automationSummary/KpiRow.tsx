import { StatCard } from '@/components/common';
import { KPI_STATS, TREND_NOTE, sampleSparkline } from './sampleData';

export default function KpiRow() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {KPI_STATS.map((s) => (
        <StatCard
          key={s.label}
          icon={s.icon}
          value={s.value}
          label={s.label}
          sub={s.sub}
          accent={s.accent}
          delta={s.delta}
          deltaLabel={s.deltaLabel}
          deltaGoodDirection={s.deltaGoodDirection}
          sparkline={sampleSparkline(s.sparkEnd, s.seed)}
          sample
          sampleNote={TREND_NOTE}
        />
      ))}
    </div>
  );
}
