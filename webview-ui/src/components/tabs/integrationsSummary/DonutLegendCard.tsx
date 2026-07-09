import DonutChart from '@/components/charts/DonutChart';
import { GlassCard, Tooltip } from '@/components/common';
import { useChartTheme } from '@/hooks/useChartTheme';
import type { DonutLegendRow } from './sampleData';

interface Props {
  title: string;
  infoTooltip?: string;
  centerLabel: string;
  centerSubLabel: string;
  rows: DonutLegendRow[];
  footerLabel: string;
  onFooterClick?: () => void;
}

// Local donut+legend card that renders each row's `pct` literally rather than
// recomputing it from slice values (unlike the shared DonutWithLegend) — the
// Integration Architecture mockup's numbers don't always reconcile internally
// (e.g. Technology Distribution's values sum to 78, not the "58" center label),
// and matching the displayed text 1:1 matters more than internal math here.
export default function DonutLegendCard({ title, infoTooltip, centerLabel, centerSubLabel, rows, footerLabel, onFooterClick }: Props) {
  const theme = useChartTheme();
  const palette = theme.chartColors;

  return (
    <GlassCard>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
        {infoTooltip && (
          <Tooltip content={infoTooltip}>
            <span className="text-[10px] text-sf-muted cursor-help">ⓘ</span>
          </Tooltip>
        )}
      </div>
      <DonutChart
        data={rows.map((r) => ({ name: r.name, value: r.value }))}
        height={140}
        showLegend={false}
        colors={palette}
        centerLabel={centerLabel}
        centerSubLabel={centerSubLabel}
      />
      <div className="flex flex-col gap-1 mt-2">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-1.5 text-[10px] min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: palette[i % palette.length] }} />
            <span className="text-sf-text truncate">{r.name}</span>
            <span className="text-sf-muted tabular-nums ml-auto pl-1">{r.value.toLocaleString()}</span>
            <span className="text-sf-muted tabular-nums w-9 text-right shrink-0">({r.pct}%)</span>
          </div>
        ))}
      </div>
      {onFooterClick && (
        <button type="button" onClick={onFooterClick}
          className="text-[11px] font-semibold mt-3"
          style={{ color: 'var(--sf-accent, #0176d3)' }}>
          {footerLabel} →
        </button>
      )}
    </GlassCard>
  );
}
