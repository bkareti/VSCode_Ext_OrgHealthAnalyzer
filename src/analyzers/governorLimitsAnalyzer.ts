/**
 * Governor Limits Analyzer
 *
 * Deep static analysis of Apex code to predict and flag governor limit risks:
 * SOQL-in-loop, DML-in-loop, CPU time, heap size, callout patterns, and
 * bulk anti-patterns. Returns GovernorRiskDetail for each class/trigger.
 * Also produces LimitsSimulatorClassData for the interactive Limits Simulator.
 */

import { Issue, ApexClass, ApexTrigger, GovernorRiskDetail, GovernorRiskPrediction, LimitsSimulatorClassData } from '../types';
import { logInfo } from '../utils/logger';

// ─── Regex patterns ──────────────────────────────────────────────────────────
const RE_FOR_LOOP       = /\bfor\s*\(/g;
const RE_WHILE_LOOP     = /\bwhile\s*\(/g;
const RE_SOQL           = /\[\s*SELECT\b/gi;
const RE_DML_STMT       = /\b(insert|update|upsert|delete|undelete|merge)\s+(new\s+|List|Set|Map|\w)/gi;
const RE_FUTURE          = /@future/gi;
const RE_CALLOUT         = /Http(Request|Response|Client)\b/gi;
const RE_SENDMAIL        = /Messaging\.sendEmail/gi;
const RE_DYNAMIC_SOQL    = /Database\.query\s*\(/gi;
const RE_ENQUEUE_JOB     = /System\.enqueueJob\s*\(/gi;
const RE_BATCH_EXECUTE   = /Database\.executeBatch\s*\(/gi;
const RE_LIMITS_QUERY    = /Limits\.(getSoql|getDml|getCpu|getHeap)/gi;
const RE_HARDCODED_ID    = /['"][a-zA-Z0-9]{15,18}['"]/g;
const RE_SELECT_STAR     = /SELECT\s+\*/gi;
const RE_NO_WHERE        = /SELECT\s+[\w,\s.*]+\s+FROM\s+\w+(?!\s+WHERE)/gi;
const RE_NO_LIMIT        = /SELECT\s+[\w,\s.*]+\s+FROM\s+\w+(?!\s+LIMIT)/gi;
const RE_SHARING_DECL    = /\b(with sharing|without sharing|inherited sharing)\b/i;
const RE_APPROVAL_PROC   = /Approval\.process/gi;

// ─── Limits constants ────────────────────────────────────────────────────────
const SOQL_LIMIT = 100;
const DML_LIMIT  = 150;
const CPU_LIMIT  = 10000;   // ms
const HEAP_LIMIT = 6 * 1024 * 1024; // 6 MB

interface CodeSection {
  body: string;
  start: number;
}

/**
 * Detects code inside loop bodies (heuristic: finds { } blocks after for/while).
 */
function extractLoopBodies(code: string): CodeSection[] {
  const sections: CodeSection[] = [];
  const loopPattern = /\b(?:for|while)\s*\([^)]*\)\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = loopPattern.exec(code)) !== null) {
    const openBrace = m.index + m[0].length - 1;
    let depth = 1;
    let i = openBrace + 1;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') { depth++; }
      else if (code[i] === '}') { depth--; }
      i++;
    }
    sections.push({ body: code.slice(openBrace + 1, i - 1), start: openBrace });
  }
  return sections;
}

/**
 * Counts non-overlapping regex matches in a string.
 */
function countMatches(pattern: RegExp, text: string): number {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

/**
 * Predict governor risk scores for a single Apex body.
 * Also returns raw counts needed for the Limits Simulator.
 */
function predictGovernorRisk(body: string): {
  prediction: GovernorRiskPrediction;
  patterns: string[];
  loopSoql: number;
  loopDml: number;
  totalSoql: number;
  totalDml: number;
  cpuEstimate: number;
  heapEstimate: number;
} {
  const patterns: string[] = [];

  const loopBodies = extractLoopBodies(body);
  const loopBodyCombined = loopBodies.map(s => s.body).join('\n');

  // SOQL: count total + in-loop
  const totalSoql = countMatches(RE_SOQL, body);
  const loopSoql  = countMatches(RE_SOQL, loopBodyCombined);
  if (loopSoql > 0) { patterns.push(`SOQL inside loop(s): ${loopSoql} occurrence(s)`); }
  if (countMatches(RE_SELECT_STAR, body) > 0) { patterns.push('SELECT * used — fetch only required fields'); }
  if (countMatches(RE_DYNAMIC_SOQL, body) > 0) { patterns.push('Dynamic SOQL (Database.query) — verify injection safety'); }

  // DML: total + in-loop
  const totalDml = countMatches(RE_DML_STMT, body);
  const loopDml  = countMatches(RE_DML_STMT, loopBodyCombined);
  if (loopDml > 0) { patterns.push(`DML inside loop(s): ${loopDml} occurrence(s)`); }

  // CPU time heuristics
  let cpuEstimate = 0;
  cpuEstimate += totalSoql * 200;
  cpuEstimate += totalDml * 50;
  cpuEstimate += loopBodies.length * 100;
  if (countMatches(RE_APPROVAL_PROC, body) > 0) { cpuEstimate += 500; patterns.push('Approval.process() can be slow under load'); }
  if (countMatches(RE_SENDMAIL, body) > 0) { cpuEstimate += 200; patterns.push('Messaging.sendEmail() counts against email limits'); }

  // Heap heuristics
  let heapEstimate = 0;
  heapEstimate += totalSoql * 50 * 1024; // ~50KB per query result
  heapEstimate += totalDml * 10 * 1024;

  // Callout detection
  if (countMatches(RE_CALLOUT, body) > 0) { patterns.push('HTTP callout detected — ensure @future(callout=true) or Queueable'); }
  if (countMatches(RE_FUTURE, body) > 0) { patterns.push('@future method — cannot chain further async calls'); }
  if (countMatches(RE_ENQUEUE_JOB, body) > 0) { patterns.push('System.enqueueJob — check Queueable depth limits'); }

  // Sharing keyword
  if (!RE_SHARING_DECL.test(body)) { patterns.push('No sharing declaration — use with sharing unless intentional'); }
  RE_SHARING_DECL.lastIndex = 0;

  // Hard-coded IDs
  const idMatches = body.match(RE_HARDCODED_ID);
  if (idMatches && idMatches.length > 2) { patterns.push(`Hard-coded Salesforce IDs detected (${idMatches.length})`); }

  // Limits checks — good practice
  if (!countMatches(RE_LIMITS_QUERY, body) && (totalSoql > 5 || totalDml > 5)) {
    patterns.push('No Limits.getSoql/getDml checks — add defensive limit guards');
  }

  const soqlRisk = loopSoql > 0 ? 'high' : totalSoql > 50 ? 'medium' : 'low';
  const dmlRisk  = loopDml  > 0 ? 'high' : totalDml  > 80 ? 'medium' : 'low';
  const cpuRisk  = cpuEstimate > CPU_LIMIT * 0.8 ? 'high' : cpuEstimate > CPU_LIMIT * 0.5 ? 'medium' : 'low';
  const heapRisk = heapEstimate > HEAP_LIMIT * 0.8 ? 'high' : heapEstimate > HEAP_LIMIT * 0.5 ? 'medium' : 'low';

  return {
    prediction: {
      soqlQueries:   { estimated: totalSoql,   limit: SOQL_LIMIT, risk: soqlRisk },
      dmlStatements: { estimated: totalDml,    limit: DML_LIMIT,  risk: dmlRisk },
      cpuTime:       { estimated: cpuEstimate, limit: CPU_LIMIT,  risk: cpuRisk },
      heapSize:      { estimated: heapEstimate,limit: HEAP_LIMIT, risk: heapRisk },
    },
    patterns,
    loopSoql,
    loopDml,
    totalSoql,
    totalDml,
    cpuEstimate,
    heapEstimate,
  };
}

/**
 * Governor Limits Analyzer — scans Apex classes and triggers for governor limit risks.
 */
export class GovernorLimitsAnalyzer {
  // ── Public API ──────────────────────────────────────────────────────────────

  analyze(apexClasses: ApexClass[], apexTriggers: ApexTrigger[]): {
    issues: Issue[];
    governorRisks: GovernorRiskDetail[];
    limitsSimulatorData: LimitsSimulatorClassData[];
  } {
    logInfo('GovernorLimitsAnalyzer: starting analysis...');
    const issues: Issue[] = [];
    const governorRisks: GovernorRiskDetail[] = [];
    const limitsSimulatorData: LimitsSimulatorClassData[] = [];

    // ── Analyze classes ────────────────────────────────────────────────────
    for (const cls of apexClasses) {
      if (!cls.Body) { continue; }
      const { prediction, patterns, loopSoql, loopDml, totalSoql, totalDml, cpuEstimate, heapEstimate } = predictGovernorRisk(cls.Body);
      const hasHighRisk = [
        prediction.soqlQueries.risk,
        prediction.dmlStatements.risk,
        prediction.cpuTime.risk,
        prediction.heapSize.risk,
      ].includes('high');

      const hasMediumRisk = !hasHighRisk && [
        prediction.soqlQueries.risk,
        prediction.dmlStatements.risk,
        prediction.cpuTime.risk,
        prediction.heapSize.risk,
      ].includes('medium');

      if (patterns.length > 0) {
        governorRisks.push({
          className: cls.Name,
          file: `org://${cls.Name}.cls`,
          prediction,
          patterns,
        });
      }

      // Build Limits Simulator data for classes with any loop-based risk
      if (loopSoql > 0 || loopDml > 0 || hasHighRisk || hasMediumRisk) {
        limitsSimulatorData.push({
          className: cls.Name,
          file: `org://${cls.Name}.cls`,
          baseSoql: totalSoql - loopSoql,
          loopSoql,
          baseDml: totalDml - loopDml,
          loopDml,
          baseCpuMs: cpuEstimate,
          cpuPerKRecords: loopSoql * 200 + loopDml * 50,
          baseHeapBytes: heapEstimate,
          heapPerKRecords: loopSoql * 20 * 1024,
        });
      }

      if (hasHighRisk) {
        this.createIssues(issues, cls.Name, `org://${cls.Name}.cls`, prediction, patterns, 'error');
      } else if (hasMediumRisk) {
        this.createIssues(issues, cls.Name, `org://${cls.Name}.cls`, prediction, patterns, 'warning');
      }
    }

    // ── Analyze triggers ───────────────────────────────────────────────────
    for (const trigger of apexTriggers) {
      if (!trigger.Body) { continue; }
      const { prediction, patterns, loopSoql, loopDml, totalSoql, totalDml, cpuEstimate, heapEstimate } = predictGovernorRisk(trigger.Body);
      const hasHighRisk = [
        prediction.soqlQueries.risk,
        prediction.dmlStatements.risk,
        prediction.cpuTime.risk,
        prediction.heapSize.risk,
      ].includes('high');

      if (patterns.length > 0) {
        governorRisks.push({
          className: trigger.Name,
          file: `org://${trigger.Name}.trigger`,
          prediction,
          patterns,
        });
      }

      if (loopSoql > 0 || loopDml > 0 || hasHighRisk) {
        limitsSimulatorData.push({
          className: trigger.Name,
          file: `org://${trigger.Name}.trigger`,
          baseSoql: totalSoql - loopSoql,
          loopSoql,
          baseDml: totalDml - loopDml,
          loopDml,
          baseCpuMs: cpuEstimate,
          cpuPerKRecords: loopSoql * 200 + loopDml * 50,
          baseHeapBytes: heapEstimate,
          heapPerKRecords: loopSoql * 20 * 1024,
        });
      }

      if (hasHighRisk) {
        this.createIssues(issues, trigger.Name, `org://${trigger.Name}.trigger`, prediction, patterns, 'error');
      } else if (!hasHighRisk && patterns.length > 0) {
        this.createIssues(issues, trigger.Name, `org://${trigger.Name}.trigger`, prediction, patterns, 'warning');
      }
    }

    logInfo(`GovernorLimitsAnalyzer: found ${issues.length} issues, ${governorRisks.length} risk profiles, ${limitsSimulatorData.length} simulator entries`);
    return { issues, governorRisks, limitsSimulatorData };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private createIssues(
    issues: Issue[],
    name: string,
    file: string,
    prediction: GovernorRiskPrediction,
    patterns: string[],
    severity: 'error' | 'warning',
  ): void {
    // One issue per distinct pattern for drill-down granularity
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const isLoop  = /loop/i.test(pattern);
      issues.push({
        id:          `gov-${name}-${i}`,
        ruleId:      isLoop ? 'governor.loop-antipattern' : 'governor.limit-risk',
        severity,
        category:    'governor-limits',
        message:     `${name}: ${pattern}`,
        description: buildDescription(pattern),
        file,
        object:      name,
        suggestion:  buildSuggestion(pattern),
      });
    }

    // Aggregate risk summary issue for the class/trigger
    const highRiskDims = (['soqlQueries', 'dmlStatements', 'cpuTime', 'heapSize'] as const)
      .filter(k => prediction[k].risk === 'high')
      .map(k => k);

    if (highRiskDims.length > 0) {
      issues.push({
        id:       `gov-${name}-summary`,
        ruleId:   'governor.high-risk-class',
        severity: 'error',
        category: 'governor-limits',
        message:  `${name}: HIGH governor limit risk detected in ${highRiskDims.join(', ')}`,
        description: `This class/trigger is predicted to be at risk of hitting Salesforce governor limits under load. Key metrics: SOQL est. ${prediction.soqlQueries.estimated}/${prediction.soqlQueries.limit}, DML est. ${prediction.dmlStatements.estimated}/${prediction.dmlStatements.limit}.`,
        file,
        object:   name,
        suggestion: 'Move queries and DML statements outside loops. Use bulkification patterns. Add Limits.getSoqlQueries() guards.',
      });
    }
  }
}

function buildDescription(pattern: string): string {
  if (/SOQL inside loop/i.test(pattern)) {
    return 'Executing SOQL queries inside a loop will multiply queries by the loop iteration count, quickly breaching the 100 SOQL governor limit. This is the most common cause of LimitException in Salesforce.';
  }
  if (/DML inside loop/i.test(pattern)) {
    return 'DML operations inside loops cause the number of DML statements to scale with record count, hitting the 150 DML governor limit under bulk operations.';
  }
  if (/SELECT \*/i.test(pattern)) {
    return 'SELECT * retrieves all fields including large blob/text fields, increasing heap usage and bandwidth. Always specify only required fields.';
  }
  if (/Hard-coded/i.test(pattern)) {
    return 'Hard-coded Salesforce IDs (15 or 18 char) are org-specific and break in sandbox deployments, managed packages, and CI environments.';
  }
  if (/sharing/i.test(pattern)) {
    return 'Without a sharing declaration, Apex runs in system mode — all records are accessible. Always declare with sharing unless bypassing record visibility is required.';
  }
  return 'Governor limit risk detected. Review the code for Salesforce best practices.';
}

function buildSuggestion(pattern: string): string {
  if (/SOQL inside loop/i.test(pattern)) {
    return 'Extract the SOQL query to before the loop. Collect all IDs first, then query with IN clause. Example: List<Account> accs = [SELECT Id FROM Account WHERE Id IN :ids];';
  }
  if (/DML inside loop/i.test(pattern)) {
    return 'Collect all records in a List<SObject> inside the loop, then execute a single DML (insert/update/upsert) statement after the loop.';
  }
  if (/SELECT \*/i.test(pattern)) {
    return 'Replace SELECT * with explicit field names: SELECT Id, Name, OwnerId FROM Account. Use FIELDS(ALL) only in tooling contexts.';
  }
  if (/Hard-coded/i.test(pattern)) {
    return 'Store IDs in Custom Metadata Types or Custom Settings. Use String constants only for RecordType.DeveloperName lookups, not IDs.';
  }
  if (/sharing/i.test(pattern)) {
    return 'Add "with sharing" to the class declaration: public with sharing class MyClass { }';
  }
  return 'Review Salesforce Apex Governor Limits documentation: https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_gov_limits.htm';
}

// ─── Factory ─────────────────────────────────────────────────────────────────
export function createGovernorLimitsAnalyzer(): GovernorLimitsAnalyzer {
  return new GovernorLimitsAnalyzer();
}
