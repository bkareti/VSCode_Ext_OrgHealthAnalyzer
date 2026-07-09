import type { RecommendationCardData } from '@/components/common';
import type { DonutLegendRow } from '@/components/charts/DonutWithLegend';

/**
 * Fixed illustrative constants for the Automation tab — none of this is
 * backed by a real analyzer/store field yet (later work will map real data
 * connectors per card, per CLAUDE.md follow-up). Every consumer renders a
 * SampleMark, mirroring the convention in perfLimitsSummary/sampleData.ts.
 */

function seededWave(seed: number, i: number): number {
  return Math.sin(seed + i * 0.6) * 6 + Math.cos(seed * 1.7 + i * 0.3) * 3;
}

/** Deterministic (seeded) sparkline ending near `endValue`, for StatCard trend columns with no real history to plot. */
export function sampleSparkline(endValue: number, seed: number, points = 7): { value: number }[] {
  const arr: number[] = [];
  for (let i = 0; i < points; i++) {
    arr.push(Math.max(0, Math.round(endValue - (points - 1 - i) * 0.6 + seededWave(seed, i))));
  }
  arr[arr.length - 1] = Math.max(0, Math.round(endValue));
  return arr.map((value) => ({ value }));
}

/** Deterministic 30-day execution-count trend, ramping up with seeded noise (~30K-100K range). */
function seededExecutionsTrend(seed: number, days = 30): { date: string; value: number }[] {
  const points: { date: string; value: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const wave = seededWave(seed, days - i);
    const value = Math.round(62_000 + wave * 3_500 + (days - i) * 250);
    points.push({ date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value });
  }
  return points;
}

export const TREND_NOTE = 'This card is illustrative sample data — OrgPulse does not yet compute this metric from real org data.';

export const formatPct = (pct: number): string => (pct < 1 ? '<1%' : `${pct}%`);

// ── KPI row ──────────────────────────────────────────────────────────────

export interface KpiStatData {
  icon: string;
  value: string;
  label: string;
  sub?: string;
  accent?: string;
  delta: number;
  deltaLabel?: string;
  deltaGoodDirection: 'up' | 'down' | 'neutral';
  seed: number;
  sparkEnd: number;
}

export const KPI_STATS: KpiStatData[] = [
  { icon: '⚡', value: '1,248', label: 'Total Automations', delta: 8, deltaGoodDirection: 'neutral', seed: 1, sparkEnd: 1248 },
  { icon: '✅', value: '1,062', label: 'Active Automations', sub: '85% of total', delta: 14, deltaGoodDirection: 'up', seed: 2, sparkEnd: 1062 },
  { icon: '📊', value: '82', label: 'Automation Score', sub: '/100 · Good', accent: 'text-score-good', delta: 6, deltaGoodDirection: 'up', seed: 3, sparkEnd: 82 },
  { icon: '🚨', value: '64', label: 'High Risk Automations', accent: 'text-sev-error', delta: 3, deltaGoodDirection: 'down', seed: 4, sparkEnd: 64 },
  { icon: '⏸️', value: '186', label: 'Inactive Automations', sub: '15% of total', delta: -2, deltaGoodDirection: 'down', seed: 5, sparkEnd: 186 },
  { icon: '❌', value: '32', label: 'Failed Automations (30d)', delta: -12, deltaLabel: 'vs last 30 days', deltaGoodDirection: 'down', seed: 6, sparkEnd: 32 },
  { icon: '🕐', value: '298', label: 'Scheduled Automations', sub: '24% of total', delta: 5, deltaGoodDirection: 'neutral', seed: 7, sparkEnd: 298 },
];

// ── Level 1 · Automation Overview & Distribution (Metadata Based) ──────────

export const AUTOMATIONS_BY_TYPE: DonutLegendRow[] = [
  { name: 'Flows', value: 965, color: '#3b82f6' },
  { name: 'Process Builder', value: 98, color: '#f97316' },
  { name: 'Workflow Rules', value: 92, color: '#ef4444' },
  { name: 'Apex Triggers', value: 58, color: '#8b5cf6' },
  { name: 'Scheduled Apex', value: 21, color: '#ec4899' },
  { name: 'Approval Processes', value: 14, color: '#14b8a6' },
];
export const TOTAL_AUTOMATIONS_LABEL = '1,248';

