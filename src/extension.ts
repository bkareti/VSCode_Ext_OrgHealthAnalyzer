/**
 * Salesforce Org Health Analyzer - VS Code Extension
 *
 * Enterprise-grade Salesforce Architecture Intelligence Platform.
 * Analyzes connected org metadata: Apex, Automation, Data Model,
 * Performance, Security, Test Coverage, and Integrations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Services
import { getSalesforceService, ensureSfCli } from './services/salesforceService';
import { initAIService, getAIService } from './services/aiService';

// Analyzers
import { createApexAnalyzer } from './analyzers/apexAnalyzer';
import { createAutomationAnalyzer } from './analyzers/automationAnalyzer';
import { createQueryAnalyzer } from './analyzers/queryAnalyzer';
import { createDataModelAnalyzer } from './analyzers/dataModelAnalyzer';
import { createTestCoverageAnalyzer } from './analyzers/testCoverageAnalyzer';
import { createPermissionAnalyzer } from './analyzers/permissionAnalyzer';
import { createIntegrationAnalyzer } from './analyzers/integrationAnalyzer';
import { createGovernorLimitsAnalyzer } from './analyzers/governorLimitsAnalyzer';
import { createLwcAnalyzer } from './analyzers/lwcAnalyzer';
import { createTechnicalDebtAnalyzer } from './analyzers/technicalDebtAnalyzer';
import { createScaleCenterAnalyzer } from './analyzers/scaleCenterAnalyzer';
import { createDependencyAnalyzer } from './analyzers/dependencyAnalyzer';
import { createUserGovernanceAnalyzer } from './analyzers/userGovernanceAnalyzer';
import { createProfileSecurityAnalyzer } from './analyzers/profileSecurityAnalyzer';
import { createStaleMetadataAnalyzer } from './analyzers/staleMetadataAnalyzer';
import { createOrgInventoryAnalyzer } from './analyzers/orgInventoryAnalyzer';
import { createCtaArchitectureAnalyzer } from './analyzers/ctaArchitectureAnalyzer';

// Rules
import { registerBuiltInRules } from './rules/index';
import { ruleEngine } from './rules/engine';

// Reports
import { healthScoreCalculator } from './reports/healthScore';
import { reportGenerator } from './reports/reportGenerator';

// UI
import { getDashboardPanel } from './ui/dashboard';
import { healthResultsProvider } from './ui/treeProvider';

// Utils
import {
  initializeLogger,
  logInfo,
  logError,
  logWarning,
  logAnalysisStart,
  logAnalysisComplete,
  showOutput,
  getOutputChannel,
} from './utils/logger';
import { getConfig, onConfigChange } from './utils/config';
import { getErrorMessage, isAuthError } from './utils/errors';
import { initCache, createApexFileWatcher } from './utils/cache';

// Plugins
import { pluginLoader } from './rules/plugin';

// Types
import { AnalysisResult, Issue, UserGovernanceSummary, ProfileSecuritySummary, StaleMetadataSummary, OrgInventorySummary, OrgDetailsInfo, TrendPoint } from './types';

// ============================================================================
// Extension State
// ============================================================================

let currentResult: AnalysisResult | null = null;
let activeAnalysisCts: vscode.CancellationTokenSource | null = null;
const RESULT_STORAGE_KEY = 'sfHealthAnalyzer.lastResult';
/** Ring buffer of recent run scores, used to render run-over-run trend deltas. */
const HISTORY_STORAGE_KEY = 'sfHealthAnalyzer.scoreHistory';
const HISTORY_MAX_POINTS = 10;
const CACHE_FOLDER = '.orgpulse';
const CACHE_FILE = 'cache.json';

// ============================================================================
// File-based Cache Helpers
// ============================================================================

function getCacheFilePath(): string | null {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) { return null; }
  return path.join(ws, CACHE_FOLDER, CACHE_FILE);
}

function saveCacheToFile(result: AnalysisResult): void {
  try {
    const filePath = getCacheFilePath();
    if (!filePath) { return; }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Ensure .gitignore exists in cache folder
    const gitignorePath = path.join(dir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '*\n', 'utf8');
    }
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
    logInfo(`Analysis cache saved to ${filePath}`);
  } catch (e) {
    logWarning(`Failed to save analysis cache: ${getErrorMessage(e)}`);
  }
}

function loadCacheFromFile(): AnalysisResult | null {
  try {
    const filePath = getCacheFilePath();
    if (!filePath || !fs.existsSync(filePath)) { return null; }
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as AnalysisResult;
    // Restore Date objects from JSON
    if (data.timestamp) { data.timestamp = new Date(data.timestamp); }
    logInfo(`Loaded cached analysis from ${filePath} (${new Date(data.timestamp).toLocaleString()})`);
    return data;
  } catch (e) {
    logWarning(`Failed to load analysis cache: ${getErrorMessage(e)}`);
    return null;
  }
}

