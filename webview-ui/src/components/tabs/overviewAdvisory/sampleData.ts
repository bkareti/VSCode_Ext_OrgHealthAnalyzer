/**
 * All content on the "AI Executive Advisory" overview tab is sample/illustrative
 * for now — real analyzer-driven wiring is a later phase (see docs/DATA_WIRING_REFERENCE.md).
 * Every card that renders these literals must show a SampleMark or a `sample` prop
 * so users can tell this apart from real scan output.
 */

// ── Overall Verdict ──────────────────────────────────────────────────────────

export interface VerdictData {
  headline: string;
  description: string;
  score: number;
  scoreLabel: string;
  maturity: string;
}

export const VERDICT: VerdictData = {
  headline: 'Well-Architected with Modernization Opportunities',
  description:
    'Your Salesforce org demonstrates strong architecture foundations with healthy security, automation and code quality. Focus on integration modernization and data readiness to unlock greater value from AI and Cloud.',
  score: 82,
  scoreLabel: 'Overall Health',
  maturity: 'Managed',
};

// ── Key Takeaways ────────────────────────────────────────────────────────────

export const KEY_TAKEAWAYS: string[] = [
  'Strong foundation in security, code quality and automation.',
  'Integration layer uses legacy patterns that increase operational risk.',
  'Data quality and identity resolution need improvement for Data Cloud & AI.',
  'Good opportunity to accelerate Agentforce adoption.',
  'Address top 6 priorities to improve score from 82 → 91.',
];

// ── What Changed Since Last Scan ─────────────────────────────────────────────

export interface WhatChangedRow {
  area: string;
  deltaPts: number;
  trend: 'up' | 'down';
}

export const WHAT_CHANGED_ROWS: WhatChangedRow[] = [
  { area: 'Overall Health',    deltaPts: 6,  trend: 'up'   },
  { area: 'Architecture',      deltaPts: 4,  trend: 'up'   },
  { area: 'Security',          deltaPts: 6,  trend: 'up'   },
  { area: 'Code Quality',      deltaPts: 2,  trend: 'up'   },
  { area: 'Performance',       deltaPts: 1,  trend: 'up'   },
  { area: 'Future Readiness',  deltaPts: -3, trend: 'down' },
];

// ── Business Risk Summary ────────────────────────────────────────────────────

export interface RiskLevelItem {
  label: string;
  level: 'Low' | 'Medium' | 'High';
}

export const BUSINESS_RISK_SUMMARY: RiskLevelItem[] = [
  { label: 'Deployment Risk',  level: 'Low'    },
  { label: 'Migration Risk',   level: 'Medium' },
  { label: 'Compliance Risk',  level: 'Low'    },
  { label: 'Maintenance Cost', level: 'High'   },
  { label: 'AI Readiness',     level: 'Medium' },
  { label: 'Scalability Risk', level: 'Low'    },
];

// ── Estimated Readiness After Fixes ──────────────────────────────────────────

export interface ForecastPoint {
  label: string;
  score: number;
}

export const READINESS_FORECAST: ForecastPoint[] = [
  { label: 'Current',            score: 82 },
  { label: 'After Quick Wins',   score: 88 },
  { label: 'After Full Roadmap', score: 91 },
];

export const FORECAST_STATS = {
  effort: 'Medium',
  timeline: '2-3 Months',
  confidence: 'High',
} as const;

// ── Top Business Risks ───────────────────────────────────────────────────────

export interface RiskItem {
  title: string;
  description: string;
  impact: 'High' | 'Medium';
  trend: 'Worsening' | 'No Change' | 'Slightly Improving';
}

export const TOP_BUSINESS_RISKS: RiskItem[] = [
  {
    title: 'Integration Modernization',
    description: '7 hardcoded login URLs and 14 Remote Site Settings in use.',
    impact: 'High',
    trend: 'Worsening',
  },
  {
    title: 'Data Quality Issues',
    description: '53% duplicate and incomplete data affects AI accuracy.',
    impact: 'High',
    trend: 'No Change',
  },
  {
    title: 'Technical Debt',
    description: '65 components using legacy patterns (Workflow, Aura).',
    impact: 'Medium',
    trend: 'Slightly Improving',
  },
  {
    title: 'Scalability Constraints',
    description: 'Large data volumes may impact performance.',
    impact: 'Medium',
    trend: 'No Change',
  },
];

// ── Top Opportunities ────────────────────────────────────────────────────────

export interface OpportunityItem {
  title: string;
  description: string;
  impact: 'High' | 'Medium';
  effort: 'High' | 'Medium' | 'Low';
}

export const TOP_OPPORTUNITIES: OpportunityItem[] = [
  {
    title: 'Enable Data Cloud',
    description: 'Unlock 360° customer view and real-time insights.',
    impact: 'High',
    effort: 'Medium',
  },
  {
    title: 'Modernize Integrations',
    description: 'Improve security, reliability and portability.',
    impact: 'High',
    effort: 'Low',
  },
  {
    title: 'Adopt Agentforce',
    description: 'Automate service, sales and internal operations.',
    impact: 'High',
    effort: 'Medium',
  },
  {
    title: 'Improve Data Quality',
    description: 'Increase AI/Analytics accuracy and trust.',
    impact: 'High',
    effort: 'Medium',
  },
];

