import { IPiiSanitizer } from './interfaces';

// Ordered replacement patterns — applied in sequence to each string value.
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Salesforce 15/18-char IDs (starts with 00D, 005, 001, etc.)
  { pattern: /\b00[A-Za-z0-9]{13,16}\b/g, replacement: '<SF-ID>' },
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, replacement: '<User>' },
  // Salesforce / Force.com URLs
  { pattern: /https?:\/\/[a-zA-Z0-9.\-]+\.salesforce\.com[^\s"']*/g, replacement: '<Salesforce Instance>' },
  { pattern: /https?:\/\/[a-zA-Z0-9.\-]+\.force\.com[^\s"']*/g, replacement: '<Salesforce Instance>' },
  // Any other HTTPS URL (named credentials, external endpoints)
  { pattern: /https?:\/\/[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}(\/[^\s"']*)?/g, replacement: '<External Endpoint>' },
  // IPv4 addresses
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '<IP>' },
  // Phone numbers (international and domestic formats)
  { pattern: /\+?\d[\d\s\-(). ]{7,}\d/g, replacement: '<Phone>' },
];

export class PiiSanitizer implements IPiiSanitizer {
  sanitize<T>(value: T): T {
    return this.sanitizeValue(value, new WeakSet()) as T;
  }

  sanitizeString(value: string): string {
    let result = value;
    for (const { pattern, replacement } of PII_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  private sanitizeValue(value: unknown, visited: WeakSet<object>): unknown {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      if (visited.has(value)) { return '<circular>'; }
      visited.add(value);
      const result = value.map(item => this.sanitizeValue(item, visited));
      visited.delete(value);
      return result;
    }
    if (typeof value === 'object') {
      if (visited.has(value as object)) { return '<circular>'; }
      visited.add(value as object);
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.sanitizeValue(val, visited);
      }
      visited.delete(value as object);
      return result;
    }
    return value;
  }
}