// ============================================================================
// Extension Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  initializeLogger(context);
  logInfo('Salesforce Org Health Analyzer activating...');

  // Register all built-in rules
  registerBuiltInRules();

  // Phase 4 — AI Service
  initAIService(context);

  // Phase 5 — Cache + file watcher
  const cache = initCache(context.globalState);
  const apexWatcher = createApexFileWatcher(cache);
  context.subscriptions.push(apexWatcher);

  // Phase 5 — Load plugins
  pluginLoader.loadFromConfig().catch(err =>
    logError('Plugin loader failed', err as Error)
  );

  // Register tree view
  const treeView = vscode.window.createTreeView('sfHealthAnalyzer.results', {
    treeDataProvider: healthResultsProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  vscode.commands.executeCommand('setContext', 'sfHealthAnalyzer.hasResults', false);

  // Register commands
  registerCommands(context);

  // Config change listener — also reload plugins
  context.subscriptions.push(
    onConfigChange(() => {
      logInfo('Configuration changed — re-run analysis to apply new settings');
      pluginLoader.loadFromConfig().catch(err =>
        logError('Plugin reload failed', err as Error)
      );
    })
  );

  // Register diagnostics collection
  const diagnostics = vscode.languages.createDiagnosticCollection('sfHealthAnalyzer');
  context.subscriptions.push(diagnostics);

  // Restore last result if present
  const stored = context.globalState.get<AnalysisResult>(RESULT_STORAGE_KEY);
  if (stored) {
    try {
      // Restore dates from JSON serialization
      stored.timestamp = new Date(stored.timestamp);
      currentResult = stored;
      healthResultsProvider.setResults(currentResult);
      vscode.commands.executeCommand('setContext', 'sfHealthAnalyzer.hasResults', true);
      logInfo('Restored previous analysis results');
    } catch {
      // Ignore stale/corrupt stored results
    }
  }

  logInfo('Salesforce Org Health Analyzer activated');
}

// ============================================================================
// Command Registration
// ============================================================================

function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.analyzeOrg', () =>
      runFullAnalysis(context, false)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.analyzeCurrentFile', () =>
      analyzeCurrentFile(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.openDashboard', () => {
      const panel = getDashboardPanel(context.extensionUri);
      if (currentResult) {
        panel.updateResults(currentResult);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.exportReport', () => exportReport())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.exportSarif', () => exportSarif())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.refreshResults', () =>
      runFullAnalysis(context, true)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.clearCache', async () => {
      const { getCache } = await import('./utils/cache.js');
      await getCache()?.clear();
      vscode.window.showInformationMessage('Salesforce Health Analyzer: analysis cache cleared.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.revokeAiConsent', async () => {
      await getAIService()?.revokeConsent();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.cancelAnalysis', () => {
      if (activeAnalysisCts) {
        activeAnalysisCts.cancel();
        activeAnalysisCts = null;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.runCtaReview', async (modelPreference?: string) => {
      const ai = getAIService();
      if (!ai) {
        vscode.window.showWarningMessage('AI Service not initialised. Run a full analysis first.');
        return;
      }
      if (!currentResult) {
        vscode.window.showWarningMessage('No analysis data available. Run Salesforce: Run Org Health Analyzer first.');
        return;
      }
      const panel = getDashboardPanel(context.extensionUri);
      panel.postMessage({ type: 'ctaReviewLoading' });
      const review = await ai.synthesizeCtaReview(currentResult, modelPreference);
      if (review) {
        currentResult.ctaReview = review;
        panel.postMessage({ type: 'ctaReview', data: review });
        // Persist updated result with CTA review to both caches
        context.globalState.update(RESULT_STORAGE_KEY, currentResult);
        saveCacheToFile(currentResult);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.askArchitect', async (preset?: string) => {
      const ai = getAIService();
      if (!ai) {
        vscode.window.showWarningMessage('AI Service not initialised. Ensure GitHub Copilot or an Anthropic model is available.');
        return;
      }
      const question = preset ?? await vscode.window.showInputBox({
        title: 'Ask the Architect',
        prompt: 'Ask a question about this Salesforce org (the AI can query it live, read-only).',
        placeHolder: 'e.g. Which objects are at risk of large data volume issues?',
        ignoreFocusOut: true,
      });
      if (!question || !question.trim()) { return; }

      const answer = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ask the Architect — analysing org…' },
        async () => ai.askArchitect(question, currentResult),
      );
      if (!answer) { return; }

      // Render the answer as a read-only Markdown preview.
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: `# Ask the Architect\n\n**Q:** ${question}\n\n---\n\n${answer}\n`,
      });
      await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.explainIssue', async (issue: Issue) => {
      const ai = getAIService();
      if (!ai) { return; }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Generating AI explanation…' },
        async () => {
          const explanation = await ai.explainIssue(issue);
          if (explanation) {
            // Post result to dashboard if open
            const panel = getDashboardPanel(context.extensionUri);
            panel.postAIExplanation(explanation);
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sfHealthAnalyzer.openIssueLocation',
      async (issue: Issue) => {
        if (issue.file && !issue.file.startsWith('org://')) {
          const uri = vscode.Uri.file(issue.file);
          const document = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(document);

          if (issue.line) {
            const position = new vscode.Position(issue.line - 1, issue.column || 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
              new vscode.Range(position, position),
              vscode.TextEditorRevealType.InCenter
            );
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.runScaleCenterScan', async () => {
      if (!currentResult) {
        vscode.window.showWarningMessage('Run full analysis first to access Scale Center data.');
        return;
      }
      vscode.commands.executeCommand('sfHealthAnalyzer.openDashboard');
      vscode.window.showInformationMessage('Scale Center tab opened in OrgPulse dashboard.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.viewDependencyGraph', async () => {
      if (!currentResult) {
        vscode.window.showWarningMessage('Run full analysis first to view dependency graph.');
        return;
      }
      vscode.commands.executeCommand('sfHealthAnalyzer.openDashboard');
      vscode.window.showInformationMessage('Open the Dependencies tab in the OrgPulse dashboard.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.generateArchitectReport', async () => {
      if (!currentResult) {
        vscode.window.showWarningMessage('No analysis results. Run analysis first.');
        return;
      }
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('orgpulse-architect-report.html'),
        filters: { HTML: ['html'] },
      });
      if (!uri) { return; }
      const content = reportGenerator.generateArchitectReport(currentResult);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      const open = await vscode.window.showInformationMessage(
        `Architect report saved to ${uri.fsPath}`, 'Open'
      );
      if (open === 'Open') { vscode.env.openExternal(uri); }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.exportDebtBacklog', async () => {
      if (!currentResult?.debtSummary) {
        vscode.window.showWarningMessage('No debt data. Run full analysis first.');
        return;
      }
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file('orgpulse-debt-backlog.csv'),
        filters: { CSV: ['csv'] },
      });
      if (!uri) { return; }
      const debt = currentResult.debtSummary;
      const allItems = [
        ...(debt.quickWins  || []),
        ...(debt.mediumItems || []),
        ...(debt.largeItems  || []),
      ];
      const header = 'ID,Category,Priority,Description,EstimatedHours,File,Line,Tags';
      const rows = allItems.map(item =>
        `"${item.id}","${item.category}","${item.priority}","${item.description.replace(/"/g, '""')}",${item.estimatedHours},"${item.file || ''}",${item.line || ''},"${(item.tags || []).join('; ')}"`
      );
      const csv = [header, ...rows].join('\n');
      await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf8'));
      vscode.window.showInformationMessage(`Debt backlog CSV saved to ${uri.fsPath}`);
    })
  );
}

// ============================================================================
// Full Analysis — Connected Org
// ============================================================================

async function runFullAnalysis(context: vscode.ExtensionContext, forceRefresh = false): Promise<void> {
  // ─── Try loading from file cache (unless force-refresh) ──────────────────
  if (!forceRefresh) {
    const cached = loadCacheFromFile();
    if (cached) {
      currentResult = cached;
      healthResultsProvider.setResults(currentResult);
      vscode.commands.executeCommand('setContext', 'sfHealthAnalyzer.hasResults', true);
      context.globalState.update(RESULT_STORAGE_KEY, currentResult);

      const panel = getDashboardPanel(context.extensionUri);
      panel.updateResults(currentResult);

      const grade = healthScoreCalculator.getGrade(currentResult.scores.overall);
      const cacheTime = new Date(currentResult.timestamp).toLocaleString();
      vscode.window.showInformationMessage(
        `Loaded cached analysis from ${cacheTime} — ${currentResult.scores.overall}/100 (${grade.grade}). Click Re-Analyse for fresh data.`,
        'Re-Analyse'
      ).then(action => {
        if (action === 'Re-Analyse') {
          runFullAnalysis(context, true);
        }
      });
      return;
    }
  }

  const startTime = new Date();

  activeAnalysisCts = new vscode.CancellationTokenSource();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Salesforce Org Health Analyzer',
      cancellable: true,
    },
    async (progress, token) => {
      // Keep activeAnalysisCts in sync with the notification cancel button
      token.onCancellationRequested(() => { if (activeAnalysisCts) { activeAnalysisCts.cancel(); } });
      try {
        logAnalysisStart();
        showOutput();

        const issues: Issue[] = [];
        // Names of analysis steps that failed, surfaced in the dashboard so a
        // section showing "0 issues" is never confused with a failed fetch.
        const stepWarnings: string[] = [];
        const failStep = (label: string, e: unknown): void => {
          logError(`${label} failed`, e as Error);
          stepWarnings.push(label);
        };
        let analyzedFiles = 0;
        let analyzedClasses = 0;
        let analyzedTriggers = 0;
        let analyzedObjects = 0;
        let analyzedFlows = 0;
        let capturedDataModelStats: AnalysisResult['dataModelStats'] = [];
        let capturedAutomationSummary: AnalysisResult['automationSummary'] | undefined;

        ruleEngine.reset();

        // Open the dashboard early so the user sees live progress
        const dashPanel = getDashboardPanel(context.extensionUri);
        dashPanel.postMessage({ type: 'analysisProgress', step: 0, label: 'Connecting to Salesforce org…', total: 20 });

        // ─── Step 1: Ensure SF CLI & connect ────────────────────────────────
        progress.report({ message: 'Connecting to Salesforce org…', increment: 5 });

        const hasCli = await ensureSfCli();
        if (!hasCli) {
          vscode.window.showErrorMessage(
            'Salesforce CLI is required. Install it and authenticate with: sf org login web'
          );
          return;
        }

        const sfService = getSalesforceService();
        let orgInfo: { alias?: string; id?: string; username?: string; instanceUrl?: string } = {};
        let orgDetails: OrgDetailsInfo | undefined;

        try {
          const orgData = await sfService.connect();
          orgInfo = { alias: orgData.alias, id: orgData.id, username: orgData.username, instanceUrl: orgData.instanceUrl };
          logInfo(`Connected: ${orgData.username} (${orgData.alias ?? 'no alias'})`);

          // Fetch extended org details in parallel (non-blocking if any fail)
          try {
            const [orgEdition, featureLicenses, apps] = await Promise.all([
              sfService.getOrgEdition(),
              sfService.getFeatureLicenses(),
              sfService.getInstalledApps(),
            ]);
            const instanceName = orgEdition.instanceName || '';
            const [trustData, nextRelease] = await Promise.all([
              instanceName ? sfService.getTrustInstanceStatus(instanceName) : Promise.resolve({ status: 'Unknown' as const, incidents: [] }),
              instanceName ? sfService.getNextReleaseInfo(instanceName) : Promise.resolve(null),
            ]);
            const consoleAppCount = apps.filter(a => a.type === 'ServiceDesk' || a.type === 'Console' || (a.type || '').toLowerCase().includes('console')).length;
            orgDetails = {
              orgId: orgData.id || '',
              orgName: orgEdition.name || '',
              orgType: orgEdition.orgType || '',
              instanceName,
              instanceUrl: orgData.instanceUrl || '',
              apiVersion: orgData.apiVersion || '',
              username: orgData.username || '',
              alias: orgData.alias,
              trustStatus: trustData.status as OrgDetailsInfo['trustStatus'],
              trustIncidents: trustData.incidents,
              nextReleaseName: nextRelease?.name,
              nextReleaseDate: nextRelease?.date,
              featureLicenses,
              apps,
              consoleAppCount,
              standardAppCount: apps.length - consoleAppCount,
            };
          } catch (detailErr) {
            logWarning(`Could not fetch extended org details: ${getErrorMessage(detailErr)}`);
          }
        } catch (error) {
          if (isAuthError(error)) {
            vscode.window.showErrorMessage(
              'Not authenticated. Run: sf org login web --set-default'
            );
            return;
          }
          throw error;
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 2: Apex Classes & Triggers (from org) ──────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 1, label: 'Fetching Apex classes from org…', total: 20 });
        progress.report({ message: 'Fetching Apex classes from org…', increment: 10 });

        const [apexClasses, apexTriggers] = await Promise.all([
          sfService.getApexClasses(),
          sfService.getApexTriggers(),
        ]);
        analyzedClasses = apexClasses.length;
        analyzedTriggers = apexTriggers.length;
        analyzedFiles = analyzedClasses + analyzedTriggers;

        logInfo(`Fetched ${analyzedClasses} classes, ${analyzedTriggers} triggers from org`);

        const apexAnalyzer = createApexAnalyzer();
        if (apexAnalyzer) {
          // Analyze org source via Tooling API bodies
          const orgApexResult = await apexAnalyzer.analyzeFromOrg(apexClasses, apexTriggers);
          issues.push(...orgApexResult.issues);

          // Also scan local workspace files for rules that need full body (method length etc.)
          const localApexResult = await apexAnalyzer.analyzeWorkspace();
          // Merge avoiding duplicates (local files may overlap with org)
          const orgPaths = new Set(orgApexResult.issues.map(i => i.file));
          for (const issue of localApexResult.issues) {
            if (!issue.file || !orgPaths.has(issue.file)) {
              issues.push(issue);
              analyzedFiles++;
            }
          }
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 3: SOQL Query Analysis (local workspace) ───────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 2, label: 'Analyzing SOQL queries…', total: 20, meta: { classCount: analyzedClasses, triggerCount: analyzedTriggers } });
        progress.report({ message: 'Analyzing SOQL queries…', increment: 10 });

        const queryAnalyzer = createQueryAnalyzer(sfService);
        if (queryAnalyzer) {
          const queryResult = await queryAnalyzer.analyzeWithOrgContext();
          issues.push(...queryResult.issues);
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 4: Automation Complexity ───────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 3, label: 'Analyzing automation complexity…', total: 20 });
        progress.report({ message: 'Analyzing automation complexity…', increment: 15 });

        const automationAnalyzer = createAutomationAnalyzer(sfService);
        const automationResult = await automationAnalyzer.analyzeOrg();
        issues.push(...automationResult.issues);
        analyzedObjects = automationResult.summaries.length;
        analyzedFlows = automationResult.totalFlows;
        // Build per-object map for dashboard
        const autoObjectMap: Record<string, { triggers: number; flows: number; validations: number; total: number }> = {};
        for (const s of automationResult.summaries) {
          autoObjectMap[s.objectName] = {
            triggers: s.triggers || 0,
            flows: s.flows || 0,
            validations: s.validationRules || 0,
            total: (s.triggers || 0) + (s.flows || 0) + (s.validationRules || 0),
          };
        }
        capturedAutomationSummary = {
          objectMap: autoObjectMap,
          totalFlows: automationResult.totalFlows,
          totalTriggers: automationResult.totalTriggers,
          totalValidationRules: automationResult.totalValidationRules,
          flowInventory: (automationResult.flowInventory || []).map(f => ({
            name: f.name,
            processType: f.processType,
            objectApiName: f.objectApiName ?? '',
            isActive: f.isActive,
          })),
        };

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 5: Data Model ───────────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 4, label: 'Analyzing data model…', total: 20, meta: { flowCount: automationResult.totalFlows, totalTriggers: automationResult.totalTriggers, totalValidationRules: automationResult.totalValidationRules } });
        progress.report({ message: 'Analyzing data model…', increment: 10 });

        const dataModelAnalyzer = createDataModelAnalyzer(sfService);
        if (dataModelAnalyzer) {
          const dataModelResult = await dataModelAnalyzer.analyze();
          issues.push(...dataModelResult.issues);
          capturedDataModelStats = dataModelResult.objectFieldStats || [];
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 6: Test Coverage ────────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 5, label: 'Fetching test coverage…', total: 20, meta: { objectCount: capturedDataModelStats.length } });
        progress.report({ message: 'Fetching test coverage…', increment: 10 });

        const coverageAnalyzer = createTestCoverageAnalyzer(sfService);
        const coverageResult = await coverageAnalyzer.analyze();
        issues.push(...coverageResult.issues);

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 7: Security (Permissions) ──────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 6, label: 'Analyzing permissions & security…', total: 20, meta: { coverageIssues: coverageResult.issues.length } });
        progress.report({ message: 'Analyzing permissions & security…', increment: 10 });

        const permAnalyzer = createPermissionAnalyzer(sfService);
        const permResult = await permAnalyzer.analyze();
        issues.push(...permResult.issues);

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 8: Integration ──────────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 7, label: 'Analyzing integrations…', total: 20 });
        progress.report({ message: 'Analyzing integrations…', increment: 10 });

        const integrationAnalyzer = createIntegrationAnalyzer(sfService);
        const integrationResult = await integrationAnalyzer.analyze();
        issues.push(...integrationResult.issues);

        // ─── Step 9: Third-party plugins ─────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 8, label: 'Running plugins…', total: 20 });
        progress.report({ message: 'Running plugins…', increment: 5 });

        const pluginIssues = await pluginLoader.runAll({
          apexClasses,
          apexTriggers,
          orgUsername: orgInfo.username ?? '',
          workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        });
        issues.push(...pluginIssues);

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 10: Governor Limits ─────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 9, label: 'Scanning governor limit risks…', total: 20 });
        progress.report({ message: 'Scanning governor limit risks…', increment: 3 });

        let governorRisks: AnalysisResult['governorRisks'];
        let limitsSimulatorData: AnalysisResult['limitsSimulatorData'];
        try {
          const govAnalyzer = createGovernorLimitsAnalyzer();
          const govResult   = govAnalyzer.analyze(apexClasses, apexTriggers);
          issues.push(...govResult.issues);
          governorRisks       = govResult.governorRisks;
          limitsSimulatorData = govResult.limitsSimulatorData;
        } catch (e) {
          failStep('Governor Limits', e);
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 11: LWC Quality ─────────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 10, label: 'Analysing LWC components…', total: 20, meta: { governorRiskCount: governorRisks ? governorRisks.length : 0 } });
        progress.report({ message: 'Analysing LWC components…', increment: 3 });

        let lwcSummary: AnalysisResult['lwcSummary'];
        let analyzedLwcComponents = 0;
        const vscConfig = vscode.workspace.getConfiguration('sfHealthAnalyzer');
        if (vscConfig.get<boolean>('lwc.enabled', true)) {
          try {
            const lwcAnalyzer = createLwcAnalyzer();
            if (lwcAnalyzer) {
              const lwcResult = await lwcAnalyzer.analyze();
              issues.push(...lwcResult.issues);
              lwcSummary = lwcResult.lwcSummary;
              analyzedLwcComponents = lwcSummary?.totalComponents ?? 0;
            }
          } catch (e) {
            failStep('LWC Quality', e);
          }
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 12: Technical Debt ──────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 11, label: 'Calculating technical debt…', total: 20, meta: { lwcComponentCount: analyzedLwcComponents } });
        progress.report({ message: 'Calculating technical debt…', increment: 3 });

        let debtSummary: AnalysisResult['debtSummary'];
        try {
          const debtHoursPerSprint = vscConfig.get<number>('debt.sprintHoursPerCycle', 16);
          const debtAnalyzer = createTechnicalDebtAnalyzer();
          debtAnalyzer.setSprintHours(debtHoursPerSprint ?? 16);
          const debtResult   = await debtAnalyzer.analyze(apexClasses, apexTriggers);
          issues.push(...debtResult.issues);
          debtSummary = debtResult.debtSummary;
        } catch (e) {
          failStep('Technical Debt', e);
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 13: Scale Center ────────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 12, label: 'Fetching Scale Center metrics…', total: 20 });
        progress.report({ message: 'Fetching Scale Center metrics…', increment: 3 });

        let scaleCenterMetrics: AnalysisResult['scaleCenterMetrics'];
        if (vscConfig.get<boolean>('scaleCenter.enabled', true)) {
          try {
            const scaleAnalyzer = createScaleCenterAnalyzer(sfService);
            const scaleResult   = await scaleAnalyzer.analyze();
            issues.push(...scaleResult.issues);
            scaleCenterMetrics = scaleResult.scaleCenterMetrics;
          } catch (e) {
            failStep('Scale Center', e);
          }
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 14: Dependency Graph ────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 13, label: 'Building dependency graph…', total: 20 });
        progress.report({ message: 'Building dependency graph…', increment: 3 });

        let dependencyGraph: AnalysisResult['dependencyGraph'];
        try {
          const depAnalyzer = createDependencyAnalyzer(sfService);
          const depResult   = await depAnalyzer.analyze(apexClasses, apexTriggers);
          issues.push(...depResult.issues);
          dependencyGraph = depResult.dependencyGraph;
        } catch (e) {
          failStep('Dependencies', e);
        }

        // ─── Step 15: Calculate scores & display ──────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 14, label: 'Calculating health scores…', total: 20 });
        progress.report({ message: 'Calculating health scores…', increment: 5 });

        currentResult = healthScoreCalculator.createAnalysisResult(
          issues,
          {
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            orgAlias: orgInfo.alias,
            orgId: orgInfo.id,
            orgUsername: orgInfo.username,
            analyzedFiles,
            analyzedObjects,
            analyzedClasses,
            analyzedTriggers,
            analyzedFlows,
            analyzedLwcComponents,
          },
          startTime
        );

        // Attach extended result fields
        if (governorRisks)         { currentResult.governorRisks       = governorRisks; }
        if (limitsSimulatorData)   { currentResult.limitsSimulatorData = limitsSimulatorData; }
        if (lwcSummary)            { currentResult.lwcSummary          = lwcSummary; }
        if (debtSummary)           { currentResult.debtSummary         = debtSummary; }
        if (scaleCenterMetrics)    { currentResult.scaleCenterMetrics  = scaleCenterMetrics; }
        if (dependencyGraph)       { currentResult.dependencyGraph     = dependencyGraph; }
        if (capturedDataModelStats && capturedDataModelStats.length > 0) {
          currentResult.dataModelStats = capturedDataModelStats;
        }
        if (capturedAutomationSummary) {
          currentResult.automationSummary = capturedAutomationSummary;
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 16: User Governance ────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 15, label: 'Analysing user governance…', total: 20 });
        progress.report({ message: 'Analysing user governance…', increment: 3 });

        let userSummary: UserGovernanceSummary | undefined;
        let analyzedUsers = 0;
        if (vscConfig.get<boolean>('userGovernance.enabled', true)) {
          try {
            const ugAnalyzer = createUserGovernanceAnalyzer(sfService);
            const ugResult   = await ugAnalyzer.analyze();
            issues.push(...ugResult.issues);
            userSummary    = ugResult.userSummary;
            analyzedUsers  = userSummary.totalActiveUsers;
            currentResult.userSummary = userSummary;
          } catch (e) {
            failStep('User Governance', e);
          }
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 17: Profile Security ───────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 16, label: 'Analysing profile security…', total: 20, meta: { activeUsers: analyzedUsers } });
        progress.report({ message: 'Analysing profile security…', increment: 3 });

        let profileSummary: ProfileSecuritySummary | undefined;
        let analyzedProfiles = 0;
        if (vscConfig.get<boolean>('profileSecurity.enabled', true)) {
          try {
            const psAnalyzer = createProfileSecurityAnalyzer(sfService);
            const psResult   = await psAnalyzer.analyze();
            issues.push(...psResult.issues);
            profileSummary   = psResult.profileSummary;
            analyzedProfiles = profileSummary.totalProfiles;

            // Enrich profile list with active user counts
            try {
              const userCounts = await sfService.getProfileUserCounts();
              const countMap = new Map(userCounts.map(u => [u.ProfileId, u.userCount]));
              for (const p of profileSummary.profileList) {
                p._userCount = countMap.get(p.Id) ?? 0;
              }
            } catch { /* non-critical — column will show "—" */ }

            currentResult.profileSummary = profileSummary;
          } catch (e) {
            failStep('Profile Security', e);
          }
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 18: Stale Metadata ─────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 17, label: 'Scanning for stale metadata…', total: 20 });
        progress.report({ message: 'Scanning for stale metadata…', increment: 3 });

        let staleMetadata: StaleMetadataSummary | undefined;
        if (vscConfig.get<boolean>('staleMetadata.enabled', true)) {
          try {
            const smAnalyzer = createStaleMetadataAnalyzer(sfService);
            const smResult   = await smAnalyzer.analyze();
            issues.push(...smResult.issues);
            staleMetadata    = smResult.staleMetadata;
            currentResult.staleMetadata = staleMetadata;
          } catch (e) {
            failStep('Stale Metadata', e);
          }
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Step 19: Org Inventory ───────────────────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 18, label: 'Building org inventory…', total: 20 });
        progress.report({ message: 'Building org inventory…', increment: 3 });

        let orgInventory: OrgInventorySummary | undefined;
        if (vscConfig.get<boolean>('orgInventory.enabled', true)) {
          try {
            const invAnalyzer = createOrgInventoryAnalyzer(sfService);
            const invResult   = await invAnalyzer.analyze(analyzedClasses, analyzedTriggers, analyzedFlows);
            issues.push(...invResult.issues);
            orgInventory      = invResult.orgInventory;
            currentResult.orgInventory = orgInventory;
          } catch (e) {
            failStep('Org Inventory', e);
          }
        }

        // Attach extended org details fetched at Step 1
        if (orgDetails) {
          currentResult.orgDetails = orgDetails;
        }

        // ─── Step 20: CTA Architecture Analysis ──────────────────────────────
        dashPanel.postMessage({ type: 'analysisProgress', step: 19, label: 'Running CTA architecture checks…', total: 20, meta: { totalIssues: issues.length, inventoryReady: !!orgInventory } });
        progress.report({ message: 'Running CTA architecture checks…', increment: 2 });

        if (vscConfig.get<boolean>('ctaArchitecture.enabled', true)) {
          try {
            const ctaAnalyzer = createCtaArchitectureAnalyzer(sfService);
            const queryExplainEnabled = vscConfig.get<boolean>('queryExplain.enabled', true);
            const ctaResult = await ctaAnalyzer.analyze(currentResult, queryExplainEnabled, apexClasses, apexTriggers);
            issues.push(...ctaResult.issues);
            currentResult.licenseSummary       = ctaResult.licenseSummary;
            currentResult.queryExplainResults  = ctaResult.queryExplainResults;
            currentResult.objectRecordCounts   = ctaResult.objectRecordCounts;
            currentResult.entryPoints          = ctaResult.entryPoints;
          } catch (e) {
            failStep('CTA Architecture', e);
          }
        }

        // ─── Live governor-limit utilisation (REST /limits) ──────────────────
        try {
          const orgLimits = await sfService.getOrgLimits();
          if (orgLimits.length > 0) { currentResult.orgLimits = orgLimits; }
        } catch (e) {
          failStep('Org Limits', e);
        }

        // Update metadata with new counts
        if (currentResult.metadata) {
          currentResult.metadata.analyzedUsers    = analyzedUsers;
          currentResult.metadata.analyzedProfiles = analyzedProfiles;
          currentResult.metadata.installedPackages = orgInventory?.installedPackages?.length ?? 0;
          if (stepWarnings.length > 0) { currentResult.metadata.warnings = stepWarnings; }
        }

        // Recompute summary with added issues from steps 16-19
        currentResult.summary = healthScoreCalculator.createSummary(currentResult.issues);

        // ─── Run-over-run trend history ──────────────────────────────────────
        // Append this run's scores to a small ring buffer so the Overview tab
        // can render ▲/▼ deltas vs the previous run.
        const priorHistory = context.globalState.get<TrendPoint[]>(HISTORY_STORAGE_KEY) ?? [];
        const s = currentResult.scores;
        const trendPoint: TrendPoint = {
          timestamp: currentResult.timestamp instanceof Date
            ? currentResult.timestamp.toISOString()
            : new Date().toISOString(),
          overall: s.overall,
          codeQuality: s.codeQuality,
          automationDesign: s.automationDesign,
          performance: s.performance,
          security: s.security,
          testing: s.testing,
        };
        const history = [...priorHistory, trendPoint].slice(-HISTORY_MAX_POINTS);
        context.globalState.update(HISTORY_STORAGE_KEY, history);
        currentResult.trends = history;

        // Persist result for restore on reload
        context.globalState.update(RESULT_STORAGE_KEY, currentResult);

        // Save to project file cache (.orgpulse/cache.json)
        saveCacheToFile(currentResult);

        // Update tree view
        healthResultsProvider.setResults(currentResult);
        vscode.commands.executeCommand('setContext', 'sfHealthAnalyzer.hasResults', true);

        // Show/update dashboard
        const panel = getDashboardPanel(context.extensionUri);
        panel.updateResults(currentResult);

        // Output channel summary
        const duration = Date.now() - startTime.getTime();
        logAnalysisComplete(duration, issues.length);
        getOutputChannel().appendLine('');
        getOutputChannel().appendLine(healthScoreCalculator.formatScores(currentResult.scores));

        // Notification
        const grade = healthScoreCalculator.getGrade(currentResult.scores.overall);
        const errorCount = currentResult.summary.errorCount;
        vscode.window.showInformationMessage(
          `Analysis complete — Overall: ${currentResult.scores.overall}/100 (${grade.grade} – ${grade.description}) | ${errorCount} critical issue(s)`,
          'View Dashboard'
        ).then(action => {
          if (action === 'View Dashboard') {
            vscode.commands.executeCommand('sfHealthAnalyzer.openDashboard');
          }
        });

      } catch (error) {
        logError('Analysis failed', error as Error);
        vscode.window.showErrorMessage(`Analysis failed: ${getErrorMessage(error)}`);
      } finally {
        activeAnalysisCts = null;
      }
    }
  );
}

