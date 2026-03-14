/**
 * Salesforce Org Health Analyzer - VS Code Extension
 * 
 * Analyzes Salesforce org health including Apex code quality, automation complexity,
 * data model health, and query performance.
 */

import * as vscode from 'vscode';

// Services
import { getSalesforceService, ensureSfCli } from './services/salesforceService';

// Analyzers
import { createApexAnalyzer } from './analyzers/apexAnalyzer';
import { createAutomationAnalyzer } from './analyzers/automationAnalyzer';
import { createQueryAnalyzer } from './analyzers/queryAnalyzer';
import { createDataModelAnalyzer } from './analyzers/dataModelAnalyzer';

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
  logAnalysisStart, 
  logAnalysisComplete,
  showOutput,
  getOutputChannel 
} from './utils/logger';
import { getConfig, onConfigChange } from './utils/config';
import { getErrorMessage, isAuthError } from './utils/errors';

// Types
import { AnalysisResult, Issue } from './types';

// ============================================================================
// Extension State
// ============================================================================

let currentResult: AnalysisResult | null = null;

// ============================================================================
// Extension Activation
// ============================================================================

export function activate(context: vscode.ExtensionContext) {
  // Initialize logger
  initializeLogger(context);
  logInfo('Salesforce Org Health Analyzer is activating...');

  // Register built-in rules
  registerBuiltInRules();

  // Register tree view provider
  const treeView = vscode.window.createTreeView('sfHealthAnalyzer.results', {
    treeDataProvider: healthResultsProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Set context for tree view visibility
  vscode.commands.executeCommand('setContext', 'sfHealthAnalyzer.hasResults', false);

  // Register commands
  registerCommands(context);

  // Register configuration change listener
  context.subscriptions.push(
    onConfigChange(() => {
      logInfo('Configuration changed');
    })
  );

  // Register diagnostics collection
  const diagnostics = vscode.languages.createDiagnosticCollection('sfHealthAnalyzer');
  context.subscriptions.push(diagnostics);

  logInfo('Salesforce Org Health Analyzer activated');
}

// ============================================================================
// Command Registration
// ============================================================================

function registerCommands(context: vscode.ExtensionContext): void {
  // Main analysis command
  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.analyzeOrg', async () => {
      await runFullAnalysis(context);
    })
  );

  // Analyze current file
  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.analyzeCurrentFile', async () => {
      await analyzeCurrentFile(context);
    })
  );

  // Open dashboard
  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.openDashboard', () => {
      const panel = getDashboardPanel(context.extensionUri);
      if (currentResult) {
        panel.updateResults(currentResult);
      }
    })
  );

  // Export report
  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.exportReport', async () => {
      await exportReport();
    })
  );

  // Refresh results
  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.refreshResults', async () => {
      await runFullAnalysis(context);
    })
  );

  // Open issue location
  context.subscriptions.push(
    vscode.commands.registerCommand('sfHealthAnalyzer.openIssueLocation', async (issue: Issue) => {
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
    })
  );
}

// ============================================================================
// Analysis Functions
// ============================================================================

