/**
 * Logging utilities for the Salesforce Org Health Analyzer
 */

import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

/**
 * Initialize the output channel
 */
export function initializeLogger(context: vscode.ExtensionContext): vscode.OutputChannel {
  outputChannel = vscode.window.createOutputChannel('Salesforce Health Analyzer');
  context.subscriptions.push(outputChannel);
  return outputChannel;
}

/**
 * Get the output channel
 */
export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Salesforce Health Analyzer');
  }
  return outputChannel;
}

/**
 * Log an info message
 */
export function logInfo(message: string): void {
  const timestamp = new Date().toISOString();
  getOutputChannel().appendLine(`[${timestamp}] INFO: ${message}`);
}

/**
 * Log a warning message
 */
export function logWarning(message: string): void {
  const timestamp = new Date().toISOString();
  getOutputChannel().appendLine(`[${timestamp}] WARN: ${message}`);
}

/**
 * Log an error message
 */
export function logError(message: string, error?: Error): void {
  const timestamp = new Date().toISOString();
  getOutputChannel().appendLine(`[${timestamp}] ERROR: ${message}`);
  if (error) {
    getOutputChannel().appendLine(`  ${error.message}`);
    if (error.stack) {
      getOutputChannel().appendLine(`  Stack: ${error.stack}`);
    }
  }
}

/**
 * Log a debug message (only in development)
 */
export function logDebug(message: string): void {
  if (process.env.NODE_ENV === 'development') {
    const timestamp = new Date().toISOString();
    getOutputChannel().appendLine(`[${timestamp}] DEBUG: ${message}`);
  }
}

/**
 * Show the output channel
 */
export function showOutput(preserveFocus: boolean = true): void {
  getOutputChannel().show(preserveFocus);
}

/**
 * Clear the output channel
 */
export function clearOutput(): void {
  getOutputChannel().clear();
}

/**
 * Log analysis start
 */
export function logAnalysisStart(): void {
  getOutputChannel().appendLine('');
  getOutputChannel().appendLine('═'.repeat(60));
  logInfo('Starting Salesforce Org Health Analysis...');
  getOutputChannel().appendLine('═'.repeat(60));
}

/**
 * Log analysis complete
 */
export function logAnalysisComplete(duration: number, issueCount: number): void {
  getOutputChannel().appendLine('');
  getOutputChannel().appendLine('─'.repeat(60));
  logInfo(`Analysis completed in ${duration}ms`);
  logInfo(`Found ${issueCount} issue(s)`);
  getOutputChannel().appendLine('═'.repeat(60));
}

/**
 * Log a section header
 */
export function logSection(title: string): void {
  getOutputChannel().appendLine('');
  getOutputChannel().appendLine(`▶ ${title}`);
  getOutputChannel().appendLine('─'.repeat(40));
}
