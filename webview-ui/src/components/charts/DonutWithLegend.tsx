import DonutChart from './DonutChart';
import { useChartTheme } from '@/hooks/useChartTheme';

export interface DonutLegendRow { name: string; value: number; color?: string }

interface Props {
  data: DonutLegendRow[];
  height?: number;
  layout?: 'side' | 'below';
  centerLabel: string;
  centerSubLabel?: string;
  colors?: string[];
  valueFormatter?: (n: number) => string;
  /** Hide the percent column — needed in narrow (e.g. KPI strip) containers where name + value + pct can't all fit. */
  showPercent?: boolean;
}

// DonutChart's built-in Legend only renders color swatches + names — this
// wraps it with a custom legend showing value + percent per row, in either a
// side-by-side (KPI card) or below (mid-page card) layout.
export default function DonutWithLegend({ data, height = 150, layout = 'below', centerLabel, centerSubLabel, colors, valueFormatter, showPercent = true }: Props) {
  const theme = useChartTheme();
  const palette = colors ?? theme.chartColors;
  const total = data.reduce((s, d) => s + d.value, 0);
  const fmt = valueFormatter ?? ((n: number) => n.toLocaleString());
  const rowColor = (d: DonutLegendRow, i: number) => d.color ?? palette[i % palette.length];

  const legend = (
    <div className={layout === 'side' ? 'flex flex-col gap-1 justify-center' : 'flex flex-col gap-1 mt-2'}>
      {data.map((d, i) => {
        const pct = total ? Math.round((d.value / total) * 100) : 0;
        return (
          <div key={d.name} className="flex items-center gap-1 text-[10px] min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: rowColor(d, i) }} />
            <span className="text-sf-text truncate">{d.name}</span>
            <span className="text-sf-muted tabular-nums ml-auto pl-1">{fmt(d.value)}</span>
            {showPercent && <span className="text-sf-muted tabular-nums w-8 text-right shrink-0">{pct}%</span>}
          </div>
        );
      })}
    </div>
  );

  const donut = (
    <DonutChart
      data={data.map((d) => ({ name: d.name, value: d.value }))}
      height={height}
      showLegend={false}
      colors={data.map((d, i) => rowColor(d, i))}
      centerLabel={centerLabel}
      centerSubLabel={centerSubLabel}
    />
  );

  if (layout === 'side') {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">{donut}</div>
        <div className="flex-1 min-w-0">{legend}</div>
      </div>
    );
  }

  return (
    <div>
      {donut}
      {legend}
    </div>
  );
}
