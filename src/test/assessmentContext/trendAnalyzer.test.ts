import * as assert from 'assert';
import { TrendAnalyzer } from '../../services/assessmentContext/trendAnalyzer';
import { makeMockResult } from './fixtures/mockAnalysisResult';

suite('TrendAnalyzer', () => {
  let analyzer: TrendAnalyzer;

  setup(() => { analyzer = new TrendAnalyzer(); });

  test('returns hasPreviousSnapshot: false when no previous and only one trend point', () => {
    const result = makeMockResult({ trends: [
      { timestamp: '2026-07-01T10:00:00.000Z', overall: 65, codeQuality: 55, automationDesign: 70, performance: 65, security: 50, testing: 60 },
    ]});
    const trend = analyzer.analyze(result);
    assert.strictEqual(trend.hasPreviousSnapshot, false);
  });

  test('returns hasPreviousSnapshot: true when result has 2+ trend points', () => {
    const result = makeMockResult(); // fixture has 2 trend points
    const trend = analyzer.analyze(result);
    assert.strictEqual(trend.hasPreviousSnapshot, true);
  });

  test('returns hasPreviousSnapshot: true when previous snapshot provided', () => {
    const current  = makeMockResult({ trends: undefined });
    const previous = makeMockResult({ trends: undefined });
    const trend = analyzer.analyze(current, previous);
    assert.strictEqual(trend.hasPreviousSnapshot, true);
  });

  test('direction is improving when delta >= 3', () => {
    const current  = makeMockResult({ scores: { ...makeMockResult().scores, codeQuality: 75 }, trends: undefined });
    const previous = makeMockResult({ scores: { ...makeMockResult().scores, codeQuality: 55 }, trends: undefined });
    const trend = analyzer.analyze(current, previous);
    const cqTrend = trend.scoreTrends.find(t => t.dimension === 'codeQuality');
    assert.strictEqual(cqTrend?.direction, 'improving');
    assert.strictEqual(cqTrend?.delta, 20);
  });

  test('direction is declining when delta <= -3', () => {
    const current  = makeMockResult({ scores: { ...makeMockResult().scores, security: 40 }, trends: undefined });
    const previous = makeMockResult({ scores: { ...makeMockResult().scores, security: 70 }, trends: undefined });
    const trend = analyzer.analyze(current, previous);
    const secTrend = trend.scoreTrends.find(t => t.dimension === 'security');
    assert.strictEqual(secTrend?.direction, 'declining');
  });

  test('direction is stable when delta is between -2 and 2', () => {
    const current  = makeMockResult({ scores: { ...makeMockResult().scores, testing: 61 }, trends: undefined });
    const previous = makeMockResult({ scores: { ...makeMockResult().scores, testing: 60 }, trends: undefined });
    const trend = analyzer.analyze(current, previous);
    const testTrend = trend.scoreTrends.find(t => t.dimension === 'testing');
    assert.strictEqual(testTrend?.direction, 'stable');
  });

  test('newFindingCount reflects issues in current not in previous', () => {
    const base = makeMockResult({ trends: undefined });
    const current  = { ...base, issues: [...base.issues, { id: 'new-1', ruleId: 'new-rule', severity: 'error' as const, category: 'code-quality' as const, message: 'New issue' }] };
    const trend = analyzer.analyze(current, base);
    assert.strictEqual(trend.newFindingCount, 1);
  });

  test('resolvedFindingCount reflects issues in previous not in current', () => {
    const previous = makeMockResult({ trends: undefined });
    const current  = makeMockResult({ trends: undefined, issues: [] });
    const trend = analyzer.analyze(current, previous);
    assert.ok(trend.resolvedFindingCount > 0);
  });

  test('snapshotDeltaDays is approximately correct from ring buffer', () => {
    const result = makeMockResult(); // fixture has 14-day gap between trend points
    const trend = analyzer.analyze(result);
    assert.ok(trend.snapshotDeltaDays >= 13 && trend.snapshotDeltaDays <= 15, `Expected ~14 days, got ${trend.snapshotDeltaDays}`);
  });
});
