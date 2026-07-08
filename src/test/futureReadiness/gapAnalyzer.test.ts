import * as assert from 'assert';
import { GapAnalyzer } from '../../services/futureReadiness/gapAnalyzer';
import { signal } from './fixtures';

suite('GapAnalyzer', () => {
  const analyzer = new GapAnalyzer();

  test('emits gaps only for blocked/partial signals', () => {
    const gaps = analyzer.analyze('ai-agentforce', [
      signal({ id: 'ok', status: 'ready', score: 95 }),
      signal({ id: 'na', status: 'na', score: 0 }),
      signal({ id: 'weak', status: 'partial', score: 60, dimension: 'Weak' }),
      signal({ id: 'bad', status: 'blocked', score: 20, dimension: 'Bad' }),
    ]);
    assert.strictEqual(gaps.length, 2);
  });

  test('blocked signals sort before partial and get higher severity', () => {
    const gaps = analyzer.analyze('ai-agentforce', [
      signal({ id: 'weak', status: 'partial', score: 65, dimension: 'Weak' }),
      signal({ id: 'bad', status: 'blocked', score: 20, dimension: 'Bad' }),
    ]);
    assert.strictEqual(gaps[0].area, 'Bad');
    assert.strictEqual(gaps[0].severity, 'Critical');
    assert.strictEqual(gaps[1].severity, 'Low');
  });

  test('carries the recommendation into whyItMatters', () => {
    const gaps = analyzer.analyze('ai-agentforce', [
      signal({ status: 'blocked', score: 10, recommendation: 'Do the thing.' }),
    ]);
    assert.strictEqual(gaps[0].whyItMatters, 'Do the thing.');
  });
});
