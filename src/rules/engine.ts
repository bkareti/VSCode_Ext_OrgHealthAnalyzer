/**
 * Rules Engine - Manages rule definitions and execution
 */

import { Issue, Severity, IssueCategory, RuleConfig } from '../types';
import { getRuleConfig, isRuleEnabled } from '../utils/config';

// ============================================================================
// Rule Interface Types
// ============================================================================

export interface RuleMeta {
  id: string;
  name: string;
  description: string;
  category: IssueCategory;
  severity: Severity;
  enabled: boolean;
  configurable: boolean;
  docs?: string;
}

export interface RuleContext {
  config: RuleConfig;
  filePath?: string;
  objectName?: string;
  report: (issue: Omit<Issue, 'id' | 'ruleId'>) => void;
}

export interface Rule<T = unknown> {
  meta: RuleMeta;
  analyze(data: T, context: RuleContext): void;
}

// ============================================================================
// Rule Registry
// ============================================================================

class RuleRegistry {
  private rules: Map<string, Rule<unknown>> = new Map();

  /**
   * Register a rule
   */
  register<T>(rule: Rule<T>): void {
    this.rules.set(rule.meta.id, rule as Rule<unknown>);
  }

  /**
   * Get a rule by ID
   */
  get(ruleId: string): Rule<unknown> | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all registered rules
   */
  getAll(): Rule<unknown>[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get all enabled rules
   */
  getEnabled(): Rule<unknown>[] {
    return this.getAll().filter(rule => isRuleEnabled(rule.meta.id));
  }

  /**
   * Get rules by category
   */
  getByCategory(category: IssueCategory): Rule<unknown>[] {
    return this.getAll().filter(rule => rule.meta.category === category);
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.rules.clear();
  }
}

// Global rule registry instance
export const ruleRegistry = new RuleRegistry();

// ============================================================================
// Rule Engine
// ============================================================================

export class RuleEngine {
  private issueCounter = 0;

  /**
   * Run all enabled rules against data
   */
  run<T>(ruleIds: string[], data: T, options: { filePath?: string; objectName?: string } = {}): Issue[] {
    const issues: Issue[] = [];
    const config = getRuleConfig();

    const context: RuleContext = {
      config,
      filePath: options.filePath,
      objectName: options.objectName,
      report: (issue) => {
        issues.push({
          ...issue,
          id: `issue-${++this.issueCounter}`,
          ruleId: '', // Will be set by the rule
        });
      },
    };

    for (const ruleId of ruleIds) {
      if (!isRuleEnabled(ruleId)) {
        continue;
      }

      const rule = ruleRegistry.get(ruleId);
      if (!rule) {
        continue;
      }

      // Update context report to include rule ID
      const ruleContext: RuleContext = {
        ...context,
        report: (issue) => {
          issues.push({
            ...issue,
            id: `issue-${++this.issueCounter}`,
            ruleId: rule.meta.id,
          });
        },
      };

      try {
        rule.analyze(data, ruleContext);
      } catch (error) {
        console.error(`Error running rule ${ruleId}:`, error);
      }
    }

    return issues;
  }

  /**
   * Run rules for a specific category
   */
  runCategory<T>(category: IssueCategory, data: T, options: { filePath?: string; objectName?: string } = {}): Issue[] {
    const rules = ruleRegistry.getByCategory(category);
    const ruleIds = rules.map(r => r.meta.id);
    return this.run(ruleIds, data, options);
  }

  /**
   * Reset issue counter
   */
  reset(): void {
    this.issueCounter = 0;
  }
}

// ============================================================================
// Built-in Rule Definitions
// ============================================================================

// Code patterns for Apex analysis
export const APEX_PATTERNS = {
  SOQL_QUERY: /\[\s*SELECT\s+[\s\S]*?\s+FROM\s+\w+[\s\S]*?\]/gi,
  DML_STATEMENT: /\b(insert|update|delete|upsert|merge|undelete)\s+\w+/gi,
  HARDCODED_ID: /['"][a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?['"]/g,
  FOR_LOOP: /\bfor\s*\(/gi,
  WHILE_LOOP: /\bwhile\s*\(/gi,
  DO_LOOP: /\bdo\s*\{/gi,
  METHOD_DECLARATION: /\b(public|private|protected|global)\s+(static\s+)?\w+\s+\w+\s*\([^)]*\)\s*\{/gi,
  CLASS_DECLARATION: /\b(public|private|protected|global)\s+(virtual\s+|abstract\s+)?(with\s+sharing\s+|without\s+sharing\s+)?class\s+(\w+)/gi,
  TRIGGER_DECLARATION: /\btrigger\s+(\w+)\s+on\s+(\w+)/gi,
  SYSTEM_DEBUG: /System\.debug\s*\(/gi,
  FUTURE_ANNOTATION: /@future/gi,
  QUEUEABLE_INTERFACE: /implements\s+Queueable/gi,
  BATCH_INTERFACE: /implements\s+Database\.Batchable/gi,
};

// Helper function to find all matches with positions
export function findPatternMatches(
  content: string,
  pattern: RegExp
): Array<{ match: string; index: number; line: number; column: number }> {
  const matches: Array<{ match: string; index: number; line: number; column: number }> = [];
  const lines = content.split('\n');
  
  // Create a new regex to avoid state issues
  const regex = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(content)) !== null) {
    // Calculate line and column
    let charCount = 0;
    let lineNum = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (charCount + lines[i].length >= match.index) {
        lineNum = i;
        break;
      }
      charCount += lines[i].length + 1; // +1 for newline
    }
    
    matches.push({
      match: match[0],
      index: match.index,
      line: lineNum + 1,
      column: match.index - charCount + 1,
    });
  }
  
  return matches;
}

// Helper function to check if position is inside a loop
export function isInsideLoop(content: string, position: number): boolean {
  // Simple heuristic: check if there's an unclosed loop before this position
  const beforePosition = content.substring(0, position);
  
  const forMatches = (beforePosition.match(/\bfor\s*\([^)]*\)\s*\{/g) || []).length;
  const whileMatches = (beforePosition.match(/\bwhile\s*\([^)]*\)\s*\{/g) || []).length;
  const doMatches = (beforePosition.match(/\bdo\s*\{/g) || []).length;
  
  // Count closing braces that might close loops
  // This is a simplified check - a proper implementation would use AST
  const loopStarts = forMatches + whileMatches + doMatches;
  
  if (loopStarts === 0) {
    return false;
  }
  
  // Count brace depth from loop starts to position
  let depth = 0;
  let inLoop = false;
  
  for (let i = 0; i < position; i++) {
    const char = content[i];
    
    // Check if we're at a loop start
    if (content.substring(i).match(/^(for|while)\s*\([^)]*\)\s*\{/) || 
        content.substring(i).match(/^do\s*\{/)) {
      inLoop = true;
    }
    
    if (inLoop) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          inLoop = false;
        }
      }
    }
  }
  
  return inLoop && depth > 0;
}

// ============================================================================
// Export rule engine singleton
// ============================================================================

export const ruleEngine = new RuleEngine();
