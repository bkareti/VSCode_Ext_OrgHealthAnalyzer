import * as assert from 'assert';
import { FutureReadinessService } from '../../services/futureReadiness';
import { ReadinessCollectorData } from '../../types/futureReadiness';
import { makeMockResult } from '../assessmentContext/fixtures/mockAnalysisResult';

const COLLECTORS: ReadinessCollectorData = {
  duplicateRules: [{ developerName: 'AccountDup', sobjectType: 'Account', isActive: true }],
  matchingRules: [{ developerName: 'AccountMatch', sobjectType: 'Account', status: 'Active' }],
  remoteSites: [{ name: 'Legacy', endpoint: 'http://legacy.example.com', isActive: true, isHttp: true }],
  certificates: [{ name: 'ApiCert', keySize: 2048, daysUntilExpiry: 200 }],
  platformFeatures: { dataCloudEnabled: false, einsteinFeatures: ['Einstein Prediction'], agentforceLicensed: false, edition: 'Enterprise Edition' },
};

suite('FutureReadinessService', () => {
  test('assess produces the three V1 packs with valid scores', () => {
    const svc = FutureReadinessService.createDefault();
    const result = svc.assess({ result: makeMockResult(), collectors: COLLECTORS });

    const packIds = result.packs.map((p) => p.packId).sort();
    assert.deepStrictEqual(packIds, ['ai-agentforce', 'data-cloud', 'hyperforce']);

    for (const pack of result.packs) {
      assert.ok(pack.overallScore >= 0 && pack.overallScore <= 100, `${pack.packId} score out of range`);
      assert.ok(pack.dimensions.length > 0, `${pack.packId} has no dimensions`);
    }
  });

  test('overall score is the mean of the pack scores', () => {
    const svc = FutureReadinessService.createDefault();
    const result = svc.assess({ result: makeMockResult(), collectors: COLLECTORS });
    const mean = Math.round(result.packs.reduce((s, p) => s + p.overallScore, 0) / result.packs.length);
    assert.strictEqual(result.overall.score, mean);
  });

  test('roadmap always has Now / Next / Later phases', () => {
    const svc = FutureReadinessService.createDefault();
    const result = svc.assess({ result: makeMockResult(), collectors: COLLECTORS });
    assert.deepStrictEqual(result.roadmap.map((p) => p.horizon), ['Now', 'Next', 'Later']);
  });

  test('missing collector data degrades gracefully (no throw, still 3 packs)', () => {
    const svc = FutureReadinessService.createDefault();
    const result = svc.assess({ result: makeMockResult(), collectors: {} });
    assert.strictEqual(result.packs.length, 3);
  });

  test('buildContext omits raw PII and carries scores through', () => {
    const svc = FutureReadinessService.createDefault();
    const result = svc.assess({ result: makeMockResult(), collectors: COLLECTORS });
    const ctx = svc.buildContext(result, makeMockResult());

    assert.strictEqual(ctx.overall.score, result.overall.score);
    assert.strictEqual(ctx.packs.length, 3);
    const json = JSON.stringify(ctx);
    assert.ok(!json.includes('admin@testorg.com'), 'context must not contain the org username');
  });
});
