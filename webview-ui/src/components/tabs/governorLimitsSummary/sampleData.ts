import type { GovernorLimitsRecommendationCard } from '@/types';

/**
 * Fixed illustrative constants for Governor Limits sections that have no
 * real backing data anywhere in the app today (see derivations.ts for what
 * IS real). Every consumer of these must render a SampleMark — see
 * webview-ui/src/components/tabs/security/sampleData.ts for the established
 * convention this mirrors.
 */

export type UsageTrendCategory = 'api' | 'dataStorage' | 'fileStorage' | 'email' | 'asyncApex' | 'platformEvents' | 'cdc';

export const USAGE_TREND_TABS: { id: UsageTrendCategory; label: string }[] = [
  { id: 'api', label: 'API' },
  { id: 'dataStorage', label: 'Data Storage' },
  { id: 'fileStorage', label: 'File Storage' },
  { id: 'email', label: 'Email' },
  { id: 'asyncApex', label: 'Async Apex' },
  { id: 'platformEvents', label: 'Platform Events' },
  { id: 'cdc', label: 'CDC' },
];

const BASE_BY_CATEGORY: Record<UsageTrendCategory, number> = {
  api: 63,
  dataStorage: 74,
  fileStorage: 88,
  email: 69,
  asyncApex: 38,
  platformEvents: 28,
  cdc: 16,
};

function seededWave(seed: number, i: number): number {
  return Math.sin(seed + i * 0.6) * 6 + Math.cos(seed * 1.7 + i * 0.3) * 3;
}

/** Deterministic (seeded) sparkline ending near `endValue`, for StatCard/table trend columns with no real history to plot. */
export function sampleSparkline(endValue: number, seed: number, points = 7): { value: number }[] {
  const arr: number[] = [];
  for (let i = 0; i < points; i++) {
    arr.push(Math.max(0, Math.round(endValue - (points - 1 - i) * 0.6 + seededWave(seed, i))));
  }
  arr[arr.length - 1] = Math.max(0, Math.round(endValue));
  return arr.map((value) => ({ value }));
}

/** Deterministic (seeded) 7-day-average label near `pct`, for stat-card sub-text with no real trend history. */
export function sampleAvgLabel(pct: number, seed: number): string {
  const avg = Math.max(0, Math.min(100, Math.round(pct - 2 - (seed % 5))));
  return `7 day avg: ${avg}%`;
}

/** Deterministic (seeded, not random) synthetic 30-day series so the chart doesn't reshuffle on every render. */
export function usageTrendSeries(category: UsageTrendCategory): { date: string; usage: number; avg7d: number }[] {
  const base = BASE_BY_CATEGORY[category];
  const points: { date: string; usage: number; avg7d: number }[] = [];
  const today = new Date();
  const raw: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const usage = Math.max(0, Math.min(100, Math.round(base + seededWave(category.length, i))));
    raw.push(usage);
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    points.push({ date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), usage, avg7d: 0 });
  }
  for (let i = 0; i < points.length; i++) {
    const window = raw.slice(Math.max(0, i - 6), i + 1);
    points[i].avg7d = Math.round(window.reduce((s, v) => s + v, 0) / window.length);
  }
  return points;
}

export interface ForecastRow {
  label: string;
  currentPct: number;
  forecastPct: number;
  daysRemaining: number | null; // null = "No risk"
}

export const FORECAST_ROWS: ForecastRow[] = [
  { label: 'File Storage', currentPct: 92, forecastPct: 97, daysRemaining: 25 },
  { label: 'Data Storage', currentPct: 76, forecastPct: 84, daysRemaining: 95 },
  { label: 'Daily API', currentPct: 68, forecastPct: 74, daysRemaining: 62 },
  { label: 'Mass Email', currentPct: 82, forecastPct: 89, daysRemaining: 48 },
  { label: 'Async Apex', currentPct: 44, forecastPct: 47, daysRemaining: null },
  { label: 'Platform Events', currentPct: 31, forecastPct: 33, daysRemaining: null },
  { label: 'Daily Bulk API', currentPct: 23, forecastPct: 25, daysRemaining: null },
];

export type ConsumerCategory = 'apiUsers' | 'connectedApps' | 'namedCredentials' | 'asyncJobs' | 'platformEvents' | 'email' | 'storageObjects';

export const CONSUMER_TABS: { id: ConsumerCategory; label: string }[] = [
  { id: 'apiUsers', label: 'API Users' },
  { id: 'connectedApps', label: 'Connected Apps' },
  { id: 'namedCredentials', label: 'Named Credentials' },
  { id: 'asyncJobs', label: 'Async Jobs' },
  { id: 'platformEvents', label: 'Platform Events' },
  { id: 'email', label: 'Email' },
  { id: 'storageObjects', label: 'Storage (Objects)' },
];

export interface ConsumerRow {
  name: string;
  type: string;
  value: number;
  pctOfTotal: number;
}

