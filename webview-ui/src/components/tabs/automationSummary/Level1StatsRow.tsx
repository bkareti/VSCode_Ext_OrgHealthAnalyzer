import { StatCard, InfoCard } from '@/components/common';
import { AUTOMATION_TYPE_STATS, TREND_NOTE, sampleSparkline } from './sampleData';

export default function Level1StatsRow() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {AUTOMATION_TYPE_STATS.map((s) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            value={s.value}
            label={s.label}
            delta={s.delta}
            deltaLabel={s.deltaLabel}
            deltaGoodDirection={s.deltaGoodDirection}
            sparkline={sampleSparkline(s.sparkEnd, s.seed)}
            sample
            sampleNote={TREND_NOTE}
          />
        ))}
      </div>

      <InfoCard variant="success">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span>✓ Good news! Your org has a healthy automation distribution. Continue monitoring high complexity automations.</span>
          <span className="text-sf-accent font-semibold whitespace-nowrap cursor-default">See best practices →</span>
        </div>
      </InfoCard>
    </>
  );
}
