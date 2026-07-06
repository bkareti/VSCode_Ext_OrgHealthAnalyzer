import * as assert from 'assert';
import { ReadinessRuleEngine } from '../../services/futureReadiness/ruleEngine';
import { EvidenceBuilder } from '../../services/futureReadiness/evidenceBuilder';
import { HyperforceReadinessPack } from '../../services/futureReadiness/packs/hyperforceReadinessPack';
import { DataCloudReadinessPack } from '../../services/futureReadiness/packs/dataCloudReadinessPack';
import { ReadinessScoreCalculator } from '../../services/futureReadiness/scoreCalculator';
import { GapAnalyzer } from '../../services/futureReadiness/gapAnalyzer';
import { RecommendationEngine } from '../../services/futureReadiness/recommendationEngine';
import { ReadinessInput } from '../../services/futureReadiness/interfaces';
import { ReadinessCollectorData } from '../../types/futureReadiness';
import { makeMockResult } from '../assessmentContext/fixtures/mockAnalysisResult';

function deps() {
  return [
    new ReadinessRuleEngine(new EvidenceBuilder()),
    new ReadinessScoreCalculator(),
    new GapAnalyzer(),
    new RecommendationEngine(),
  ] as const;
}

function input(collectors: ReadinessCollectorData): ReadinessInput {
  return { result: makeMockResult(), collectors };
}

suite('Readiness packs', () => {
  test('Hyperforce flags insecure http remote sites as a blocking issue', () => {
    const pack = new HyperforceReadinessPack(...deps());
    const assessment = pack.assess(input({
      remoteSites: [
        { name: 'Legacy', endpoint: 'http://legacy.example.com', isActive: true, isHttp: true },
        { name: 'Legacy2', endpoint: 'http://legacy2.example.com', isActive: true, isHttp: true },
        { name: 'Legacy3', endpoint: 'http://legacy3.example.com', isActive: true, isHttp: true },
      ],
    }));
    const endpoints = assessment.dimensions.find((d) => d.dimension === 'Secure Endpoints');
    assert.ok(endpoints);
    assert.notStrictEqual(endpoints!.status, 'ready');
  });

  test('Data Cloud is weakened when no duplicate/matching rules exist', () => {
    const pack = new DataCloudReadinessPack(...deps());
    const withRules = pack.assess(input({
      duplicateRules: [{ developerName: 'D', sobjectType: 'Account', isActive: true }],
      matchingRules: [{ developerName: 'M', sobjectType: 'Account', status: 'Active' }],
    }));
    const withoutRules = pack.assess(input({ duplicateRules: [], matchingRules: [] }));

    const idr = (a: typeof withRules) => a.dimensions.find((d) => d.dimension === 'Identity Resolution Readiness')!.score;
    assert.ok(idr(withRules) > idr(withoutRules), 'identity resolution should score higher when rules exist');
  });
});
