import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: { value: number }[];
  color?: string;
  height?: number;
  showDots?: boolean;
}

export default function SparklineChart({ data, color = '#3b82f6', height = 40, showDots = false }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Tooltip
          contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 10 }}
          itemStyle={{ color: '#cccccc' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={showDots ? { r: 3, fill: color, strokeWidth: 0 } : false}
          activeDot={{ r: 4, fill: color }}
          animationDuration={600}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
