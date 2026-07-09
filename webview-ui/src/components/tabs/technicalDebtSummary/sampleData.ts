import type { RecommendationCardData } from '@/components/common';

/**
 * Fixed illustrative constants for the Technical Debt Overview redesign.
 * OrgPulse's real DebtSummary/DebtItem model has no domain taxonomy
 * (Code/Automation/Security/…) or severity tiers (Critical/High/Medium/Low)
 * today — every value here is sample data. Every consumer must render a
 * SampleMark, mirroring the convention in
 * webview-ui/src/components/tabs/governorLimitsSummary/sampleData.ts.
 */

export type DebtDomain =
  | 'Code Debt' | 'Automation Debt' | 'Security Debt' | 'Integration Debt'
  | 'Configuration Debt' | 'Data Debt' | 'Licensing Debt' | 'Modernization Debt';

export const DOMAIN_COLOR: Record<DebtDomain, string> = {
  'Code Debt':           '#3b82f6',
  'Automation Debt':     '#ef4444',
  'Security Debt':       '#f97316',
  'Integration Debt':    '#14b8a6',
  'Configuration Debt':  '#22c55e',
  'Data Debt':           '#eab308',
  'Licensing Debt':      '#8b5cf6',
  'Modernization Debt':  '#6b7280',
};

function seededWave(seed: number, i: number): number {
  return Math.sin(seed + i * 0.6) * 6 + Math.cos(seed * 1.7 + i * 0.3) * 3;
}

/** Deterministic (seeded) sparkline ending near `endValue` — no real scan history is captured for these metrics. */
export function sampleSparkline(endValue: number, seed: number, points = 7): { value: number }[] {
  const arr: number[] = [];
  for (let i = 0; i < points; i++) {
    arr.push(Math.max(0, Math.round(endValue - (points - 1 - i) * 0.6 + seededWave(seed, i))));
  }
  arr[arr.length - 1] = Math.max(0, Math.round(endValue));
  return arr.map((value) => ({ value }));
}

export const TREND_NOTE = 'Trend sparkline is illustrative — OrgPulse only captures a point-in-time snapshot, not history across scans.';

// ── KPI row ──────────────────────────────────────────────────────────────────
export const KPI = {
  technicalDebtScore: 68,
  technicalDebtScoreLabel: 'Moderate',
  technicalDebtScoreDelta: -6,
  criticalDebtItems: 72,
  criticalDebtItemsDelta: 8,
  domainsAffected: 7,
  domainsTotal: 8,
  domainsAffectedDelta: 1,
  modernizationDebt: 186,
  modernizationDebtDelta: 14,
  quickWinsAvailable: 38,
  quickWinsAvailableDelta: -5,
  debtTrendLabel: 'Improving',
  debtTrendPct: 9,
};

// ── Debt Distribution by Domain (donut) ─────────────────────────────────────
export interface DomainCount { domain: DebtDomain; total: number }

export const DOMAIN_TOTALS: DomainCount[] = [
  { domain: 'Code Debt',          total: 232 },
  { domain: 'Automation Debt',    total: 150 },
  { domain: 'Security Debt',      total: 102 },
  { domain: 'Integration Debt',   total: 75 },
  { domain: 'Configuration Debt', total: 55 },
  { domain: 'Data Debt',          total: 41 },
  { domain: 'Licensing Debt',     total: 20 },
  { domain: 'Modernization Debt', total: 7 },
];

export const TOTAL_DEBT_ITEMS = DOMAIN_TOTALS.reduce((s, d) => s + d.total, 0); // 682

// ── Debt by Severity (bar) ───────────────────────────────────────────────────
export const SEVERITY_TOTALS = [
  { name: 'Critical', value: 72,  color: '#ef4444' },
  { name: 'High',     value: 214, color: '#f97316' },
  { name: 'Medium',   value: 262, color: '#eab308' },
  { name: 'Low',      value: 134, color: '#22c55e' },
];

// ── Debt by Domain (Score) radar ─────────────────────────────────────────────
export const DOMAIN_RADAR = [
  { subject: 'Code',              value: 95 },
  { subject: 'Automation',        value: 70 },
  { subject: 'Security',          value: 65 },
  { subject: 'Integration',       value: 55 },
  { subject: 'Data',              value: 50 },
  { subject: 'Configuration',     value: 60 },
  { subject: 'Performance',       value: 45 },
  { subject: 'Future Readiness',  value: 35 },
];

// ── Top Business Risks ───────────────────────────────────────────────────────
export interface BusinessRisk { label: string; level: 'High' | 'Medium' | 'Low' }

export const TOP_BUSINESS_RISKS: BusinessRisk[] = [
  { label: 'Future Release Risk',    level: 'Medium' },
  { label: 'Deployment Risk',        level: 'High' },
  { label: 'Maintenance Cost',       level: 'High' },
  { label: 'Developer Productivity', level: 'Medium' },
  { label: 'AI Readiness',           level: 'Low' },
];

// ── Architecture Maturity ────────────────────────────────────────────────────
export const ARCHITECTURE_MATURITY = { level: 3, levelsTotal: 5, label: 'Defined' };

// ── AI Prioritization Matrix ──────────────────────────────────────────────────
export const PRIORITIZATION_MATRIX = {
  quickWins: 38,   // Do First — low effort, high impact
  strategic: 26,   // Difficult but Valuable — high effort, high impact
  cleanup: 44,     // Low Impact — low effort, low impact
  longTerm: 18,    // Monitor — high effort, low impact
};

// ── 8 Domain stat cards (with Critical/High/Medium/Low breakdown) ───────────
export interface DomainBreakdown { domain: DebtDomain; total: number; critical: number; high: number; medium: number; low: number }

