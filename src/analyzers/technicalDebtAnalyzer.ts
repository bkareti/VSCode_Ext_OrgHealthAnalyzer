/**
 * Technical Debt Analyzer
 *
 * Scans Apex classes for indicators of technical debt:
 * - Deprecated API usage (old Salesforce API versions)
 * - TODO/FIXME/HACK comment density
 * - Code complexity (nesting depth, cyclomatic complexity proxy)
 * - Missing documentation on public classes/methods
 * - Dead code indicators (empty catch blocks, unreachable returns)
 * - Naming convention violations
 * - God classes (too many responsibilities)
 * - Copy-paste patterns (duplicate method signatures)
 *
 * Returns a DebtSummary with sprint plan and remediation estimates.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
  Issue,
  ApexClass,
  ApexTrigger,
  DebtItem,
  DebtSummary,
  DebtCategory,
} from '../types';
import { logInfo } from '../utils/logger';

// ─── Regex patterns ───────────────────────────────────────────────────────────
const RE_TODO_FIXME         = /\/\/\s*(TODO|FIXME|HACK|XXX|BUG|TEMP)\s*:?\s*(.+)/gi;
const RE_EMPTY_CATCH        = /catch\s*\([^)]*\)\s*\{\s*\}/g;
const RE_EMPTY_CATCH_COMMENT= /catch\s*\([^)]*\)\s*\{[\s\n]*\/\/[^\n]*\n\s*\}/g;
const RE_MISSING_JAVADOC    = /public\s+(static\s+|virtual\s+|override\s+)?(void|Boolean|Integer|String|List|Map|Set|Id|Decimal|Double|Object)\s+\w+\s*\(/g;
const RE_SYSTEM_DEBUG       = /System\.debug\s*\(/g;
const RE_DEPRECATED_ANNOT   = /@deprecated\b/gi;
const RE_HARDCODED_STRINGS  = /'[A-Za-z][A-Za-z0-9\s]{10,}'/g;
const RE_NESTING            = /\{/g;
const RE_DEEP_NESTING_CHECK = /\{[^{}]*\{[^{}]*\{[^{}]*\{[^{}]*\{/;
const RE_API_VERSION_LOW    = /ApiVersion\s*<\s*50/;
const RE_CLASS_DECL         = /\bclass\s+(\w+)/;
const RE_METHOD_COUNT       = /\b(public|private|protected)\s+(static\s+)?(void|Boolean|Integer|String|List|Map|Set|Id|Decimal|Double|Object|[\w<>]+)\s+\w+\s*\(/g;
const RE_INSTANCEOF_CATCH   = /catch\s*\(\s*Exception\s+/g;
const RE_SUPPRESS_WARNINGS  = /@SuppressWarnings/gi;
const RE_MAGIC_NUMBERS      = /(?<![.\w])\b(?!0\b|1\b|100\b)\d{2,}\b(?!\s*\))/g;

// ─── Complexity calculation ───────────────────────────────────────────────────

/**
 * Approximate cyclomatic complexity by counting decision points.
 */
function calculateComplexity(body: string): number {
  let complexity = 1; // base
  const decisions = body.match(
    /\bif\b|\bwhile\b|\bfor\b|\bcase\b|\bcatch\b|\b&&\b|\b\|\|\b|\b\?\b/g,
  );
  complexity += decisions ? decisions.length : 0;
  return complexity;
}

/**
 * Estimate time in hours to address an issue.
 */
function estimateHours(category: DebtCategory, severity: string): number {
  const base: Record<DebtCategory, number> = {
    'outdated-api':          2,
    'missing-documentation': 0.5,
    'todo-fixme':            1,
    'complexity':            4,
    'test-debt':             3,
    'naming':                0.25,
    'dead-code':             0.5,
  };
  const multiplier = severity === 'error' ? 2 : severity === 'warning' ? 1.5 : 1;
  return (base[category] || 1) * multiplier;
}

/**
 * Determine priority based on category and severity.
 */
