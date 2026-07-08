import * as assert from 'assert';
import { PayloadOptimizer } from '../../services/assessmentContext/payloadOptimizer';
import { AssessmentContext } from '../../types/assessmentContext';
import { AssessmentContextService } from '../../services/assessmentContext/assessmentContextService';
import { makeMockResult } from './fixtures/mockAnalysisResult';

function makeMinimalContext(): AssessmentContext {
  return AssessmentContextService.createDefault().build(makeMockResult());
}

suite('PayloadOptimizer', () => {
  let optimizer: PayloadOptimizer;

  setup(() => { optimizer = new PayloadOptimizer(); });

  test('estimateTokens returns a positive integer', () => {
    const ctx = makeMinimalContext();
    const tokens = optimizer.estimateTokens(ctx);
    assert.ok(tokens > 0);
    assert.ok(Number.isInteger(tokens));
  });

  test('estimateTokens approximates JSON.stringify.length / 4', () => {
    const value = { hello: 'world', count: 42 };
    const expected = Math.ceil(JSON.stringify(value).length / 4);
    assert.strictEqual(optimizer.estimateTokens(value), expected);
  });

  test('under-budget context is returned unchanged (no truncations)', () => {
    const ctx = makeMinimalContext();
    const result = optimizer.optimize(ctx, 100_000); // very large budget
    assert.deepStrictEqual(result.optimizerReport.truncationsApplied, []);
  });

  test('truncationsApplied is an array', () => {
    const ctx = makeMinimalContext();
    const result = optimizer.optimize(ctx);
    assert.ok(Array.isArray(result.optimizerReport.truncationsApplied));
  });

  test('optimizerReport.estimatedTokens is present', () => {
    const ctx = makeMinimalContext();
    const result = optimizer.optimize(ctx);
    assert.ok(typeof result.optimizerReport.estimatedTokens === 'number');
    assert.ok(result.optimizerReport.estimatedTokens > 0);
  });

  test('over-budget context: topFindings capped per domain', () => {
    const ctx = makeMinimalContext();
    // Inflate findings to trigger truncation.
    ctx.findings = ctx.findings.map(g => ({
      ...g,
      topFindings: Array.from({ length: 20 }, (_, i) => ({
        ruleId: `rule-${i}`,
        normalizedSeverity: 'High' as const,
        count: 1,
        message: `Finding ${i}`,
        tags: [],
        affectedObjects: [],
      })),
    }));
    const result = optimizer.optimize(ctx, 100); // tiny budget to force truncation
    for (const group of result.findings) {
      assert.ok(group.topFindings.length <= 10, `topFindings for ${group.domain} exceeds 10`);
    }
  });

  test('does not mutate the original context', () => {
    const ctx = makeMinimalContext();
    const originalFindingCount = ctx.findings[0]?.topFindings.length ?? 0;
    optimizer.optimize(ctx, 100); // force truncation
    // Original should be unchanged.
    assert.strictEqual(ctx.findings[0]?.topFindings.length ?? 0, originalFindingCount);
  });

  test('budget is recorded in optimizerReport', () => {
    const ctx = makeMinimalContext();
    const result = optimizer.optimize(ctx, 8000);
    assert.strictEqual(result.optimizerReport.budget, 8000);
  });
});
