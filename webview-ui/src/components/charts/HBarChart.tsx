import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ec4899','#14b8a6','#f97316'];

interface Entry { name: string; value: number; color?: string }

interface Props {
  data: Entry[];
  height?: number;
  color?: string;
  multiColor?: boolean;
}

export default function HBarChart({ data, height, color = '#3b82f6', multiColor }: Props) {
  const h = height ?? Math.max(120, data.length * 28);

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" barSize={14} margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
        <XAxis type="number" tick={{ fill: '#6b6b6b', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fill: '#9d9d9d', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
          itemStyle={{ color: '#cccccc' }}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} animationDuration={600}
          label={{ position: 'right', fill: '#6b6b6b', fontSize: 10 }}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={multiColor ? (d.color ?? COLORS[i % COLORS.length]) : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
