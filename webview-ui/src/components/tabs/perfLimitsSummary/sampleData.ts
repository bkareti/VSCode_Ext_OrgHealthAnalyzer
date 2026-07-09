import type { RecommendationCardData } from '@/components/common';
import type { DonutLegendRow } from '@/components/charts/DonutWithLegend';

/**
 * Fixed illustrative constants for the Performance & Scalability tab — none of
 * this is backed by a real analyzer/store field yet (see CLAUDE.md follow-up:
 * "later will map real data"). Every consumer renders a SampleMark, mirroring
 * the convention in governorLimitsSummary/sampleData.ts and security/sampleData.ts.
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

const TREND_NOTE = 'Trend sparkline is illustrative — OrgPulse only captures a point-in-time snapshot, not history across scans.';
export { TREND_NOTE };

// ── Level 1 · Architecture Performance ──────────────────────────────────────

export interface ScoreCardData {
  icon: string;
  value: number;
  label: string;
  sub: string;
  delta: number;
  seed: number;
}

export const ARCHITECTURE_SCORES: ScoreCardData[] = [
  { icon: '🛡️', value: 86, label: 'Architecture Score',      sub: 'Good',            delta: 7, seed: 1 },
  { icon: '🧹', value: 78, label: 'Code Quality Score',       sub: 'Good',            delta: 5, seed: 2 },
  { icon: '🔀', value: 82, label: 'Automation Score',         sub: 'Good',            delta: 6, seed: 3 },
  { icon: '📈', value: 81, label: 'Scalability Score (LDV)',  sub: 'Good',            delta: 8, seed: 4 },
  { icon: '🔍', value: 73, label: 'Query Selectivity Score',  sub: 'Needs Attention', delta: -4, seed: 5 },
];

export interface CodePerformanceRow {
  label: string;
  value: string;
  severity: 'high' | 'medium' | 'good';
}

export const CODE_PERFORMANCE_ROWS: CodePerformanceRow[] = [
  { label: 'SOQL in Loops',                 value: '34',          severity: 'high' },
  { label: 'DML in Loops',                  value: '18',          severity: 'high' },
  { label: 'Nested Loops',                  value: '22',          severity: 'high' },
  { label: 'High Complexity Methods',       value: '41',          severity: 'medium' },
  { label: 'Large Classes (> 400 LOC)',     value: '27',          severity: 'medium' },
  { label: 'Apex Triggers',                 value: '58 (7 active)', severity: 'good' },
];

export const AUTOMATION_FLOWS_DATA: DonutLegendRow[] = [
  { name: 'Record-Triggered Flows', value: 342, color: '#3b82f6' },
  { name: 'Scheduled Flows',        value: 128, color: '#ef4444' },
  { name: 'Screen Flows',           value: 205, color: '#22c55e' },
  { name: 'Process Builder',        value: 98,  color: '#f59e0b' },
  { name: 'Workflow Rules',         value: 192, color: '#8b5cf6' },
];
export const TOTAL_AUTOMATIONS = 965;

export const LDV_OBJECTS_DATA: DonutLegendRow[] = [
  { name: '> 1 Million Records', value: 12,  color: '#22c55e' },
  { name: '100K - 1M Records',   value: 28,  color: '#3b82f6' },
  { name: '50K - 100K Records',  value: 18,  color: '#8b5cf6' },
];
export const TOTAL_RECORDS_LABEL = '52.4M';
export const TOTAL_OBJECTS = 682;

export interface AsyncArchitectureStat {
  label: string;
  value: number;
  delta: number;
  seed: number;
}

export const ASYNC_ARCHITECTURE_STATS: AsyncArchitectureStat[] = [
  { label: 'Batch Classes',      value: 68,  delta: 4,  seed: 11 },
  { label: 'Queueable Classes',  value: 112, delta: 7,  seed: 12 },
  { label: 'Future Methods',     value: 86,  delta: -2, seed: 13 },
  { label: 'Scheduled Jobs',     value: 54,  delta: 3,  seed: 14 },
];
export const APEX_FLEX_QUEUE_USAGE_PCT = 28;

export interface QueryIndexStat {
  label: string;
  value: number;
  severity: 'high' | 'medium';
}

export const QUERY_INDEX_STATS: QueryIndexStat[] = [
  { label: 'Non-Selective Queries',    value: 29, severity: 'high' },
  { label: 'Leading Wildcard SOQL',    value: 16, severity: 'medium' },
  { label: 'Missing Index Candidates', value: 31, severity: 'high' },
];

export const TOP_OBJECTS_NEEDING_INDEX: { label: string; value: number }[] = [
  { label: 'Case',              value: 6 },
  { label: 'Task',               value: 5 },
  { label: 'Custom_Object__c',   value: 4 },
];

export const STORAGE_FILES = {
  dataStorage: { usedLabel: '2.8 TB', totalLabel: '3.7 TB', pct: 76 },
  fileStorage: { usedLabel: '92%',    totalLabel: '10 TB',  pct: 92 },
  bigObjects:  { usedLabel: '180 GB', totalLabel: '2 TB',   pct: 9 },
  totalFiles: '1.2M',
  largestFile: '85 MB',
};

// ── Level 2 · Operational Metrics from Logs ─────────────────────────────────

export interface TrendStat {
  icon: string;
  value: string;
  label: string;
  /** Signed magnitude passed straight to StatCard's `delta` prop. */
  delta: number;
  /** Suffix after the number, e.g. "% vs last scan" / "sec vs last scan". */
  deltaLabel: string;
  deltaGoodDirection: 'up' | 'down';
  seed: number;
  sparkEnd: number;
}

