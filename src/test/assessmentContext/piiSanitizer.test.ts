import * as assert from 'assert';
import { PiiSanitizer } from '../../services/assessmentContext/piiSanitizer';

suite('PiiSanitizer', () => {
  let sanitizer: PiiSanitizer;

  setup(() => { sanitizer = new PiiSanitizer(); });

  test('replaces email addresses', () => {
    const result = sanitizer.sanitizeString('Contact admin@mycompany.com for help');
    assert.ok(!result.includes('admin@mycompany.com'));
    assert.ok(result.includes('<User>'));
  });

  test('replaces salesforce.com URLs', () => {
    const result = sanitizer.sanitizeString('Login at https://myorg.my.salesforce.com/home');
    assert.ok(!result.includes('myorg'));
    assert.ok(result.includes('<Salesforce Instance>'));
  });

  test('replaces force.com URLs', () => {
    const result = sanitizer.sanitizeString('URL: https://myorg.lightning.force.com/one/one.app');
    assert.ok(result.includes('<Salesforce Instance>'));
  });

  test('replaces other HTTPS URLs', () => {
    const result = sanitizer.sanitizeString('Endpoint: https://api.example.com/v1/data');
    assert.ok(!result.includes('api.example.com'));
    assert.ok(result.includes('<External Endpoint>'));
  });

  test('replaces IPv4 addresses', () => {
    const result = sanitizer.sanitizeString('Server at 192.168.1.100');
    assert.ok(!result.includes('192.168.1.100'));
    assert.ok(result.includes('<IP>'));
  });

  test('replaces Salesforce org IDs (18-char)', () => {
    const result = sanitizer.sanitizeString('Org ID: 00D000000000001ABC');
    assert.ok(!result.includes('00D000000000001ABC'));
    assert.ok(result.includes('<SF-ID>'));
  });

  test('does NOT mask sObject API names like Account__c', () => {
    const result = sanitizer.sanitizeString('Account__c has 28 custom fields');
    assert.ok(result.includes('Account__c'));
  });

  test('handles null without throwing', () => {
    const result = sanitizer.sanitize(null);
    assert.strictEqual(result, null);
  });

  test('handles undefined without throwing', () => {
    const result = sanitizer.sanitize(undefined);
    assert.strictEqual(result, undefined);
  });

  test('recursively sanitizes nested objects', () => {
    const obj = { user: { email: 'test@org.com', name: 'Account' } };
    const result = sanitizer.sanitize(obj) as typeof obj;
    assert.ok(!result.user.email.includes('test@org.com'));
    assert.ok(result.user.email.includes('<User>'));
    assert.strictEqual(result.user.name, 'Account');
  });

  test('recursively sanitizes arrays', () => {
    const arr = ['admin@example.com', 'Account__c', 'normal text'];
    const result = sanitizer.sanitize(arr) as string[];
    assert.ok(result[0].includes('<User>'));
    assert.strictEqual(result[1], 'Account__c');
    assert.strictEqual(result[2], 'normal text');
  });

  test('passes through numbers and booleans unchanged', () => {
    assert.strictEqual(sanitizer.sanitize(42), 42);
    assert.strictEqual(sanitizer.sanitize(true), true);
    assert.strictEqual(sanitizer.sanitize(false), false);
  });

  test('handles circular references without throwing', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;
    assert.doesNotThrow(() => sanitizer.sanitize(obj));
  });
});