export const DOMAIN_BREAKDOWN: DomainBreakdown[] = [
  { domain: 'Code Debt',          total: 232, critical: 24, high: 73, medium: 89, low: 46 },
  { domain: 'Automation Debt',    total: 150, critical: 16, high: 47, medium: 58, low: 29 },
  { domain: 'Security Debt',      total: 102, critical: 11, high: 32, medium: 39, low: 20 },
  { domain: 'Integration Debt',   total: 75,  critical: 8,  high: 24, medium: 29, low: 14 },
  { domain: 'Configuration Debt', total: 55,  critical: 6,  high: 17, medium: 21, low: 11 },
  { domain: 'Data Debt',          total: 41,  critical: 4,  high: 13, medium: 16, low: 8 },
  { domain: 'Licensing Debt',     total: 20,  critical: 2,  high: 6,  medium: 8,  low: 4 },
  { domain: 'Modernization Debt', total: 7,   critical: 1,  high: 2,  medium: 2,  low: 2 },
];

// ── Top Technical Debt Items table ───────────────────────────────────────────
export interface TopDebtItem {
  issue: string;
  domain: DebtDomain;
  severity: 'Critical' | 'High' | 'Medium';
  impact: 'High' | 'Medium';
  effort: 'Low' | 'Medium' | 'High';
  instances: number;
}

export const TOP_DEBT_ITEMS: TopDebtItem[] = [
  { issue: 'SOQL queries inside loops',        domain: 'Code Debt',          severity: 'Critical', impact: 'High',   effort: 'Medium', instances: 34 },
  { issue: 'Process Builder still in use',     domain: 'Automation Debt',    severity: 'Critical', impact: 'High',   effort: 'High',   instances: 14 },
  { issue: 'Workflows still in use',           domain: 'Automation Debt',    severity: 'High',     impact: 'High',   effort: 'Medium', instances: 28 },
  { issue: 'Profiles with Modify All Data',    domain: 'Security Debt',      severity: 'High',     impact: 'High',   effort: 'Low',    instances: 6 },
  { issue: 'Hardcoded credentials in Apex',    domain: 'Integration Debt',   severity: 'High',     impact: 'High',   effort: 'Low',    instances: 9 },
  { issue: 'Remote Site Settings in use',      domain: 'Integration Debt',   severity: 'Medium',   impact: 'Medium', effort: 'Low',    instances: 14 },
  { issue: 'Unused custom fields',             domain: 'Configuration Debt', severity: 'Medium',   impact: 'Medium', effort: 'Medium', instances: 112 },
  { issue: 'Aura components in use',           domain: 'Modernization Debt', severity: 'Medium',   impact: 'Medium', effort: 'High',   instances: 42 },
];

// ── Modernization Debt breakdown ─────────────────────────────────────────────
export const MODERNIZATION_DEBT: { label: string; count: number }[] = [
  { label: 'Workflow Rules',        count: 28 },
  { label: 'Process Builder',       count: 14 },
  { label: 'Aura Components',       count: 42 },
  { label: 'Visualforce Pages',     count: 65 },
  { label: 'SOAP API Usage',        count: 18 },
  { label: 'Remote Site Settings',  count: 14 },
  { label: 'Basic Authentication',  count: 5 },
  { label: 'Legacy API Versions',   count: 12 },
];

// ── Quick Wins (High Impact, Low Effort) ─────────────────────────────────────
export const QUICK_WINS: { title: string; impact: 'High' | 'Medium' | 'Low' }[] = [
  { title: 'Delete 18 inactive flows',              impact: 'High' },
  { title: 'Automate 12 obsolete profiles',         impact: 'High' },
  { title: 'Remove 112 unused custom fields',       impact: 'Medium' },
  { title: 'Replace 14 remote sites',                impact: 'High' },
  { title: 'Deactivate 9 inactive users',           impact: 'Medium' },
  { title: 'Clean up 8 unused permission sets',     impact: 'Medium' },
  { title: 'Delete 23 unused reports',              impact: 'Low' },
  { title: 'Optimize 34 validation rules',          impact: 'Medium' },
];

// ── AI Recommendations (prioritized for maximum impact) ──────────────────────
export const TECHNICAL_DEBT_RECOMMENDATIONS: RecommendationCardData[] = [
  {
    id: 'automate-legacy-cleanup', icon: '🧹', impact: 'High',
    title: 'Automate Legacy Cleanup',
    description: 'Migrate 28 Workflow Rules and 14 Process Builders to Flows. This reduces technical debt and improves reliability.',
    sample: true,
  },
  {
    id: 'reduce-code-complexity', icon: '🧩', impact: 'High',
    title: 'Reduce Code Complexity',
    description: 'Refactor 41 high complexity methods and eliminate SOQL/DML in loops to reduce performance risks.',
    sample: true,
  },
  {
    id: 'strengthen-security-model', icon: '🛡️', impact: 'High',
    title: 'Strengthen Security Model',
    description: 'Review 6 over-privileged profiles and implement least privilege access model using Permission Sets.',
    sample: true,
  },
  {
    id: 'modernize-integrations', icon: '🔌', impact: 'Medium',
    title: 'Modernize Integrations',
    description: 'Migrate 14 Remote Sites to Named Credentials and replace 5 Basic Auth integrations.',
    sample: true,
  },
  {
    id: 'optimize-data-model', icon: '🗄️', impact: 'Medium',
    title: 'Optimize Data Model',
    description: 'Archive 1.2M old records and clean up unused fields to improve data quality and storage.',
    sample: true,
  },
  {
    id: 'improve-automation-design', icon: '🔄', impact: 'Medium',
    title: 'Improve Automation Design',
    description: 'Consolidate overlapping automations on Opportunity and Case to reduce maintenance effort.',
    sample: true,
  },
];
