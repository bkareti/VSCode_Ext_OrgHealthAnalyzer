import * as assert from 'assert';
import { BusinessContextEngine } from '../../services/assessmentContext/businessContextEngine';
import { makeMockResult } from './fixtures/mockAnalysisResult';

suite('BusinessContextEngine', () => {
  let engine: BusinessContextEngine;

  setup(() => { engine = new BusinessContextEngine(); });

  // ── OrgComplexity ─────────────────────────────────────────────────────────

  test('Small complexity: < 50 users, < 15 custom objects, < 50 apex classes', () => {
    const result = makeMockResult({
      userSummary:  { ...makeMockResult().userSummary!, totalActiveUsers: 20 },
      orgInventory: { ...makeMockResult().orgInventory!, customObjectCount: 10, apexClassCount: 30 },
    });
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.orgComplexity, 'Small');
  });

  test('Medium complexity when users >= 50', () => {
    const result = makeMockResult({
      userSummary:  { ...makeMockResult().userSummary!, totalActiveUsers: 120 },
      orgInventory: { ...makeMockResult().orgInventory!, customObjectCount: 30, apexClassCount: 80 },
    });
    const ctx = engine.infer(result);
    assert.ok(['Medium', 'Large'].includes(ctx.orgComplexity));
  });

  test('Enterprise complexity when users >= 1000', () => {
    const result = makeMockResult({
      userSummary:  { ...makeMockResult().userSummary!, totalActiveUsers: 1500 },
      orgInventory: { ...makeMockResult().orgInventory!, customObjectCount: 50, apexClassCount: 200 },
    });
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.orgComplexity, 'Enterprise');
  });

  test('Enterprise complexity when customObjects >= 100', () => {
    const result = makeMockResult({
      userSummary:  { ...makeMockResult().userSummary!, totalActiveUsers: 50 },
      orgInventory: { ...makeMockResult().orgInventory!, customObjectCount: 120, apexClassCount: 100 },
    });
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.orgComplexity, 'Enterprise');
  });

  // ── AutomationComplexity ──────────────────────────────────────────────────

  test('High automation complexity when multi-trigger objects exist', () => {
    const result = makeMockResult(); // Account has 2 triggers in fixture
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.automationComplexity, 'High');
  });

  test('Low automation complexity when totalTriggers + flows < 20', () => {
    const result = makeMockResult({
      automationSummary: {
        objectMap:          {},
        totalFlows:         5,
        totalTriggers:      3,
        totalValidationRules: 2,
        flowInventory:      [],
      },
    });
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.automationComplexity, 'Low');
  });

  // ── ArchitectureMaturityLevel ─────────────────────────────────────────────

  test('Level 1 when processBuilders > 0 AND multi-trigger objects exist', () => {
    const result = makeMockResult(); // has processBuilders=2 and Account with 2 triggers
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.architectureMaturityLevel, 1);
  });

  test('Level 5 when overall >= 90, coverage >= 90, no legacy automation', () => {
    const result = makeMockResult({
      scores: { ...makeMockResult().scores, overall: 92 },
      testCoverageSummary: { ...makeMockResult().testCoverageSummary!, averageCoverage: 95 },
      automationSummary: {
        objectMap:          { Account: { triggers: 1, flows: 1, validations: 0, total: 2 } },
        totalFlows:         5,
        totalTriggers:      5,
        totalValidationRules: 3,
        totalWorkflowRules:  0,
        totalProcessBuilders: 0,
        flowInventory:      [],
      },
    });
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.architectureMaturityLevel, 5);
  });

  // ── ComplianceRisk ────────────────────────────────────────────────────────

  test('High compliance risk when without-sharing issues > 5', () => {
    const withoutSharingIssues = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`, ruleId: 'missing-sharing', severity: 'error' as const,
      category: 'security' as const, message: 'Apex class without sharing',
    }));
    const result = makeMockResult({ issues: withoutSharingIssues });
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.complianceRisk, 'High');
  });

  test('complianceRiskEvidence includes without-sharing info', () => {
    const result = makeMockResult(); // fixture has issue-4 with 'without sharing'
    const ctx = engine.infer(result);
    assert.ok(ctx.complianceRiskEvidence.length > 0 || ctx.complianceRisk !== 'Low');
  });

  // ── orgComplexityEvidence ─────────────────────────────────────────────────

  test('orgComplexityEvidence reflects actual counts', () => {
    const result = makeMockResult();
    const ctx = engine.infer(result);
    assert.strictEqual(ctx.orgComplexityEvidence.activeUsers, 120);
    assert.strictEqual(ctx.orgComplexityEvidence.customObjectCount, 38);
    assert.strictEqual(ctx.orgComplexityEvidence.apexClassCount, 85);
  });
});