async function runFullAnalysis(context: vscode.ExtensionContext): Promise<void> {
  const startTime = new Date();
  
  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing Salesforce Org Health',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        logAnalysisStart();
        showOutput();

        const issues: Issue[] = [];
        let analyzedFiles = 0;
        let analyzedObjects = 0;
        let orgInfo: { alias?: string; id?: string } = {};

        // Reset rule engine
        ruleEngine.reset();

        // Step 1: Analyze local Apex files
        progress.report({ message: 'Analyzing Apex code...', increment: 10 });
        
        const apexAnalyzer = createApexAnalyzer();
        if (apexAnalyzer) {
          const apexResult = await apexAnalyzer.analyzeWorkspace();
          issues.push(...apexResult.issues);
          analyzedFiles += apexResult.filesAnalyzed;
        }

        if (token.isCancellationRequested) {
          return;
        }

        // Step 2: Analyze SOQL queries
        progress.report({ message: 'Analyzing SOQL queries...', increment: 20 });
        
        const queryAnalyzer = createQueryAnalyzer();
        if (queryAnalyzer) {
          const queryResult = await queryAnalyzer.analyzeWorkspace();
          issues.push(...queryResult.issues);
        }

        if (token.isCancellationRequested) {
          return;
        }

        // Step 3: Analyze org metadata if enabled
        const config = getConfig();
        if (config.analysis.includeOrgMetadata) {
          progress.report({ message: 'Connecting to Salesforce org...', increment: 10 });
          
          const hasCli = await ensureSfCli();
          if (hasCli) {
            try {
              const sfService = getSalesforceService();
              const orgData = await sfService.connect();
              orgInfo = { alias: orgData.alias, id: orgData.id };

              // Analyze automation
              progress.report({ message: 'Analyzing automation...', increment: 20 });
              const automationAnalyzer = createAutomationAnalyzer(sfService);
              const automationResult = await automationAnalyzer.analyzeOrg();
              issues.push(...automationResult.issues);
              analyzedObjects += automationResult.summaries.length;

              // Analyze data model
              progress.report({ message: 'Analyzing data model...', increment: 20 });
              const dataModelAnalyzer = createDataModelAnalyzer(sfService);
              if (dataModelAnalyzer) {
                const dataModelResult = await dataModelAnalyzer.analyze();
                issues.push(...dataModelResult.issues);
              }
            } catch (error) {
              if (isAuthError(error)) {
                vscode.window.showWarningMessage(
                  'Could not connect to Salesforce org. Analyzing local files only.'
                );
              } else {
                logError('Org analysis failed', error as Error);
              }
            }
          }
        } else {
          // Local-only automation analysis
          progress.report({ message: 'Analyzing local metadata...', increment: 30 });
          const automationAnalyzer = createAutomationAnalyzer();
          const automationResult = await automationAnalyzer.analyzeWorkspace();
          issues.push(...automationResult.issues);

          const dataModelAnalyzer = createDataModelAnalyzer();
          if (dataModelAnalyzer) {
            const dataModelResult = await dataModelAnalyzer.analyzeLocal();
            issues.push(...dataModelResult.issues);
          }
        }

        // Step 4: Calculate health scores
        progress.report({ message: 'Calculating health scores...', increment: 10 });
        
        currentResult = healthScoreCalculator.createAnalysisResult(
          issues,
          {
            workspacePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            orgAlias: orgInfo.alias,
            orgId: orgInfo.id,
            analyzedFiles,
            analyzedObjects,
          },
          startTime
        );

        // Step 5: Display results
        progress.report({ message: 'Generating report...', increment: 10 });
        
        // Update tree view
        healthResultsProvider.setResults(currentResult);
        vscode.commands.executeCommand('setContext', 'sfHealthAnalyzer.hasResults', true);

        // Show dashboard
        const panel = getDashboardPanel(context.extensionUri);
        panel.updateResults(currentResult);

        // Log summary
        const duration = new Date().getTime() - startTime.getTime();
        logAnalysisComplete(duration, issues.length);

        // Show output
        getOutputChannel().appendLine('');
        getOutputChannel().appendLine(healthScoreCalculator.formatScores(currentResult.scores));

        // Show notification
        const grade = healthScoreCalculator.getGrade(currentResult.scores.overall);
        vscode.window.showInformationMessage(
          `Analysis complete! Overall Health: ${currentResult.scores.overall}/100 (${grade.grade})`
        );

      } catch (error) {
        logError('Analysis failed', error as Error);
        vscode.window.showErrorMessage(`Analysis failed: ${getErrorMessage(error)}`);
      }
    }
  );
}

async function analyzeCurrentFile(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  
  if (!editor) {
    vscode.window.showWarningMessage('No file is currently open');
    return;
  }

  const document = editor.document;
  const fileName = document.fileName;

  // Check if it's an Apex file
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

    // Show issues as diagnostics
    const diagnostics = vscode.languages.createDiagnosticCollection('sfHealthAnalyzer');
    const diagnosticItems = issues.map(issue => {
      const range = new vscode.Range(
        (issue.line || 1) - 1,
        (issue.column || 1) - 1,
        (issue.endLine || issue.line || 1) - 1,
        (issue.endColumn || issue.column || 1) + 50
      );

      const severity = issue.severity === 'error'
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
      vscode.window.showInformationMessage(`Found ${issues.length} issue(s)`);
    }

  } catch (error) {
    vscode.window.showErrorMessage(`Analysis failed: ${getErrorMessage(error)}`);
  }
}

async function exportReport(): Promise<void> {
  if (!currentResult) {
    vscode.window.showWarningMessage('No analysis results to export. Run an analysis first.');
    return;
  }

  const format = await vscode.window.showQuickPick(
    [
      { label: 'HTML Report', value: 'html', description: 'Interactive HTML report' },
      { label: 'JSON', value: 'json', description: 'Raw JSON data' },
      { label: 'Text', value: 'text', description: 'Plain text report' },
    ],
    { placeHolder: 'Select export format' }
  );

  if (!format) {
    return;
  }

  let content: string;
  let defaultName: string;
  let filters: Record<string, string[]>;

  switch (format.value) {
    case 'html':
      content = reportGenerator.generateHtmlReport(currentResult);
      defaultName = 'org-health-report.html';
      filters = { 'HTML': ['html'] };
      break;
    case 'json':
      content = reportGenerator.generateJsonReport(currentResult);
      defaultName = 'org-health-report.json';
      filters = { 'JSON': ['json'] };
      break;
    default:
      content = reportGenerator.generateTextReport(currentResult);
      defaultName = 'org-health-report.txt';
      filters = { 'Text': ['txt'] };
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
        vscode.workspace.openTextDocument(uri).then(doc => {
          vscode.window.showTextDocument(doc);
        });
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
