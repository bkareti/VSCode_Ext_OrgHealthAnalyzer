import * as assert from 'assert';
import { AssessmentContextService } from '../../services/assessmentContext/assessmentContextService';
import { makeMockResult } from './fixtures/mockAnalysisResult';

suite('AssessmentContextBuilder (integration)', () => {
  test('build() returns a valid AssessmentContext with all required top-level keys', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);

    const required = [
      'scanMetadata', 'metadataCoverage', 'scores', 'findings', 'businessContext',
      'quickWins', 'trends', 'securitySummary', 'performanceSummary', 'architectureSummary',
      'testCoverageSummary', 'licenseUtilizationSummary', 'governorLimitsSummary', 'optimizerReport',
    ];
    for (const key of required) {
      assert.ok(key in ctx, `Missing top-level key: ${key}`);
    }
  });

  test('scanMetadata.orgId is masked (not the raw org ID)', () => {
    const result  = makeMockResult(); // orgId: '00D000000000001ABC'
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.ok(!ctx.scanMetadata.orgId.includes('000000000001ABC'), 'Raw org ID must be masked');
    assert.ok(ctx.scanMetadata.orgId.includes('*'), 'Masked org ID should contain asterisks');
  });

  test('scores array has >= 14 entries (13 dimensions + overall)', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.ok(ctx.scores.length >= 14, `Expected >= 14 score dimensions, got ${ctx.scores.length}`);
  });

  test('findings array is non-empty', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.ok(ctx.findings.length > 0, 'findings should not be empty');
  });

  test('metadataCoverage.hasTrends is true when result.trends has >= 2 points', () => {
    const result  = makeMockResult(); // fixture has 2 trend points
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.strictEqual(ctx.metadataCoverage.hasTrends, true);
  });

  test('metadataCoverage.hasTrends is false when result.trends is undefined', () => {
    const result  = makeMockResult({ trends: undefined });
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.strictEqual(ctx.metadataCoverage.hasTrends, false);
  });

  test('metadataCoverage.hasOrgLimits is true when orgLimits present', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.strictEqual(ctx.metadataCoverage.hasOrgLimits, true);
  });

  test('findings do not contain file paths', () => {
    const result  = makeMockResult({
      issues: [{ id: '1', ruleId: 'soql-in-loop', severity: 'error', category: 'code-quality', message: 'SOQL in loop', file: '/workspace/classes/Handler.cls' }],
    });
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    const json    = JSON.stringify(ctx.findings);
    assert.ok(!json.includes('/workspace'), 'findings must not contain file paths');
    assert.ok(!json.includes('.cls'),       'findings must not contain .cls references');
  });

  test('quickWins are sorted by priority', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    for (let i = 1; i < ctx.quickWins.length; i++) {
      assert.ok(
        priorityOrder[ctx.quickWins[i].priority] >= priorityOrder[ctx.quickWins[i - 1].priority],
        `quickWins out of priority order at index ${i}`
      );
    }
  });

  test('licenseUtilizationSummary maps from licenseSummary', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.ok(ctx.licenseUtilizationSummary.length > 0);
    assert.strictEqual(ctx.licenseUtilizationSummary[0].licenseName, 'Salesforce');
    assert.strictEqual(ctx.licenseUtilizationSummary[0].usedPct, 71);
  });

  test('toJson returns valid JSON string', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    const json    = service.toJson(ctx);
    assert.doesNotThrow(() => JSON.parse(json));
  });

  test('estimateTokenCount returns positive integer', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    const tokens  = service.estimateTokenCount(ctx);
    assert.ok(tokens > 0);
    assert.ok(Number.isInteger(tokens));
  });

  test('governorLimitsSummary includes limits near threshold', () => {
    const result  = makeMockResult(); // DailyApiRequests at 78%
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.ok(ctx.governorLimitsSummary.limitsNearThreshold.length > 0, 'Expected at least one limit near threshold (78%)');
  });

  test('performanceSummary.ldvObjects contains Account (1.2M records)', () => {
    const result  = makeMockResult();
    const service = AssessmentContextService.createDefault();
    const ctx     = service.build(result);
    assert.ok(ctx.performanceSummary.ldvObjects.includes('Account'), 'Account with 1.2M records should be an LDV object');
  });
});
