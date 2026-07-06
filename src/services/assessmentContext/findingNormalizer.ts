import { Issue, IssueCategory } from '../../types';
import { NormalizedFinding, NormalizedFindingGroup, NormalizedSeverity } from '../../types/assessmentContext';
import { IFindingNormalizer, IPiiSanitizer } from './interfaces';

// Rule IDs with system-level blast radius — elevated from High to Critical.
const CRITICAL_RULE_IDS = new Set([
  'soql-in-loop',
  'dml-in-loop',
  'missing-sharing',
  'modifyall-permission',
]);

// Map from IssueCategory → display domain (17 categories → 9 domains).
const CATEGORY_TO_DOMAIN: Record<IssueCategory, { domain: string; displayName: string }> = {
  'code-quality':      { domain: 'code-quality',    displayName: 'Code Quality' },
  'automation-design': { domain: 'automation',       displayName: 'Automation Design' },
  'data-model':        { domain: 'data-model',       displayName: 'Data Model' },
  'performance':       { domain: 'performance',      displayName: 'Performance' },
  'security':          { domain: 'security',         displayName: 'Security' },
  'profile-security':  { domain: 'security',         displayName: 'Security' },
  'testing':           { domain: 'testing',          displayName: 'Test Coverage' },
  'integration':       { domain: 'integration',      displayName: 'Integration' },
  'governor-limits':   { domain: 'governor-limits',  displayName: 'Governor Limits' },
  'technical-debt':    { domain: 'technical-debt',   displayName: 'Technical Debt' },
  'stale-metadata':    { domain: 'technical-debt',   displayName: 'Technical Debt' },
  'org-inventory':     { domain: 'technical-debt',   displayName: 'Technical Debt' },
  'dependencies':      { domain: 'technical-debt',   displayName: 'Technical Debt' },
  'lwc-quality':       { domain: 'technical-debt',   displayName: 'Technical Debt' },
  'aura-quality':      { domain: 'technical-debt',   displayName: 'Technical Debt' },
  'user-governance':   { domain: 'technical-debt',   displayName: 'Technical Debt' },
  'cta-review':        { domain: 'technical-debt',   displayName: 'Technical Debt' },
};

function toNormalizedSeverity(issue: Issue): NormalizedSeverity {
  if (issue.severity === 'error') {
    return CRITICAL_RULE_IDS.has(issue.ruleId) ? 'Critical' : 'High';
  }
  if (issue.severity === 'warning') { return 'Medium'; }
  return 'Low';
}

export class FindingNormalizer implements IFindingNormalizer {
  normalize(issues: Issue[], sanitizer: IPiiSanitizer): NormalizedFindingGroup[] {
    // Group issues by domain, then by ruleId within each domain.
    const domainMap = new Map<string, {
      displayName: string;
      byRule: Map<string, { severity: NormalizedSeverity; messages: string[]; objects: Set<string> }>;
    }>();

    for (const issue of issues) {
      const mapping = CATEGORY_TO_DOMAIN[issue.category];
      if (!mapping) { continue; }

      if (!domainMap.has(mapping.domain)) {
        domainMap.set(mapping.domain, { displayName: mapping.displayName, byRule: new Map() });
      }
      const domainEntry = domainMap.get(mapping.domain)!;

      if (!domainEntry.byRule.has(issue.ruleId)) {
        domainEntry.byRule.set(issue.ruleId, {
          severity: toNormalizedSeverity(issue),
          messages: [],
          objects: new Set(),
        });
      }
      const ruleEntry = domainEntry.byRule.get(issue.ruleId)!;

      // Sanitize the message — NEVER include file paths, descriptions, or source.
      const sanitizedMessage = sanitizer.sanitizeString(issue.message);
      if (!ruleEntry.messages.includes(sanitizedMessage)) {
        ruleEntry.messages.push(sanitizedMessage);
      }

      if (issue.object) {
        ruleEntry.objects.add(issue.object);
      }
    }

    const groups: NormalizedFindingGroup[] = [];

    for (const [domain, { displayName, byRule }] of domainMap) {
      const topFindings: NormalizedFinding[] = [];
      let criticalCount = 0;
      let highCount = 0;
      let mediumCount = 0;
      let lowCount = 0;

      for (const [ruleId, { severity, messages, objects }] of byRule) {
        const count = messages.length;
        switch (severity) {
          case 'Critical': criticalCount += count; break;
          case 'High':     highCount     += count; break;
          case 'Medium':   mediumCount   += count; break;
          case 'Low':      lowCount      += count; break;
        }

        topFindings.push({
          ruleId,
          normalizedSeverity: severity,
          count,
          // Use the first (most representative) deduplicated message.
          message: messages[0] ?? '',
          tags: [domain],
          affectedObjects: Array.from(objects),
        });
      }

      // Sort findings: Critical → High → Medium → Low, then by count descending.
      const severityOrder: Record<NormalizedSeverity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      topFindings.sort((a, b) => {
        const diff = severityOrder[a.normalizedSeverity] - severityOrder[b.normalizedSeverity];
        return diff !== 0 ? diff : b.count - a.count;
      });

      groups.push({ domain, displayName, criticalCount, highCount, mediumCount, lowCount, topFindings });
    }

    return groups;
  }
}
