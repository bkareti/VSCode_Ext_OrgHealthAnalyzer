/**
 * Health Dashboard — Webview panel
 *
 * The TypeScript layer is a thin shell:
 *   - Creates / reveals the WebviewPanel
 *   - Serves the Vite React build from webview-ui/dist/
 *   - Injects CSP nonce and icon URI into the built index.html
 *   - Proxies messages between the extension and the webview
 */

import * as vscode from 'vscode';
import { AnalysisResult, Issue, DashboardMessage, ScanHistoryEntry } from '../types';
import { reportGenerator } from '../reports/reportGenerator';
import { getAIService, AIExplanation, getPreferredModelSelector } from '../services/aiService';
import { ARCHITECT_PROMPT_SCOPES, loadArchitectPrompts, saveArchitectPrompt } from '../services/architectPrompts';

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
  private orgHistory: Record<string, ScanHistoryEntry[]> | null = null;
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
          vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist'),
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

  /** Push per-org scan history to the webview. */
  public updateOrgHistory(orgHistory: Record<string, ScanHistoryEntry[]>): void {
    this.orgHistory = orgHistory;
    this.postMessage({ type: 'orgHistory', data: orgHistory });
  }

  /** Enumerate the user's available AI models and send them to the webview. */
  public async pushAvailableModels(): Promise<void> {
    this.postMessage({ type: 'preferredModel', data: getPreferredModelSelector() });

    const ai = getAIService();
    if (!ai) {
      this.postMessage({ type: 'availableModels', data: [{ id: 'auto', label: 'Auto (best available)', backend: 'vscode-lm' }] });
      this.postMessage({ type: 'copilotStatus', available: false, count: 0 });
      return;
    }
    try {
      const models = await ai.listModels();
      this.postMessage({ type: 'availableModels', data: models });
    } catch {
      this.postMessage({ type: 'availableModels', data: [{ id: 'auto', label: 'Auto (best available)', backend: 'vscode-lm' }] });
    }
    this.postMessage({ type: 'claudeAuthStatus', authorized: ai.isClaudeAuthorized() });
    this.postMessage({ type: 'openaiAuthStatus', authorized: ai.isOpenAIAuthorized() });
    this.postMessage({ type: 'geminiAuthStatus', authorized: ai.isGeminiAuthorized() });

    // Explicitly check GitHub Copilot extension availability via the LM API.
    try {
      const copilotModels = vscode.lm ? await vscode.lm.selectChatModels({ vendor: 'copilot' }) : [];
      this.postMessage({ type: 'copilotStatus', available: copilotModels.length > 0, count: copilotModels.length });
    } catch {
      this.postMessage({ type: 'copilotStatus', available: false, count: 0 });
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
      case 'ready':
        if (this.currentResult) { this.updateResults(this.currentResult); }
        if (this.orgHistory)    { this.updateOrgHistory(this.orgHistory); }
        void this.pushAvailableModels();
        break;

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

      case 'exportCodeQualityCsv': {
        const { csv: cqCsv, fileName: cqFileName } = message.data as { csv: string; fileName: string };
        const cqDefaultUri = vscode.Uri.joinPath(
          vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(require('os').homedir()),
          cqFileName || 'code-quality-issues.csv'
        );
        const cqUri = await vscode.window.showSaveDialog({
          defaultUri: cqDefaultUri,
          filters: { 'CSV Files': ['csv'] },
          title: 'Export Code Quality Issues',
        });
        if (cqUri) {
          await vscode.workspace.fs.writeFile(cqUri, Buffer.from(cqCsv, 'utf8'));
          vscode.window.showInformationMessage(`Code quality issues exported to ${cqUri.fsPath}`);
        }
        break;
      }

      case 'exportCtaHtml': {
        // Sent flat (not nested under `data`) — see OutboundMessage in useVSCode.ts.
        const { html, fileName } = message as unknown as { html: string; fileName: string };
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
        const force = (message as { force?: boolean }).force ?? false;
        // Pass the override through as-is (undefined when not sent) so the
        // command falls back to the persisted sfHealthAnalyzer.ai.preferredModel
        // setting instead of being force-fed the literal string 'auto', which
        // would silently bypass that setting.
        await vscode.commands.executeCommand('sfHealthAnalyzer.runCtaReview', message.model, force);
        break;
      }

      case 'runFutureReadiness': {
        if (this.securityMode === 'safe') {
          break; // AI narrative disabled in Safe mode — deterministic scores still render
        }
        const force = (message as { force?: boolean }).force ?? false;
        await vscode.commands.executeCommand('sfHealthAnalyzer.runFutureReadiness', message.model, force);
        break;
      }

      case 'runLicenseRecommendations': {
        if (this.securityMode === 'safe') {
          break; // AI narrative disabled in Safe mode — deterministic card values still render
        }
        const force = (message as { force?: boolean }).force ?? false;
        await vscode.commands.executeCommand('sfHealthAnalyzer.runLicenseRecommendations', message.model, force);
        break;
      }

      case 'runOrgInfoRecommendations': {
        if (this.securityMode === 'safe') {
          break; // AI narrative disabled in Safe mode — deterministic card values still render
        }
        const force = (message as { force?: boolean }).force ?? false;
        await vscode.commands.executeCommand('sfHealthAnalyzer.runOrgInfoRecommendations', message.model, force);
        break;
      }

      case 'runDataCloudInsights': {
        if (this.securityMode === 'safe') {
          break; // AI narrative disabled in Safe mode — deterministic card values still render
        }
        const force = (message as { force?: boolean }).force ?? false;
        await vscode.commands.executeCommand('sfHealthAnalyzer.runDataCloudInsights', message.model, force);
        break;
      }

      case 'runAgentforceInsights': {
        if (this.securityMode === 'safe') {
          break; // AI narrative disabled in Safe mode — deterministic card values still render
        }
        const force = (message as { force?: boolean }).force ?? false;
        await vscode.commands.executeCommand('sfHealthAnalyzer.runAgentforceInsights', message.model, force);
        break;
      }

      case 'getModels': {
        await this.pushAvailableModels();
        break;
      }

      case 'setPreferredModel': {
        const { modelId, label } = (message.data as { modelId?: string; label?: string }) ?? {};
        if (!modelId) { break; }
        await vscode.workspace.getConfiguration('sfHealthAnalyzer.ai').update('preferredModel', modelId, vscode.ConfigurationTarget.Global);
        await this.pushAvailableModels();
        void vscode.window.showInformationMessage(`Active AI model set to: ${label ?? modelId}`);
        break;
      }

      case 'authorizeClaude': {
        const ai = getAIService();
        if (!ai) {
          this.postMessage({ type: 'claudeAuthStatus', authorized: false, error: 'AI service not initialised. Run an analysis first.' });
          break;
        }
        const result = await ai.authorizeClaude();
        // Refresh the picker (now includes Claude models) then report status.
        await this.pushAvailableModels();
        this.postMessage({
          type: 'claudeAuthStatus',
          authorized: ai.isClaudeAuthorized(),
          count: result.count,
          error: result.ok ? undefined : result.error,
        });
        if (result.ok) {
          void vscode.window.showInformationMessage(`Claude connected — ${result.count} model(s) available for CTA review.`);
        } else if (result.error && result.error !== 'No API key entered.') {
          void vscode.window.showWarningMessage(`Could not connect Claude: ${result.error}`);
        }
        break;
      }

      case 'disconnectClaude': {
        const ai = getAIService();
        if (ai) { await ai.disconnectClaude(); }
        await this.pushAvailableModels();
        this.postMessage({ type: 'claudeAuthStatus', authorized: false });
        break;
      }

      case 'authorizeOpenAI': {
        const ai = getAIService();
        if (!ai) {
          this.postMessage({ type: 'openaiAuthStatus', authorized: false, error: 'AI service not initialised. Run an analysis first.' });
          break;
        }
        const result = await ai.authorizeOpenAI();
        // Refresh the picker (now includes ChatGPT models) then report status.
        await this.pushAvailableModels();
        this.postMessage({
          type: 'openaiAuthStatus',
          authorized: ai.isOpenAIAuthorized(),
          count: result.count,
          error: result.ok ? undefined : result.error,
        });
        if (result.ok) {
          void vscode.window.showInformationMessage(`ChatGPT connected — ${result.count} model(s) available.`);
        } else if (result.error && result.error !== 'No API key entered.') {
          void vscode.window.showWarningMessage(`Could not connect ChatGPT: ${result.error}`);
        }
        break;
      }

      case 'disconnectOpenAI': {
        const ai = getAIService();
        if (ai) { await ai.disconnectOpenAI(); }
        await this.pushAvailableModels();
        this.postMessage({ type: 'openaiAuthStatus', authorized: false });
        break;
      }

      case 'authorizeGemini': {
        const ai = getAIService();
        if (!ai) {
          this.postMessage({ type: 'geminiAuthStatus', authorized: false, error: 'AI service not initialised. Run an analysis first.' });
          break;
        }
        const result = await ai.authorizeGemini();
        // Refresh the picker (now includes Gemini models) then report status.
        await this.pushAvailableModels();
        this.postMessage({
          type: 'geminiAuthStatus',
          authorized: ai.isGeminiAuthorized(),
          count: result.count,
          error: result.ok ? undefined : result.error,
        });
        if (result.ok) {
          void vscode.window.showInformationMessage(`Gemini connected — ${result.count} model(s) available.`);
        } else if (result.error && result.error !== 'No API key entered.') {
          void vscode.window.showWarningMessage(`Could not connect Gemini: ${result.error}`);
        }
        break;
      }

      case 'disconnectGemini': {
        const ai = getAIService();
        if (ai) { await ai.disconnectGemini(); }
        await this.pushAvailableModels();
        this.postMessage({ type: 'geminiAuthStatus', authorized: false });
        break;
      }

      case 'getArchitectPrompts': {
        this.postMessage({ type: 'architectPrompts', data: { scopes: ARCHITECT_PROMPT_SCOPES, overrides: loadArchitectPrompts() } });
        break;
      }

      case 'saveArchitectPrompt': {
        const { scopeId, text } = (message.data as { scopeId?: string; text?: string }) ?? {};
        try {
          if (!scopeId) { throw new Error('Missing scopeId.'); }
          saveArchitectPrompt(scopeId, text ?? '');
          this.postMessage({ type: 'architectPrompts', data: { scopes: ARCHITECT_PROMPT_SCOPES, overrides: loadArchitectPrompts() } });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showWarningMessage(`Failed to save recommendation prompt: ${msg}`);
        }
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
          const answer = await ai.askArchitect(question, this.currentResult, model, (progress) => {
            this.panel.webview.postMessage({ type: 'architectAnswerProgress', data: progress });
          });
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

    const distDir   = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');
    const indexPath = vscode.Uri.joinPath(distDir, 'index.html').fsPath;

    let html: string;
    try {
      html = require('fs').readFileSync(indexPath, 'utf8') as string;
    } catch {
      // webview-ui hasn't been built yet — show a helpful placeholder
      return [
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">',
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">`,
        '<style>body{background:#1e1e1e;color:#ccc;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>',
        '</head><body><div style="text-align:center">',
        '<p style="font-size:1.2rem">OrgPulse UI not built.</p>',
        '<p>Run <code style="background:#333;padding:2px 6px;border-radius:3px">npm run build:webview</code> then reload VS Code.</p>',
        '</div></body></html>',
      ].join('\n');
    }

    // Rewrite ./assets/ paths (Vite base:'./') so static refs resolve inside the webview
    const assetsUri = webview.asWebviewUri(vscode.Uri.joinPath(distDir, 'assets')).toString();
    html = html.replace(/src="\.?\/assets\//g,  `src="${assetsUri}/`);
    html = html.replace(/href="\.?\/assets\//g, `href="${assetsUri}/`);

    // Add nonce to every <script> tag (Vite emits one <script type="module"> entry)
    html = html.replace(/<script /g,  `<script nonce="${nonce}" `);
    html = html.replace(/<script>/g,  `<script nonce="${nonce}">`);

    // Inject CSP meta right after <head>
    const csp = [
      `default-src 'none';`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      // cspSource allows dynamically-imported Vite chunks (import('./OrgInfo.js') etc.)
      `script-src 'nonce-${nonce}' ${webview.cspSource};`,
      `img-src ${webview.cspSource} data:;`,
      `font-src ${webview.cspSource};`,
      // Needed for the CTA Review "Download PDF" flow — a hidden srcdoc iframe
      // renders the report so the native print dialog can be triggered on it.
      `frame-src 'self';`,
    ].join(' ');
    html = html.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`);

    // Inject icon URI global before </head>
    const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png'));
    html = html.replace(
      '</head>',
      `<script nonce="${nonce}">window.ORGPULSE_ICON_URI="${iconUri}";</script>\n</head>`
    );

    return html;
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
