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

/**
 * Rule: Method Length
 */
const methodLengthRule: Rule<ApexFileData> = {
  meta: {
    id: 'method-length',
    name: 'Method Length Limit',
    description: 'Checks if methods exceed the recommended line count (indicates single responsibility violations)',
    category: 'code-quality',
    severity: 'warning',
    enabled: true,
    configurable: true,
  },
  analyze(data: ApexFileData, context) {
    const maxLines = context.config.maxMethodLines;
    const lines = data.content.split('\n');

    // Find method declarations
    const methodPattern = /\b(public|private|protected|global)\s+(static\s+)?\w[\w<>\[\]]*\s+(\w+)\s*\([^)]*\)\s*\{/g;
    let methodMatch;

    while ((methodMatch = methodPattern.exec(data.content)) !== null) {
      const methodName = methodMatch[3];
      const startPos = methodMatch.index + methodMatch[0].length - 1; // position of opening {

      // Count brace depth to find end of method
      let depth = 1;
      let pos = startPos + 1;
      const methodStart = methodMatch.index;
      let methodEnd = startPos;

      while (pos < data.content.length && depth > 0) {
        if (data.content[pos] === '{') {
          depth++;
        } else if (data.content[pos] === '}') {
          depth--;
          if (depth === 0) {
            methodEnd = pos;
          }
        }
        pos++;
      }

      // Count lines in method
      const methodContent = data.content.substring(methodStart, methodEnd + 1);
      const methodLineCount = methodContent.split('\n').length;

      if (methodLineCount > maxLines) {
        // Calculate line number of method start
        let charCount = 0;
        let lineNum = 0;
        for (let i = 0; i < lines.length; i++) {
          if (charCount + lines[i].length >= methodStart) {
            lineNum = i + 1;
            break;
          }
          charCount += lines[i].length + 1;
        }

        context.report({
          severity: 'warning',
          category: 'code-quality',
          message: `Method '${methodName}' exceeds ${maxLines} lines (${methodLineCount} lines)`,
          description: 'Long methods are hard to read, test, and maintain. Extract logic into smaller helper methods.',
          file: data.filePath,
          line: lineNum,
          suggestion: 'Break this method into smaller methods following Single Responsibility Principle',
        });
      }
    }
  },
};

/**
 * Rule: Missing Sharing Declaration
 */
const missingSharingRule: Rule<ApexFileData> = {
  meta: {
    id: 'missing-sharing',
    name: 'Missing Sharing Declaration',
    description: 'Detects classes that declare no sharing model, which defaults to omitting sharing (risky)',
    category: 'security',
    severity: 'warning',
    enabled: true,
    configurable: false,
  },
  analyze(data: ApexFileData, context) {
    if (!data.isClass) {
      return;
    }

    // Skip test classes, interfaces, abstract classes, and trigger handlers
    if (
      data.fileName.toLowerCase().includes('test') ||
      /\binterface\b/.test(data.content) ||
      /\babstract\s+class\b/.test(data.content)
    ) {
      return;
    }

    const classDecl = APEX_PATTERNS.CLASS_DECLARATION;
    const resetPattern = new RegExp(classDecl.source, classDecl.flags);
    const match = resetPattern.exec(data.content);

    if (match && !/(with sharing|without sharing|inherited sharing)/i.test(match[0])) {
      context.report({
        severity: 'warning',
        category: 'security',
        message: `Class '${match[4] || data.fileName}' has no sharing declaration`,
        description: 'Classes without a sharing declaration inherit or omit sharing rules, which can expose data unexpectedly.',
        file: data.filePath,
        line: 1,
        suggestion: 'Add "with sharing" (recommended), "without sharing" (only if required), or "inherited sharing"',
      });
    }
  },
};

/**
 * Rule: System.debug in production code
 */