export const FLOWS_BY_CATEGORY: DonutLegendRow[] = [
  { name: 'Record-Triggered', value: 342, color: '#3b82f6' },
  { name: 'Screen Flows', value: 205, color: '#22c55e' },
  { name: 'Scheduled Flows', value: 128, color: '#ec4899' },
  { name: 'Autolaunched Flows', value: 190, color: '#8b5cf6' },
  { name: 'Process Builder Invoked', value: 98, color: '#f59e0b' },
];
export const TOTAL_FLOWS_LABEL = '965';

export interface RankedBarRow {
  label: string;
  value: number;
  pct: number;
  color: string;
}

export const AUTOMATIONS_BY_STATUS: RankedBarRow[] = [
  { label: 'Active', value: 1062, pct: 85, color: '#22c55e' },
  { label: 'Inactive', value: 186, pct: 15, color: '#94a3b8' },
  { label: 'Deprecated', value: 12, pct: 1, color: '#ef4444' },
  { label: 'Draft', value: 6, pct: 0.5, color: '#f59e0b' },
];

export const AUTOMATION_COMPLEXITY: RankedBarRow[] = [
  { label: 'Very High (80-100)', value: 54, pct: 4.3, color: '#ef4444' },
  { label: 'High (50-79)', value: 162, pct: 13.0, color: '#f97316' },
  { label: 'Medium (20-49)', value: 586, pct: 47.0, color: '#eab308' },
  { label: 'Low (0-19)', value: 446, pct: 35.7, color: '#22c55e' },
];

export const AUTOMATION_SIZE: RankedBarRow[] = [
  { label: '> 200 Elements', value: 48, pct: 3.8, color: '#ef4444' },
  { label: '101-200 Elements', value: 113, pct: 9.0, color: '#f97316' },
  { label: '21-100 Elements', value: 510, pct: 40.9, color: '#eab308' },
  { label: '≤ 20 Elements', value: 577, pct: 46.3, color: '#22c55e' },
];

export interface TopObjectRow {
  object: string;
  automations: number;
  flows: number;
  triggers: number;
  processBuilders: number;
  workflows: number;
}

export const TOP_OBJECTS: TopObjectRow[] = [
  { object: 'Opportunity', automations: 186, flows: 126, triggers: 24, processBuilders: 20, workflows: 16 },
  { object: 'Account', automations: 161, flows: 98, triggers: 22, processBuilders: 18, workflows: 13 },
  { object: 'Case', automations: 132, flows: 85, triggers: 22, processBuilders: 15, workflows: 10 },
  { object: 'Lead', automations: 118, flows: 72, triggers: 18, processBuilders: 17, workflows: 11 },
  { object: 'Contact', automations: 96, flows: 54, triggers: 22, processBuilders: 12, workflows: 8 },
];

export const AUTOMATION_TYPE_STATS: KpiStatData[] = [
  { icon: '🔄', value: '342', label: 'Record-Triggered Flows', delta: 12, deltaGoodDirection: 'neutral', seed: 11, sparkEnd: 342 },
  { icon: '⏰', value: '128', label: 'Scheduled Flows', delta: 5, deltaGoodDirection: 'neutral', seed: 12, sparkEnd: 128 },
  { icon: '🖥️', value: '205', label: 'Screen Flows', delta: 9, deltaGoodDirection: 'neutral', seed: 13, sparkEnd: 205 },
  { icon: '🚀', value: '190', label: 'Autolaunched Flows', delta: 3, deltaGoodDirection: 'neutral', seed: 14, sparkEnd: 190 },
  { icon: '⚡', value: '58', label: 'Apex Triggers', delta: -2, deltaGoodDirection: 'neutral', seed: 15, sparkEnd: 58 },
  { icon: '🏗️', value: '98', label: 'Process Builder', delta: -4, deltaGoodDirection: 'down', seed: 16, sparkEnd: 98 },
  { icon: '📜', value: '92', label: 'Workflow Rules', delta: -6, deltaGoodDirection: 'down', seed: 17, sparkEnd: 92 },
];

