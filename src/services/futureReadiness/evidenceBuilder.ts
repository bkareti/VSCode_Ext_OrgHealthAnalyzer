import { IEvidenceBuilder } from './interfaces';

/**
 * Normalizes evidence strings: trims, drops empties, and deduplicates.
 * Evidence is OrgPulse-generated (counts, sObject API names, metrics) — never
 * source, SOQL, or PII. The AI context builder additionally runs PiiSanitizer.
 */
export class EvidenceBuilder implements IEvidenceBuilder {
  clean(evidence: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of evidence ?? []) {
      const s = (raw ?? '').trim();
      if (!s || seen.has(s)) { continue; }
      seen.add(s);
      out.push(s);
    }
    return out;
  }
}
