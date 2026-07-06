import * as assert from 'assert';
import { ScoreCalculator } from '../../services/assessmentContext/scoreCalculator';
import { makeMockResult } from './fixtures/mockAnalysisResult';

suite('ScoreCalculator', () => {
  let calculator: ScoreCalculator;

  setup(() => { calculator = new ScoreCalculator(); });

  test('produces at least 14 dimensions (13 + overall)', () => {
    const result = makeMockResult();
    const dims = calculator.calculate(result);
    assert.ok(dims.length >= 14, `Expected >= 14 dimensions, got ${dims.length}`);
  });

  test('reads codeQuality score directly from result.scores (no recalculation)', () => {
    const result = makeMockResult();
    result.scores.codeQuality = 42; // Force a specific value.
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'codeQuality');
    assert.strictEqual(dim?.score, 42, 'codeQuality must match result.scores.codeQuality exactly');
  });

  test('reads security score directly from result.scores', () => {
    const result = makeMockResult();
    result.scores.security = 77;
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'security');
    assert.strictEqual(dim?.score, 77);
  });

  test('grade A for score >= 90', () => {
    const result = makeMockResult();
    result.scores.integration = 95;
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'integration');
    assert.strictEqual(dim?.grade, 'A');
  });

  test('grade B for score 80-89', () => {
    const result = makeMockResult();
    result.scores.dataModel = 84;
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'dataModel');
    assert.strictEqual(dim?.grade, 'B');
  });

  test('grade F for score < 60', () => {
    const result = makeMockResult();
    result.scores.codeQuality = 40;
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'codeQuality');
    assert.strictEqual(dim?.grade, 'F');
  });

  test('all 7 original dimensions present', () => {
    const result = makeMockResult();
    const dims = calculator.calculate(result);
    const dimNames = dims.map(d => d.dimension);
    for (const name of ['codeQuality', 'automationDesign', 'dataModel', 'performance', 'security', 'testing', 'integration']) {
      assert.ok(dimNames.includes(name as never), `Missing dimension: ${name}`);
    }
  });

  test('all 6 new dimensions present', () => {
    const result = makeMockResult();
    const dims = calculator.calculate(result);
    const dimNames = dims.map(d => d.dimension);
    for (const name of ['architecture', 'governorLimits', 'licenseUtilization', 'featureAdoption', 'complexity', 'maintainability']) {
      assert.ok(dimNames.includes(name as never), `Missing new dimension: ${name}`);
    }
  });

  test('overall dimension is last', () => {
    const result = makeMockResult();
    const dims = calculator.calculate(result);
    assert.strictEqual(dims[dims.length - 1].dimension, 'overall');
  });

  test('licenseUtilization confidence is high when licenseSummary is present', () => {
    const result = makeMockResult();
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'licenseUtilization');
    assert.strictEqual(dim?.confidence, 'high');
  });

  test('licenseUtilization confidence is low when licenseSummary is absent', () => {
    const result = makeMockResult({ licenseSummary: undefined });
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'licenseUtilization');
    assert.strictEqual(dim?.confidence, 'low');
  });

  test('featureAdoption score is reduced when workflowRules > 0', () => {
    const result = makeMockResult();
    // Mock has totalWorkflowRules = 3 → score should be < 90.
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'featureAdoption');
    assert.ok((dim?.score ?? 100) < 90, 'featureAdoption score should drop when workflowRules > 0');
  });

  test('governorLimits confidence is high when orgLimits present', () => {
    const result = makeMockResult();
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'governorLimits');
    assert.strictEqual(dim?.confidence, 'high');
  });

  test('ruleBreakdown is populated for codeQuality', () => {
    const result = makeMockResult();
    const dims = calculator.calculate(result);
    const dim  = dims.find(d => d.dimension === 'codeQuality');
    assert.ok((dim?.ruleBreakdown.length ?? 0) > 0, 'ruleBreakdown should contain contributing rules');
  });
});