// ── AI Advisor Opinion ───────────────────────────────────────────────────────

export const AI_ADVISOR_OPINION = {
  opinionText:
    'If I were reviewing this org as a Salesforce CTA, I would approve this org for enterprise operations. The architecture is well governed and scalable. However, I recommend resolving integration and data quality gaps before major initiatives like Data Cloud or Agentforce at scale.',
  priorityRecommendation:
    'Focus on the top 6 priorities below. They will improve your overall health score from 82 to 91 and reduce long-term operational risk.',
  byline: 'OrgPulse AI Architect — Senior Salesforce CTA-Level Analysis',
};

// ── Recommended Roadmap ──────────────────────────────────────────────────────

export interface RoadmapPhaseData {
  phase: string;
  subtitle: string;
  icon: string;
  theme: 'green' | 'blue' | 'purple' | 'orange';
  items: string[];
  effort: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High';
  scoreGain: number;
}

export const ROADMAP_PHASES: RoadmapPhaseData[] = [
  {
    phase: 'Phase 1',
    subtitle: 'Quick Wins (0 – 30 Days)',
    icon: '🛡️',
    theme: 'green',
    items: [
      'Replace Remote Sites with Named Credentials',
      'Remove hardcoded URLs / login endpoints',
      'Enable External Credentials for integrations',
      'Clean up unused profiles, permission sets',
    ],
    effort: 'Low',
    impact: 'High',
    scoreGain: 6,
  },
  {
    phase: 'Phase 2',
    subtitle: 'Foundation (1 – 3 Months)',
    icon: '💎',
    theme: 'blue',
    items: [
      'Improve data quality and deduplicate records',
      'Standardize authentication (OAuth / JWT)',
      'Migrate Workflow Rules & Process Builder to Flow',
      'Enhance monitoring & logging for integrations',
    ],
    effort: 'Medium',
    impact: 'High',
    scoreGain: 6,
  },
  {
    phase: 'Phase 3',
    subtitle: 'Modernization (3 – 6 Months)',
    icon: '⚙️',
    theme: 'purple',
    items: [
      'Enable Data Cloud and identity resolution',
      'Adopt Agentforce for key use cases',
      'Refactor Aura & legacy components',
      'Optimize large data volumes & archiving',
    ],
    effort: 'Medium',
    impact: 'High',
    scoreGain: 6,
  },
  {
    phase: 'Phase 4',
    subtitle: 'Innovation (6+ Months)',
    icon: '💡',
    theme: 'orange',
    items: [
      'Advanced AI/Analytics & predictive insights',
      'Expand automation & self-service capabilities',
      'Continuous optimization & governance',
    ],
    effort: 'Medium',
    impact: 'Medium',
    scoreGain: 3,
  },
];

// ── Investment Priority Matrix ────────────────────────────────────────────────

export interface PriorityQuadrant {
  id: 'do-first' | 'strategic-bets' | 'quick-wins' | 'consider-later';
  label: string;
  sub: string;
}

export const PRIORITY_QUADRANTS: PriorityQuadrant[] = [
  { id: 'do-first',       label: 'Do First',       sub: 'High Impact, Low Effort'  },
  { id: 'strategic-bets', label: 'Strategic Bets', sub: 'High Impact, High Effort' },
  { id: 'quick-wins',     label: 'Quick Wins',     sub: 'Low Impact, Low Effort'   },
  { id: 'consider-later', label: 'Consider Later', sub: 'Low Impact, High Effort'  },
];

// ── AI Prioritized Actions ───────────────────────────────────────────────────

export interface ActionRow {
  rank: number;
  action: string;
  category: string;
  impact: 'High' | 'Medium';
  effort: 'Low' | 'Medium' | 'High';
  scoreGain: number;
  targetDate: string;
  status: 'Not Started';
}

