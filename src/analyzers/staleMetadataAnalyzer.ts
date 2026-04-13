/**
 * Stale Metadata Analyzer
 *
 * Identifies reports, dashboards, and other metadata not modified in 180+ days.
 * Helps reduce org complexity and improve maintainability.
 */

import {
  Issue,
  StaleMetadataSummary,
  StaleMetadataItem,
} from '../types';
import { SalesforceService } from '../services/salesforceService';
import { logInfo, logError } from '../utils/logger';

const STALE_DAYS = 180;

function ageInDays(dateStr?: string): number {
  if (!dateStr) { return 0; }
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export class StaleMetadataAnalyzer {
  constructor(private sfService: SalesforceService) {}

  async analyze(): Promise<{ issues: Issue[]; staleMetadata: StaleMetadataSummary }> {
    logInfo('StaleMetadataAnalyzer: starting analysis…');
    const issues: Issue[] = [];

    try {
      const [staleReports, staleDashboards] = await Promise.all([
        this.sfService.getStaleReports(),
        this.sfService.getStaleDashboards(),
      ]);

      const staleReportItems: StaleMetadataItem[] = staleReports.map(r => ({
        id: r.Id,
        name: r.Name,
        type: 'report' as const,
        lastModifiedDate: r.LastModifiedDate,
        createdDate: r.CreatedDate,
        ageInDays: ageInDays(r.LastModifiedDate),
      }));

      const staleDashboardItems: StaleMetadataItem[] = staleDashboards.map(d => ({
        id: d.Id,
        name: d.Name,
        type: 'dashboard' as const,
        lastModifiedDate: d.LastModifiedDate,
        createdDate: d.CreatedDate,
        ageInDays: ageInDays(d.LastModifiedDate),
      }));

      const totalStale = staleReportItems.length + staleDashboardItems.length;
      const estimatedCleanupHours = Math.round(totalStale * 0.1); // ~6 min per item

      // ── Issue Generation ──────────────────────────────────────────────────

      if (staleReportItems.length > 0) {
        const veryStale = staleReportItems.filter(r => (r.ageInDays || 0) > 365);
        issues.push({
          id: 'stale-reports',
          ruleId: 'stale-reports',
          severity: staleReportItems.length > 50 ? 'warning' : 'info',
          category: 'stale-metadata',
          message: `${staleReportItems.length} report(s) not modified in ${STALE_DAYS}+ days (${veryStale.length} over 1 year old)`,
          description: 'Stale reports add confusion for users and may reference deprecated fields or logic.',
          suggestion: `Review and archive reports unused for over ${STALE_DAYS} days. Move to archive folders or delete.`,
          object: 'Report',
        });
      }

      if (staleDashboardItems.length > 0) {
        issues.push({
          id: 'stale-dashboards',
          ruleId: 'stale-dashboards',
          severity: staleDashboardItems.length > 20 ? 'warning' : 'info',
          category: 'stale-metadata',
          message: `${staleDashboardItems.length} dashboard(s) not modified in ${STALE_DAYS}+ days`,
          description: 'Stale dashboards may show outdated metrics and erode user trust in reporting.',
          suggestion: 'Review dashboards with stakeholders and archive or refresh outdated ones.',
          object: 'Dashboard',
        });
      }

      if (totalStale > 100) {
        issues.push({
          id: 'stale-metadata-bulk',
          ruleId: 'stale-metadata-bulk',
          severity: 'warning',
          category: 'stale-metadata',
          message: `${totalStale} total stale metadata items detected — estimated ${estimatedCleanupHours} hours to clean up`,
          description: 'Large amounts of stale metadata indicate an org needing a metadata hygiene sprint.',
          suggestion: 'Schedule a dedicated metadata cleanup sprint. Prioritise by age and object type.',
          object: 'Metadata',
        });
      }

      logInfo(`StaleMetadataAnalyzer: ${staleReportItems.length} stale reports, ${staleDashboardItems.length} stale dashboards`);

      return {
        issues,
        staleMetadata: {
          staleReports: staleReportItems,
          staleDashboards: staleDashboardItems,
          unusedCustomFields: [], // populated by dataModelAnalyzer separately
          totalStaleItems: totalStale,
          estimatedCleanupHours,
        },
      };

    } catch (err) {
      logError('StaleMetadataAnalyzer failed', err as Error);
      return {
        issues,
        staleMetadata: {
          staleReports: [],
          staleDashboards: [],
          unusedCustomFields: [],
          totalStaleItems: 0,
          estimatedCleanupHours: 0,
        },
      };
    }
  }
}

export function createStaleMetadataAnalyzer(sfService: SalesforceService): StaleMetadataAnalyzer {
  return new StaleMetadataAnalyzer(sfService);
}
