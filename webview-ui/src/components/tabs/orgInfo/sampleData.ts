import type { LicenseSummary, FeatureLicenseSummary, LicenseRecommendationCard, OrgInfoRecommendationCard } from '@/types';

/**
 * Every literal constant needed to render the Clouds & Licenses tab exactly
 * like the reference screenshot when a data concept has no real backend
 * mapping (see derivations.ts for the real, scan-derived counterparts).
 * These are demo-mode fallbacks AND permanent sample fallbacks for concepts
 * that never have real backing (Permission Set Licenses, login-recency
 * buckets, license trend, waste indicators) — see the ◎ marks in
 * CloudsLicensesTab.tsx for which is which.
 */

// ─── Clouds (demo-mode only 3-state grid; real scans stay 2-state) ─────────
export interface DemoCloudStatus { name: string; key: string; status: 'enabled' | 'disabled' | 'unavailable' }

export const DEMO_CLOUDS_EXTENDED: DemoCloudStatus[] = [
  { name: 'Sales Cloud',        key: 'sales',        status: 'enabled' },
  { name: 'Service Cloud',      key: 'service',      status: 'enabled' },
  { name: 'Experience Cloud',   key: 'experience',   status: 'enabled' },
  { name: 'Industries (PSS)',   key: 'industries',   status: 'enabled' },
  { name: 'Field Service',      key: 'fieldservice', status: 'enabled' },
  { name: 'Agentforce',         key: 'agentforce',   status: 'enabled' },
  { name: 'Einstein Analytics', key: 'einstein',     status: 'enabled' },
  { name: 'Data Cloud',         key: 'data',         status: 'enabled' },
  { name: 'Revenue Cloud',      key: 'revenue',      status: 'disabled' },
  { name: 'Marketing Cloud',    key: 'marketing',    status: 'disabled' },
  { name: 'Health Cloud',       key: 'health',       status: 'disabled' },
  { name: 'Financial Services', key: 'financial',    status: 'disabled' },
  { name: 'OmniStudio',         key: 'omnistudio',   status: 'unavailable' },
  { name: 'CRM Analytics',      key: 'crmanalytics', status: 'unavailable' },
  { name: 'Interaction Studio', key: 'interaction',  status: 'unavailable' },
  { name: 'Tableau CRM',        key: 'tableaucrm',   status: 'unavailable' },
];

// ─── License Utilization by Type (demo rows matching the reference screenshot) ──
export const DEMO_LICENSES: LicenseSummary[] = [
  { name: 'Salesforce',                        usedLicenses: 1230, totalLicenses: 1650, usedPct: 74.5 },
  { name: 'Platform',                          usedLicenses: 250,  totalLicenses: 300,  usedPct: 83.3 },
  { name: 'Service Cloud User',                usedLicenses: 180,  totalLicenses: 250,  usedPct: 72 },
  { name: 'Analytics Cloud Integration User',  usedLicenses: 96,   totalLicenses: 200,  usedPct: 48 },
  { name: 'Chatter Free',                      usedLicenses: 1,    totalLicenses: 5000, usedPct: 0 },
  { name: 'Customer Community',                usedLicenses: 30,   totalLicenses: 100,  usedPct: 30 },
  { name: 'Identity',                          usedLicenses: 410,  totalLicenses: 800,  usedPct: 51.3 },
  { name: 'Customer Community Plus',           usedLicenses: 10,   totalLicenses: 50,   usedPct: 20 },
];

// ─── Overall License Utilization KPI headline (demo mode only) ─────────────────
// The reference screenshot's aggregate KPI numbers (2,512 / 1,842 / 670 / 78%)
// don't sum from DEMO_LICENSES' 8 rows above — like most hand-built dashboard
// mockups, the headline KPI and the detail table aren't cross-summed. Real
// scans compute this KPI live from actual licenseSummary instead (see
// derivations.ts's licenseUtilizationSplit).
export const SAMPLE_LICENSE_KPI = {
  total: 2512,
  used: 1842,
  available: 512,
  unassigned: 146,
  expired: 12,
  utilizationPct: 78,
};

// ─── Feature Licenses Overview (top-5 sized to match the reference donut, ──────
// plus filler entries so the KPI's count/assigned/available totals — 36
// types, 1,214 assigned, 298 available — also match exactly). ──────────────
const FEATURE_LICENSE_TOP5: FeatureLicenseSummary[] = [
  { name: 'Einstein',      status: 'Active', usedLicenses: 320, totalLicenses: 400 },
  { name: 'Agentforce',    status: 'Active', usedLicenses: 210, totalLicenses: 260 },
  { name: 'Tableau CRM',   status: 'Active', usedLicenses: 180, totalLicenses: 220 },
  { name: 'CRM Analytics', status: 'Active', usedLicenses: 140, totalLicenses: 180 },
  { name: 'OmniStudio',    status: 'Active', usedLicenses: 124, totalLicenses: 150 },
];

