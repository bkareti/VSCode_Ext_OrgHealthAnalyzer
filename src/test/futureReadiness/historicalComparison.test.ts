import * as assert from 'assert';
import { HistoricalComparisonService, InMemorySnapshotStore } from '../../services/futureReadiness/historicalComparison';
import { FutureReadinessResult } from '../../types/futureReadiness';

function makeResult(overall: number, aiScore: number): FutureReadinessResult {
  return {
    packs: [
      { packId: 'ai-agentforce', packName: 'AI', overallScore: aiScore, grade: 'C', confidence: 'high', maturityLevel: 3, dimensions: [], strengths: [], blockingIssues: [], quickWins: [], strategicInitiatives: [] },
    ],
    overall: { score: overall, grade: 'C' },
    roadmap: [],
    historical: [],
    generatedAt: new Date().toISOString(),
  };
}

suite('HistoricalComparisonService', () => {
  test('returns no trends without a prior snapshot', () => {
    const svc = new HistoricalComparisonService(new InMemorySnapshotStore());
    assert.deepStrictEqual(svc.compare(makeResult(70, 60)), []);
  });

  test('computes improving/declining/stable directions across runs', () => {
    const store = new InMemorySnapshotStore();
    const svc = new HistoricalComparisonService(store);

    svc.record(makeResult(70, 60));               // baseline
    const trends = svc.compare(makeResult(80, 55)); // overall +10, AI -5

    const overall = trends.find((t) => t.packId === 'overall');
    const ai = trends.find((t) => t.packId === 'ai-agentforce');
    assert.strictEqual(overall?.direction, 'improving');
    assert.strictEqual(overall?.delta, 10);
    assert.strictEqual(ai?.direction, 'declining');
  });
});
