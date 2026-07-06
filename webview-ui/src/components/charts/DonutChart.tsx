import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ec4899','#14b8a6','#f97316'];

interface Entry { name: string; value: number }

interface Props {
  data: Entry[];
  height?: number;
  showLegend?: boolean;
}

export default function DonutChart({ data, height = 200, showLegend = true }: Props) {
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
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        {/* Centre total */}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="#cccccc" fontSize={14} fontWeight={700}>
          {total.toLocaleString()}
        </text>
        <Tooltip
          contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
          itemStyle={{ color: '#cccccc' }}
          formatter={(v) => { const n = v as number; return [`${n} (${total ? ((n/total)*100).toFixed(1) : 0}%)`, '']; }}
        />
        {showLegend && (
          <Legend
            iconType="circle"
            iconSize={8}
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ fontSize: 11, color: '#9d9d9d', paddingTop: 8 }}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
