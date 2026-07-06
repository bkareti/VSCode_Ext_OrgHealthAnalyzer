import {
  RadarChart as RechartsRadar, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Entry { subject: string; value: number; fullMark?: number }

interface Props {
  data: Entry[];
  color?: string;
  height?: number;
}

export default function RadarChart({ data, color = '#3b82f6', height = 220 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadar data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9d9d9d', fontSize: 10 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#6b6b6b', fontSize: 9 }} axisLine={false} />
        <Radar
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          animationDuration={600}
        />
        <Tooltip
          contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
          itemStyle={{ color: '#cccccc' }}
        />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