export const TOP_CONSUMERS: Record<ConsumerCategory, ConsumerRow[]> = {
  apiUsers: [
    { name: 'Integration User', type: 'Integration', value: 342582, pctOfTotal: 54 },
    { name: 'MuleSoft User', type: 'Integration', value: 128419, pctOfTotal: 20 },
    { name: 'Analytics User', type: 'Integration', value: 78654, pctOfTotal: 12 },
    { name: 'Mobile App User', type: 'Connected App', value: 36821, pctOfTotal: 6 },
    { name: 'Admin User', type: 'User', value: 22314, pctOfTotal: 4 },
  ],
  connectedApps: [
    { name: 'Mobile Publisher', type: 'Connected App', value: 41230, pctOfTotal: 38 },
    { name: 'Tableau CRM', type: 'Connected App', value: 26110, pctOfTotal: 24 },
    { name: 'Slack Integration', type: 'Connected App', value: 18040, pctOfTotal: 17 },
  ],
  namedCredentials: [
    { name: 'ERP_Callout', type: 'Named Credential', value: 15230, pctOfTotal: 41 },
    { name: 'Payment_Gateway', type: 'Named Credential', value: 9810, pctOfTotal: 26 },
  ],
  asyncJobs: [
    { name: 'NightlySyncBatch', type: 'Batch Apex', value: 4820, pctOfTotal: 33 },
    { name: 'DataCleanupQueue', type: 'Queueable', value: 3110, pctOfTotal: 21 },
  ],
  platformEvents: [
    { name: 'Order_Event__e', type: 'Platform Event', value: 8420, pctOfTotal: 45 },
    { name: 'Inventory_Update__e', type: 'Platform Event', value: 5210, pctOfTotal: 28 },
  ],
  email: [
    { name: 'Marketing Cloud Connector', type: 'Integration', value: 62100, pctOfTotal: 58 },
    { name: 'Case Auto-Notify', type: 'Automation', value: 21400, pctOfTotal: 20 },
  ],
  storageObjects: [
    { name: 'ContentVersion', type: 'Files', value: 9200000, pctOfTotal: 74 },
    { name: 'Case', type: 'Object', value: 3100000, pctOfTotal: 22 },
  ],
};

/** Big Objects storage slice for the Storage Breakdown donut — no real Big Object storage query exists. */
export const BIG_OBJECTS_STORAGE_MB = 512;

/** Rough illustrative bytes-per-record estimate, used only to give the "Largest Objects" table a plausible Size column. */
export function estimateStorageMB(recordCount: number): number {
  return Math.round((recordCount * 0.68) / 1024);
}

export interface QuickWin {
  id: string;
  title: string;
  savingsLabel: string;
  priority: 'High' | 'Medium';
}

export const QUICK_WINS: QuickWin[] = [
  { id: 'archive-files', title: 'Archive files older than 18 months', savingsLabel: 'Potential savings: 1.8 TB', priority: 'High' },
  { id: 'delete-debug-logs', title: 'Delete debug logs older than 7 days', savingsLabel: 'Potential savings: 120 GB', priority: 'High' },
  { id: 'unused-reports', title: 'Review and delete unused reports', savingsLabel: 'Potential savings: 34 GB', priority: 'Medium' },
  { id: 'optimize-soql', title: 'Optimize SOQL queries in Apex', savingsLabel: 'Improve performance', priority: 'Medium' },
  { id: 'composite-api', title: 'Use Composite API for integrations', savingsLabel: 'Reduce API calls', priority: 'Medium' },
];

export const NEED_MORE_CAPACITY_TIPS: { title: string; description: string }[] = [
  { title: 'Audit Data', description: 'Identify and remove unused data.' },
  { title: 'Archive Data', description: 'Archive old data to Big Objects or external storage.' },
  { title: 'Optimize Integrations', description: 'Reduce API calls and payload sizes.' },
  { title: 'Use External Storage', description: 'Move files to SharePoint, Google Drive, or AWS S3.' },
];

export const DEMO_GOVERNOR_LIMITS_RECOMMENDATIONS: GovernorLimitsRecommendationCard[] = [
  {
    id: 'capacity-score', title: 'Platform Capacity', icon: '🛡️', impact: 'Low',
    value: 91, valueLabel: 'Overall capacity score out of 100',
    detailLabel: 'Status', detailValue: 'Healthy', sample: false,
  },
  {
    id: 'storage-headroom', title: 'Storage Headroom', icon: '💾', impact: 'High',
    value: 92, valueLabel: 'of allocated file storage used',
    detailLabel: 'Headroom Remaining', detailValue: '8% free', sample: false,
  },
  {
    id: 'api-trajectory', title: 'API Utilization', icon: '🔌', impact: 'Medium',
    value: 68, valueLabel: 'of daily API request limit used',
    detailLabel: 'Guidance', detailValue: 'Monitor integration call volume', sample: false,
  },
  {
    id: 'async-processing', title: 'Async Processing', icon: '⚙️', impact: 'Low',
    value: 44, valueLabel: 'of daily async Apex executions used',
    detailLabel: 'Guidance', detailValue: 'Healthy headroom', sample: false,
  },
  {
    id: 'forecast-risk', title: 'Limits at Risk', icon: '⚠️', impact: 'Medium',
    value: 5, valueLabel: 'limits at or above 50% consumed',
    detailLabel: 'Guidance', detailValue: 'Review the Capacity Health table', sample: false,
  },
];
