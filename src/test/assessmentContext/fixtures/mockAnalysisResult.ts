import { AnalysisResult, Issue, HealthScores, AnalysisSummary, AnalysisMetadata } from '../../../types';

export function makeMockIssues(): Issue[] {
  return [
    { id: 'issue-1', ruleId: 'soql-in-loop',    severity: 'error',   category: 'code-quality',      message: 'SOQL inside for-loop in AccountHandler', object: 'Account' },
    { id: 'issue-2', ruleId: 'soql-in-loop',    severity: 'error',   category: 'code-quality',      message: 'SOQL inside for-loop in ContactHandler', object: 'Contact' },
    { id: 'issue-3', ruleId: 'dml-in-loop',     severity: 'error',   category: 'code-quality',      message: 'DML inside for-loop in CaseTrigger',     object: 'Case' },
    { id: 'issue-4', ruleId: 'missing-sharing', severity: 'error',   category: 'security',          message: 'Apex class declared without sharing: IntegrationHandler' },
    { id: 'issue-5', ruleId: 'modifyall-permission', severity: 'error', category: 'profile-security', message: 'Profile has Modify All Data permission: System Admin' },
    { id: 'issue-6', ruleId: 'test-coverage',   severity: 'warning', category: 'testing',           message: 'Test coverage 62% — below 75% threshold' },
    { id: 'issue-7', ruleId: 'non-selective-query', severity: 'warning', category: 'performance',   message: 'Non-selective SOQL query on Account' },
    { id: 'issue-8', ruleId: 'trigger-logic',   severity: 'warning', category: 'automation-design', message: 'Business logic in trigger body' },
    { id: 'issue-9', ruleId: 'unused-field',    severity: 'info',    category: 'data-model',        message: 'Custom field unused: Account.Legacy_Status__c', object: 'Account' },
    { id: 'issue-10', ruleId: 'debug-statement', severity: 'info',   category: 'technical-debt',    message: 'System.debug found in production code' },
  ];
}

export function makeMockScores(): HealthScores {
  return {
    codeQuality:      55,
    automationDesign: 70,
    dataModel:        80,
    performance:      65,
    security:         50,
    testing:          60,
    integration:      85,
    overall:          65,
  };
}

export function makeMockSummary(): AnalysisSummary {
  return {
    totalIssues:  10,
    errorCount:   5,
    warningCount: 3,
    infoCount:    2,
    byCategory: {
      'code-quality':      3,
      'automation-design': 1,
      'data-model':        1,
      'performance':       1,
      'security':          1,
      'testing':           1,
      'integration':       0,
      'lwc-quality':       0,
      'governor-limits':   0,
      'technical-debt':    1,
      'dependencies':      0,
      'user-governance':   0,
      'profile-security':  1,
      'stale-metadata':    0,
      'org-inventory':     0,
      'aura-quality':      0,
      'cta-review':        0,
    },
    byObject: { Account: 3, Case: 1, Contact: 1 },
  };
}

export function makeMockMetadata(): AnalysisMetadata {
  return {
    orgId:            '00D000000000001ABC',
    orgAlias:         'test-org',
    orgUsername:      'admin@testorg.com',
    apiVersion:       '63.0',
    analyzedFiles:    42,
    analyzedObjects:  18,
    analyzedClasses:  85,
    analyzedTriggers: 12,
    analyzedFlows:    24,
    analyzedUsers:    120,
  };
}

