import { StatCard, GlassCard, Badge, InfoCard } from '@/components/common';
import DonutWithLegend from '@/components/charts/DonutWithLegend';
import {
  OPERATIONAL_STATS,
  TOP_CPU_TRANSACTIONS,
  HEAP_USAGE_DISTRIBUTION,
  TOTAL_TRANSACTIONS,
  SLOWEST_TRANSACTIONS,
  TREND_NOTE,
  sampleSparkline,
} from './sampleData';

function CardHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
      <span className="text-[11px] font-semibold text-sf-accent whitespace-nowrap">View all →</span>
    </div>
  );
}

const IMPACT_VARIANT: Record<'High' | 'Medium', 'error' | 'warning'> = { High: 'error', Medium: 'warning' };

export default function OperationalMetrics() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {OPERATIONAL_STATS.map((s) => (
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
          <CardHeader title="Top CPU Consuming Transactions" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border">
                  {['Transaction / Class', 'Avg CPU Time', 'Executions', 'Impact'].map((h) => (
                    <th key={h} className="text-left py-2 pr-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOP_CPU_TRANSACTIONS.map((t) => (
                  <tr key={t.name} className="border-b border-sf-border/40 last:border-0">
                    <td className="py-1.5 pr-2 text-sf-text font-mono text-[10px] truncate max-w-40" title={t.name}>{t.name}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums whitespace-nowrap">{t.avgCpuMs.toLocaleString()} ms</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums">{t.executions.toLocaleString()}</td>
                    <td className="py-1.5"><Badge variant={IMPACT_VARIANT[t.impact]}>{t.impact}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard>
          <CardHeader title="Heap Usage Distribution" />
          <DonutWithLegend
            data={HEAP_USAGE_DISTRIBUTION}
            layout="side"
            centerLabel={TOTAL_TRANSACTIONS.toLocaleString()}
            centerSubLabel="Total Transactions"
            height={140}
          />
        </GlassCard>

        <GlassCard>
          <CardHeader title="Slowest Transactions (Top 5)" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border">
                  {['Transaction / Class', 'Avg Response Time', 'Impact'].map((h) => (
                    <th key={h} className="text-left py-2 pr-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOWEST_TRANSACTIONS.map((t) => (
                  <tr key={t.name} className="border-b border-sf-border/40 last:border-0">
                    <td className="py-1.5 pr-2 text-sf-text font-mono text-[10px] truncate max-w-40" title={t.name}>{t.name}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums whitespace-nowrap">{t.avgResponseSec.toFixed(2)} sec</td>
                    <td className="py-1.5"><Badge variant={IMPACT_VARIANT[t.impact]}>{t.impact}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      <InfoCard variant="warning">
        ⚠ These metrics are based on available logs (last 14 days). Enable comprehensive logging or export logs regularly for deeper insights.
      </InfoCard>
    </>
  );
}
