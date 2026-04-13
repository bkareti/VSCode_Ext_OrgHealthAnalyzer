/**
 * Plugin Interface — Phase 5
 *
 * Allows third-party code to contribute additional analysis rules
 * without forking the extension. Plugins are loaded from paths listed in
 * sfHealthAnalyzer.plugins configuration array.
 *
 * Plugin contract:
 *   - Export a default object (or named `plugin`) conforming to HealthAnalyzerPlugin
 *   - The analyze() method receives a read-only PluginContext and returns Issues
 *   - Errors thrown by plugins are caught and surfaced as warnings; they never
 *     crash the main analysis pipeline
 *
 * Example plugin (JavaScript):
 *   // my-plugin.js
 *   module.exports = {
 *     id: 'my-org-rules',
 *     name: 'My Org Rules',
 *     version: '1.0.0',
 *     async analyze(ctx) {
 *       return ctx.apexClasses
 *         .filter(c => c.Name.startsWith('Legacy'))
 *         .map(c => ({
 *           id: `my-org-rules-legacy-${c.Id}`,
 *           ruleId: 'legacy-class-name',
 *           severity: 'warning',
 *           category: 'code-quality',
 *           message: `Class "${c.Name}" has a legacy naming prefix`,
 *           file: `org://${c.Name}.cls`,
 *         }));
 *     }
 *   };
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Issue, ApexClass, ApexTrigger } from '../types';
import { logInfo, logError } from '../utils/logger';

// ============================================================================
// Plugin Context (read-only snapshot passed to each plugin)
// ============================================================================

export interface PluginContext {
  /** All Apex classes fetched from the org */
  readonly apexClasses: ReadonlyArray<ApexClass>;
  /** All Apex triggers fetched from the org */
  readonly apexTriggers: ReadonlyArray<ApexTrigger>;
  /** Org username / alias */
  readonly orgUsername: string;
  /** VS Code workspace root (may be undefined if no folder open) */
  readonly workspacePath: string | undefined;
}

// ============================================================================
// Plugin Interface
// ============================================================================

export interface HealthAnalyzerPlugin {
  /** Unique reverse-domain identifier, e.g. "com.mycompany.apex-rules" */
  readonly id: string;
  /** Human-readable name shown in output */
  readonly name: string;
  /** Semver string */
  readonly version: string;
  /**
   * Run the plugin analysis.
   * Must resolve (never reject). Return [] on no findings.
   */
  analyze(context: PluginContext): Promise<Issue[]>;
}

// ============================================================================
// Plugin Loader
// ============================================================================

export class PluginLoader {
  private plugins: HealthAnalyzerPlugin[] = [];

  /**
   * Load all plugins listed in sfHealthAnalyzer.plugins.
   * Each entry is an absolute path or a path relative to the workspace root.
   */
  public async loadFromConfig(): Promise<void> {
    const cfg      = vscode.workspace.getConfiguration('sfHealthAnalyzer');
    const paths    = cfg.get<string[]>('plugins', []);
    const wsRoot   = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    this.plugins = [];

    for (const pluginPath of paths) {
      const resolved = path.isAbsolute(pluginPath)
        ? pluginPath
        : wsRoot
        ? path.join(wsRoot, pluginPath)
        : null;

      if (!resolved) {
        logError(`Plugin path "${pluginPath}" is relative but no workspace is open`, new Error('No workspace'));
        continue;
      }

      try {
        const mod = require(resolved) as { default?: HealthAnalyzerPlugin; plugin?: HealthAnalyzerPlugin } | HealthAnalyzerPlugin;
        const plugin: HealthAnalyzerPlugin =
          (mod as { default?: HealthAnalyzerPlugin }).default ||
          (mod as { plugin?: HealthAnalyzerPlugin }).plugin ||
          (mod as HealthAnalyzerPlugin);

        if (typeof plugin?.analyze !== 'function') {
          throw new Error('Plugin does not export an analyze() function');
        }

        this.plugins.push(plugin);
        logInfo(`Plugin loaded: ${plugin.name} v${plugin.version} (${plugin.id})`);
      } catch (err) {
        logError(`Failed to load plugin from "${resolved}"`, err as Error);
        vscode.window.showWarningMessage(
          `Salesforce Health Analyzer: plugin at "${resolved}" failed to load — ${(err as Error).message}`
        );
      }
    }
  }

  /**
   * Run all loaded plugins and collect their issues.
   * Individual plugin failures are isolated and logged as warnings.
   */
  public async runAll(context: PluginContext): Promise<Issue[]> {
    if (this.plugins.length === 0) { return []; }

    logInfo(`Running ${this.plugins.length} plugin(s)…`);
    const allIssues: Issue[] = [];

    for (const plugin of this.plugins) {
      try {
        const issues = await plugin.analyze(context);
        logInfo(`Plugin "${plugin.name}" returned ${issues.length} issue(s)`);
        allIssues.push(...issues);
      } catch (err) {
        logError(`Plugin "${plugin.name}" threw during analyze()`, err as Error);
        vscode.window.showWarningMessage(
          `Plugin "${plugin.name}" failed during analysis: ${(err as Error).message}`
        );
      }
    }

    return allIssues;
  }

  public get count(): number { return this.plugins.length; }
}

// ============================================================================
// Singleton
// ============================================================================

export const pluginLoader = new PluginLoader();
