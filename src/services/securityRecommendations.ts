import type { AnalysisResult, Issue, SecurityImpact, SecurityRecommendationCard, SecurityRecommendationsReport } from '../types';

/**
 * Deterministic base for the "AI Security Recommendations" cards on the
 * Security → Overview tab. Real cards are built from `Issue.suggestion` text
 * already produced by profileSecurityAnalyzer/userGovernanceAnalyzer, plus the
 * org-wide MFA flag surfaced via `securityCollectorData`. Cards only fall back
 * to fixed sample content (`sample: true`) when fewer than 5 real candidates
 * exist for a given org, so the row always renders 5 cards.
 */

const SEC_CATS = ['security', 'profile-security', 'user-governance'];

const SEVERITY_IMPACT: Record<Issue['severity'], SecurityImpact> = {
  error: 'High',
  warning: 'Medium',
  info: 'Low',
};

const RULE_PRESENTATION: Record<string, { title: string; icon: string }> = {
  'profile-modify-all-data': { title: 'Modify All Data Exposure', icon: '🔓' },
  'profile-view-all-data': { title: 'View All Data Exposure', icon: '👁️' },
  'profile-author-apex': { title: 'Author Apex Access', icon: '🧩' },
  'overprivileged-profiles': { title: 'Overprivileged Profiles', icon: '⚠️' },
  'permission-set-modify-all-data': { title: 'Permission Set: Modify All', icon: '🔓' },
  'permission-set-view-all-data': { title: 'Permission Set: View All', icon: '👁️' },
  'user-never-logged-in': { title: 'Users Never Logged In', icon: '🔑' },
  'user-dormant-accounts': { title: 'Dormant User Accounts', icon: '💤' },
  'excess-system-administrators': { title: 'Excess Super Admins', icon: '⚡' },
  'deep-role-hierarchy': { title: 'Deep Role Hierarchy', icon: '🌳' },
};

const SAMPLE_PADDING_CARDS: SecurityRecommendationCard[] = [
  {
    id: 'sample-password-policy',
    title: 'Strengthen Password Policy',
    icon: '🔐',
    impact: 'Medium',
    value: 'Review',
    valueLabel: 'Minimum length and complexity requirements',
    detailLabel: 'Recommended',
    detailValue: '12+ chars, mixed complexity',
    sample: true,
  },
  {
    id: 'sample-session-timeout',
    title: 'Tighten Session Timeout',
    icon: '⏱️',
    impact: 'Low',
    value: 'Review',
    valueLabel: 'Idle session timeout for sensitive profiles',
    detailLabel: 'Recommended',
    detailValue: '≤ 2 hours',
    sample: true,
  },
  {
    id: 'sample-shield-encryption',
    title: 'Expand Shield Encryption Coverage',
    icon: '🛡️',
    impact: 'Low',
    value: 'Review',
    valueLabel: 'Platform Encryption coverage on sensitive fields',
    detailLabel: 'Guidance',
    detailValue: 'Encrypt PII-bearing fields',
    sample: true,
  },
  {
    id: 'sample-event-monitoring',
    title: 'Enable Event Monitoring',
    icon: '📡',
    impact: 'Insight',
    value: 'Review',
    valueLabel: 'Track high-risk login and data-access events',
    detailLabel: 'Guidance',
    detailValue: 'Salesforce Shield add-on required',
    sample: true,
  },
];

function extractLeadingCount(message: string): number | undefined {
  const m = /^(\d+)/.exec(message.trim());
  return m ? Number(m[1]) : undefined;
}

export function buildSecurityRecommendationsBase(result: AnalysisResult): SecurityRecommendationsReport {
  const secIssues = (result.issues ?? []).filter((i) => SEC_CATS.includes(i.category) && !!i.suggestion);

  const severityRank: Record<Issue['severity'], number> = { error: 0, warning: 1, info: 2 };
  const ranked = [...secIssues].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const seenRules = new Set<string>();
  const realCards: SecurityRecommendationCard[] = [];

  for (const issue of ranked) {
    if (seenRules.has(issue.ruleId)) { continue; }
    seenRules.add(issue.ruleId);

    const presentation = RULE_PRESENTATION[issue.ruleId];
    const count = extractLeadingCount(issue.message);

    realCards.push({
      id: issue.ruleId,
      title: presentation?.title ?? issue.message.slice(0, 40),
      icon: presentation?.icon ?? '🛡️',
      impact: SEVERITY_IMPACT[issue.severity],
      value: count ?? '—',
      valueLabel: issue.message,
      detailLabel: 'Recommended Action',
      detailValue: issue.suggestion,
      sample: false,
    });
  }

  if (result.securityCollectorData?.mfaRequired === false) {
    realCards.push({
      id: 'mfa-not-enforced',
      title: 'MFA Not Enforced Org-Wide',
      icon: '🔑',
      impact: 'High',
      value: 'Off',
      valueLabel: 'Organization.IsMfaRequired is not set',
      detailLabel: 'Recommended Action',
      detailValue: 'Enforce Multi-Factor Authentication for every user.',
      sample: false,
    });
  }

  realCards.sort((a, b) => severityRank[({ High: 'error', Medium: 'warning', Low: 'info', Insight: 'info' } as const)[a.impact]]
    - severityRank[({ High: 'error', Medium: 'warning', Low: 'info', Insight: 'info' } as const)[b.impact]]);

  const cards = [...realCards];
  for (const sampleCard of SAMPLE_PADDING_CARDS) {
    if (cards.length >= 5) { break; }
    cards.push(sampleCard);
  }

  return { generatedAt: new Date().toISOString(), cards: cards.slice(0, 5) };
}
