/**
 * Built-in rules registration
 */

import { ruleRegistry, Rule, APEX_PATTERNS, findPatternMatches, isInsideLoop } from './engine';
import { Issue, Severity, IssueCategory, ApexTrigger, ObjectAutomationSummary } from '../types';

// ============================================================================
// Apex Code Quality Rules
// ============================================================================

interface ApexFileData {
  content: string;
  filePath: string;
  fileName: string;
  isClass: boolean;
  isTrigger: boolean;
}

/**
 * Rule: SOQL in Loop
 */
const soqlInLoopRule: Rule<ApexFileData> = {
  meta: {
    id: 'soql-in-loop',
    name: 'SOQL in Loop',
    description: 'Detects SOQL queries inside loops which can cause governor limit issues',
    category: 'code-quality',
    severity: 'error',
    enabled: true,
    configurable: false,
    docs: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/langCon_apex_loops_for_SOQL.htm',
  },
  analyze(data: ApexFileData, context) {
    const soqlMatches = findPatternMatches(data.content, APEX_PATTERNS.SOQL_QUERY);
    
    for (const match of soqlMatches) {
      if (isInsideLoop(data.content, match.index)) {
        context.report({
          severity: 'error',
          category: 'code-quality',
          message: 'SOQL query detected inside loop',
          description: 'Move SOQL queries outside of loops to avoid hitting governor limits. Use collections and maps instead.',
          file: data.filePath,
          line: match.line,
          column: match.column,
          suggestion: 'Query records before the loop and use a Map for lookups',
        });
      }
    }
  },
};

/**
 * Rule: DML in Loop
 */
const dmlInLoopRule: Rule<ApexFileData> = {
  meta: {
    id: 'dml-in-loop',
    name: 'DML in Loop',
    description: 'Detects DML statements inside loops which can cause governor limit issues',
    category: 'code-quality',
    severity: 'error',
    enabled: true,
    configurable: false,
    docs: 'https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_dml_bulk.htm',
  },
  analyze(data: ApexFileData, context) {
    const dmlMatches = findPatternMatches(data.content, APEX_PATTERNS.DML_STATEMENT);
    
    for (const match of dmlMatches) {
      if (isInsideLoop(data.content, match.index)) {
        context.report({
          severity: 'error',
          category: 'code-quality',
          message: `DML statement (${match.match.split(/\s+/)[0]}) detected inside loop`,
          description: 'Collect records in a list and perform DML operations outside the loop.',
          file: data.filePath,
          line: match.line,
          column: match.column,
          suggestion: 'Use a List to collect records and perform a single DML operation after the loop',
        });
      }
    }
  },
};

/**
 * Rule: Hardcoded ID
 */
const hardcodedIdRule: Rule<ApexFileData> = {
  meta: {
    id: 'hardcoded-id',
    name: 'Hardcoded Salesforce ID',
    description: 'Detects hardcoded Salesforce record IDs which are environment-specific',
    category: 'code-quality',
    severity: 'warning',
    enabled: true,
    configurable: false,
  },
  analyze(data: ApexFileData, context) {
    const idMatches = findPatternMatches(data.content, APEX_PATTERNS.HARDCODED_ID);
    
    for (const match of idMatches) {
      // Filter out common false positives (test classes often have hardcoded IDs)
      if (data.fileName.toLowerCase().includes('test')) {
        continue;
      }
      
      context.report({
        severity: 'warning',
        category: 'code-quality',
        message: 'Hardcoded Salesforce ID detected',
        description: `Found hardcoded ID: ${match.match}. Hardcoded IDs are environment-specific and will break in other orgs.`,
        file: data.filePath,
        line: match.line,
        column: match.column,
        suggestion: 'Use Custom Metadata, Custom Settings, or query for the ID dynamically',
      });
    }
  },
};

/**
 * Rule: Trigger Size
 */
const triggerSizeRule: Rule<ApexFileData> = {
  meta: {
    id: 'trigger-size',
    name: 'Trigger Size Limit',
    description: 'Checks if triggers exceed the recommended line count',
    category: 'code-quality',
    severity: 'warning',
    enabled: true,
    configurable: true,
  },
  analyze(data: ApexFileData, context) {
    if (!data.isTrigger) {
      return;
    }
    
    const lineCount = data.content.split('\n').length;
    const maxLines = context.config.maxTriggerLines;
    
    if (lineCount > maxLines) {
      context.report({
        severity: 'warning',
        category: 'code-quality',
        message: `Trigger exceeds ${maxLines} lines (${lineCount} lines)`,
        description: 'Large triggers are hard to maintain. Consider using a trigger handler pattern.',
        file: data.filePath,
        line: 1,
        suggestion: 'Implement a Trigger Handler pattern and move logic to handler classes',
      });
    }
  },
};

/**
 * Rule: Trigger Logic
 */