const FILLER_FEATURE_NAMES = [
  'Revenue Intelligence', 'Sales Engagement', 'Field Service Mobile', 'Consumption Credits',
  'Digital Experiences', 'Data Pipelines', 'Slack Integration', 'Marketing Cloud Connect',
  'Commerce Cloud', 'Loyalty Management', 'Net Zero Cloud', 'Public Sector Solutions',
  'Health Cloud Add-on', 'Financial Services Add-on', 'Manufacturing Cloud', 'Consumer Goods Cloud',
  'Nonprofit Cloud', 'Education Cloud', 'Vaccine Management', 'Contact Center',
  'Field Service Scheduling', 'Einstein Conversation Insights', 'Einstein Bots', 'CPQ',
  'Billing', 'Order Management', 'B2B Commerce', 'B2C Commerce',
  'Salesforce Maps', 'Salesforce Surveys', 'Salesforce Scheduler',
];

function buildFillerFeatureLicenses(): FeatureLicenseSummary[] {
  return FILLER_FEATURE_NAMES.map((name, i) => {
    const isLast = i === FILLER_FEATURE_NAMES.length - 1;
    return {
      name,
      status: isLast ? 'Inactive' : 'Active',
      usedLicenses: isLast ? 0 : 8,
      totalLicenses: isLast ? 2 : 10,
    };
  });
}

export const DEMO_FEATURE_LICENSES: FeatureLicenseSummary[] = [...FEATURE_LICENSE_TOP5, ...buildFillerFeatureLicenses()];

// ─── Permission Set License Usage (always sample — object is never queried) ────
export interface DonutBucket { name: string; value: number }

export const SAMPLE_PERMISSION_SET_LICENSES: DonutBucket[] = [
  { name: 'Salesforce',     value: 62 },
  { name: 'Service Cloud',  value: 28 },
  { name: 'Analytics Cloud', value: 18 },
  { name: 'Platform',       value: 12 },
  { name: 'Others',         value: 22 },
];
export const SAMPLE_PERMISSION_SET_TOTAL = 186;
export const SAMPLE_PERMISSION_SET_AVAILABLE = 44;

// ─── User Login Activity (always sample — buckets aren't tracked) ─────────────
export const SAMPLE_LOGIN_ACTIVITY: DonutBucket[] = [
  { name: 'Logged in < 30 days',    value: 1326 },
  { name: 'Logged in 30-90 days',   value: 462 },
  { name: 'Logged in 90-180 days',  value: 116 },
  { name: 'Not logged in > 180 days', value: 238 },
];

// ─── License Trend (Last 12 Scans) — always sample, no scan-over-scan history exists ──
export interface TrendPointSample {
  month: string; assigned: number; used: number; available: number;
  [key: string]: string | number;
}

export const SAMPLE_LICENSE_TREND: TrendPointSample[] = [
  { month: "Sep'25", assigned: 2380, used: 1690, available: 690 },
  { month: "Oct'25", assigned: 2390, used: 1710, available: 680 },
  { month: "Nov'25", assigned: 2400, used: 1730, available: 670 },
  { month: "Dec'25", assigned: 2410, used: 1750, available: 660 },
  { month: "Jan'26", assigned: 2420, used: 1760, available: 660 },
  { month: "Feb'26", assigned: 2430, used: 1780, available: 650 },
  { month: "Mar'26", assigned: 2440, used: 1790, available: 650 },
  { month: "Apr'26", assigned: 2450, used: 1800, available: 650 },
  { month: "May'26", assigned: 2460, used: 1810, available: 650 },
  { month: "Jun'26", assigned: 2470, used: 1820, available: 650 },
  { month: "Jul'26", assigned: 2500, used: 1830, available: 670 },
  { month: "Aug'26", assigned: 2512, used: 1842, available: 670 },
];

// ─── License Waste Indicators (mostly sample; "Inactive Users" row is real) ────
export const SAMPLE_WASTE_UNASSIGNED = 146;
export const SAMPLE_WASTE_EXPIRED = 12;
export const SAMPLE_WASTE_MULTI_LICENSE_USERS = 72;

// ─── Top Unused Feature Licenses — literal demo ranking (real scans derive this ──
// from real featureLicenses via total-used descending, see derivations.ts). ────
export interface TopUnusedRow { name: string; value: number }

