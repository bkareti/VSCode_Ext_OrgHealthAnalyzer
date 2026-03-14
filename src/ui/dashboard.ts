/**
 * Health Dashboard - Webview panel for displaying analysis results
 */

import * as vscode from 'vscode';
import { AnalysisResult, Issue, DashboardMessage } from '../types';
import { reportGenerator } from '../reports/reportGenerator';
import { healthScoreCalculator } from '../reports/healthScore';

// ============================================================================
// Dashboard Panel
// ============================================================================

export class HealthDashboardPanel {
  public static currentPanel: HealthDashboardPanel | undefined;
  private static readonly viewType = 'sfHealthAnalyzer.dashboard';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];
  private currentResult: AnalysisResult | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    // Set initial content
    this.panel.webview.html = this.getHtmlContent();

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      async (message: DashboardMessage) => {
        await this.handleMessage(message);
      },
      null,
      this.disposables
    );

    // Handle panel disposal
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  /**
   * Create or show the dashboard panel
   */
  public static createOrShow(extensionUri: vscode.Uri): HealthDashboardPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (HealthDashboardPanel.currentPanel) {
      HealthDashboardPanel.currentPanel.panel.reveal(column);
      return HealthDashboardPanel.currentPanel;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      HealthDashboardPanel.viewType,
      'Salesforce Org Health',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'dist'),
        ],
      }
    );

    HealthDashboardPanel.currentPanel = new HealthDashboardPanel(panel, extensionUri);
    return HealthDashboardPanel.currentPanel;
  }

  /**
   * Update the dashboard with analysis results
   */
  public updateResults(result: AnalysisResult): void {
    this.currentResult = result;
    this.panel.webview.postMessage({
      type: 'analysisResults',
      data: result,
    });
  }

  /**
   * Show loading state
   */
  public showLoading(): void {
    this.panel.webview.postMessage({
      type: 'loading',
      data: true,
    });
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: DashboardMessage): Promise<void> {
    switch (message.command) {
      case 'runAnalysis':
        await vscode.commands.executeCommand('sfHealthAnalyzer.analyzeOrg');
        break;

      case 'openFile':
        const data = message.data as { file: string; line?: number };
        await this.openFile(data.file, data.line);
        break;

      case 'exportReport':
        const format = (message.data as { format: string }).format;
        await this.exportReport(format);
        break;

      case 'refresh':
        await vscode.commands.executeCommand('sfHealthAnalyzer.analyzeOrg');
        break;
    }
  }

  /**
   * Open a file at a specific line
   */
  private async openFile(filePath: string, line?: number): Promise<void> {
    try {
      // Handle org:// paths
      if (filePath.startsWith('org://')) {
        vscode.window.showInformationMessage(
          `This file is from the org: ${filePath.replace('org://', '')}`
        );
        return;
      }

      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      if (line) {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
    }
  }

  /**
   * Export the current report
   */
  private async exportReport(format: string): Promise<void> {
    if (!this.currentResult) {
      vscode.window.showWarningMessage('No analysis results to export');
      return;
    }

    let content: string;
    let defaultName: string;
    let filters: Record<string, string[]>;

    switch (format) {
      case 'html':
        content = reportGenerator.generateHtmlReport(this.currentResult);
        defaultName = 'org-health-report.html';
        filters = { 'HTML': ['html'] };
        break;
      case 'json':
        content = reportGenerator.generateJsonReport(this.currentResult);
        defaultName = 'org-health-report.json';
        filters = { 'JSON': ['json'] };
        break;
      case 'text':
      default:
        content = reportGenerator.generateTextReport(this.currentResult);
        defaultName = 'org-health-report.txt';
        filters = { 'Text': ['txt'] };
        break;
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultName),
      filters,
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      vscode.window.showInformationMessage(`Report saved to ${uri.fsPath}`);
    }
  }

  /**
   * Get HTML content for the webview
   */
  private getHtmlContent(): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Salesforce Org Health</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --accent: var(--vscode-textLink-foreground);
      --error: var(--vscode-errorForeground, #f14c4c);
      --warning: var(--vscode-editorWarning-foreground, #cca700);
      --info: var(--vscode-editorInfo-foreground, #3794ff);
      --button-bg: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --button-hover: var(--vscode-button-hoverBackground);
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border);
      --border: var(--vscode-panel-border);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--vscode-font-family);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 20px;
      line-height: 1.5;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    
    .header h1 {
      font-size: 24px;
      font-weight: 600;
    }
    
    .header-actions {
      display: flex;
      gap: 8px;
    }
    
    button {
      background: var(--button-bg);
      color: var(--button-fg);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    button:hover {
      background: var(--button-hover);
    }
    
    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-primary);
    }
    
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
      gap: 16px;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }
    
    .empty-state h2 {
      margin-bottom: 12px;
      color: var(--text-primary);
    }
    
    .empty-state button {
      margin-top: 20px;
    }
    
    .scores-section {
      margin-bottom: 32px;
    }
    
    .scores-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }
    
    .score-card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    
    .score-card.overall {
      grid-column: span 2;
    }
    
    .score-value {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .score-label {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .score-grade {
      font-size: 14px;
      margin-top: 8px;
      font-weight: 500;
    }
    
    .summary-section {
      margin-bottom: 32px;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    
    .summary-card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .summary-icon {
      font-size: 24px;
    }
    
    .summary-content {
      flex: 1;
    }
    
    .summary-value {
      font-size: 24px;
      font-weight: 600;
    }
    
    .summary-label {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    
    h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: var(--accent);
    }
    
    .issues-section {
      margin-bottom: 32px;
    }
    
    .issues-filters {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .issues-filters select {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 13px;
    }
    
    .issues-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .issue-item {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 12px 16px;
      border-left: 4px solid;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .issue-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    
    .issue-item.error { border-color: var(--error); }
    .issue-item.warning { border-color: var(--warning); }
    .issue-item.info { border-color: var(--info); }
    
    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    
    .issue-severity {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    .issue-severity.error { background: var(--error); color: white; }
    .issue-severity.warning { background: var(--warning); color: black; }
    .issue-severity.info { background: var(--info); color: white; }
    
    .issue-location {
      font-size: 12px;
      color: var(--text-secondary);
    }
    
    .issue-message {
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .issue-description {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .issue-suggestion {
      font-size: 12px;
      margin-top: 8px;
      padding: 8px;
      background: rgba(55, 148, 255, 0.1);
      border-radius: 4px;
    }
    
    .category-badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    
    .no-issues {
      text-align: center;
      padding: 40px;
      color: var(--text-secondary);
    }
    
    .color-excellent { color: #22c55e; }
    .color-good { color: #84cc16; }
    .color-fair { color: #eab308; }
    .color-poor { color: #f97316; }
    .color-critical { color: #ef4444; }
  </style>
</head>
<body>
  <div id="app">
    <div class="header">
      <h1>🏥 Salesforce Org Health</h1>
      <div class="header-actions">
        <button onclick="exportReport('html')" class="secondary">📄 Export HTML</button>
        <button onclick="exportReport('json')" class="secondary">📋 Export JSON</button>
        <button onclick="runAnalysis()">🔍 Run Analysis</button>
      </div>
    </div>
    
    <div id="content">
      <div class="empty-state">
        <h2>No Analysis Results</h2>
        <p>Run an analysis to see your org's health score and issues.</p>
        <button onclick="runAnalysis()">🔍 Run Analysis</button>
      </div>
    </div>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    let currentResults = null;
    let filters = { category: 'all', severity: 'all' };
    
    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.type) {
        case 'analysisResults':
          currentResults = message.data;
          renderResults(message.data);
          break;
        case 'loading':
          if (message.data) {
            showLoading();
          }
          break;
      }
    });
    
    function showLoading() {
      document.getElementById('content').innerHTML = \`
        <div class="loading">
          <div class="spinner"></div>
          <p>Analyzing your Salesforce org...</p>
        </div>
      \`;
    }
    
    function renderResults(results) {
      const content = document.getElementById('content');
      
      if (!results || results.issues.length === 0) {
        content.innerHTML = \`
          <div class="scores-section">
            \${renderScores(results.scores)}
          </div>
          <div class="no-issues">
            <h2>🎉 Great job!</h2>
            <p>No issues found in your org.</p>
          </div>
        \`;
        return;
      }
      
      content.innerHTML = \`
        <div class="scores-section">
          <h2>Health Scores</h2>
          \${renderScores(results.scores)}
        </div>
        
        <div class="summary-section">
          <h2>Summary</h2>
          \${renderSummary(results.summary)}
        </div>
        
        <div class="issues-section">
          <h2>Issues (\${results.issues.length})</h2>
          \${renderFilters()}
          <div id="issues-list" class="issues-list">
            \${renderIssues(results.issues)}
          </div>
        </div>
      \`;
    }
    
    function renderScores(scores) {
      return \`
        <div class="scores-grid">
          <div class="score-card overall">
            <div class="score-value \${getScoreColorClass(scores.overall)}">\${scores.overall}</div>
            <div class="score-label">Overall Score</div>
            <div class="score-grade">\${getGrade(scores.overall)}</div>
          </div>
          <div class="score-card">
            <div class="score-value \${getScoreColorClass(scores.codeQuality)}">\${scores.codeQuality}</div>
            <div class="score-label">Code Quality</div>
          </div>
          <div class="score-card">
            <div class="score-value \${getScoreColorClass(scores.automationDesign)}">\${scores.automationDesign}</div>
            <div class="score-label">Automation Design</div>
          </div>
          <div class="score-card">
            <div class="score-value \${getScoreColorClass(scores.dataModel)}">\${scores.dataModel}</div>
            <div class="score-label">Data Model</div>
          </div>
          <div class="score-card">
            <div class="score-value \${getScoreColorClass(scores.performance)}">\${scores.performance}</div>
            <div class="score-label">Performance</div>
          </div>
        </div>
      \`;
    }
    
    function renderSummary(summary) {
      return \`
        <div class="summary-grid">
          <div class="summary-card">
            <span class="summary-icon">❌</span>
            <div class="summary-content">
              <div class="summary-value">\${summary.errorCount}</div>
              <div class="summary-label">Errors</div>
            </div>
          </div>
          <div class="summary-card">
            <span class="summary-icon">⚠️</span>
            <div class="summary-content">
              <div class="summary-value">\${summary.warningCount}</div>
              <div class="summary-label">Warnings</div>
            </div>
          </div>
          <div class="summary-card">
            <span class="summary-icon">ℹ️</span>
            <div class="summary-content">
              <div class="summary-value">\${summary.infoCount}</div>
              <div class="summary-label">Info</div>
            </div>
          </div>
        </div>
      \`;
    }
    
    function renderFilters() {
      return \`
        <div class="issues-filters">
          <select id="category-filter" onchange="applyFilters()">
            <option value="all">All Categories</option>
            <option value="code-quality">Code Quality</option>
            <option value="automation-design">Automation Design</option>
            <option value="data-model">Data Model</option>
            <option value="performance">Performance</option>
          </select>
          <select id="severity-filter" onchange="applyFilters()">
            <option value="all">All Severities</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
          </select>
        </div>
      \`;
    }
    
    function renderIssues(issues) {
      if (issues.length === 0) {
        return '<div class="no-issues">No issues match the current filters.</div>';
      }
      
      return issues.map(issue => \`
        <div class="issue-item \${issue.severity}" onclick="openFile('\${escapeHtml(issue.file || '')}', \${issue.line || 0})">
          <div class="issue-header">
            <span class="issue-severity \${issue.severity}">\${issue.severity}</span>
            <span class="category-badge">\${formatCategory(issue.category)}</span>
          </div>
          <div class="issue-message">\${escapeHtml(issue.message)}</div>
          \${issue.file ? \`<div class="issue-location">📁 \${formatPath(issue.file)}\${issue.line ? ':' + issue.line : ''}</div>\` : ''}
          \${issue.description ? \`<div class="issue-description">\${escapeHtml(issue.description)}</div>\` : ''}
          \${issue.suggestion ? \`<div class="issue-suggestion">💡 \${escapeHtml(issue.suggestion)}</div>\` : ''}
        </div>
      \`).join('');
    }
    
    function applyFilters() {
      const categoryFilter = document.getElementById('category-filter').value;
      const severityFilter = document.getElementById('severity-filter').value;
      
      filters = { category: categoryFilter, severity: severityFilter };
      
      if (currentResults) {
        let filtered = currentResults.issues;
        
        if (categoryFilter !== 'all') {
          filtered = filtered.filter(i => i.category === categoryFilter);
        }
        
        if (severityFilter !== 'all') {
          filtered = filtered.filter(i => i.severity === severityFilter);
        }
        
        document.getElementById('issues-list').innerHTML = renderIssues(filtered);
      }
    }
    
    function getScoreColorClass(score) {
      if (score >= 90) return 'color-excellent';
      if (score >= 80) return 'color-good';
      if (score >= 70) return 'color-fair';
      if (score >= 60) return 'color-poor';
      return 'color-critical';
    }
    
    function getGrade(score) {
      if (score >= 90) return 'A - Excellent';
      if (score >= 80) return 'B - Good';
      if (score >= 70) return 'C - Fair';
      if (score >= 60) return 'D - Needs Improvement';
      return 'F - Critical';
    }
    
    function formatCategory(category) {
      const names = {
        'code-quality': 'Code Quality',
        'automation-design': 'Automation',
        'data-model': 'Data Model',
        'performance': 'Performance'
      };
      return names[category] || category;
    }
    
    function formatPath(path) {
      const parts = path.split('/');
      return parts.slice(-2).join('/');
    }
    
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function runAnalysis() {
      showLoading();
      vscode.postMessage({ command: 'runAnalysis' });
    }
    
    function openFile(file, line) {
      if (file) {
        vscode.postMessage({ command: 'openFile', data: { file, line } });
      }
    }
    
    function exportReport(format) {
      vscode.postMessage({ command: 'exportReport', data: { format } });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose the panel
   */
  public dispose(): void {
    HealthDashboardPanel.currentPanel = undefined;

    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

/**
 * Get or create the dashboard panel
 */
export function getDashboardPanel(extensionUri: vscode.Uri): HealthDashboardPanel {
  return HealthDashboardPanel.createOrShow(extensionUri);
}