export const OPERATIONAL_STATS: TrendStat[] = [
  { icon: '⏱️', value: '312 ms',   label: 'Avg CPU Time',        delta: 12, deltaLabel: '% vs last scan', deltaGoodDirection: 'down', seed: 21, sparkEnd: 312 },
  { icon: '🧠', value: '8.7 MB',   label: 'Avg Heap Size',        delta: 8,  deltaLabel: '% vs last scan', deltaGoodDirection: 'down', seed: 22, sparkEnd: 87 },
  { icon: '🔍', value: '18 / Txn', label: 'Avg SOQL Queries',     delta: 6,  deltaLabel: '% vs last scan', deltaGoodDirection: 'down', seed: 23, sparkEnd: 18 },
  { icon: '🔀', value: '7 / Txn',  label: 'Avg DML Statements',   delta: 5,  deltaLabel: '% vs last scan', deltaGoodDirection: 'down', seed: 24, sparkEnd: 7 },
  { icon: '🚨', value: '124',      label: 'Exceptions (Total)',   delta: 18, deltaLabel: '% vs last scan', deltaGoodDirection: 'down', seed: 25, sparkEnd: 124 },
  { icon: '⏳', value: '58',       label: 'Long Running Txns',    delta: 9,  deltaLabel: '% vs last scan', deltaGoodDirection: 'down', seed: 26, sparkEnd: 58 },
];

export interface TopCpuTransactionRow {
  name: string;
  avgCpuMs: number;
  executions: number;
  impact: 'High' | 'Medium';
}

export const TOP_CPU_TRANSACTIONS: TopCpuTransactionRow[] = [
  { name: 'AccountService.processBatch', avgCpuMs: 1245, executions: 432, impact: 'High' },
  { name: 'OpportunityCalculator',       avgCpuMs: 987,  executions: 312, impact: 'High' },
  { name: 'PricingEngine.applyDiscount', avgCpuMs: 752,  executions: 215, impact: 'Medium' },
  { name: 'LeadAssignmentHandler',       avgCpuMs: 632,  executions: 189, impact: 'Medium' },
  { name: 'CaseEscalationService',       avgCpuMs: 598,  executions: 156, impact: 'Medium' },
];

export const HEAP_USAGE_DISTRIBUTION: DonutLegendRow[] = [
  { name: '< 6 MB',       value: 12_845, color: '#22c55e' },
  { name: '6 MB – 12 MB', value: 7_258,  color: '#3b82f6' },
  { name: '12 MB – 24 MB', value: 2_845, color: '#f59e0b' },
  { name: '> 24 MB',      value: 1_620,  color: '#ef4444' },
];
export const TOTAL_TRANSACTIONS = 24_568;

export interface SlowestTransactionRow {
  name: string;
  avgResponseSec: number;
  impact: 'High' | 'Medium';
}

export const SLOWEST_TRANSACTIONS: SlowestTransactionRow[] = [
  { name: '/apex/OpportunityDetail',         avgResponseSec: 5.82, impact: 'High' },
  { name: '/lightning/r/Case/500xx/view',    avgResponseSec: 4.12, impact: 'High' },
  { name: '/apex/AccountSearch',             avgResponseSec: 3.45, impact: 'Medium' },
  { name: '/lightning/n/Custom_Console',     avgResponseSec: 2.78, impact: 'Medium' },
  { name: '/apex/ReportViewer',              avgResponseSec: 2.35, impact: 'Medium' },
];

