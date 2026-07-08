import { SalesforceService } from '../../salesforceService';
import { DuplicateRuleInfo } from '../../../types/futureReadiness';

/** Collects active/inactive Duplicate Rules (Tooling API). Metadata only. */
export async function collectDuplicateRules(sf: SalesforceService): Promise<DuplicateRuleInfo[]> {
  try {
    const rows = await sf.toolingQuery<{ DeveloperName: string; SobjectType: string; IsActive: boolean }>(
      'SELECT DeveloperName, SobjectType, IsActive FROM DuplicateRule LIMIT 500',
    );
    return rows.map((r) => ({
      developerName: r.DeveloperName,
      sobjectType: r.SobjectType,
      isActive: !!r.IsActive,
    }));
  } catch {
    return [];
  }
}
