import { StatCard, InfoCard } from '@/components/common';
import { scoreBand } from '@/constants/scoring';
import { ARCHITECTURE_SCORES, TREND_NOTE, sampleSparkline } from './sampleData';

export default function ArchitectureOverview() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {ARCHITECTURE_SCORES.map((s) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            value={`${s.value}/100`}
            label={s.label}
            sub={s.sub}
            accent={scoreBand(s.value).text}
            delta={s.delta}
            sparkline={sampleSparkline(s.value, s.seed)}
            sample
            sampleNote={TREND_NOTE}
          />
        ))}
      </div>

      <InfoCard variant="success">
        ✓ Good news! Your architecture metrics are healthy. Review items marked as High or Medium to improve scalability and maintain performance.
      </InfoCard>
    </>
  );
}