// ============================================================================
// Analyze Current File
// ============================================================================

async function analyzeCurrentFile(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage('No file is currently open');
    return;
  }

  const document = editor.document;
  const fileName = document.fileName;

  if (!fileName.endsWith('.cls') && !fileName.endsWith('.trigger')) {
    vscode.window.showWarningMessage('Current file is not an Apex class or trigger');
    return;
  }

  try {
    const apexAnalyzer = createApexAnalyzer();
    if (!apexAnalyzer) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    const issues = await apexAnalyzer.analyzeFile(document.uri);

    const diagnostics = vscode.languages.createDiagnosticCollection('sfHealthAnalyzer');
    const diagnosticItems = issues.map(issue => {
      const range = new vscode.Range(
        (issue.line || 1) - 1,
        (issue.column || 1) - 1,
        (issue.endLine || issue.line || 1) - 1,
        (issue.endColumn || issue.column || 1) + 50
      );

      const severity =
        issue.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : issue.severity === 'warning'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;

      const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
      diagnostic.source = 'Salesforce Health Analyzer';
      diagnostic.code = issue.ruleId;
      return diagnostic;
    });

    diagnostics.set(document.uri, diagnosticItems);
    context.subscriptions.push(diagnostics);

    if (issues.length === 0) {
      vscode.window.showInformationMessage('No issues found in this file!');
    } else {
      vscode.window.showInformationMessage(`Found ${issues.length} issue(s) — see Problems panel`);
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Analysis failed: ${getErrorMessage(error)}`);
  }
}

// ============================================================================
// Export SARIF Report
// ============================================================================

async function exportSarif(): Promise<void> {
  if (!currentResult) {
    vscode.window.showWarningMessage('No analysis results. Run analysis first.');
    return;
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file('org-health-report.sarif'),
    filters: { SARIF: ['sarif', 'json'] },
  });

  if (!uri) { return; }

  const content = reportGenerator.generateSarifReport(currentResult);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

  const openAction = await vscode.window.showInformationMessage(
    `SARIF report saved to ${uri.fsPath}`,
    'Open'
  );

  if (openAction === 'Open') {
    vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc));
  }
}

// ============================================================================
// Export Report
// ============================================================================

async function exportReport(): Promise<void> {
  if (!currentResult) {
    vscode.window.showWarningMessage('No analysis results. Run analysis first.');
    return;
  }

  const format = await vscode.window.showQuickPick(
    [
      { label: '$(globe) HTML Report', value: 'html', description: 'Interactive HTML report' },
      { label: '$(json) JSON', value: 'json', description: 'Raw JSON data' },
      { label: '$(output) Text', value: 'text', description: 'Plain text report' },
    ],
    { placeHolder: 'Select export format' }
  );

  if (!format) { return; }

  let content: string;
  let defaultName: string;
  let filters: Record<string, string[]>;

  switch (format.value) {
    case 'html':
      content = reportGenerator.generateHtmlReport(currentResult);
      defaultName = 'org-health-report.html';
      filters = { HTML: ['html'] };
      break;
    case 'json':
      content = reportGenerator.generateJsonReport(currentResult);
      defaultName = 'org-health-report.json';
      filters = { JSON: ['json'] };
      break;
    default:
      content = reportGenerator.generateTextReport(currentResult);
      defaultName = 'org-health-report.txt';
      filters = { Text: ['txt'] };
  }

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultName),
    filters,
  });

  if (uri) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

    const openAction = await vscode.window.showInformationMessage(
      `Report saved to ${uri.fsPath}`,
      'Open'
    );

    if (openAction === 'Open') {
      if (format.value === 'html') {
        vscode.env.openExternal(uri);
      } else {
        vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc));
      }
    }
  }
}

// ============================================================================
// Extension Deactivation
// ============================================================================

export function deactivate() {
  logInfo('Salesforce Org Health Analyzer deactivated');
}
