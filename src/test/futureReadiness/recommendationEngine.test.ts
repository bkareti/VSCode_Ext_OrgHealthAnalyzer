import * as assert from 'assert';
import { RecommendationEngine } from '../../services/futureReadiness/recommendationEngine';
import { ReadinessGap } from '../../types/futureReadiness';
import { signal } from './fixtures';

suite('RecommendationEngine', () => {
  const engine = new RecommendationEngine();

  test('quick wins come from partial signals that carry a recommendation', () => {
    const wins = engine.quickWins('data-cloud', [
      signal({ status: 'partial', score: 55, recommendation: 'Add matching rules.' }),
      signal({ status: 'partial', score: 55, recommendation: undefined }), // no rec → skipped
      signal({ status: 'ready', score: 95, recommendation: 'Nothing needed.' }), // not partial → skipped
    ]);
    assert.strictEqual(wins.length, 1);
    assert.strictEqual(wins[0].title, 'Add matching rules.');
    assert.strictEqual(wins[0].category, 'data-cloud');
    assert.strictEqual(wins[0].complexity, 'Low');
  });

  test('strategic initiatives come from Critical/High gaps only', () => {
    const gaps: ReadinessGap[] = [
      { title: 'Big', severity: 'Critical', area: 'X', whyItMatters: 'matters', evidence: [] },
      { title: 'Med', severity: 'Medium', area: 'Y', whyItMatters: 'meh', evidence: [] },
    ];
    const initiatives = engine.strategicInitiatives(gaps);
    assert.strictEqual(initiatives.length, 1);
    assert.strictEqual(initiatives[0].effort, 'High');
  });
});
