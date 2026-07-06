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
import { getSalesforceService, ensureSfCli, ensureCodeAnalyzer } from './services/salesforceService';
import { runCodeAnalyzer } from './services/codeAnalyzerService';
import { initAIService, getAIService } from './services/aiService';
import { AssessmentContextService } from './services/assessmentContext';
import {
  FutureReadinessService,
  IFutureReadinessService,
  IReadinessSnapshotStore,
  FutureReadinessSnapshot,
} from './services/futureReadiness';
import { collectReadinessData } from './services/futureReadiness/collectors';

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
import { getConfig, onConfigChange, getCodeAnalyzerConfig } from './utils/config';
import { getErrorMessage, isAuthError } from './utils/errors';
import { initCache, createApexFileWatcher } from './utils/cache';

// Plugins
import { pluginLoader } from './rules/plugin';

// Types
import { AnalysisResult, Issue, UserGovernanceSummary, ProfileSecuritySummary, StaleMetadataSummary, OrgInventorySummary, OrgDetailsInfo, TrendPoint, OrgInfoData, OrgExtendedDetails, CloudStatus, FeatureLicenseSummary, LicenseSummary, ScanHistoryEntry } from './types';

// ============================================================================
// Cloud Detection (pure function — no network, heuristic based on feature licenses)
// ============================================================================

const CLOUD_DEFINITIONS: Array<{ name: string; key: string; keywords: string[] }> = [
  { name: 'Sales Cloud',        key: 'sales',        keywords: ['SalesUser', 'SalesCloud', 'Sales Cloud', 'Salesforce'] },
  { name: 'Service Cloud',      key: 'service',      keywords: ['ServiceCloud', 'Service Cloud', 'Service User', 'Service Agent'] },
  { name: 'Experience Cloud',   key: 'experience',   keywords: ['ExperienceCloud', 'Experience Cloud', 'Communities', 'PortalLicenses', 'Partner Community', 'Customer Community', 'Customer Portal', 'Partner', 'External Apps'] },
  { name: 'Revenue Cloud',      key: 'revenue',      keywords: ['RevenueCloud', 'Revenue Cloud', 'CPQ', 'Billing'] },
  { name: 'Field Service',      key: 'fieldservice', keywords: ['FieldService', 'Field Service', 'FieldServiceMobile'] },
  { name: 'Marketing Cloud',    key: 'marketing',    keywords: ['Marketing Cloud', 'MarketingCloud', 'PardotPermissionSet', 'Pardot', 'Account Engagement'] },
  { name: 'Data Cloud',         key: 'data',         keywords: ['DataCloud', 'Data Cloud', 'CustomerDataPlatform', 'CDP'] },
  { name: 'Industries (PSS)',   key: 'industries',   keywords: ['Industries', 'Omnistudio', 'Vlocity', 'IndustriesCloud', 'Public Sector'] },
  { name: 'Health Cloud',       key: 'health',       keywords: ['HealthCloud', 'Health Cloud'] },
  { name: 'Financial Services', key: 'financial',    keywords: ['FinancialServices', 'Financial Services Cloud', 'FinServ', 'FSC'] },
  { name: 'Einstein Analytics', key: 'einstein',     keywords: ['EinsteinAnalytics', 'Einstein Analytics', 'Analytics Cloud', 'CRM Analytics', 'Tableau CRM', 'Wave'] },
  { name: 'Agentforce',         key: 'agentforce',   keywords: ['Agentforce', 'AgentUser', 'Einstein Copilot', 'GenerativeAI', 'Einstein Bot'] },
];

/**
 * Heuristically detect enabled clouds from the org's licenses. There is no
 * Salesforce API that enumerates "clouds", so we match cloud keywords against
 * both feature-license names and user-license names (e.g. a `Salesforce` user
 * license implies Sales Cloud). A cloud is enabled when a matching license
 * exists with any allocation.
 */
function detectClouds(
  featureLicenses: FeatureLicenseSummary[],
  userLicenses: LicenseSummary[] = []
): CloudStatus[] {
  return CLOUD_DEFINITIONS.map(cloud => {
    const kws = cloud.keywords.map(k => k.toLowerCase());
    const featMatch = featureLicenses.find(fl =>
      kws.some(kw => fl.name.toLowerCase().includes(kw)) &&
      (fl.status === 'Active' || fl.totalLicenses > 0)
    );
    const userMatch = userLicenses.find(ul =>
      kws.some(kw => ul.name.toLowerCase().includes(kw)) && ul.totalLicenses > 0
    );
    return {
      name: cloud.name,
      key: cloud.key,
      enabled: !!featMatch || !!userMatch,
    };
  });
}