const triggerLogicRule: Rule<ApexFileData> = {
  meta: {
    id: 'trigger-logic',
    name: 'Business Logic in Trigger',
    description: 'Detects business logic (SOQL/DML) directly in triggers instead of handler classes',
    category: 'code-quality',
    severity: 'warning',
    enabled: true,
    configurable: false,
  },
  analyze(data: ApexFileData, context) {
    if (!data.isTrigger) {
      return;
    }
    
    const soqlMatches = findPatternMatches(data.content, APEX_PATTERNS.SOQL_QUERY);
    const dmlMatches = findPatternMatches(data.content, APEX_PATTERNS.DML_STATEMENT);
    
    if (soqlMatches.length > 0 || dmlMatches.length > 0) {
      context.report({
        severity: 'warning',
        category: 'code-quality',
        message: 'Business logic detected in trigger body',
        description: 'Triggers should delegate to handler classes. SOQL/DML in triggers violates separation of concerns.',
        file: data.filePath,
        line: 1,
        suggestion: 'Create a TriggerHandler class and move all logic there',
      });
    }
  },
};

/**
 * Rule: Missing Bulkification
 */
const missingBulkificationRule: Rule<ApexFileData> = {
  meta: {
    id: 'missing-bulkification',
    name: 'Missing Bulkification',
    description: 'Detects code that may not handle bulk operations properly',
    category: 'code-quality',
    severity: 'warning',
    enabled: true,
    configurable: false,
  },
  analyze(data: ApexFileData, context) {
    if (!data.isTrigger) {
      return;
    }
    
    // Check for Trigger.new[0] pattern which suggests non-bulk code
    const singleRecordPattern = /Trigger\.(new|old)\s*\[\s*0\s*\]/gi;
    const matches = findPatternMatches(data.content, singleRecordPattern);
    
    for (const match of matches) {
      context.report({
        severity: 'warning',
        category: 'code-quality',
        message: 'Potential bulkification issue detected',
        description: 'Accessing Trigger.new[0] or Trigger.old[0] suggests the code may not handle bulk operations.',
        file: data.filePath,
        line: match.line,
        column: match.column,
        suggestion: 'Iterate over Trigger.new or Trigger.old to handle all records',
      });
    }
  },
};

/**
 * Rule: Class Size
 */
const classSizeRule: Rule<ApexFileData> = {
  meta: {
    id: 'class-size',
    name: 'Class Size Limit',
    description: 'Checks if classes exceed the recommended line count',
    category: 'code-quality',
    severity: 'info',
    enabled: true,
    configurable: true,
  },
  analyze(data: ApexFileData, context) {
    if (!data.isClass) {
      return;
    }
    
    const lineCount = data.content.split('\n').length;
    const maxLines = context.config.maxClassLines;
    
    if (lineCount > maxLines) {
      context.report({
        severity: 'info',
        category: 'code-quality',
        message: `Class exceeds ${maxLines} lines (${lineCount} lines)`,
        description: 'Large classes may indicate a need for refactoring into smaller, focused classes.',
        file: data.filePath,
        line: 1,
        suggestion: 'Consider splitting into smaller classes following Single Responsibility Principle',
      });
    }
  },
};

// ============================================================================
// Automation Complexity Rules
// ============================================================================

/**
 * Rule: Automation Complexity
 */
const automationComplexityRule: Rule<ObjectAutomationSummary> = {
  meta: {
    id: 'automation-complexity',
    name: 'Automation Complexity',
    description: 'Detects objects with too many automations',
    category: 'automation-design',
    severity: 'warning',
    enabled: true,
    configurable: true,
  },
  analyze(data: ObjectAutomationSummary, context) {
    const { objectName, triggers, flows, processBuilders, validationRules } = data;
    
    // Check trigger count
    if (triggers > context.config.maxTriggersPerObject) {
      context.report({
        severity: 'error',
        category: 'automation-design',
        message: `Object ${objectName} has ${triggers} triggers (max: ${context.config.maxTriggersPerObject})`,
        description: 'Multiple triggers on the same object can cause unpredictable behavior and order of execution issues.',
        object: objectName,
        suggestion: 'Consolidate into a single trigger using a trigger handler framework',
      });
    }
    
    // Check flow count
    if (flows > context.config.maxFlowsPerObject) {
      context.report({
        severity: 'warning',
        category: 'automation-design',
        message: `Object ${objectName} has ${flows} flows (max: ${context.config.maxFlowsPerObject})`,
        description: 'Too many flows on a single object increases complexity and debugging difficulty.',
        object: objectName,
        suggestion: 'Consider consolidating flows or using a single flow with subflows',
      });
    }
    
    // Check for Process Builders (deprecated)
    if (processBuilders > 0) {
      context.report({
        severity: 'warning',
        category: 'automation-design',
        message: `Object ${objectName} has ${processBuilders} Process Builder(s)`,
        description: 'Process Builders are deprecated. Migrate to Flows for better performance and maintainability.',
        object: objectName,
        suggestion: 'Use the Migrate to Flow tool to convert Process Builders to Flows',
      });
    }
    
    // Check validation rule count
    if (validationRules > context.config.maxValidationRulesPerObject) {
      context.report({
        severity: 'info',
        category: 'automation-design',
        message: `Object ${objectName} has ${validationRules} validation rules (max: ${context.config.maxValidationRulesPerObject})`,
        description: 'Many validation rules can impact performance and user experience.',
        object: objectName,
        suggestion: 'Consider consolidating validation rules or using Apex validation for complex logic',
      });
    }
    
    // Check total automation count
    const totalAutomations = triggers + flows + processBuilders;
    if (totalAutomations > 5) {
      context.report({
        severity: 'warning',
        category: 'automation-design',
        message: `Object ${objectName} has ${totalAutomations} total automations`,
        description: 'High automation count increases risk of conflicts and recursion.',
        object: objectName,
        suggestion: 'Review and consolidate automations to reduce complexity',
      });
    }
  },
};