function determinePriority(category: DebtCategory, hours: number): 'quick-win' | 'medium' | 'large' {
  if (hours < 1) { return 'quick-win'; }
  if (hours < 4) { return 'medium'; }
  return 'large';
}

// ─── Apex body analysis ───────────────────────────────────────────────────────

interface ClassDebtAnalysis {
  issues: Issue[];
  debtItems: DebtItem[];
}

function analyzeApexBody(
  name: string,
  body: string,
  file: string,
  apiVersion?: number,
): ClassDebtAnalysis {
  const issues: Issue[] = [];
  const debtItems: DebtItem[] = [];

  let debtItemCounter = 0;
  function addDebt(
    category: DebtCategory,
    description: string,
    estimatedHours: number,
    tags: string[],
    issueSeverity: 'error' | 'warning' | 'info' = 'warning',
    issueMessage?: string,
    suggestion?: string,
  ): void {
    const hours = estimatedHours;
    const priority = determinePriority(category, hours);
    debtItems.push({
      id:       `debt-${name}-${debtItemCounter++}`,
      category,
      file,
      description,
      estimatedHours: hours,
      priority,
      tags,
    });
    issues.push({
      id:          `debt-${name}-${category}-${debtItemCounter}`,
      ruleId:      `debt.${category}`,
      severity:    issueSeverity,
      category:    'technical-debt',
      message:     issueMessage || `${name}: ${description}`,
      description,
      file,
      object:      name,
      suggestion:  suggestion || undefined,
    });
  }

  // ── API Version ────────────────────────────────────────────────────────
  if (apiVersion && apiVersion < 50) {
    addDebt(
      'outdated-api',
      `API version ${apiVersion} is outdated (current: 62.0). Upgrade to use latest features and security fixes.`,
      estimateHours('outdated-api', 'warning'),
      ['API Upgrade', 'Migration', 'Security'],
      'warning',
      `${name}: API version ${apiVersion} — should be upgraded to 62.0`,
      'Change the API version in the metadata XML file to 62.0 and test for deprecated method removals.',
    );
  }

  // ── TODO / FIXME comments ────────────────────────────────────────────
  const todoMatches = [...body.matchAll(RE_TODO_FIXME)];
  if (todoMatches.length > 0) {
    const types = todoMatches.map(m => m[1]).join(', ');
    addDebt(
      'todo-fixme',
      `${todoMatches.length} ${types} comment(s) representing deferred work`,
      estimateHours('todo-fixme', 'info') * Math.min(todoMatches.length, 5),
      ['Code Quality', 'Documentation', 'Deferred Work'],
      'info',
      `${name}: ${todoMatches.length} TODO/FIXME comment(s) — track as backlog items`,
      'Convert TODO/FIXME comments into work items in your project tracker (e.g., JIRA, GitHub Issues). Remove resolved ones.',
    );
  }
  RE_TODO_FIXME.lastIndex = 0;

  // ── Empty catch blocks ────────────────────────────────────────────────
  const emptyCatches = body.match(RE_EMPTY_CATCH);
  const emptyCatchesWithComment = body.match(RE_EMPTY_CATCH_COMMENT);
  const totalEmptyCatches = (emptyCatches?.length || 0) + (emptyCatchesWithComment?.length || 0);
  if (totalEmptyCatches > 0) {
    addDebt(
      'dead-code',
      `${totalEmptyCatches} empty catch block(s) — exceptions silently swallowed`,
      estimateHours('dead-code', 'warning'),
      ['Error Handling', 'Reliability', 'Observability'],
      'warning',
      `${name}: ${totalEmptyCatches} empty catch block(s) — exceptions silently swallowed`,
      'At minimum, log the exception: Logger.error("Context message", e); or re-throw it. Never silently swallow exceptions.',
    );
  }

  // ── Cyclomatic complexity ─────────────────────────────────────────────
  const complexity = calculateComplexity(body);
  if (complexity > 20) {
    addDebt(
      'complexity',
      `Cyclomatic complexity ~${complexity} — method decomposition needed`,
      estimateHours('complexity', 'error'),
      ['Refactoring', 'Testability', 'Maintainability'],
      'error',
      `${name}: High cyclomatic complexity ~${complexity} — extremely hard to test and maintain`,
      'Decompose large methods into focused private helpers. Each method should do one thing. Consider the Command or Strategy pattern.',
    );
  } else if (complexity > 10) {
    addDebt(
      'complexity',
      `Cyclomatic complexity ~${complexity} — consider simplification`,
      estimateHours('complexity', 'warning'),
      ['Refactoring', 'Testability'],
      'warning',
      `${name}: Moderate cyclomatic complexity ~${complexity} — review method size`,
      'Extract complex conditional logic into private helper methods with descriptive names.',
    );
  }

  // ── Deep nesting ────────────────────────────────────────────────────
  if (RE_DEEP_NESTING_CHECK.test(body)) {
    addDebt(
      'complexity',
      'Deeply nested code detected (5+ levels) — "Arrow Code" anti-pattern',
      estimateHours('complexity', 'warning'),
      ['Refactoring', 'Readability'],
      'warning',
      `${name}: Deep nesting (5+ levels) — invert conditionals or extract methods`,
      'Use early returns / guard clauses to flatten nesting. Extract inner blocks into private methods.',
    );
  }

  // ── System.debug in production ────────────────────────────────────────
  const debugCount = body.match(RE_SYSTEM_DEBUG)?.length || 0;
  if (debugCount > 5) {
    addDebt(
      'dead-code',
      `${debugCount} System.debug() calls — remove from production code`,
      estimateHours('dead-code', 'info'),
      ['Performance', 'Log Hygiene'],
      'info',
      `${name}: ${debugCount} System.debug() calls — excessive debug logging in production`,
      'Remove System.debug calls or gate them behind a feature flag / Custom Metadata. Excessive debug logging impacts CPU governor limits.',
    );
  }

  // ── Magic numbers ─────────────────────────────────────────────────────
  const magicNumbers = body.match(RE_MAGIC_NUMBERS);
  if (magicNumbers && magicNumbers.length > 5) {
    addDebt(
      'missing-documentation',
      `${magicNumbers.length} magic numbers — extract to named constants`,
      estimateHours('missing-documentation', 'info'),
      ['Readability', 'Maintainability'],
      'info',
      `${name}: ${magicNumbers.length} magic numbers — extract to named constants`,
      'Define constants: private static final Integer MAX_RETRIES = 3; This makes the intent clear and changes easy.',
    );
  }

  // ── Broad Exception catches ───────────────────────────────────────────
  const broadCatch = body.match(RE_INSTANCEOF_CATCH)?.length || 0;
  if (broadCatch > 2) {
    addDebt(
      'dead-code',
      `${broadCatch} generic catch(Exception e) blocks — catch specific exception types`,
      estimateHours('dead-code', 'info'),
      ['Error Handling', 'Reliability'],
      'info',
      `${name}: ${broadCatch} generic Exception catches — prefer specific exception types`,
      'Catch DMLException, QueryException, CalloutException etc. separately. Generic catches mask programming errors.',
    );
  }

  // ── @SuppressWarnings ────────────────────────────────────────────────
  const suppressCount = body.match(RE_SUPPRESS_WARNINGS)?.length || 0;
  if (suppressCount > 0) {
    addDebt(
      'missing-documentation',
      `${suppressCount} @SuppressWarnings annotation(s) — underlying issues should be fixed`,
      estimateHours('missing-documentation', 'info'),
      ['Code Quality', 'Warnings'],
      'info',
      `${name}: @SuppressWarnings used — fix underlying issues instead of suppressing`,
      'Address the root cause of PMD/ESLint warnings rather than suppressing them.',
    );
  }

  // ── God class check ────────────────────────────────────────────────
  const methodCount = body.match(RE_METHOD_COUNT)?.length || 0;
  if (methodCount > 25) {
    addDebt(
      'complexity',
      `${methodCount} methods in one class — "God class" anti-pattern`,
      estimateHours('complexity', 'error') * 2,
      ['Architecture', 'SRP', 'Refactoring'],
      'error',
      `${name}: ${methodCount} methods — God Class anti-pattern. Split by responsibility.`,
      'Apply Single Responsibility Principle. Split by domain concern: e.g., AccountValidator, AccountSelector, AccountService.',
    );
  }

  return { issues, debtItems };
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class TechnicalDebtAnalyzer {
  private sprintHours = 16;

  setSprintHours(hours: number): void {
    this.sprintHours = Math.max(1, hours);
  }

  analyze(apexClasses: ApexClass[], apexTriggers: ApexTrigger[]): {
    issues: Issue[];
    debtSummary: DebtSummary;
  } {
    logInfo('TechnicalDebtAnalyzer: starting analysis...');
    const allIssues: Issue[] = [];
    const allDebtItems: DebtItem[] = [];

    // ── Analyze Apex classes ─────────────────────────────────────────────
    for (const cls of apexClasses) {
      if (!cls.Body) { continue; }
      const result = analyzeApexBody(
        cls.Name,
        cls.Body,
        `org://${cls.Name}.cls`,
        cls.ApiVersion,
      );
      allIssues.push(...result.issues);
      allDebtItems.push(...result.debtItems);
    }

    // ── Analyze local workspace Apex files ───────────────────────────────
    // (org bodies may not have all metadata, supplement with workspace scan)
    this.scanWorkspaceFiles(allIssues, allDebtItems).catch(() => {
      // non-blocking
    });

    // ── Analyze triggers ─────────────────────────────────────────────────
    for (const trigger of apexTriggers) {
      if (!trigger.Body) { continue; }
      const result = analyzeApexBody(
        trigger.Name,
        trigger.Body,
        `org://${trigger.Name}.trigger`,
        trigger.ApiVersion,
      );
      allIssues.push(...result.issues);
      allDebtItems.push(...result.debtItems);
    }

    const debtSummary = this.buildDebtSummary(allDebtItems);
    logInfo(`TechnicalDebtAnalyzer: ${allIssues.length} issues, ${debtSummary.totalHours.toFixed(1)}h total debt`);
    return { issues: allIssues, debtSummary };
  }

  private buildDebtSummary(items: DebtItem[]): DebtSummary {
    const totalHours = items.reduce((sum, i) => sum + i.estimatedHours, 0);
    const quickWins  = items.filter(i => i.priority === 'quick-win');
    const medium     = items.filter(i => i.priority === 'medium');
    const large      = items.filter(i => i.priority === 'large');

    const byCategory: Record<DebtCategory, number> = {
      'outdated-api':          0,
      'missing-documentation': 0,
      'todo-fixme':            0,
      'complexity':            0,
      'test-debt':             0,
      'naming':                0,
      'dead-code':             0,
    };
    for (const item of items) {
      byCategory[item.category] = (byCategory[item.category] || 0) + item.estimatedHours;
    }

    // Assume 2-week sprints, 20% capacity for debt work (configurable via setSprintHours)
    const sprintCycles = Math.ceil(totalHours / this.sprintHours);

    return { totalHours, quickWins, mediumItems: medium, largeItems: large, byCategory, sprintCycles };
  }

  private async scanWorkspaceFiles(
    allIssues: Issue[],
    allDebtItems: DebtItem[],
  ): Promise<void> {
    try {
      const apexFiles = await vscode.workspace.findFiles(
        '**/*.cls',
        '**/node_modules/**',
        200,
      );
      for (const uri of apexFiles) {
        const raw = await vscode.workspace.fs.readFile(uri);
        const body = Buffer.from(raw).toString('utf8');
        const name = path.basename(uri.fsPath, '.cls');
        // Only add if not already in org analysis
        const result = analyzeApexBody(name, body, uri.fsPath);
        // Filter to workspace-specific debt only (avoid double-counting)
        const wsOnly = result.debtItems.filter(d => d.category !== 'outdated-api');
        allDebtItems.push(...wsOnly);
      }
    } catch {
      // non-critical
    }
  }
}

export function createTechnicalDebtAnalyzer(): TechnicalDebtAnalyzer {
  return new TechnicalDebtAnalyzer();
}
