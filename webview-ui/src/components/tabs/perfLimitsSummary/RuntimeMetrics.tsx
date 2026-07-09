import { StatCard, GlassCard, InfoCard } from '@/components/common';
import TrendLineChart from '@/components/charts/TrendLineChart';
import {
  RUNTIME_STATS,
  PAGE_LOAD_TREND,
  API_RESPONSE_TREND,
  TOP_SLOW_PAGES,
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

export default function RuntimeMetrics() {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {RUNTIME_STATS.map((s) => (
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
          <h3 className="text-xs font-semibold text-sf-text mb-3">Page Load Time Trend (30 Days)</h3>
          <TrendLineChart
            data={PAGE_LOAD_TREND}
            xKey="date"
            series={[{ key: 'value', name: 'Avg Page Load Time (sec)', color: '#3b82f6' }]}
            height={200}
          />
        </GlassCard>

        <GlassCard>
          <h3 className="text-xs font-semibold text-sf-text mb-3">API Response Time Trend (30 Days)</h3>
          <TrendLineChart
            data={API_RESPONSE_TREND}
            xKey="date"
            series={[{ key: 'value', name: 'Avg Response Time (ms)', color: '#8b5cf6' }]}
            height={200}
          />
        </GlassCard>

        <GlassCard>
          <CardHeader title="Top Slow Pages" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-sf-border">
                  {['Page URL', 'Avg Load Time', 'Page Views'].map((h) => (
                    <th key={h} className="text-left py-2 pr-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOP_SLOW_PAGES.map((p) => (
                  <tr key={p.url} className="border-b border-sf-border/40 last:border-0">
                    <td className="py-1.5 pr-2 text-sf-text font-mono text-[10px] truncate max-w-40" title={p.url}>{p.url}</td>
                    <td className="py-1.5 pr-2 text-sf-muted tabular-nums whitespace-nowrap">{p.avgLoadSec.toFixed(2)} sec</td>
                    <td className="py-1.5 text-sf-muted tabular-nums">{p.pageViews.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      <InfoCard variant="info">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span>ℹ Runtime performance insights are available because Shield Event Monitoring is enabled.</span>
          <span className="text-sf-accent font-semibold whitespace-nowrap cursor-default">Learn more about Event Monitoring →</span>
        </div>
      </InfoCard>
    </>
  );
}
