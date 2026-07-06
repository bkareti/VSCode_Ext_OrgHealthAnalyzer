import { useOrgStore } from '@/store/slices/orgStore';
import GlassCard from '@/components/common/GlassCard';
import EmptyState from '@/components/common/EmptyState';
import SparklineChart from '@/components/charts/SparklineChart';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { ScanHistoryEntry } from '@/types';

function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 65) return '#84cc16';
  if (score >= 50) return '#eab308';
  if (score >= 35) return '#f97316';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 35) return 'Poor';
  return 'Critical';
}

function formatTs(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return ts.slice(0, 10);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const DIMENSION_KEYS: { key: keyof ScanHistoryEntry['scores']; label: string; color: string }[] = [
  { key: 'overall',         label: 'Overall',      color: '#3b82f6' },
  { key: 'codeQuality',     label: 'Code',         color: '#a78bfa' },
  { key: 'security',        label: 'Security',     color: '#34d399' },
  { key: 'performance',     label: 'Performance',  color: '#fb923c' },
  { key: 'automationDesign',label: 'Automation',   color: '#f472b6' },
  { key: 'testing',         label: 'Testing',      color: '#facc15' },
];

export default function TrendsHistory() {
  const results    = useOrgStore((s) => s.results);
  const orgHistory = useOrgStore((s) => s.orgHistory);

  const orgId = results?.orgDetails?.orgId ?? results?.metadata?.orgId ?? null;
  const history: ScanHistoryEntry[] = orgId ? (orgHistory[orgId] ?? []) : [];

  if (history.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon="📅"
          title="No scan history yet"
          description="Run a scan to start tracking your org's health trends over time. Up to 10 scans are stored per org."
        />
      </div>
    );
  }

  const chartData = history.map((entry) => ({
    date: formatTs(entry.timestamp),
    Overall:      entry.scores.overall,
    Code:         entry.scores.codeQuality,
    Security:     entry.scores.security,
    Performance:  entry.scores.performance,
    Automation:   entry.scores.automationDesign,
    Testing:      entry.scores.testing,
  }));

  const latest = history[history.length - 1];
  const prev   = history.length >= 2 ? history[history.length - 2] : null;

  return (
    <div className="p-6 space-y-5">

      {/* Summary cards for latest scan */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {DIMENSION_KEYS.map(({ key, label, color }) => {
          const score = latest.scores[key] ?? 0;
          const delta = prev ? (latest.scores[key] ?? 0) - (prev.scores[key] ?? 0) : null;
          return (
            <div key={label} className="rounded-xl border border-sf-border bg-white/[0.03] p-3 flex flex-col gap-1 items-center text-center">
              <span className="text-[10px] text-sf-muted uppercase tracking-wide">{label}</span>
              <span className="text-xl font-bold tabular-nums" style={{ color }}>{score}</span>
              {delta !== null && (
                <span className={`text-[10px] font-medium ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {delta >= 0 ? '+' : ''}{delta.toFixed(0)} pts
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Score trend chart */}
      <GlassCard title="Score Trends Over Time">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9d9d9d' }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9d9d9d' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#252526', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                itemStyle={{ color: '#cccccc' }}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              {DIMENSION_KEYS.map(({ label, color }) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4, fill: color }}
                  animationDuration={500}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      {/* Scan history table */}
      <GlassCard title={`Scan History — ${latest.orgName}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-sf-border">
                <th className="text-left py-2 px-2 text-sf-muted font-medium">#</th>
                <th className="text-left py-2 px-2 text-sf-muted font-medium">Date</th>
                <th className="text-center py-2 px-2 text-sf-muted font-medium">Overall</th>
                <th className="text-center py-2 px-2 text-sf-muted font-medium">Code</th>
                <th className="text-center py-2 px-2 text-sf-muted font-medium">Security</th>
                <th className="text-center py-2 px-2 text-sf-muted font-medium">Perf</th>
                <th className="text-center py-2 px-2 text-sf-muted font-medium">Issues</th>
                <th className="text-center py-2 px-2 text-sf-muted font-medium">Duration</th>
                <th className="text-left py-2 px-2 text-sf-muted font-medium">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sf-border/30">
              {[...history].reverse().map((entry, revIdx) => {
                const idx = history.length - 1 - revIdx;
                const priorEntry = idx > 0 ? history[idx - 1] : null;
                const delta = priorEntry ? entry.scores.overall - priorEntry.scores.overall : null;
                const color = scoreColor(entry.scores.overall);
                const sparkData = history.slice(0, idx + 1).map((e) => ({ value: e.scores.overall }));
                return (
                  <tr key={entry.timestamp} className="hover:bg-sf-bg-2 transition-colors">
                    <td className="py-2 px-2 text-sf-muted tabular-nums">{history.length - revIdx}</td>
                    <td className="py-2 px-2 text-sf-text whitespace-nowrap">{formatTs(entry.timestamp)}</td>
                    <td className="py-2 px-2 text-center">
                      <span className="font-bold tabular-nums" style={{ color }}>{entry.scores.overall}</span>
                      <span className="text-[10px] text-sf-muted ml-1">({scoreLabel(entry.scores.overall)})</span>
                    </td>
                    <td className="py-2 px-2 text-center tabular-nums text-sf-text">{entry.scores.codeQuality ?? '—'}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-sf-text">{entry.scores.security ?? '—'}</td>
                    <td className="py-2 px-2 text-center tabular-nums text-sf-text">{entry.scores.performance ?? '—'}</td>
                    <td className="py-2 px-2 text-center">
                      <span className="tabular-nums text-sf-muted">{entry.issueSummary.total}</span>
                      {entry.issueSummary.error > 0 && (
                        <span className="ml-1 text-[10px] text-red-400">({entry.issueSummary.error} err)</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center tabular-nums text-sf-muted">{formatDuration(entry.duration)}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        {sparkData.length > 1 && (
                          <div className="w-16 h-6">
                            <SparklineChart data={sparkData} color={color} height={24} />
                          </div>
                        )}
                        {delta !== null && (
                          <span className={`text-[10px] font-medium tabular-nums ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