// ============================================================================
// Extension State
// ============================================================================

let currentResult: AnalysisResult | null = null;
let activeAnalysisCts: vscode.CancellationTokenSource | null = null;
/** Deterministic Future Readiness engine (shared with the AI service). */
let futureReadinessService: IFutureReadinessService;
const RESULT_STORAGE_KEY = 'sfHealthAnalyzer.lastResult';
/** Last Future Readiness scores, used for run-over-run readiness trend deltas. */
const READINESS_SNAPSHOT_KEY = 'sfHealthAnalyzer.futureReadinessSnapshot';
/** Ring buffer of recent run scores, used to render run-over-run trend deltas. */
const HISTORY_STORAGE_KEY = 'sfHealthAnalyzer.scoreHistory';
const HISTORY_MAX_POINTS = 10;
/** Per-org ring buffer of lightweight scan history entries (max 10 per org). */
const ORG_HISTORY_KEY = 'sfHealthAnalyzer.orgHistory';
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

  // Phase 4 — AI Service + Future Readiness engine (shared instance so the
  // deterministic assessment and the AI narrative use the same historical store).
  const readinessStore: IReadinessSnapshotStore = {
    load: () => context.globalState.get<FutureReadinessSnapshot>(READINESS_SNAPSHOT_KEY),
    save: (snapshot) => { void context.globalState.update(READINESS_SNAPSHOT_KEY, snapshot); },
  };
  futureReadinessService = FutureReadinessService.createDefault(readinessStore);
  initAIService(context, AssessmentContextService.createDefault(), futureReadinessService);

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
      const storedOrgHistory = context.globalState.get<Record<string, ScanHistoryEntry[]>>(ORG_HISTORY_KEY);
      if (storedOrgHistory) {
        panel.updateOrgHistory(storedOrgHistory);
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
    vscode.commands.registerCommand('sfHealthAnalyzer.runCtaReview', async (modelPreference?: string, force?: boolean) => {
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
      try {
        const review = await ai.synthesizeCtaReview(currentResult, modelPreference, !!force);
        if (review) {
          currentResult.ctaReview = review;
          panel.postMessage({ type: 'ctaReview', data: review });
          // Persist updated result with CTA review to both caches
          context.globalState.update(RESULT_STORAGE_KEY, currentResult);
          saveCacheToFile(currentResult);
        } else {
          // Should not normally happen — synthesize throws on failure now.
          panel.postMessage({ type: 'ctaReviewError', message: 'No review was generated. Try another model or configure an API key in Settings → sfHealthAnalyzer.ai.' });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Always unblock the webview spinner with a terminal error message (#11).
        panel.postMessage({ type: 'ctaReviewError', message: msg });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.runFutureReadiness', async (modelPreference?: string, force?: boolean) => {
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
      panel.postMessage({ type: 'futureReadinessLoading' });
      try {
        const report = await ai.synthesizeFutureReadiness(currentResult, modelPreference, !!force);
        if (report) {
          currentResult.futureReadiness = report;
          panel.postMessage({ type: 'futureReadiness', data: report });
          context.globalState.update(RESULT_STORAGE_KEY, currentResult);
          saveCacheToFile(currentResult);
        } else {
          panel.postMessage({ type: 'futureReadinessError', message: 'No narrative was generated. Try another model or configure an API key in Settings → sfHealthAnalyzer.ai.' });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        panel.postMessage({ type: 'futureReadinessError', message: msg });
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
        let capturedDataModelSummary: AnalysisResult['dataModelSummary'] | undefined;
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
        let capturedOrgExtended: OrgExtendedDetails | undefined;
        let capturedFeatureLicenses: FeatureLicenseSummary[] = [];

        try {
          const orgData = await sfService.connect();
          orgInfo = { alias: orgData.alias, id: orgData.id, username: orgData.username, instanceUrl: orgData.instanceUrl };
          logInfo(`Connected: ${orgData.username} (${orgData.alias ?? 'no alias'})`);

          // Fetch extended org details in parallel (non-blocking if any fail)
          try {
            const [orgEdition, featureLicenses, apps] = await Promise.all([
              sfService.getOrgExtendedDetails(),
              sfService.getFeatureLicenses(),
              sfService.getInstalledApps(),
            ]);
            capturedFeatureLicenses = featureLicenses;
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
            // Derive myDomain from instanceUrl
            let myDomain: string | undefined;
            try {
              const host = new URL(orgData.instanceUrl || '').hostname;
              myDomain = host.split('.')[0];
            } catch { /* ok */ }
            capturedOrgExtended = {
              createdDate: orgEdition.createdDate,
              timezone: orgEdition.timezone,
              language: orgEdition.language,
              currency: orgEdition.currency,
              defaultLocale: orgEdition.defaultLocale,
              division: orgEdition.division,
              primaryContact: orgEdition.primaryContact,
              phone: orgEdition.phone,
              fax: orgEdition.fax,
              address: orgEdition.address,
              fiscalYearStartMonth: orgEdition.fiscalYearStartMonth,
              namespacePrefix: orgEdition.namespacePrefix,
              monthlyPageViewsUsed: orgEdition.monthlyPageViewsUsed,
              monthlyPageViewsEntitlement: orgEdition.monthlyPageViewsEntitlement,
              isHyperforce: orgEdition.isHyperforce,
              isSandbox: orgEdition.isSandbox,
              buildVersion: 'releaseNumber' in trustData ? trustData.releaseNumber : undefined,
              dataCenter: instanceName,
              myDomain,
              loginUrl: orgData.instanceUrl || undefined,
              currentRelease: nextRelease?.name,
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

        // ─── Optional: delegate static Apex/LWC analysis to Salesforce Code
        // Analyzer. When active, it replaces the built-in Apex + LWC rule passes
        // to avoid double-counting; on any failure we fall back to the built-ins.
        let scaActive = false;
        const scaConfig = getCodeAnalyzerConfig();
        const scaWorkspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (scaConfig.enabled && scaWorkspacePath && await ensureCodeAnalyzer()) {
          dashPanel.postMessage({ type: 'analysisProgress', step: 1, label: 'Running Salesforce Code Analyzer…', total: 20 });
          progress.report({ message: 'Running Salesforce Code Analyzer…' });
          try {
            const scaIssues = await runCodeAnalyzer(scaWorkspacePath, scaConfig.ruleSelector, scaConfig.runGraphEngine);
            issues.push(...scaIssues);
            scaActive = true;
            logInfo(`Code Analyzer delegation active: ${scaIssues.length} issues (built-in Apex/LWC rules skipped)`);
          } catch (e) {
            failStep('Salesforce Code Analyzer', e);
          }
        }

        const vscConfig = vscode.workspace.getConfiguration('sfHealthAnalyzer');

        // Counter-based progress: analyzers below run concurrently, so fixed
        // step numbers no longer apply — advance the bar as each one settles.
        let scanStep = 1;
        const TOTAL_SCAN_STEPS = 20;
        const tick = (label: string) => {
          const step = Math.min(++scanStep, TOTAL_SCAN_STEPS - 1);
          dashPanel.postMessage({ type: 'analysisProgress', step, label, total: TOTAL_SCAN_STEPS });
          progress.report({ message: label });
        };

        // ─── Batch 1 — independent analyzers (run concurrently) ──────────────
        // Each isolates its failure via failStep and stashes issues in `bag`,
        // which is merged in a fixed order afterwards so output stays
        // deterministic regardless of which analyzer finishes first.
        const bag: Record<string, Issue[]> = {};
        let testCoverageSummary: AnalysisResult['testCoverageSummary'] | undefined;
        let governorRisks: AnalysisResult['governorRisks'];
        let limitsSimulatorData: AnalysisResult['limitsSimulatorData'];
        let lwcSummary: AnalysisResult['lwcSummary'];
        let analyzedLwcComponents = 0;
        let debtSummary: AnalysisResult['debtSummary'];
        let scaleCenterMetrics: AnalysisResult['scaleCenterMetrics'];
        let dependencyGraph: AnalysisResult['dependencyGraph'];

        await Promise.all([
          // Apex analysis (org source + local workspace)
          (async () => {
            const apexAnalyzer = !scaActive ? createApexAnalyzer() : null;
            if (!apexAnalyzer) { return; }
            try {
              const orgApexResult = await apexAnalyzer.analyzeFromOrg(apexClasses, apexTriggers);
              const out = [...orgApexResult.issues];
              try {
                const localApexResult = await apexAnalyzer.analyzeWorkspace();
                const orgPaths = new Set(orgApexResult.issues.map(i => i.file));
                for (const issue of localApexResult.issues) {
                  if (!issue.file || !orgPaths.has(issue.file)) { out.push(issue); analyzedFiles++; }
                }
              } catch (e) { failStep('Local Apex scan', e); }
              bag.apex = out;
            } catch (e) { failStep('Apex Analysis', e); }
            tick('Analyzing Apex…');
          })(),

          // SOQL query analysis
          (async () => {
            const queryAnalyzer = createQueryAnalyzer(sfService);
            if (!queryAnalyzer) { return; }
            try {
              const queryResult = await queryAnalyzer.analyzeWithOrgContext();
              bag.query = queryResult.issues;
            } catch (e) { failStep('Query Analysis', e); }
            tick('Analyzing SOQL queries…');
          })(),

          // Automation complexity
          (async () => {
            try {
              const automationAnalyzer = createAutomationAnalyzer(sfService);
              const automationResult = await automationAnalyzer.analyzeOrg();
              bag.automation = automationResult.issues;
              analyzedObjects = automationResult.summaries.length;
              const autoObjectMap: Record<string, { triggers: number; flows: number; validations: number; total: number }> = {};
              for (const s of automationResult.summaries) {
                autoObjectMap[s.objectName] = {
                  triggers: s.triggers || 0,
                  flows: s.flows || 0,
                  validations: s.validationRules || 0,
                  total: (s.triggers || 0) + (s.flows || 0) + (s.validationRules || 0),
                };
              }
              let workflowRules: Array<{ name: string; objectApiName: string }> = [];
              try { workflowRules = await sfService.getWorkflowRules(); } catch (e) { failStep('Workflow Rules', e); }
              const flowInventory = (automationResult.flowInventory || []).map(f => ({
                name: f.name, processType: f.processType, objectApiName: f.objectApiName ?? '', isActive: f.isActive,
              }));
              capturedAutomationSummary = {
                objectMap: autoObjectMap,
                totalFlows: automationResult.totalFlows,
                totalTriggers: automationResult.totalTriggers,
                totalValidationRules: automationResult.totalValidationRules,
                totalScreenFlows: automationResult.totalScreenFlows,
                totalScheduledFlows: automationResult.totalScheduledFlows,
                totalEventFlows: automationResult.totalEventFlows,
                totalProcessBuilders: automationResult.totalProcessBuilders,
                totalWorkflowRules: workflowRules.length,
                flowInventory,
                workflowInventory: workflowRules.map(w => ({ name: w.name, objectApiName: w.objectApiName })),
              };
              analyzedFlows = flowInventory.filter(f => f.processType !== 'Workflow').length;
            } catch (e) { failStep('Automation', e); }
            tick('Analyzing automation complexity…');
          })(),

          // Data model
          (async () => {
            const dataModelAnalyzer = createDataModelAnalyzer(sfService);
            if (!dataModelAnalyzer) { return; }
            try {
              const dataModelResult = await dataModelAnalyzer.analyze();
              bag.dataModel = dataModelResult.issues;
              capturedDataModelStats   = dataModelResult.objectFieldStats || [];
              capturedDataModelSummary = dataModelResult.dataModelSummary;
            } catch (e) { failStep('Data Model', e); }
            tick('Analyzing data model…');
          })(),

          // Test coverage
          (async () => {
            try {
              const coverageAnalyzer = createTestCoverageAnalyzer(sfService);
              const coverageResult = await coverageAnalyzer.analyze();
              bag.testCoverage = coverageResult.issues;
              testCoverageSummary = {
                averageCoverage: coverageResult.averageCoverage,
                totalClasses: coverageResult.totalClasses,
                classesBelow75: coverageResult.classesBelow75,
                zeroCoverageCount: coverageResult.zeroCoverageCount,
                classCoverageDetails: coverageResult.classCoverageDetails,
              };
            } catch (e) { failStep('Test Coverage', e); }
            tick('Fetching test coverage…');
          })(),

          // Permissions / security
          (async () => {
            try {
              const permResult = await createPermissionAnalyzer(sfService).analyze();
              bag.permission = permResult.issues;
            } catch (e) { failStep('Permissions', e); }
            tick('Analyzing permissions & security…');
          })(),

          // Integration
          (async () => {
            try {
              const integrationResult = await createIntegrationAnalyzer(sfService).analyze();
              bag.integration = integrationResult.issues;
            } catch (e) { failStep('Integration', e); }
            tick('Analyzing integrations…');
          })(),

          // Governor limits (synchronous scan, wrapped for isolation)
          (async () => {
            try {
              const govAnalyzer = createGovernorLimitsAnalyzer();
              const govResult = govAnalyzer.analyze(apexClasses, apexTriggers);
              bag.governor = govResult.issues;
              governorRisks = govResult.governorRisks;
              limitsSimulatorData = govResult.limitsSimulatorData;
            } catch (e) { failStep('Governor Limits', e); }
            tick('Scanning governor limit risks…');
          })(),

          // LWC quality
          (async () => {
            if (!vscConfig.get<boolean>('lwc.enabled', true)) { return; }
            try {
              const lwcAnalyzer = createLwcAnalyzer();
              if (lwcAnalyzer) {
                const lwcResult = await lwcAnalyzer.analyze();
                // When Code Analyzer is active it covers LWC/Aura (ESLint); skip
                // built-in LWC issues to avoid duplicate findings.
                if (!scaActive) { bag.lwc = lwcResult.issues; }
                lwcSummary = lwcResult.lwcSummary;
                analyzedLwcComponents = lwcSummary?.totalComponents ?? 0;
              }
            } catch (e) { failStep('LWC Quality', e); }
            tick('Analysing LWC components…');
          })(),

          // Technical debt
          (async () => {
            try {
              const debtHoursPerSprint = vscConfig.get<number>('debt.sprintHoursPerCycle', 16);
              const debtAnalyzer = createTechnicalDebtAnalyzer();
              debtAnalyzer.setSprintHours(debtHoursPerSprint ?? 16);
              const debtResult = await debtAnalyzer.analyze(apexClasses, apexTriggers);
              bag.technicalDebt = debtResult.issues;
              debtSummary = debtResult.debtSummary;
            } catch (e) { failStep('Technical Debt', e); }
            tick('Calculating technical debt…');
          })(),

          // Scale Center
          (async () => {
            if (!vscConfig.get<boolean>('scaleCenter.enabled', true)) { return; }
            try {
              const scaleResult = await createScaleCenterAnalyzer(sfService).analyze();
              bag.scale = scaleResult.issues;
              scaleCenterMetrics = scaleResult.scaleCenterMetrics;
            } catch (e) { failStep('Scale Center', e); }
            tick('Fetching Scale Center metrics…');
          })(),

          // Dependency graph
          (async () => {
            try {
              const depResult = await createDependencyAnalyzer(sfService).analyze(apexClasses, apexTriggers);
              bag.dependency = depResult.issues;
              dependencyGraph = depResult.dependencyGraph;
            } catch (e) { failStep('Dependencies', e); }
            tick('Building dependency graph…');
          })(),
        ]);

        // Merge batch-1 issues in a fixed analyzer order (deterministic output).
        for (const key of ['apex', 'query', 'automation', 'dataModel', 'testCoverage', 'permission', 'integration', 'governor', 'lwc', 'technicalDebt', 'scale', 'dependency']) {
          if (bag[key]) { issues.push(...bag[key]); }
        }

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Plugins (sequential — needs apexClasses, orgUsername) ───────────
        tick('Running plugins…');
        try {
          const pluginIssues = await pluginLoader.runAll({
            apexClasses,
            apexTriggers,
            orgUsername: orgInfo.username ?? '',
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          });
          issues.push(...pluginIssues);
        } catch (e) { failStep('Plugins', e); }

        // ─── Step 15: Calculate health scores ─────────────────────────────────
        tick('Calculating health scores…');

        if (capturedDataModelStats && capturedDataModelStats.length > 0) {
          analyzedObjects = capturedDataModelStats.length;
        }
        let scheduledJobs: Array<{ name: string; state: string; nextFireTime?: string }> = [];
        try { scheduledJobs = await sfService.getScheduledApexJobs(); } catch (e) { failStep('Scheduled Jobs', e); }
        const reBatch = /implements\s+[^;{]*Database\.Batchable/i;
        const reQueueable = /implements\s+[^;{]*Queueable/i;
        const reSchedulable = /implements\s+[^;{]*Schedulable/i;
        let batchClasses = 0, queueableClasses = 0, schedulableClasses = 0, apexCodeChars = 0;
        for (const c of apexClasses) {
          const body = c.Body || '';
          if (reBatch.test(body)) { batchClasses++; }
          if (reQueueable.test(body)) { queueableClasses++; }
          if (reSchedulable.test(body)) { schedulableClasses++; }
          apexCodeChars += c.LengthWithoutComments ?? body.length;
        }
        for (const t of apexTriggers) { apexCodeChars += (t.Body || '').length; }
        const codeInventory = {
          apexClasses: analyzedClasses,
          apexTriggers: analyzedTriggers,
          batchClasses, queueableClasses, schedulableClasses,
          scheduledJobs: scheduledJobs.length,
          apexCodeChars, apexCodeCharLimit: 6000000,
        };

        currentResult = healthScoreCalculator.createAnalysisResult(
          issues,
          {
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            orgAlias: orgInfo.alias,
            orgId: orgInfo.id,
            orgUsername: orgInfo.username,
            analyzedFiles, analyzedObjects, analyzedClasses, analyzedTriggers, analyzedFlows, analyzedLwcComponents,
          },
          startTime
        );

        if (governorRisks)       { currentResult.governorRisks       = governorRisks; }
        if (limitsSimulatorData) { currentResult.limitsSimulatorData = limitsSimulatorData; }
        if (lwcSummary)          { currentResult.lwcSummary          = lwcSummary; }
        if (debtSummary)         { currentResult.debtSummary         = debtSummary; }
        if (scaleCenterMetrics)  { currentResult.scaleCenterMetrics  = scaleCenterMetrics; }
        if (dependencyGraph)     { currentResult.dependencyGraph     = dependencyGraph; }
        if (capturedDataModelStats && capturedDataModelStats.length > 0) { currentResult.dataModelStats = capturedDataModelStats; }
        if (capturedDataModelSummary) { currentResult.dataModelSummary = capturedDataModelSummary; }
        if (capturedAutomationSummary) { currentResult.automationSummary = capturedAutomationSummary; }
        if (testCoverageSummary) { currentResult.testCoverageSummary = testCoverageSummary; }
        currentResult.codeInventory = codeInventory;

        if (token.isCancellationRequested || (activeAnalysisCts && activeAnalysisCts.token.isCancellationRequested)) { return; }

        // ─── Batch 2 — analyzers that read/write the assembled result ──────────
        // Mutually independent; run concurrently. Each writes distinct result fields.
        const bag2: Record<string, Issue[]> = {};
        let userSummary: UserGovernanceSummary | undefined;
        let profileSummary: ProfileSecuritySummary | undefined;
        let staleMetadata: StaleMetadataSummary | undefined;
        let orgInventory: OrgInventorySummary | undefined;
        let analyzedUsers = 0;
        let analyzedProfiles = 0;

        await Promise.all([
          // User Governance
          (async () => {
            if (!vscConfig.get<boolean>('userGovernance.enabled', true)) { return; }
            try {
              const ugResult = await createUserGovernanceAnalyzer(sfService).analyze();
              bag2.userGovernance = ugResult.issues;
              userSummary = ugResult.userSummary;
              analyzedUsers = userSummary.totalActiveUsers;
              currentResult.userSummary = userSummary;
            } catch (e) { failStep('User Governance', e); }
            tick('Analysing user governance…');
          })(),

          // Profile Security
          (async () => {
            if (!vscConfig.get<boolean>('profileSecurity.enabled', true)) { return; }
            try {
              const psResult = await createProfileSecurityAnalyzer(sfService).analyze();
              bag2.profileSecurity = psResult.issues;
              profileSummary = psResult.profileSummary;
              analyzedProfiles = profileSummary.totalProfiles;
              try {
                const userCounts = await sfService.getProfileUserCounts();
                const countMap = new Map(userCounts.map(u => [u.ProfileId, u.userCount]));
                for (const p of profileSummary.profileList) { p._userCount = countMap.get(p.Id) ?? 0; }
              } catch { /* non-critical — column will show "—" */ }
              try {
                const [psgList, assignCounts] = await Promise.all([
                  sfService.getPermissionSetGroups(),
                  sfService.getPermissionSetAssignmentCounts(),
                ]);
                for (const ps of profileSummary.permissionSetList ?? []) { ps._userCount = assignCounts.bySet.get(ps.Id) ?? 0; }
                profileSummary.permissionSetGroupList = psgList.map(g => ({ ...g, _userCount: assignCounts.byGroup.get(g.Id) ?? 0 }));
              } catch { /* non-critical — tables will show "—" / be empty */ }
              currentResult.profileSummary = profileSummary;
            } catch (e) { failStep('Profile Security', e); }
            tick('Analysing profile security…');
          })(),

          // Stale Metadata
          (async () => {
            if (!vscConfig.get<boolean>('staleMetadata.enabled', true)) { return; }
            try {
              const smResult = await createStaleMetadataAnalyzer(sfService).analyze();
              bag2.staleMetadata = smResult.issues;
              staleMetadata = smResult.staleMetadata;
              currentResult.staleMetadata = staleMetadata;
            } catch (e) { failStep('Stale Metadata', e); }
            tick('Scanning for stale metadata…');
          })(),

          // Org Inventory
          (async () => {
            if (!vscConfig.get<boolean>('orgInventory.enabled', true)) { return; }
            try {
              const invResult = await createOrgInventoryAnalyzer(sfService).analyze(analyzedClasses, analyzedTriggers, analyzedFlows);
              bag2.orgInventory = invResult.issues;
              orgInventory = invResult.orgInventory;
              currentResult.orgInventory = orgInventory;
            } catch (e) { failStep('Org Inventory', e); }
            tick('Building org inventory…');
          })(),
        ]);

        // Merge batch-2 issues in a fixed order.
        for (const key of ['userGovernance', 'profileSecurity', 'staleMetadata', 'orgInventory']) {
          if (bag2[key]) { issues.push(...bag2[key]); }
        }

        if (orgDetails) { currentResult.orgDetails = orgDetails; }

        // ─── CTA Architecture (needs the fully-assembled result) ──────────────
        tick('Running CTA architecture checks…');
        if (vscConfig.get<boolean>('ctaArchitecture.enabled', true)) {
          try {
            const ctaAnalyzer = createCtaArchitectureAnalyzer(sfService);
            const queryExplainEnabled = vscConfig.get<boolean>('queryExplain.enabled', true);
            const ctaResult = await ctaAnalyzer.analyze(currentResult, queryExplainEnabled, apexClasses, apexTriggers);
            issues.push(...ctaResult.issues);
            currentResult.licenseSummary      = ctaResult.licenseSummary;
            currentResult.queryExplainResults = ctaResult.queryExplainResults;
            currentResult.objectRecordCounts  = ctaResult.objectRecordCounts;
            currentResult.entryPoints         = ctaResult.entryPoints;
          } catch (e) { failStep('CTA Architecture', e); }
        }

        // ─── Live governor-limit utilisation ────────────────────────────────
        try {
          const orgLimits = await sfService.getOrgLimits();
          if (orgLimits.length > 0) { currentResult.orgLimits = orgLimits; }
        } catch (e) { failStep('Org Limits', e); }

        // ─── Org Info Extended Data (best-effort, non-blocking) ─────────────
        try {
          const [envSummary, integSummary, quickCounts, appTypeSummary] = await Promise.allSettled([
            sfService.getEnvironmentsSummary(),
            sfService.getIntegrationsSummary(),
            sfService.getQuickFactsCounts(),
            sfService.getAppTypeSummary(orgDetails?.apps ?? []),
          ]);

          // Detect clouds from feature licenses (pure function — no network)
          const clouds: CloudStatus[] = detectClouds(capturedFeatureLicenses, currentResult.licenseSummary ?? []);

          // Classify packages by type
          const packagesByType = sfService.classifyPackages(orgInventory?.installedPackages ?? []);

          // Storage from already-fetched orgLimits
          const storageLimitEntry = currentResult.orgLimits?.find(l => l.name === 'DataStorageMB');
          const extWithStorage: OrgExtendedDetails | undefined = capturedOrgExtended
            ? {
                ...capturedOrgExtended,
                storageUsedMB: storageLimitEntry?.used,
                storageLimitMB: storageLimitEntry?.max,
                storageUsedPct: storageLimitEntry?.usedPct,
              }
            : undefined;

          const qc = quickCounts.status === 'fulfilled' ? quickCounts.value : null;
          const licenses: LicenseSummary[] = currentResult.licenseSummary ?? [];

          currentResult.orgInfoData = {
            extended: extWithStorage,
            clouds,
            packagesByType,
            appsByType: appTypeSummary.status === 'fulfilled' ? appTypeSummary.value : undefined,
            environments: envSummary.status === 'fulfilled' ? envSummary.value : undefined,
            integrations: integSummary.status === 'fulfilled' ? integSummary.value : undefined,
            quickFacts: {
              // Prefer the dedicated all-namespace counts; fall back to inventory; null ⇒ N/A.
              customObjects: qc?.customObjects ?? (orgInventory?.customObjectCount || null),
              users: currentResult.userSummary?.totalActiveUsers ?? 0,
              roles: qc?.roles ?? 0,
              profiles: orgInventory?.profileCount ?? 0,
              permissionSets: orgInventory?.permissionSetCount ?? 0,
              permissionSetGroups: qc?.permissionSetGroups ?? 0,
              publicGroups: qc?.publicGroups ?? 0,
              queues: qc?.queues ?? 0,
              flows: qc?.flows ?? (orgInventory?.flowCount || currentResult.automationSummary?.totalFlows || null),
              apexClasses: orgInventory?.apexClassCount ?? 0,
              triggers: orgInventory?.apexTriggerCount ?? 0,
              lwcComponents: currentResult.lwcSummary?.totalComponents ?? 0,
            },
            activeUsers: currentResult.userSummary?.totalActiveUsers ?? 0,
            activeLicenses: licenses.reduce((s, l) => s + l.usedLicenses, 0),
            totalLicenses: licenses.reduce((s, l) => s + l.totalLicenses, 0),
          };
        } catch (e) { failStep('Org Info Extended', e); }

        // Update metadata with new counts
        if (currentResult.metadata) {
          currentResult.metadata.analyzedUsers    = analyzedUsers;
          currentResult.metadata.analyzedProfiles = analyzedProfiles;
          currentResult.metadata.installedPackages = orgInventory?.installedPackages?.length ?? 0;
          if (stepWarnings.length > 0) { currentResult.metadata.warnings = stepWarnings; }
        }

        // Recompute summary now that all batches added issues.
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

        // ─── Future Readiness (deterministic; AI narrative added on demand) ──
        tick('Assessing future readiness…');
        try {
          const edition = currentResult.orgDetails?.orgType ?? 'unknown';
          const collectors = await collectReadinessData(sfService, edition);
          currentResult.futureReadiness = futureReadinessService.assess({ result: currentResult, collectors });
        } catch (e) { failStep('Future Readiness', e); }

        // Persist result for restore on reload
        context.globalState.update(RESULT_STORAGE_KEY, currentResult);

        // Save to project file cache (.orgpulse/cache.json)
        saveCacheToFile(currentResult);

        // ─── Per-org scan history (lightweight, max 10 per org) ─────────────
        const orgId = currentResult.orgDetails?.orgId ?? currentResult.metadata?.orgId ?? 'unknown';
        const orgName = currentResult.orgDetails?.orgName ?? 'Unknown Org';
        const scanEntry: ScanHistoryEntry = {
          timestamp: currentResult.timestamp instanceof Date
            ? currentResult.timestamp.toISOString()
            : new Date().toISOString(),
          orgId,
          orgName,
          scores: currentResult.scores,
          issueSummary: {
            total: currentResult.issues.length,
            error: currentResult.issues.filter(i => i.severity === 'error').length,
            warning: currentResult.issues.filter(i => i.severity === 'warning').length,
            info: currentResult.issues.filter(i => i.severity === 'info').length,
          },
          duration: Date.now() - startTime.getTime(),
        };
        const allOrgHistory = context.globalState.get<Record<string, ScanHistoryEntry[]>>(ORG_HISTORY_KEY) ?? {};
        allOrgHistory[orgId] = [...(allOrgHistory[orgId] ?? []), scanEntry].slice(-10);
        context.globalState.update(ORG_HISTORY_KEY, allOrgHistory);

        // Update tree view
        healthResultsProvider.setResults(currentResult);
        vscode.commands.executeCommand('setContext', 'sfHealthAnalyzer.hasResults', true);

        // Show/update dashboard
        const panel = getDashboardPanel(context.extensionUri);
        panel.updateResults(currentResult);
        panel.updateOrgHistory(allOrgHistory);

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