/** Full mock AnalysisResult with rich optional payloads for testing. */
export function makeMockResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const base: AnalysisResult = {
    timestamp: new Date('2026-07-01T10:00:00.000Z'),
    duration:  34820,
    issues:    makeMockIssues(),
    summary:   makeMockSummary(),
    scores:    makeMockScores(),
    metadata:  makeMockMetadata(),

    automationSummary: {
      objectMap: {
        Account: { triggers: 2, flows: 3, validations: 2, total: 7 },
        Case:    { triggers: 1, flows: 2, validations: 1, total: 4 },
      },
      totalFlows:           24,
      totalTriggers:        12,
      totalValidationRules: 18,
      totalWorkflowRules:   3,
      totalProcessBuilders: 2,
      flowInventory: [],
    },

    testCoverageSummary: {
      averageCoverage: 74,
      totalClasses:    85,
      classesBelow75:  18,
      zeroCoverageCount: 3,
    },

    licenseSummary: [
      { name: 'Salesforce',         totalLicenses: 200, usedLicenses: 142, usedPct: 71 },
      { name: 'Salesforce Platform', totalLicenses: 50,  usedLicenses: 22,  usedPct: 44 },
    ],

    orgInventory: {
      installedPackages:  [],
      visualforcePages:   [],
      customLabels:       [],
      apexClassCount:     85,
      apexTriggerCount:   12,
      flowCount:          24,
      customObjectCount:  38,
      standardObjectCount: 14,
      customFieldCount:   410,
      permissionSetCount: 22,
      validationRuleCount: 18,
      profileCount:       10,
      recordTypeCount:    25,
      pageLayoutCount:    30,
      flexiPageCount:     8,
      totalComponents:    700,
    },

    userSummary: {
      totalActiveUsers:   120,
      totalInactiveUsers: 30,
      neverLoggedIn:      5,
      dormantUsers:       22,
      superAdmins:        2,
      profileDistribution: [],
      usersByType: { Standard: 115, Guest: 5 },
      roleHierarchyDepth: 4,
    },

    profileSummary: {
      totalProfiles:          10,
      systemAdminProfiles:    2,
      profilesWithModifyAll:  2,
      profilesWithViewAll:    3,
      profilesWithAuthorApex: 4,
      overprivilegedCount:    3,
      profileList:            [],
      permissionSetList: [
        { Id: 'ps1', Name: 'PS_Unused', Label: 'Unused PS', IsCustom: true, _userCount: 0 },
        { Id: 'ps2', Name: 'PS_Used',   Label: 'Used PS',   IsCustom: true, _userCount: 5 },
        { Id: 'ps3', Name: 'PS_Empty',  Label: 'Empty PS',  IsCustom: true, _userCount: 0 },
        { Id: 'ps4', Name: 'PS_None',   Label: 'None PS',   IsCustom: true, _userCount: 0 },
      ],
    },

    staleMetadata: {
      staleReports: new Array(25).fill({ id: 'r1', name: 'Report', type: 'report' as const }),
      staleDashboards: new Array(10).fill({ id: 'd1', name: 'Dash', type: 'dashboard' as const }),
      unusedCustomFields: [
        ...new Array(8).fill({ id: 'f1', name: 'F1', type: 'custom-field' as const, objectName: 'Account' }),
        ...new Array(6).fill({ id: 'f2', name: 'F2', type: 'custom-field' as const, objectName: 'Contact' }),
      ],
      totalStaleItems: 43,
      estimatedCleanupHours: 8,
    },

    orgLimits: [
      { name: 'DailyApiRequests',  label: 'Daily API Requests',  max: 1_000_000, remaining: 220_000, used: 780_000, usedPct: 78 },
      { name: 'DataStorageMB',     label: 'Data Storage (MB)',   max: 1024,       remaining: 600,     used: 424,     usedPct: 41 },
    ],

    governorRisks: [
      {
        className: 'AccountBatchProcessor',
        prediction: {
          soqlQueries:    { estimated: 180, limit: 200, risk: 'high' },
          dmlStatements:  { estimated: 50,  limit: 150, risk: 'low' },
          cpuTime:        { estimated: 8000, limit: 10000, risk: 'medium' },
          heapSize:       { estimated: 5_000_000, limit: 6_000_000, risk: 'medium' },
        },
        patterns: ['soql-in-loop'],
      },
    ],

    objectRecordCounts: {
      Account: 1_200_000,
      Contact: 450_000,
    },

    entryPoints: [
      { name: 'IntegrationController', type: 'RestResource', annotation: '@RestResource' },
    ],

    trends: [
      { timestamp: '2026-06-17T10:00:00.000Z', overall: 60, codeQuality: 50, automationDesign: 65, performance: 62, security: 48, testing: 55 },
      { timestamp: '2026-07-01T10:00:00.000Z', overall: 65, codeQuality: 55, automationDesign: 70, performance: 65, security: 50, testing: 60 },
    ],
  };

  return { ...base, ...overrides };
}