// ── Level 2 · Operational & Usage Metrics (From Logs / Debug Logs / Apex Logs) ──

export const LEVEL2_STATS: KpiStatData[] = [
  { icon: '▶️', value: '1.85M', label: 'Total Executions (30d)', delta: 10, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'neutral', seed: 21, sparkEnd: 1850 },
  { icon: '❌', value: '7,842', label: 'Failed Executions (30d)', sub: '0.42% failure rate', delta: 15, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'down', seed: 22, sparkEnd: 78 },
  { icon: '⏱️', value: '1.28 sec', label: 'Avg Execution Time', delta: -0.18, deltaLabel: 'sec vs last 30 days', deltaGoodDirection: 'down', seed: 23, sparkEnd: 128 },
  { icon: '🧮', value: '186.5 hrs', label: 'CPU Time (Total 30d)', delta: 12, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'down', seed: 24, sparkEnd: 187 },
  { icon: '🚫', value: '456', label: 'Limits Exceptions (30d)', delta: -8, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'down', seed: 25, sparkEnd: 456 },
  { icon: '💾', value: '14.8M', label: 'DML Operations (30d)', delta: 9, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'neutral', seed: 26, sparkEnd: 148 },
  { icon: '📧', value: '1.2M', label: 'Emails Sent (30d)', delta: 14, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'neutral', seed: 27, sparkEnd: 120 },
];

export interface ExecutionRow {
  name: string;
  type: string;
  executions: number;
  avgTimeSec: number;
  failureRatePct: number;
}

export const TOP_EXECUTIONS: ExecutionRow[] = [
  { name: 'Opportunity - Update Stage Flow', type: 'RT Flow', executions: 128_542, avgTimeSec: 1.32, failureRatePct: 0.15 },
  { name: 'Case - Escalation Flow', type: 'RT Flow', executions: 96_882, avgTimeSec: 0.22, failureRatePct: 0.22 },
  { name: 'Nightly - Data Sync Flow', type: 'Scheduled Flow', executions: 52_341, avgTimeSec: 6.21, failureRatePct: 1.02 },
  { name: 'Lead Assignment Flow', type: 'RT Flow', executions: 43_215, avgTimeSec: 0.75, failureRatePct: 0.06 },
  { name: 'Invoice Generation Flow', type: 'Autolaunched Flow', executions: 38_651, avgTimeSec: 2.41, failureRatePct: 0.31 },
];

export const EXECUTIONS_TREND = seededExecutionsTrend(51);

export interface FailureRow {
  name: string;
  type: string;
  failures: number;
  rate: 'High' | 'Medium' | 'Low';
}

export const FAILURES_BY_AUTOMATION: FailureRow[] = [
  { name: 'Nightly - Data Sync Flow', type: 'Scheduled Flow', failures: 1245, rate: 'High' },
  { name: 'Price Calculation Flow', type: 'Autolaunched Flow', failures: 856, rate: 'High' },
  { name: 'Case - Escalation Flow', type: 'RT Flow', failures: 532, rate: 'Medium' },
  { name: 'Invoice Generation Flow', type: 'Autolaunched Flow', failures: 421, rate: 'Medium' },
  { name: 'Approval Reminder Flow', type: 'Scheduled Flow', failures: 310, rate: 'Low' },
];

// ── Level 3 · Runtime Performance (Shield Event Monitoring) ────────────────

export const LEVEL3_STATS: KpiStatData[] = [
  { icon: '🐢', value: '4.82 sec', label: 'Slowest Automations (P95)', delta: -0.82, deltaLabel: 'sec vs last 30 days', deltaGoodDirection: 'down', seed: 31, sparkEnd: 482 },
  { icon: '👥', value: '156', label: 'Peak Concurrent Executions', delta: 14, deltaLabel: 'vs last 30 days', deltaGoodDirection: 'down', seed: 32, sparkEnd: 156 },
  { icon: '⏳', value: '2m 48s', label: 'Longest Running (Max)', delta: -18, deltaLabel: 'sec vs last 30 days', deltaGoodDirection: 'down', seed: 33, sparkEnd: 168 },
  { icon: '🎯', value: '0.86 sec', label: 'Time to First Element (Avg)', delta: -0.12, deltaLabel: 'sec vs last 30 days', deltaGoodDirection: 'down', seed: 34, sparkEnd: 86 },
  { icon: '⌛', value: '28.6 hrs', label: 'User Wait Time (Total 30d)', delta: 7, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'down', seed: 35, sparkEnd: 286 },
  { icon: '🌐', value: '15.3 hrs', label: 'Browser Time (Total 30d)', delta: 6, deltaLabel: '% vs last 30 days', deltaGoodDirection: 'down', seed: 36, sparkEnd: 153 },
];

