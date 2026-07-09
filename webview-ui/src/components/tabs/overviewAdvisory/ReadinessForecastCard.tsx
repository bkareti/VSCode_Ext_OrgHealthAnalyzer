import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import type { DotProps } from 'recharts';
import { GlassCard, SampleMark } from '@/components/common';
import { useChartTheme } from '@/hooks/useChartTheme';
import type { ForecastPoint } from './sampleData';

interface Props {
  points: ForecastPoint[];
  stats: { effort: string; timeline: string; confidence: string };
}

function EndDot(props: DotProps & { index?: number }) {
  const { cx, cy, index } = props;
  if (index !== 2 || cx == null || cy == null) return <circle cx={cx} cy={cy} r={3} fill="#3b82f6" />;
  return (
    <text x={cx} y={(cy as number) - 8} textAnchor="middle" fontSize={14}>
      ⭐
    </text>
  );
}

export default function ReadinessForecastCard({ points, stats }: Props) {
  const theme = useChartTheme();
  return (
    <GlassCard className="flex-1 min-w-64">
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-semibold text-sf-text">Estimated Readiness After Fixes</h3>
        <SampleMark />
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={points} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: theme.textMuted, fontSize: 8 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} hide />
          <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={<EndDot />} />
        </LineChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-1 text-center">
        <div>
          <p className="text-[9px] text-sf-muted uppercase">Effort</p>
          <p className="text-[11px] font-semibold text-sf-text">{stats.effort}</p>
        </div>
        <div>
          <p className="text-[9px] text-sf-muted uppercase">Timeline</p>
          <p className="text-[11px] font-semibold text-sf-text">{stats.timeline}</p>
        </div>
        <div>
          <p className="text-[9px] text-sf-muted uppercase">Confidence</p>
          <p className="text-[11px] font-semibold text-sf-text">{stats.confidence}</p>
        </div>
      </div>
      <span className="text-[10px] text-sf-accent hover:underline mt-2 block cursor-default">
        View detailed improvement forecast →
      </span>
    </GlassCard>
  );
}
