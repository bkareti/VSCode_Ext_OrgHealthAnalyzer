import { StatCard, GlassCard, InfoCard } from '@/components/common';
import DonutWithLegend from '@/components/charts/DonutWithLegend';
import {
  LEVEL3_STATS,
  EXECUTION_TIME_DISTRIBUTION,
  SLOW_AUTOMATIONS_BY_USERS,
  RUNTIME_EVENTS,
  TREND_NOTE,
  sampleSparkline,
} from './sampleData';

function CardHeader({ title, link }: { title: string; link: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
      <span className="text-[11px] font-semibold text-sf-accent whitespace-nowrap">{link}</span>
    </div>
  );
}

const STATUS_DOT: Record<'good' | 'warning' | 'error', string> = {
  good: 'text-score-good',
  warning: 'text-sev-warning',
  error: 'text-sev-error',
};
const STATUS_GLYPH: Record<'good' | 'warning' | 'error', string> = {
  good: '✓',
  warning: '⚠',
  error: '⚠',
};

export default function Level3Runtime() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {LEVEL3_STATS.map((s) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard>
          <h3 className="text-xs font-semibold text-sf-text mb-3">Execution Time Distribution</h3>
          <DonutWithLegend
            data={EXECUTION_TIME_DISTRIBUTION}
            layout="side"
            centerLabel="100%"
            centerSubLabel="Executions"
            valueFormatter={(n) => `${n}%`}
            showPercent={false}
            height={150}
          />
        </GlassCard>

        <GlassCard>
          <h3 className="text-xs font-semibold text-sf-text mb-3">Slow Automations by Users (30d)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border">
                  {['User', 'Executions', 'Avg Time', 'User Wait Time'].map((h) => (
                    <th key={h} className="text-left py-2 pr-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOW_AUTOMATIONS_BY_USERS.map((row) => (
                  <tr key={row.user} className="border-b border-sf-border/40 last:border-0">
                    <td className="py-1.5 pr-2 text-sf-text font-mono text-[10px] truncate max-w-28" title={row.user}>{row.user}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums">{row.executions.toLocaleString()}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums whitespace-nowrap">{row.avgTimeSec.toFixed(2)} sec</td>
                    <td className="py-1.5 text-sf-muted tabular-nums whitespace-nowrap">{row.userWaitHrs.toFixed(1)} hrs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard>
          <CardHeader title="Runtime Events (30d)" link="View all events →" />
          <div className="space-y-1.5">
            {RUNTIME_EVENTS.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs py-1.5 border-b border-sf-border/40 last:border-0">
                <span className="flex items-center gap-1.5 text-sf-text">
                  <span className={STATUS_DOT[row.status]}>{STATUS_GLYPH[row.status]}</span>
                  {row.label}
                </span>
                <span className="text-sf-text font-semibold tabular-nums">{row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <InfoCard variant="info">
        ℹ Runtime insights are available because Shield Event Monitoring is enabled.
      </InfoCard>
    </>
  );
}
