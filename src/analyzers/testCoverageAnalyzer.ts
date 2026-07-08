/**
 * Test Coverage Analyzer
 * Fetches ApexCodeCoverageAggregate from the connected org and flags
 * classes/triggers that fall below the 75% Salesforce deployment threshold.
 */

import { Issue, ApexCodeCoverage } from '../types';
import { SalesforceService } from '../services/salesforceService';
import { ruleEngine } from '../rules/engine';
import { logInfo, logSection, logWarning } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

// ============================================================================
// Types
// ============================================================================

export interface TestCoverageResult {
  issues: Issue[];
  totalClasses: number;
  classesBelow75: number;
  averageCoverage: number;
  zeroCoverageCount: number;
  classCoverageDetails: Array<{ name: string; pct: number; type: 'Class' | 'Trigger' }>;
}

// ============================================================================
// Analyzer
// ============================================================================

export class TestCoverageAnalyzer {
  constructor(private salesforceService: SalesforceService) {}

  async analyze(): Promise<TestCoverageResult> {
    logSection('Test Coverage Analysis');

    const result: TestCoverageResult = {
      issues: [],
      totalClasses: 0,
      classesBelow75: 0,
      averageCoverage: 0,
      zeroCoverageCount: 0,
      classCoverageDetails: [],
    };

    try {
      const coverageRows = await this.salesforceService.getApexCodeCoverage();
      logInfo(`Fetched coverage data for ${coverageRows.length} Apex items`);

      // Deduplicate by class/trigger name (aggregate may have multiple rows per class)
      const aggregated = this.aggregate(coverageRows);
      result.totalClasses = aggregated.size;

      let totalPercent = 0;

      for (const [name, data] of aggregated) {
        const totalLines = data.covered + data.uncovered;
        const percent = totalLines === 0 ? 100 : Math.round((data.covered / totalLines) * 100);

        totalPercent += percent;

        if (percent < 75) {
          result.classesBelow75++;
          if (percent === 0) {
            result.zeroCoverageCount++;
          }

          const issues = ruleEngine.run(
            ['test-coverage'],
            {
              className: name,
              coveragePercent: percent,
              numLinesCovered: data.covered,
              numLinesUncovered: data.uncovered,
              isTest: false,
            },
            { filePath: `org://${name}` }
          );
          result.issues.push(...issues);
        }
      }

      result.averageCoverage = aggregated.size > 0
        ? Math.round(totalPercent / aggregated.size)
        : 100;

      result.classCoverageDetails = [...aggregated.entries()]
        .map(([name, data]) => {
          const totalLines = data.covered + data.uncovered;
          const pct = totalLines === 0 ? 100 : Math.round((data.covered / totalLines) * 100);
          return { name, pct, type: 'Class' as const };
        })
        .sort((a, b) => a.pct - b.pct);

      logInfo(
        `Coverage: avg=${result.averageCoverage}%, below75=${result.classesBelow75}, zero=${result.zeroCoverageCount}`
      );
    } catch (error) {
      logWarning(`Test coverage analysis failed: ${getErrorMessage(error)}`);
    }

    return result;
  }

  /**
   * Aggregate multiple coverage rows per class into a single entry
   */
  private aggregate(rows: ApexCodeCoverage[]): Map<string, { covered: number; uncovered: number }> {
    const map = new Map<string, { covered: number; uncovered: number }>();

    for (const row of rows) {
      const name = row.ApexClassOrTrigger?.Name ?? row.ApexClassOrTriggerId;
      const existing = map.get(name) ?? { covered: 0, uncovered: 0 };
      existing.covered += row.NumLinesCovered;
      existing.uncovered += row.NumLinesUncovered;
      map.set(name, existing);
    }

    return map;
  }
}

export function createTestCoverageAnalyzer(
  salesforceService: SalesforceService
): TestCoverageAnalyzer {
  return new TestCoverageAnalyzer(salesforceService);
}
