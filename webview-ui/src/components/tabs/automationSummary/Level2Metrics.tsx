import { StatCard, GlassCard, Badge, InfoCard } from '@/components/common';
import TrendLineChart from '@/components/charts/TrendLineChart';
import {
  LEVEL2_STATS,
  TOP_EXECUTIONS,
  EXECUTIONS_TREND,
  FAILURES_BY_AUTOMATION,
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

const RATE_VARIANT: Record<'High' | 'Medium' | 'Low', 'error' | 'warning' | 'info'> = {
  High: 'error',
  Medium: 'warning',
  Low: 'info',
};

export default function Level2Metrics() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {LEVEL2_STATS.map((s) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            value={s.value}
            label={s.label}
            sub={s.sub}
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
          <h3 className="text-xs font-semibold text-sf-text mb-3">Top 5 Automations by Executions (30d)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border">
                  {['Name', 'Type', 'Executions', 'Avg Time', 'Failure Rate'].map((h) => (
                    <th key={h} className="text-left py-2 pr-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOP_EXECUTIONS.map((row) => (
                  <tr key={row.name} className="border-b border-sf-border/40 last:border-0">
                    <td className="py-1.5 pr-2 text-sf-text font-mono text-[10px] truncate max-w-32" title={row.name}>{row.name}</td>
                    <td className="py-1.5 pr-2 text-sf-muted whitespace-nowrap">{row.type}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums">{row.executions.toLocaleString()}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums whitespace-nowrap">{row.avgTimeSec.toFixed(2)} sec</td>
                    <td className="py-1.5 text-sf-muted tabular-nums">{row.failureRatePct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="text-xs font-semibold text-sf-text mb-3">Executions Trend (Last 30 Days)</h3>
          <TrendLineChart
            data={EXECUTIONS_TREND}
            xKey="date"
            series={[{ key: 'value', name: 'Executions', color: '#3b82f6' }]}
            height={200}
            yTickFormatter={(n) => `${Math.round(n / 1000)}K`}
          />
        </GlassCard>

        <GlassCard>
          <CardHeader title="Failures by Automation (30d)" link="View all failures →" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border">
                  {['Automation', 'Type', 'Failures', 'Rate'].map((h) => (
                    <th key={h} className="text-left py-2 pr-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FAILURES_BY_AUTOMATION.map((row) => (
                  <tr key={row.name} className="border-b border-sf-border/40 last:border-0">
                    <td className="py-1.5 pr-2 text-sf-text font-mono text-[10px] truncate max-w-28" title={row.name}>{row.name}</td>
                    <td className="py-1.5 pr-2 text-sf-muted whitespace-nowrap">{row.type}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums">{row.failures.toLocaleString()}</td>
                    <td className="py-1.5"><Badge variant={RATE_VARIANT[row.rate]}>{row.rate}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      <InfoCard variant="warning">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span>⚠ Some automations are failing frequently. Review error details and optimize to improve reliability.</span>
          <span className="text-sf-accent font-semibold whitespace-nowrap cursor-default">View recommendations →</span>
        </div>
      </InfoCard>
    </>
  );
}
