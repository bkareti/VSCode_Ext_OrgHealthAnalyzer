/**
 * Health Dashboard — Webview panel (Phase 3)
 *
 * The TypeScript layer is a thin shell:
 *   - Creates / reveals the WebviewPanel
 *   - Injects CSP-compliant nonces and media-file URIs
 *   - Proxies messages between the extension and the webview
 *   - All UI logic lives in media/dashboard.js + media/dashboard.css
 */

import * as vscode from 'vscode';
import { AnalysisResult, Issue, DashboardMessage } from '../types';
import { reportGenerator } from '../reports/reportGenerator';
import { getAIService, AIExplanation } from '../services/aiService';

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
  private securityMode: 'safe' | 'standard' | 'advanced' | null = null;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel        = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage(
      async (message: DashboardMessage) => this.handleMessage(message),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  public static createOrShow(extensionUri: vscode.Uri): HealthDashboardPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (HealthDashboardPanel.currentPanel) {
      HealthDashboardPanel.currentPanel.panel.reveal(column);
      return HealthDashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      HealthDashboardPanel.viewType,
      'OrgPulse',  
      column,
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

  /** Push full analysis results into the webview. */
  public updateResults(result: AnalysisResult): void {
    this.currentResult = result;
    this.postMessage({ type: 'analysisResults', data: result });
    void this.pushAvailableModels();
  }

  /** Enumerate the user's available AI models and send them to the webview. */
  public async pushAvailableModels(): Promise<void> {
    const ai = getAIService();
    if (!ai) {
      this.postMessage({ type: 'availableModels', data: [{ id: 'auto', label: 'Auto (best available)', backend: 'vscode-lm' }] });
      return;
    }
    try {
      const models = await ai.listModels();
      this.postMessage({ type: 'availableModels', data: models });
    } catch {
      this.postMessage({ type: 'availableModels', data: [{ id: 'auto', label: 'Auto (best available)', backend: 'vscode-lm' }] });
    }
  }

  /** Show the spinner / progress screen. */
  public showLoading(step?: number): void {
    this.postMessage({ type: 'loading', data: true, step: step ?? null });
  }

  /** Push an AI explanation into the currently-open drill-down panel. */
  public postAIExplanation(explanation: AIExplanation): void {
    this.postMessage({ type: 'aiExplanation', data: explanation });
  }

  /** Generic message post helper (used by extension commands). */
  public postMessage(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg);
  }

  /** Get the current security mode chosen by the user */
  public getSecurityMode(): 'safe' | 'standard' | 'advanced' | null {
    return this.securityMode;
  }

  // ── Private: message routing ───────────────────────────────────────────

  private async handleMessage(message: DashboardMessage): Promise<void> {
    switch (message.command) {
      case 'setSecurityMode': {
        const mode = (message.data as { mode: string })?.mode;
        if (mode === 'safe' || mode === 'standard' || mode === 'advanced') {
          this.securityMode = mode;
        }
        break;
      }

      case 'runAnalysis': {
        // force=true means Re-Analyse (bypass cache), force=false/undefined means normal run
        const force = (message.data as { force?: boolean })?.force ?? false;
        if (force) {
          await vscode.commands.executeCommand('sfHealthAnalyzer.refreshResults');
        } else {
          await vscode.commands.executeCommand('sfHealthAnalyzer.analyzeOrg');
        }
        break;
      }

      case 'openFile': {
        const { file, line } = message.data as { file: string; line?: number };
        await this.openFile(file, line);
        break;
      }

      case 'exportReport': {
        const { format, fileName } = message.data as { format: string; fileName?: string };
        await this.exportReport(format, fileName);
        break;
      }

      case 'generateAiPdfReport': {
        if (this.securityMode === 'safe') {
          this.panel.webview.postMessage({ type: 'aiPdfSummary', data: null });
          break;
        }
        const ai = getAIService();
        if (!ai) {
          // No AI — just tell the webview to proceed without summary
          this.panel.webview.postMessage({ type: 'aiPdfSummary', data: null });
          break;
        }
        try {
          // Build a category-aware prompt from the sanitised results the webview sent us
          const reportData = (message.data as { results: unknown }).results as Record<string, unknown>;
          const scores   = reportData?.scores  as Record<string, number> | undefined;
          const summary  = reportData?.summary as Record<string, number> | undefined;
          const inv      = reportData?.orgInventory as Record<string, number> | undefined;
          const byCategory = reportData?.issuesByCategory as Record<string, Array<{ message: string; ruleId: string; object: string }>> | undefined;

          function catScore(key: string) { return Math.round((scores?.[key] ?? 0) as number); }
          function catIssues(cat: string) {
            return (byCategory?.[cat] || []).slice(0, 3).map((i: { message: string }) => `  • ${i.message}`).join('\n') || '  • No critical issues';
          }

          const prompt = [
            'You are a Salesforce Certified Technical Architect (CTA) preparing a 200-word executive summary for a leadership health report.',
            'Write in professional, non-technical language suitable for a CTO, COO, or VP of Technology.',
            'Structure your response as: 1) A 2-sentence overall health statement, 2) The 2-3 highest-risk domains with a specific finding each, 3) A 2-sentence investment recommendation.',
            '',
            `Org: ${(reportData?.metadata as Record<string, unknown>)?.orgAlias ?? (reportData?.metadata as Record<string, unknown>)?.orgUsername ?? 'Salesforce Org'}`,
            `Overall Health Score: ${catScore('overall')}/100`,
            `Total Issues: ${summary?.totalIssues ?? 0} (${summary?.errorCount ?? 0} critical, ${summary?.warningCount ?? 0} warnings)`,
            '',
            'Domain Scores:',
            `  Code Quality: ${catScore('codeQuality')}/100`,
            `  Automation Design: ${catScore('automationDesign')}/100`,
            `  Data Model: ${catScore('dataModel')}/100`,
            `  Performance: ${catScore('performance')}/100`,
            `  Security: ${catScore('security')}/100`,
            `  Test Coverage: ${catScore('testing')}/100`,
            '',
            'Sample Critical Issues by Domain:',
            `Code Quality:\n${catIssues('code-quality')}`,
            `Automation Design:\n${catIssues('automation-design')}`,
            `Performance:\n${catIssues('performance')}`,
            `Security:\n${catIssues('security')}`,
            '',
            inv ? `Org Size: ${inv.apexClassCount ?? 0} Apex classes, ${inv.flowCount ?? 0} flows, ${inv.customObjectCount ?? 0} custom objects, ${inv.customFieldCount ?? 0} custom fields.` : '',
          ].filter(Boolean).join('\n');

          const fakeIssue = {
            id: 'pdf-summary', ruleId: 'exec-summary', severity: 'info' as const,
            category: 'code-quality' as const,
            message: prompt, description: prompt,
          };
          const explanation = await ai.explainIssue(fakeIssue);
          const text = typeof explanation === 'string' ? explanation : (explanation as AIExplanation)?.summary ?? '';
          this.panel.webview.postMessage({ type: 'aiPdfSummary', data: text });
        } catch {
          this.panel.webview.postMessage({ type: 'aiPdfSummary', data: null });
        }
        break;
      }

      case 'explainIssue': {
        if (this.securityMode === 'safe') {
          this.panel.webview.postMessage({
            type: 'aiExplanation',
            data: null,
            error: 'AI explanations are disabled in Safe Mode. Switch to Standard or Advanced mode to enable AI-powered insights.',
          });
          break;
        }
        const issue = message.data as Issue;
        const ai = getAIService();
        if (!ai) {
          this.panel.webview.postMessage({
            type: 'aiExplanation',
            data: null,
            error: 'AI service not available. Ensure GitHub Copilot is installed and enabled.',
          });
          break;
        }
        // Post a loading state first so the UI can show a spinner
        this.panel.webview.postMessage({ type: 'aiExplanationLoading', data: true });
        try {
          const explanation = await ai.explainIssue(issue);
          this.panel.webview.postMessage({ type: 'aiExplanation', data: explanation });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.panel.webview.postMessage({ type: 'aiExplanation', data: null, error: msg });
        }
        break;
      }

      case 'exportDataModelCsv': {
        const { csv, fileName } = message.data as { csv: string; fileName: string };
        const defaultUri = vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(require('os').homedir()),
          fileName || 'data-model-health.csv'
        );
        const uri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { 'CSV Files': ['csv'] },
          title: 'Save Data Model CSV',
        });
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf8'));
          vscode.window.showInformationMessage(`Data model exported to ${uri.fsPath}`);
        }
        break;
      }

      case 'exportCtaHtml': {
        const { html, fileName } = message.data as { html: string; fileName: string };
        const defaultUri = vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(require('os').homedir()),
          fileName || 'OrgPulse_CTA_Review.html'
        );
        const uri = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { 'HTML Files': ['html'] },
          title: 'Save CTA Review Report',
        });
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(html, 'utf8'));
          await vscode.env.openExternal(uri);
          vscode.window.showInformationMessage(`CTA Review saved to ${uri.fsPath} — use browser Print → Save as PDF`);
        }
        break;
      }

      case 'runCtaReview': {
        if (this.securityMode === 'safe') {
          break; // CTA review disabled in Safe mode — webview handles UI
        }
        await vscode.commands.executeCommand('sfHealthAnalyzer.runCtaReview', message.model ?? 'auto');
        break;
      }

      case 'getModels': {
        await this.pushAvailableModels();
        break;
      }

      case 'askArchitect': {
        const question = (message.data as { question?: string })?.question ?? '';
        const model = (message.data as { model?: string })?.model;
        if (this.securityMode === 'safe') {
          this.panel.webview.postMessage({
            type: 'architectAnswer',
            data: null,
            error: 'Ask the Architect is disabled in Safe Mode. Switch to Standard or Advanced mode to query the org with AI.',
          });
          break;
        }
        const ai = getAIService();
        if (!ai) {
          this.panel.webview.postMessage({
            type: 'architectAnswer',
            data: null,
            error: 'AI service not available. Ensure GitHub Copilot or an Anthropic model is installed and enabled.',
          });
          break;
        }
        this.panel.webview.postMessage({ type: 'architectAnswerLoading', data: true });
        try {
          const answer = await ai.askArchitect(question, this.currentResult, model);
          this.panel.webview.postMessage({ type: 'architectAnswer', data: answer });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.panel.webview.postMessage({ type: 'architectAnswer', data: null, error: msg });
        }
        break;
      }

      case 'cancelAnalysis': {
        await vscode.commands.executeCommand('sfHealthAnalyzer.cancelAnalysis');
        break;
      }

      case 'refresh':
        await vscode.commands.executeCommand('sfHealthAnalyzer.refreshResults');
        break;
    }
  }

  // ── Private: open file ─────────────────────────────────────────────────────

  private async openFile(filePath: string, line?: number): Promise<void> {
    if (!filePath) { return; }
    if (filePath.startsWith('org://')) {
      vscode.window.showInformationMessage(
        `This resource lives in the org: ${filePath.replace('org://', '')}`
      );
      return;
    }
    try {
      const uri      = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor   = await vscode.window.showTextDocument(document);
      if (line) {
        const pos = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    } catch {
      vscode.window.showErrorMessage(`Could not open file: ${filePath}`);
    }
  }

  // ── Private: export report ─────────────────────────────────────────────────

  private async exportReport(format: string, fileName?: string): Promise<void> {
    if (!this.currentResult) {
      vscode.window.showWarningMessage('No analysis results to export');
      return;
    }

    let content: string;
    let defaultName: string;
    let filters: Record<string, string[]>;

    switch (format) {
      case 'html':
        content     = reportGenerator.generateHtmlReport(this.currentResult);
        defaultName = (fileName ? fileName : 'org-health-report') + '.html';
        filters     = { HTML: ['html'] };
        break;
      case 'json':
        content     = reportGenerator.generateJsonReport(this.currentResult);
        defaultName = (fileName ? fileName : 'org-health-report') + '.json';
        filters     = { JSON: ['json'] };
        break;
      case 'sarif':
        content     = reportGenerator.generateSarifReport(this.currentResult);
        defaultName = (fileName ? fileName : 'org-health-report') + '.sarif';
        filters     = { SARIF: ['sarif', 'json'] };
        break;
      default:
        content     = reportGenerator.generateTextReport(this.currentResult);
        defaultName = (fileName ? fileName : 'org-health-report') + '.txt';
        filters     = { Text: ['txt'] };
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

  // ── Private: HTML shell ────────────────────────────────────────────────────

  private buildHtml(): string {
    const webview = this.panel.webview;
    const nonce   = this.getNonce();
    const assetVersion = Date.now().toString();

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.css')
    ).with({ query: `v=${assetVersion}` });
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'dashboard.js')
    ).with({ query: `v=${assetVersion}` });
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png')
    ).with({ query: `v=${assetVersion}` });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             img-src ${webview.cspSource} data:;">
  <title>OrgPulse — Salesforce Architecture Health</title>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div id="app"></div>
  <div class="drill-down-overlay" id="drill-overlay"></div>
  <aside class="drill-down-panel" id="drill-panel">
    <div class="ddp-header">
      <span class="ddp-title" id="ddp-title">Issue Detail</span>
      <button class="btn btn-icon" data-action="close-drill" title="Close">&#x2715;</button>
    </div>
    <div class="ddp-body" id="ddp-body"></div>
    <div class="ddp-footer" id="ddp-footer"></div>
  </aside>
  <script nonce="${nonce}">window.ORGPULSE_ICON_URI = "${iconUri}";</script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }

  // ── Private: nonce ─────────────────────────────────────────────────────────

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce   = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  public dispose(): void {
    HealthDashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

// ============================================================================
// Singleton helper
// ============================================================================

export function getDashboardPanel(extensionUri: vscode.Uri): HealthDashboardPanel {
  return HealthDashboardPanel.createOrShow(extensionUri);
}
