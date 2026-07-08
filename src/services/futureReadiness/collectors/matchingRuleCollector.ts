import { SalesforceService } from '../../salesforceService';
import { MatchingRuleInfo } from '../../../types/futureReadiness';

/** Collects Matching Rules and their activation status (Tooling API). Metadata only. */
export async function collectMatchingRules(sf: SalesforceService): Promise<MatchingRuleInfo[]> {
  try {
    const rows = await sf.toolingQuery<{ DeveloperName: string; SobjectType: string; RuleStatus: string }>(
      'SELECT DeveloperName, SobjectType, RuleStatus FROM MatchingRule LIMIT 500',
    );
    return rows.map((r) => ({
      developerName: r.DeveloperName,
      sobjectType: r.SobjectType,
      status: r.RuleStatus ?? 'Unknown',
    }));
  } catch {
    return [];
  }
}
