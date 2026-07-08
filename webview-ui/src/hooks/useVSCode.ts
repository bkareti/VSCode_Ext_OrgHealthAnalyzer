import type { Issue } from '@/types';

// ── Outbound messages (webview → extension) ───────────────────────────────
export type OutboundMessage =
  | { command: 'setSecurityMode'; mode: 'safe' | 'standard' | 'advanced' }
  | { command: 'ready' }
  | { command: 'runAnalysis'; data?: { force?: boolean } }
  | { command: 'cancelAnalysis' }
  | { command: 'refresh' }
  | { command: 'openFile'; file: string; line?: number }
  | { command: 'exportReport'; format: 'html' | 'json' | 'architect' | 'sarif'; fileName?: string }
  | { command: 'generateAiPdfReport'; results: unknown }
  | { command: 'explainIssue'; issue: Issue }
  | { command: 'exportDataModelCsv'; csv: string; fileName: string }
  | { command: 'exportCtaHtml'; html: string; fileName: string }
  | { command: 'runCtaReview'; model?: string; force?: boolean }
  | { command: 'runFutureReadiness'; model?: string; force?: boolean }
  | { command: 'runLicenseRecommendations'; model?: string; force?: boolean }
  | { command: 'runOrgInfoRecommendations'; model?: string; force?: boolean }
  | { command: 'getModels' }
  | { command: 'authorizeClaude' }
  | { command: 'disconnectClaude' }
  | { command: 'authorizeOpenAI' }
  | { command: 'disconnectOpenAI' }
  | { command: 'authorizeGemini' }
  | { command: 'disconnectGemini' }
  | { command: 'setPreferredModel'; data: { modelId: string; label?: string } }
  | { command: 'askArchitect'; data: { question: string } }
  | { command: 'exportCodeQualityCsv'; data: { csv: string; fileName: string } }
  | { command: 'getArchitectPrompts' }
  | { command: 'saveArchitectPrompt'; data: { scopeId: string; text: string } };

// ── VS Code API singleton ─────────────────────────────────────────────────
interface VSCodeAPI {
  postMessage: (msg: unknown) => void;
  getState: () => Record<string, unknown>;
  setState: (state: Record<string, unknown>) => void;
}

function getVSCodeAPI(): VSCodeAPI {
  if (typeof acquireVsCodeApi !== 'undefined') {
    // In production webview — acquireVsCodeApi() must be called only once
    if (!(window as Window & { __vscodeApi?: VSCodeAPI }).__vscodeApi) {
      (window as Window & { __vscodeApi?: VSCodeAPI }).__vscodeApi = acquireVsCodeApi();
    }
    return (window as Window & { __vscodeApi?: VSCodeAPI }).__vscodeApi!;
  }

  // Dev fallback — running in Vite localhost:5173
  return {
    postMessage: (msg) => console.log('[dev vscode.postMessage]', msg),
    getState: () => ({}),
    setState: (s) => console.log('[dev vscode.setState]', s),
  };
}

export const vscodeApi = getVSCodeAPI();

export function useVSCode() {
  return {
    postMessage: (msg: OutboundMessage) => vscodeApi.postMessage(msg),
  };
}

// Declare the global so TypeScript doesn't complain
declare function acquireVsCodeApi(): VSCodeAPI;
