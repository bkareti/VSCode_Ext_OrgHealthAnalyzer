import * as assert from 'assert';
import { ReadinessScoreCalculator } from '../../services/futureReadiness/scoreCalculator';
import { signal } from './fixtures';

suite('ReadinessScoreCalculator', () => {
  let calc: ReadinessScoreCalculator;
  setup(() => { calc = new ReadinessScoreCalculator(); });

  test('weighted-averages signals within a dimension', () => {
    const dims = calc.scoreDimensions([
      signal({ id: 'a', dimension: 'Dim A', score: 100, weight: 3, status: 'ready' }),
      signal({ id: 'b', dimension: 'Dim A', score: 0,   weight: 1, status: 'blocked' }),
    ]);
    const dim = dims.find((d) => d.dimension === 'Dim A');
    // (100*3 + 0*1) / 4 = 75
    assert.strictEqual(dim?.score, 75);
    assert.strictEqual(dim?.weight, 4);
  });

  test('an all-na dimension is marked na with score 0 and low confidence', () => {
    const dims = calc.scoreDimensions([
      signal({ id: 'a', dimension: 'Empty', status: 'na', score: 0, weight: 5 }),
    ]);
    const dim = dims.find((d) => d.dimension === 'Empty');
    assert.strictEqual(dim?.status, 'na');
    assert.strictEqual(dim?.score, 0);
    assert.strictEqual(dim?.confidence, 'low');
  });

  test('a dimension with any blocked signal is blocked', () => {
    const dims = calc.scoreDimensions([
      signal({ id: 'a', dimension: 'Dim', score: 90, weight: 1, status: 'ready' }),
      signal({ id: 'b', dimension: 'Dim', score: 85, weight: 1, status: 'blocked' }),
    ]);
    assert.strictEqual(dims[0].status, 'blocked');
  });

  test('grades map from score bands', () => {
    const dims = calc.scoreDimensions([signal({ dimension: 'A', score: 95, status: 'ready' })]);
    assert.strictEqual(dims[0].grade, 'A');
  });

  test('packScore excludes na dimensions from the weighted average', () => {
    const dims = calc.scoreDimensions([
      signal({ id: 'a', dimension: 'Real', score: 80, weight: 10, status: 'ready' }),
      signal({ id: 'b', dimension: 'Unknown', score: 0, weight: 10, status: 'na' }),
    ]);
    const pack = calc.packScore(dims);
    // Only the 'Real' dimension counts → 80, not (80+0)/2.
    assert.strictEqual(pack.score, 80);
    assert.strictEqual(pack.grade, 'B');
  });

  test('maturity level scales with score', () => {
    const high = calc.packScore(calc.scoreDimensions([signal({ dimension: 'A', score: 95, weight: 1, status: 'ready' })]));
    const low = calc.packScore(calc.scoreDimensions([signal({ dimension: 'A', score: 20, weight: 1, status: 'blocked' })]));
    assert.strictEqual(high.maturityLevel, 5);
    assert.strictEqual(low.maturityLevel, 1);
  });
});