export const SAMPLE_TOP_UNUSED_FEATURE_LICENSES: TopUnusedRow[] = [
  { name: 'Tableau CRM',                  value: 64 },
  { name: 'OmniStudio',                   value: 48 },
  { name: 'CRM Analytics',                value: 42 },
  { name: 'Einstein Discovery',           value: 36 },
  { name: 'Agentforce',                   value: 30 },
  { name: 'Einstein Next Best Action',    value: 26 },
];

// ─── AI License Recommendations — demo-mode fallback only. The webview never ──
// calls the backend's buildLicenseRecommendationsBase() directly (extension
// host / webview stay split, per CLAUDE.md); this is a pure frontend mirror
// of that function's own no-data defaults, used when there's no scan yet or
// a cached result predates this feature. ───────────────────────────────────
export const DEMO_LICENSE_RECOMMENDATIONS: LicenseRecommendationCard[] = [
  {
    id: 'surrender-unused', title: 'Surrender Unused Licenses', icon: '✅', impact: 'High',
    value: 146, valueLabel: 'Licenses can be surrendered',
    savingsLabel: 'Est. Annual Savings', savingsValue: '$194,580', sample: true,
  },
  {
    id: 'reclaim-inactive', title: 'Reclaim Inactive User Licenses', icon: '⚠️', impact: 'High',
    value: 238, valueLabel: 'Users inactive > 180 days',
    savingsLabel: 'Est. Annual Savings', savingsValue: '$112,420', sample: true,
  },
  {
    id: 'optimize-feature', title: 'Optimize Feature Licenses', icon: '📊', impact: 'Medium',
    value: 92, valueLabel: 'Feature licenses underutilized',
    savingsLabel: 'Est. Annual Savings', savingsValue: '$86,360', sample: true,
  },
  {
    id: 'rightsize-permset', title: 'Right-size Permission Set Licenses', icon: '🔧', impact: 'Medium',
    value: 44, valueLabel: 'Permission set licenses available',
    savingsLabel: 'Potential Savings', savingsValue: '$23,980', sample: true,
  },
  {
    id: 'plan-future', title: 'Plan Future Needs', icon: '📈', impact: 'Insight',
    value: '+120', valueLabel: 'Licenses may be needed in next 90 days',
    savingsLabel: 'Based on growth trend and usage', sample: true,
  },
];

// ─── AI Recommendations demo cards (Overview tab) — mirrors the shape         ───
// buildOrgInfoRecommendationsBase() would produce for OrgInfo.tsx's demo KPIs. ───
export const DEMO_ORG_INFO_RECOMMENDATIONS: OrgInfoRecommendationCard[] = [
  {
    id: 'license-utilization', title: 'License Utilization', icon: '📊', impact: 'Low',
    value: 80, valueLabel: 'Utilization across 8 license types',
    detailLabel: 'Recommended Range', detailValue: '70–90%', sample: false,
  },
  {
    id: 'storage-headroom', title: 'Storage Headroom', icon: '💾', impact: 'Low',
    value: 23, valueLabel: 'of allocated data storage used',
    detailLabel: 'Headroom Remaining', detailValue: '77% free', sample: false,
  },
  {
    id: 'cloud-adoption', title: 'Cloud Adoption', icon: '☁️', impact: 'Insight',
    value: '7 / 12', valueLabel: 'clouds enabled of licensed clouds',
    detailLabel: 'Not Yet Enabled', detailValue: '5 clouds', sample: false,
  },
  {
    id: 'integration-footprint', title: 'Integration Footprint', icon: '🔗', impact: 'Insight',
    value: 38, valueLabel: 'named credentials, connected apps & remote sites configured',
    detailLabel: 'Guidance', detailValue: 'Review unused connections periodically', sample: false,
  },
  {
    id: 'platform-currency', title: 'Platform Currency', icon: '🚀', impact: 'Insight',
    value: '65.0', valueLabel: "Current release: Summer '26",
    detailLabel: 'Edition', detailValue: 'Enterprise', sample: false,
  },
];

// ─── Cloud "Category" taxonomy — presentational grouping of real cloud keys, ───
// revealed on Clouds Overview's expand (not a fabricated metric). ──────────────
export const CLOUD_CATEGORY: Record<string, string> = {
  sales: 'Core CRM', service: 'Core CRM', experience: 'Core CRM',
  industries: 'Industry', health: 'Industry', financial: 'Industry',
  revenue: 'Platform', fieldservice: 'Core CRM', marketing: 'Platform',
  data: 'AI & Analytics', einstein: 'AI & Analytics', agentforce: 'AI & Analytics',
  omnistudio: 'Platform', crmanalytics: 'AI & Analytics', interaction: 'AI & Analytics', tableaucrm: 'AI & Analytics',
};
