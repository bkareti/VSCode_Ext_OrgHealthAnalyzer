import * as assert from 'assert';
import { FindingNormalizer } from '../../services/assessmentContext/findingNormalizer';
import { PiiSanitizer } from '../../services/assessmentContext/piiSanitizer';
import { Issue } from '../../types';

suite('FindingNormalizer', () => {
  let normalizer: FindingNormalizer;
  let sanitizer: PiiSanitizer;

  setup(() => {
    normalizer = new FindingNormalizer();
    sanitizer  = new PiiSanitizer();
  });

  test('returns empty array for no issues', () => {
    const result = normalizer.normalize([], sanitizer);
    assert.deepStrictEqual(result, []);
  });

  test('maps soql-in-loop error to Critical severity', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'soql-in-loop', severity: 'error', category: 'code-quality', message: 'SOQL in loop' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const group  = groups.find(g => g.domain === 'code-quality');
    assert.ok(group);
    const finding = group!.topFindings.find(f => f.ruleId === 'soql-in-loop');
    assert.strictEqual(finding?.normalizedSeverity, 'Critical');
  });

  test('maps dml-in-loop error to Critical severity', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'dml-in-loop', severity: 'error', category: 'code-quality', message: 'DML in loop' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const finding = groups.flatMap(g => g.topFindings).find(f => f.ruleId === 'dml-in-loop');
    assert.strictEqual(finding?.normalizedSeverity, 'Critical');
  });

  test('maps non-critical error to High severity', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'trigger-size', severity: 'error', category: 'code-quality', message: 'Trigger too large' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const finding = groups.flatMap(g => g.topFindings).find(f => f.ruleId === 'trigger-size');
    assert.strictEqual(finding?.normalizedSeverity, 'High');
  });

  test('maps warning to Medium severity', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'test-coverage', severity: 'warning', category: 'testing', message: 'Coverage low' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const finding = groups.flatMap(g => g.topFindings).find(f => f.ruleId === 'test-coverage');
    assert.strictEqual(finding?.normalizedSeverity, 'Medium');
  });

  test('maps info to Low severity', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'unused-field', severity: 'info', category: 'data-model', message: 'Unused field' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const finding = groups.flatMap(g => g.topFindings).find(f => f.ruleId === 'unused-field');
    assert.strictEqual(finding?.normalizedSeverity, 'Low');
  });

  test('groups security and profile-security into same domain', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'missing-sharing',     severity: 'error', category: 'security',         message: 'Without sharing' },
      { id: '2', ruleId: 'modifyall-permission', severity: 'error', category: 'profile-security', message: 'Modify All' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const secGroups = groups.filter(g => g.domain === 'security');
    assert.strictEqual(secGroups.length, 1);
    assert.strictEqual(secGroups[0].topFindings.length, 2);
  });

  test('issue.file is never present in output', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'soql-in-loop', severity: 'error', category: 'code-quality', message: 'SOQL', file: '/workspace/src/classes/Handler.cls' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const json = JSON.stringify(groups);
    assert.ok(!json.includes('/workspace'));
    assert.ok(!json.includes('.cls'));
  });

  test('issue.description is never in output', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'soql-in-loop', severity: 'error', category: 'code-quality', message: 'SOQL', description: 'Full source code SELECT Id FROM Account' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const json = JSON.stringify(groups);
    assert.ok(!json.includes('Full source code'));
  });

  test('affectedObjects contains sObject API names from issue.object', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'soql-in-loop', severity: 'error', category: 'code-quality', message: 'SOQL', object: 'Account' },
      { id: '2', ruleId: 'soql-in-loop', severity: 'error', category: 'code-quality', message: 'SOQL', object: 'Contact' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const finding = groups.flatMap(g => g.topFindings).find(f => f.ruleId === 'soql-in-loop');
    assert.ok(finding?.affectedObjects.includes('Account'));
    assert.ok(finding?.affectedObjects.includes('Contact'));
  });

  test('severity counts are correct', () => {
    const issues: Issue[] = [
      { id: '1', ruleId: 'soql-in-loop',  severity: 'error',   category: 'code-quality', message: 'SOQL' },
      { id: '2', ruleId: 'trigger-logic',  severity: 'warning', category: 'code-quality', message: 'Logic' },
      { id: '3', ruleId: 'debug-statement', severity: 'info',   category: 'code-quality', message: 'Debug' },
    ];
    const groups = normalizer.normalize(issues, sanitizer);
    const group  = groups.find(g => g.domain === 'code-quality');
    assert.ok(group);
    assert.strictEqual(group!.criticalCount, 1);
    assert.strictEqual(group!.mediumCount,   1);
    assert.strictEqual(group!.lowCount,      1);
  });
});