// ============================================================================
// Query Performance Rules
// ============================================================================

interface QueryData {
  query: string;
  filePath: string;
  line: number;
  column: number;
}

/**
 * Rule: Non-Selective Query
 */
const nonSelectiveQueryRule: Rule<QueryData> = {
  meta: {
    id: 'non-selective-query',
    name: 'Non-Selective Query',
    description: 'Detects SOQL queries that may not be selective',
    category: 'performance',
    severity: 'warning',
    enabled: true,
    configurable: false,
  },
  analyze(data: QueryData, context) {
    const { query, filePath, line, column } = data;
    const upperQuery = query.toUpperCase();
    
    // Check for missing WHERE clause
    if (!upperQuery.includes('WHERE') && !upperQuery.includes('LIMIT')) {
      context.report({
        severity: 'warning',
        category: 'performance',
        message: 'Query has no WHERE clause or LIMIT',
        description: 'Queries without filters can return too many records and hit governor limits.',
        file: filePath,
        line,
        column,
        suggestion: 'Add a WHERE clause or LIMIT to restrict results',
      });
    }
    
    // Check for wildcard in SELECT (SELECT * equivalent in SOQL is SELECT Id, Name, ...)
    // SOQL doesn't have SELECT *, but we can check for queries selecting many fields
    
    // Check for common non-indexed field patterns in WHERE
    const nonIndexedFields = ['Status', 'StageName', 'Type', 'Industry', 'Rating'];
    for (const field of nonIndexedFields) {
      const fieldPattern = new RegExp(`WHERE[^)]*\\b${field}\\s*=`, 'i');
      if (fieldPattern.test(query) && !upperQuery.includes('Id =')) {
        context.report({
          severity: 'info',
          category: 'performance',
          message: `Query filters on ${field} which may not be indexed`,
          description: 'Filtering on non-indexed fields can cause full table scans on large datasets.',
          file: filePath,
          line,
          column,
          suggestion: `Consider adding an indexed field (like Id or custom index) to the WHERE clause`,
        });
        break;
      }
    }
  },
};

// ============================================================================
// Data Model Rules
// ============================================================================

interface FieldUsageData {
  fieldName: string;
  objectName: string;
  isReferenced: boolean;
  lastUsed?: Date;
}

/**
 * Rule: Unused Field
 */
const unusedFieldRule: Rule<FieldUsageData> = {
  meta: {
    id: 'unused-fields',
    name: 'Unused Custom Field',
    description: 'Detects custom fields that are not referenced in code or flows',
    category: 'data-model',
    severity: 'info',
    enabled: true,
    configurable: false,
  },
  analyze(data: FieldUsageData, context) {
    if (!data.isReferenced) {
      context.report({
        severity: 'info',
        category: 'data-model',
        message: `Field ${data.objectName}.${data.fieldName} appears unused`,
        description: 'This field is not referenced in any Apex code or Flows in the workspace.',
        object: data.objectName,
        suggestion: 'Verify usage in reports, page layouts, and external systems before removing',
      });
    }
  },
};

// ============================================================================
// Register All Rules
// ============================================================================

export function registerBuiltInRules(): void {
  // Code Quality Rules
  ruleRegistry.register(soqlInLoopRule);
  ruleRegistry.register(dmlInLoopRule);
  ruleRegistry.register(hardcodedIdRule);
  ruleRegistry.register(triggerSizeRule);
  ruleRegistry.register(triggerLogicRule);
  ruleRegistry.register(missingBulkificationRule);
  ruleRegistry.register(classSizeRule);
  
  // Automation Rules
  ruleRegistry.register(automationComplexityRule);
  
  // Performance Rules
  ruleRegistry.register(nonSelectiveQueryRule);
  
  // Data Model Rules
  ruleRegistry.register(unusedFieldRule);
}

// Export rules for testing
export {
  soqlInLoopRule,
  dmlInLoopRule,
  hardcodedIdRule,
  triggerSizeRule,
  triggerLogicRule,
  missingBulkificationRule,
  classSizeRule,
  automationComplexityRule,
  nonSelectiveQueryRule,
  unusedFieldRule,
};
