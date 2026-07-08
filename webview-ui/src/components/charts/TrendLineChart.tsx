import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';

export interface TrendSeries { key: string; name: string; color?: string; dashed?: boolean }

interface Props {
  data: Record<string, number | string>[];
  xKey: string;
  series: TrendSeries[];
  height?: number;
  yDomain?: [number, number];
  yTickFormatter?: (n: number) => string;
}

// No shared multi-line trend chart exists elsewhere — SparklineChart has no
// axes/labels, and CodeQuality.tsx's TrendChart is a private single-line
// component. Renders its own legend since Recharts' default Legend can't
// show a dashed-line swatch for series marked `dashed`.
export default function TrendLineChart({ data, xKey, series, height = 220, yDomain, yTickFormatter }: Props) {
  const theme = useChartTheme();
  const colorFor = (s: TrendSeries, i: number) => s.color ?? theme.chartColors[i % theme.chartColors.length];

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        {series.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-sf-muted">
            {s.dashed ? (
              <svg width="14" height="8" aria-hidden>
                <line x1="0" y1="4" x2="14" y2="4" stroke={colorFor(s, i)} strokeWidth={2} strokeDasharray="3 2" />
              </svg>
            ) : (
              <span className="w-2 h-2 rounded-full" style={{ background: colorFor(s, i) }} />
            )}
            {s.name}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: theme.textMuted, fontSize: 10 }} axisLine={{ stroke: theme.border }} tickLine={false} />
          <YAxis
            domain={yDomain}
            tickFormatter={yTickFormatter}
            tick={{ fill: theme.textMuted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 11 }}
            labelStyle={{ color: theme.text }}
            itemStyle={{ color: theme.text }}
          />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={colorFor(s, i)}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '6 4' : undefined}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
