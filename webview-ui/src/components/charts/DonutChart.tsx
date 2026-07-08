import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '@/hooks/useChartTheme';

interface Entry { name: string; value: number }

interface Props {
  data: Entry[];
  height?: number;
  showLegend?: boolean;
  colors?: string[];
  centerLabel?: string;
  centerSubLabel?: string;
}

export default function DonutChart({ data, height = 200, showLegend = true, colors, centerLabel, centerSubLabel }: Props) {
  const theme = useChartTheme();
  const palette = colors ?? theme.chartColors;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          dataKey="value"
          strokeWidth={0}
          animationBegin={0}
          animationDuration={600}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
        </Pie>
        {/* Centre total */}
        <text x="50%" y={centerSubLabel ? '46%' : '50%'} textAnchor="middle" dominantBaseline="middle" fill={theme.text} fontSize={14} fontWeight={700}>
          {centerLabel ?? total.toLocaleString()}
        </text>
        {centerSubLabel && (
          <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" fill={theme.textMuted} fontSize={10} fontWeight={500}>
            {centerSubLabel}
          </text>
        )}
        <Tooltip
          contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 11 }}
          itemStyle={{ color: theme.text }}
          formatter={(v) => { const n = v as number; return [`${n} (${total ? ((n/total)*100).toFixed(1) : 0}%)`, '']; }}
        />
        {showLegend && (
          <Legend
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ fontSize: 11, color: theme.textMuted, paddingTop: 8 }}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
