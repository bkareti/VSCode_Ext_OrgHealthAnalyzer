import * as assert from 'assert';
import { QuickWinEngine } from '../../services/assessmentContext/quickWinEngine';
import { PiiSanitizer } from '../../services/assessmentContext/piiSanitizer';
import { makeMockResult } from './fixtures/mockAnalysisResult';
import { AnalysisResult } from '../../types';

suite('QuickWinEngine', () => {
  let engine: QuickWinEngine;
  let sanitizer: PiiSanitizer;

  setup(() => {
    engine    = new QuickWinEngine();
    sanitizer = new PiiSanitizer();
  });

  test('returns [] when no stale metadata, no deprecated automation', () => {
    const result = makeMockResult({
      staleMetadata:     undefined,
      automationSummary: undefined,
      userSummary:       undefined,
      profileSummary:    undefined,
    });
    const wins = engine.identify(result, sanitizer);
    assert.deepStrictEqual(wins, []);
  });

  test('emits High priority win when workflowRules > 0', () => {
    const result = makeMockResult(); // fixture has totalWorkflowRules = 3
    const wins = engine.identify(result, sanitizer);
    const win = wins.find(w => w.category === 'automation-design' && w.title.includes('Workflow'));
    assert.ok(win, 'Expected a Workflow Rule migration quick win');
    assert.strictEqual(win?.priority, 'High');
  });

  test('emits High priority win when processBuilders > 0', () => {
    const result = makeMockResult(); // fixture has totalProcessBuilders = 2
    const wins = engine.identify(result, sanitizer);
    const win = wins.find(w => w.title.includes('Process Builder'));
    assert.ok(win, 'Expected a Process Builder migration quick win');
    assert.strictEqual(win?.priority, 'High');
  });

  test('emits unused field wins grouped by object', () => {
    const result = makeMockResult(); // fixture has 8 unused fields on Account, 6 on Contact
    const wins = engine.identify(result, sanitizer);
    const accountWin = wins.find(w => w.title.includes('Account') && w.category === 'stale-metadata');
    assert.ok(accountWin, 'Expected unused field quick win for Account');
    assert.strictEqual(accountWin?.affectedCount, 8);
  });

  test('does not emit unused field win when count < 5', () => {
    const result = makeMockResult({
      staleMetadata: {
        staleReports: [], staleDashboards: [], totalStaleItems: 3, estimatedCleanupHours: 1,
        unusedCustomFields: [
          { id: 'f1', name: 'F1', type: 'custom-field', objectName: 'Account' },
          { id: 'f2', name: 'F2', type: 'custom-field', objectName: 'Account' },
        ],
      },
    });
    const wins = engine.identify(result, sanitizer);
    const fieldWin = wins.find(w => w.category === 'stale-metadata' && w.title.includes('field'));
    assert.ok(!fieldWin, 'Should not emit quick win for < 5 unused fields');
  });

  test('emits dormant user win when dormantUsers >= 10', () => {
    const result = makeMockResult(); // fixture has dormantUsers = 22
    const wins = engine.identify(result, sanitizer);
    const win = wins.find(w => w.category === 'user-governance' && w.title.includes('dormant'));
    assert.ok(win, 'Expected dormant user quick win');
    assert.strictEqual(win?.affectedCount, 22);
  });

  test('does not emit dormant user win when dormantUsers < 10', () => {
    const result = makeMockResult({ userSummary: { ...makeMockResult().userSummary!, dormantUsers: 5 } });
    const wins = engine.identify(result, sanitizer);
    const win = wins.find(w => w.category === 'user-governance' && w.title.includes('dormant'));
    assert.ok(!win, 'Should not emit dormant user win for < 10 dormant users');
  });

  test('output is sorted by priority (High before Medium before Low)', () => {
    const result = makeMockResult();
    const wins = engine.identify(result, sanitizer);
    const priorities = wins.map(w => w.priority);
    const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    for (let i = 1; i < priorities.length; i++) {
      assert.ok(
        priorityOrder[priorities[i]] >= priorityOrder[priorities[i - 1]],
        `Priority out of order at index ${i}: ${priorities[i - 1]} before ${priorities[i]}`
      );
    }
  });

  test('emits stale report win when total reports+dashboards >= 20', () => {
    const result = makeMockResult(); // fixture has 25 stale reports + 10 dashboards = 35
    const wins = engine.identify(result, sanitizer);
    const win = wins.find(w => w.title.includes('stale reports'));
    assert.ok(win, 'Expected stale reports quick win');
    assert.strictEqual(win?.affectedCount, 35);
  });

  test('emits unused permission set win when 3+ unassigned', () => {
    const result = makeMockResult(); // fixture has 3 permission sets with _userCount = 0
    const wins = engine.identify(result, sanitizer);
    const win = wins.find(w => w.title.includes('permission set'));
    assert.ok(win, 'Expected unassigned permission set quick win');
    assert.ok((win?.affectedCount ?? 0) >= 3);
  });

  test('reason strings are sanitized (no raw emails or URLs)', () => {
    const result: AnalysisResult = {
      ...makeMockResult(),
      userSummary: { ...makeMockResult().userSummary!, dormantUsers: 25 },
    };
    const wins = engine.identify(result, sanitizer);
    for (const win of wins) {
      assert.ok(!win.reason.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/), `Reason contains email: ${win.reason}`);
    }
  });
});