export const EXECUTION_TIME_DISTRIBUTION: DonutLegendRow[] = [
  { name: '< 1 sec', value: 62.4, color: '#22c55e' },
  { name: '1-2 sec', value: 19.1, color: '#3b82f6' },
  { name: '2-5 sec', value: 12.6, color: '#f59e0b' },
  { name: '5-10 sec', value: 3.8, color: '#f97316' },
  { name: '> 10 sec', value: 2.1, color: '#ef4444' },
];

export interface SlowUserRow {
  user: string;
  executions: number;
  avgTimeSec: number;
  userWaitHrs: number;
}

export const SLOW_AUTOMATIONS_BY_USERS: SlowUserRow[] = [
  { user: 'jane.doe@example.com', executions: 24_851, avgTimeSec: 2.45, userWaitHrs: 4.8 },
  { user: 'john.smith@example.com', executions: 18_642, avgTimeSec: 2.12, userWaitHrs: 3.6 },
  { user: 'sarah.wilson@example.com', executions: 15_329, avgTimeSec: 1.90, userWaitHrs: 2.9 },
  { user: 'david.brown@example.com', executions: 12_102, avgTimeSec: 1.76, userWaitHrs: 2.1 },
  { user: 'michael.johnson@example.com', executions: 9_842, avgTimeSec: 1.65, userWaitHrs: 1.7 },
];

export interface RuntimeEventRow {
  label: string;
  value: number;
  status: 'good' | 'warning' | 'error';
}

export const RUNTIME_EVENTS: RuntimeEventRow[] = [
  { label: 'Automation Started', value: 1_845_231, status: 'good' },
  { label: 'Automation Completed', value: 1_837_389, status: 'good' },
  { label: 'Automation Failed', value: 7_842, status: 'error' },
  { label: 'Automation Paused', value: 1_562, status: 'warning' },
  { label: 'Unhandled Faults', value: 456, status: 'error' },
];

// ── AI Insights & Recommendations ───────────────────────────────────────────

export const AUTOMATION_RECOMMENDATIONS: RecommendationCardData[] = [
  {
    id: 'high-complexity-automations', icon: '🧩', impact: 'High',
    title: 'High Complexity Automations',
    description: '162 automations have high complexity. Simplify to reduce maintenance and failure risk.',
    detailLabel: 'Automations Affected', detailValue: '162', sample: true,
  },
  {
    id: 'optimize-slow-flows', icon: '🐢', impact: 'High',
    title: 'Optimize Slow Flows',
    description: '24 flows have avg execution time > 3 sec. Optimize formulas, queries, and elements.',
    detailLabel: 'Flows Affected', detailValue: '24', sample: true,
  },
  {
    id: 'schedule-optimization', icon: '🕐', impact: 'Medium',
    title: 'Schedule Optimization',
    description: '28 scheduled flows run between 9AM-6PM. Move to off-peak hours to reduce load.',
    detailLabel: 'Flows Affected', detailValue: '28', sample: true,
  },
  {
    id: 'reduce-automation-overlap', icon: '🔀', impact: 'Medium',
    title: 'Reduce Automation Overlap',
    description: 'Peak concurrent executions are high. Review triggers and flows that overlap.',
    detailLabel: 'Peak Concurrency', detailValue: '156', sample: true,
  },
  {
    id: 'clean-up-inactive-deprecated', icon: '🧹', impact: 'Low',
    title: 'Clean Up Inactive/Deprecated',
    description: '198 inactive/deprecated automations found. Consider deactivating or deleting.',
    detailLabel: 'Automations Affected', detailValue: '198', sample: true,
  },
];