const systemDebugRule: Rule<ApexFileData> = {
  meta: {
    id: 'system-debug',
    name: 'System.debug in Production Code',
    description: 'Detects System.debug calls that slow down org performance and may expose sensitive data in logs',
    category: 'code-quality',
    severity: 'info',
    enabled: true,
    configurable: false,
  },
  analyze(data: ApexFileData, context) {
    // Skip test classes
    if (data.fileName.toLowerCase().includes('test')) {
      return;
    }

    const debugMatches = findPatternMatches(data.content, APEX_PATTERNS.SYSTEM_DEBUG);
    for (const match of debugMatches) {
      context.report({
        severity: 'info',
        category: 'code-quality',
        message: 'System.debug call found in production code',
        description: 'Debug statements consume CPU time in governor limits and may expose sensitive data in debug logs.',
        file: data.filePath,
        line: match.line,
        column: match.column,
        suggestion: 'Remove or wrap with a configurable logging utility',
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
    description: 'Detects objects with too many automations that risk recursion and governor limit breaches',
    category: 'automation-design',
    severity: 'warning',
    enabled: true,
    configurable: true,
  },
  analyze(data: ObjectAutomationSummary, context) {
    const { objectName, triggers, flows, processBuilders, validationRules } = data;
    
    if (triggers > context.config.maxTriggersPerObject) {
      context.report({
        severity: 'error',
        category: 'automation-design',
        message: `Object ${objectName} has ${triggers} triggers (max: ${context.config.maxTriggersPerObject})`,
        description: 'Multiple triggers on the same object can cause unpredictable behavior and execution order issues.',
        object: objectName,
        suggestion: 'Consolidate into a single trigger using a trigger handler framework (e.g. FFLIB TriggerDispatcher)',
      });
    }
    
    if (flows > context.config.maxFlowsPerObject) {
      context.report({
        severity: 'warning',
        category: 'automation-design',
        message: `Object ${objectName} has ${flows} flows (max: ${context.config.maxFlowsPerObject})`,
        description: 'Too many flows on a single object increases complexity and debugging difficulty.',
        object: objectName,
        suggestion: 'Consolidate record-triggered flows into one using decision elements and subflows',
      });
    }
    
    if (processBuilders > 0) {
      context.report({
        severity: 'warning',
        category: 'automation-design',
        message: `Object ${objectName} has ${processBuilders} Process Builder(s) — deprecated`,
        description: 'Process Builders are deprecated and being retired. Migrate to Flows for better performance and maintainability.',
        object: objectName,
        suggestion: 'Use the Migrate to Flow tool to convert Process Builders to Record-Triggered Flows',
      });
    }
    
    if (validationRules > context.config.maxValidationRulesPerObject) {
      context.report({
        severity: 'info',
        category: 'automation-design',
        message: `Object ${objectName} has ${validationRules} validation rules (max: ${context.config.maxValidationRulesPerObject})`,
        description: 'Many validation rules can impact save performance and degrade user experience.',
        object: objectName,
        suggestion: 'Consider consolidating validation rules or using Apex validation for complex logic',
      });
    }
    
    const totalAutomations = triggers + flows + processBuilders;
    if (totalAutomations > 5) {
      context.report({
        severity: 'warning',
        category: 'automation-design',
        message: `Object ${objectName} has ${totalAutomations} total automations — high recursion risk`,
        description: 'High automation count increases risk of recursive execution and governor limit exhaustion.',
        object: objectName,
        suggestion: 'Implement a static recursion flag or use FFLIB Unit Of Work pattern to prevent re-entry',
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
    description: 'Detects SOQL queries that may not be selective and risk full table scans',
    category: 'performance',
    severity: 'warning',
    enabled: true,
    configurable: false,
  },
  analyze(data: QueryData, context) {
    const { query, filePath, line, column } = data;
    const upperQuery = query.toUpperCase();
    
    if (!upperQuery.includes('WHERE') && !upperQuery.includes('LIMIT')) {
      context.report({
        severity: 'warning',
        category: 'performance',
        message: 'Query has no WHERE clause or LIMIT — full table scan risk',
        description: 'Queries without filters can return too many records and hit governor limits on large datasets.',
        file: filePath,
        line,
        column,
        suggestion: 'Add a WHERE clause filtering on an indexed field, or add LIMIT to restrict results',
      });
    }
    
    // NOT IN / NOT EQUALS patterns are non-selective
    if (/WHERE[^)]*\bNOT\s+IN\b/i.test(query) || /WHERE[^)]*\s*!=\s*/i.test(query)) {
      context.report({
        severity: 'warning',
        category: 'performance',
        message: 'Query uses non-selective NOT IN or != operator',
        description: 'NOT IN and != operators prevent index use and cause full table scans.',
        file: filePath,
        line,
        column,
        suggestion: 'Rewrite as an IN filter if possible, or use a semi-join',
      });
    }

    // Leading wildcard LIKE
    if (/LIKE\s+'%/i.test(query)) {
      context.report({
        severity: 'warning',
        category: 'performance',
        message: 'Query uses leading wildcard LIKE \'%...\' — non-selective',
        description: 'Leading wildcards in LIKE clauses cannot use indexes and cause full scans.',
        file: filePath,
        line,
        column,
        suggestion: 'Use a suffix wildcard LIKE \'value%\' or SOSL for text search instead',
      });
    }

    const nonIndexedFields = ['Status', 'StageName', 'Type', 'Industry', 'Rating', 'LeadSource'];
    for (const field of nonIndexedFields) {
      const fieldPattern = new RegExp(`WHERE[^)]*\\b${field}\\s*=`, 'i');
      if (fieldPattern.test(query) && !/\bId\s*(=|IN)/i.test(query)) {
        context.report({
          severity: 'info',
          category: 'performance',
          message: `Query filters on non-indexed field: ${field}`,
          description: 'Filtering on non-indexed fields causes full table scans on large data volumes.',
          file: filePath,
          line,
          column,
          suggestion: `Add an indexed field (Id, OwnerId, or a custom indexed field) to the WHERE clause alongside ${field}`,
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
    description: 'Detects custom fields that are not referenced in Apex code',
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
        message: `Field ${data.objectName}.${data.fieldName} appears unused in Apex code`,
        description: 'This field is not referenced in any Apex class or trigger in the org.',
        object: data.objectName,
        suggestion: 'Verify usage in Flows, page layouts, reports, and external integrations before removing',
      });
    }
  },
};

// ============================================================================
// Testing Rules
// ============================================================================

interface CoverageData {
  className: string;
  coveragePercent: number;
  numLinesCovered: number;
  numLinesUncovered: number;
  isTest: boolean;
  hasAsserts?: boolean;
}

/**
 * Rule: Test Coverage Below Threshold
 */
const testCoverageRule: Rule<CoverageData> = {
  meta: {
    id: 'test-coverage',
    name: 'Insufficient Test Coverage',
    description: 'Detects Apex classes and triggers with test coverage below 75%',
    category: 'testing',
    severity: 'error',
    enabled: true,
    configurable: true,
  },
  analyze(data: CoverageData, context) {
    if (data.isTest) {
      return;
    }

    const threshold = 75;

    if (data.coveragePercent < threshold) {
      const severity: Severity = data.coveragePercent === 0 ? 'error' : 'warning';
      context.report({
        severity,
        category: 'testing',
        message: `${data.className} has ${data.coveragePercent}% test coverage (minimum: ${threshold}%)`,
        description: `Only ${data.numLinesCovered} of ${data.numLinesCovered + data.numLinesUncovered} lines are covered by tests. Salesforce requires 75% minimum for deployment.`,
        file: `org://${data.className}`,
        suggestion: data.coveragePercent === 0
          ? 'No test coverage — create unit tests with meaningful assertions before next deployment'
          : 'Add test methods covering edge cases: null inputs, bulk (200+ records), negative paths',
      });
    }

    if (data.hasAsserts === false) {
      context.report({
        severity: 'warning',
        category: 'testing',
        message: `Test class for ${data.className} has no assertions (System.assert*)`,
        description: 'Tests without assertions provide coverage numbers but do not validate behavior.',
        file: `org://${data.className}`,
        suggestion: 'Add System.assertEquals, System.assertNotEquals, or System.assert calls to validate expected outcomes',
      });
    }
  },
};

// ============================================================================
// Security Rules
// ============================================================================

interface PermissionData {
  permissionSetName: string;
  hasModifyAll: boolean;
  hasViewAll: boolean;
  isProfile: boolean;
}

/**
 * Rule: Modify All Data Permission
 */
const modifyAllPermissionRule: Rule<PermissionData> = {
  meta: {
    id: 'modifyall-permission',
    name: 'Modify All Data Permission Granted',
    description: 'Detects permission sets or profiles granting Modify All Data — an org-wide escalation',
    category: 'security',
    severity: 'error',
    enabled: true,
    configurable: false,
  },
  analyze(data: PermissionData, context) {
    if (data.hasModifyAll) {
      context.report({
        severity: 'error',
        category: 'security',
        message: `"Modify All Data" granted in ${data.isProfile ? 'profile' : 'permission set'}: ${data.permissionSetName}`,
        description: 'Modify All Data bypasses all record-level security (sharing rules, OWD, ownership) across the entire org.',
        suggestion: 'Restrict Modify All Data to System Administrators only. Use object-level Modify All (not org-wide) for targeted access.',
      });
    }

    if (data.hasViewAll) {
      context.report({
        severity: 'warning',
        category: 'security',
        message: `"View All Data" granted in ${data.isProfile ? 'profile' : 'permission set'}: ${data.permissionSetName}`,
        description: 'View All Data bypasses all record visibility controls and exposes all org data to the user.',
        suggestion: 'Use object-level "View All" permission or sharing rules instead of the org-wide View All Data system permission.',
      });
    }
  },
};

// ============================================================================
// Integration Rules
// ============================================================================

interface CredentialData {
  name: string;
  protocol?: string;
  principalType?: string;
}

/**
 * Rule: Legacy Named Credential (password-based)
 */
const legacyCredentialRule: Rule<CredentialData> = {
  meta: {
    id: 'legacy-credential',
    name: 'Password-Based Named Credential',
    description: 'Detects Named Credentials using legacy username/password authentication instead of OAuth',
    category: 'integration',
    severity: 'warning',
    enabled: true,
    configurable: false,
  },
  analyze(data: CredentialData, context) {
    if (data.principalType === 'NamedUser' || data.protocol === 'Password') {
      context.report({
        severity: 'warning',
        category: 'integration',
        message: `Named Credential '${data.name}' uses password-based auth`,
        description: 'Password-based Named Credentials are less secure and harder to rotate than OAuth 2.0 credentials.',
        suggestion: 'Migrate to OAuth 2.0 Named Credentials with JWT Bearer Flow or Client Credentials for server-to-server integrations',
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
  ruleRegistry.register(methodLengthRule);
  ruleRegistry.register(systemDebugRule);
  
  // Security Rules
  ruleRegistry.register(missingSharingRule);
  ruleRegistry.register(modifyAllPermissionRule);

  // Automation Rules
  ruleRegistry.register(automationComplexityRule);
  
  // Performance Rules
  ruleRegistry.register(nonSelectiveQueryRule);
  
  // Data Model Rules
  ruleRegistry.register(unusedFieldRule);

  // Testing Rules
  ruleRegistry.register(testCoverageRule);

  // Integration Rules
  ruleRegistry.register(legacyCredentialRule);
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
  methodLengthRule,
  systemDebugRule,
  missingSharingRule,
  automationComplexityRule,
  nonSelectiveQueryRule,
  unusedFieldRule,
  testCoverageRule,
  modifyAllPermissionRule,
  legacyCredentialRule,
};