export const PRIORITIZED_ACTIONS: ActionRow[] = [
  { rank: 1, action: 'Replace Remote Sites',        category: 'Integration',    impact: 'High',   effort: 'Low',    scoreGain: 2, targetDate: 'May 30, 2026', status: 'Not Started' },
  { rank: 2, action: 'Improve Data Quality',         category: 'Data',           impact: 'High',   effort: 'Medium', scoreGain: 4, targetDate: 'Jun 15, 2026', status: 'Not Started' },
  { rank: 3, action: 'Enable External Credentials',  category: 'Security',       impact: 'High',   effort: 'Low',    scoreGain: 2, targetDate: 'May 30, 2026', status: 'Not Started' },
  { rank: 4, action: 'Reduce Aura Components',       category: 'Technical Debt', impact: 'Medium', effort: 'Medium', scoreGain: 2, targetDate: 'Jun 30, 2026', status: 'Not Started' },
  { rank: 5, action: 'Migrate Workflow to Flow',      category: 'Automation',     impact: 'Medium', effort: 'Medium', scoreGain: 2, targetDate: 'Jul 15, 2026', status: 'Not Started' },
  { rank: 6, action: 'Enable Data Cloud',             category: 'Future Readiness', impact: 'High', effort: 'High',  scoreGain: 4, targetDate: 'Aug 30, 2026', status: 'Not Started' },
  { rank: 7, action: 'Optimize Large Data Volumes',   category: 'Data',           impact: 'Medium', effort: 'Medium', scoreGain: 1, targetDate: 'Jun 30, 2026', status: 'Not Started' },
  { rank: 8, action: 'Enhance Monitoring & Logging',  category: 'Performance',    impact: 'Medium', effort: 'Low',    scoreGain: 1, targetDate: 'May 31, 2026', status: 'Not Started' },
];

// ── Health Score Trend (Last 12 Scans) ───────────────────────────────────────

export interface HealthTrendPoint {
  [key: string]: string | number;
  month: string;
  overall: number;
  architecture: number;
  security: number;
  codeQuality: number;
  futureReadiness: number;
}

export const HEALTH_SCORE_TREND: HealthTrendPoint[] = [
  { month: "Aug '25", overall: 71, architecture: 68, security: 74, codeQuality: 70, futureReadiness: 60 },
  { month: "Sep '25", overall: 73, architecture: 70, security: 75, codeQuality: 71, futureReadiness: 61 },
  { month: "Oct '25", overall: 74, architecture: 74, security: 76, codeQuality: 73, futureReadiness: 62 },
  { month: "Nov '25", overall: 75, architecture: 75, security: 77, codeQuality: 74, futureReadiness: 63 },
  { month: "Dec '25", overall: 74, architecture: 76, security: 76, codeQuality: 75, futureReadiness: 64 },
  { month: "Jan '26", overall: 76, architecture: 78, security: 78, codeQuality: 76, futureReadiness: 66 },
  { month: "Feb '26", overall: 78, architecture: 80, security: 79, codeQuality: 78, futureReadiness: 67 },
  { month: "Mar '26", overall: 79, architecture: 84, security: 80, codeQuality: 80, futureReadiness: 68 },
  { month: "Apr '26", overall: 80, architecture: 86, security: 81, codeQuality: 82, futureReadiness: 69 },
  { month: "May '26", overall: 79, architecture: 88, security: 82, codeQuality: 84, futureReadiness: 70 },
  { month: "Jun '26", overall: 81, architecture: 90, security: 83, codeQuality: 86, futureReadiness: 71 },
  { month: "Jul '26", overall: 82, architecture: 92, security: 84, codeQuality: 88, futureReadiness: 68 },
];

// ── Domain Contribution to Health Score ──────────────────────────────────────

export interface DomainRow {
  domain: string;
  score: number;
  weight: number;
  weightedScore: number;
  contributionPct: number;
}

export const DOMAIN_CONTRIBUTION: DomainRow[] = [
  { domain: 'Architecture',      score: 92, weight: 20, weightedScore: 18.4, contributionPct: 22 },
  { domain: 'Security',          score: 84, weight: 15, weightedScore: 12.6, contributionPct: 15 },
  { domain: 'Code Quality',      score: 88, weight: 15, weightedScore: 13.2, contributionPct: 16 },
  { domain: 'Automation',        score: 81, weight: 10, weightedScore: 8.1,  contributionPct: 10 },
  { domain: 'Performance',       score: 79, weight: 10, weightedScore: 7.9,  contributionPct: 10 },
  { domain: 'Integrations',      score: 68, weight: 10, weightedScore: 6.8,  contributionPct: 8  },
  { domain: 'Platform Capacity', score: 80, weight: 5,  weightedScore: 4.0,  contributionPct: 5  },
  { domain: 'Technical Debt',    score: 65, weight: 5,  weightedScore: 3.3,  contributionPct: 4  },
];

export const DOMAIN_CONTRIBUTION_TOTAL = {
  score: 82,
  weightPct: 100,
  weightedScore: 74.3,
  contributionPct: 100,
};

// ── Next Best Actions (bottom bar — all disabled, "Soon") ────────────────────

export interface NextBestAction {
  icon: string;
  title: string;
  subtitle: string;
  highlighted?: boolean;
}

export const NEXT_BEST_ACTIONS: NextBestAction[] = [
  { icon: '⚙️', title: 'Generate Remediation Plan', subtitle: 'AI-powered fix recommendations' },
  { icon: '📄', title: 'Create Executive Report',    subtitle: 'Download presentation ready report' },
  { icon: '📊', title: 'Compare with Benchmark',      subtitle: 'See how you compare' },
  { icon: '🔗', title: 'Share Advisory',              subtitle: 'Share with your team' },
  { icon: '➜', title: 'View Full Advisory Report',   subtitle: 'Detailed CTA-level analysis', highlighted: true },
];
