import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#ec4899','#14b8a6','#f97316'];

interface Entry { name: string; value: number; color?: string }

interface Props {
  data: Entry[];
  height?: number;
  color?: string;
  multiColor?: boolean;
  /** Render a color-swatch legend (name + value) below the chart — bars don't map to Recharts' built-in Legend since each is a separate Cell color. */
  showLegend?: boolean;
}

export default function ColumnChart({ data, height = 160, color = '#3b82f6', multiColor, showLegend }: Props) {
  const barColor = (d: Entry, i: number) => d.color ?? COLORS[i % COLORS.length];
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barSize={Math.max(8, Math.min(24, 120 / data.length))} margin={{ top: 4, right: 4, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#6b6b6b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={data.length > 6 ? -30 : 0}
            textAnchor={data.length > 6 ? 'end' : 'middle'}
          />
          <YAxis tick={{ fill: '#6b6b6b', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
            itemStyle={{ color: '#cccccc' }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} animationDuration={600}>
            {multiColor
              ? data.map((d, i) => <Cell key={i} fill={barColor(d, i)} />)
              : data.map((_, i) => <Cell key={i} fill={color} />)
            }
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1 text-[10px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: multiColor ? barColor(d, i) : color }} />
              <span className="text-sf-text">{d.name}</span>
              <span className="text-sf-muted tabular-nums">{d.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