// ── Level 3 · Runtime Performance (Shield Event Monitoring) ─────────────────

export const RUNTIME_STATS: TrendStat[] = [
  { icon: '⏱️', value: '1.42 sec', label: 'Avg Page Load Time',    delta: -0.18, deltaLabel: 'sec vs last scan', deltaGoodDirection: 'down', seed: 31, sparkEnd: 142 },
  { icon: '🔌', value: '238 ms',   label: 'API Avg Response Time', delta: 32,    deltaLabel: 'ms vs last scan',  deltaGoodDirection: 'down', seed: 32, sparkEnd: 238 },
  { icon: '🐢', value: '126',      label: 'Slow Page Views',       delta: -15,   deltaLabel: '% vs last scan',   deltaGoodDirection: 'down', seed: 33, sparkEnd: 126 },
  { icon: '📡', value: '68',       label: 'Slow API Calls',        delta: -12,   deltaLabel: '% vs last scan',   deltaGoodDirection: 'down', seed: 34, sparkEnd: 68 },
  { icon: '🔑', value: '2.18 sec', label: 'Login Duration (Avg.)', delta: -0.21, deltaLabel: 'sec vs last scan', deltaGoodDirection: 'down', seed: 35, sparkEnd: 218 },
  { icon: '⛔', value: '46',       label: 'Failed Logins',         delta: -8,    deltaLabel: '% vs last scan',   deltaGoodDirection: 'down', seed: 36, sparkEnd: 46 },
];

function seededTrend(base: number, amplitude: number, seed: number, days = 30): { date: string; value: number }[] {
  const points: { date: string; value: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const value = Math.max(0, Math.round((base + seededWave(seed, days - i)) * amplitude) / amplitude);
    points.push({ date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value });
  }
  return points;
}

export const PAGE_LOAD_TREND = seededTrend(1.6, 10, 41);
export const API_RESPONSE_TREND = seededTrend(240, 1, 42);

export interface TopSlowPageRow {
  url: string;
  avgLoadSec: number;
  pageViews: number;
}

export const TOP_SLOW_PAGES: TopSlowPageRow[] = [
  { url: '/lightning/r/Case/home',        avgLoadSec: 4.82, pageViews: 1_245 },
  { url: '/lightning/r/Opportunity/home', avgLoadSec: 3.91, pageViews: 1_012 },
  { url: '/lightning/n/Custom_Console',   avgLoadSec: 3.21, pageViews: 856 },
  { url: '/apex/CustomerPortal',          avgLoadSec: 2.88, pageViews: 742 },
  { url: '/lightning/r/Account/home',     avgLoadSec: 2.45, pageViews: 623 },
];

// ── AI Insights & Recommendations ───────────────────────────────────────────

export const PERF_RECOMMENDATIONS: RecommendationCardData[] = [
  {
    id: 'optimize-soql-loops', icon: '🔍', impact: 'High',
    title: 'Optimize SOQL in Loops',
    description: '34 instances of SOQL in loops found. This can cause CPU spikes and limit exceptions.',
    detailLabel: 'Potential Improvement', detailValue: 'High', sample: true,
  },
  {
    id: 'reduce-file-storage', icon: '📁', impact: 'Medium',
    title: 'Reduce File Storage',
    description: 'File storage is at 92%. Consider archiving files or using external storage (SharePoint/Google Drive).',
    detailLabel: 'Potential Savings', detailValue: '~1.8 TB', sample: true,
  },
  {
    id: 'improve-query-selectivity', icon: '🎯', impact: 'High',
    title: 'Improve Query Selectivity',
    description: '29 non-selective queries detected. Add selective filters or indexes to improve performance.',
    detailLabel: 'Affected Objects', detailValue: 'Case, Task, Opportunity', sample: true,
  },
  {
    id: 'high-cpu-apex', icon: '⚙️', impact: 'Medium',
    title: 'High CPU Usage in Apex',
    description: 'AccountService class consumes 24.6% of total CPU time. Optimize logic and queries.',
    detailLabel: 'Potential Savings', detailValue: '20-30% CPU', sample: true,
  },
  {
    id: 'page-load-optimization', icon: '✅', impact: 'Low',
    title: 'Page Load Optimization',
    description: 'Average page load time is good. Optimize bundle size and images for better UX.',
    detailLabel: 'Potential Improvement', detailValue: '10-15%', sample: true,
  },
];
