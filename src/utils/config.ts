/**
 * Configuration management for the Salesforce Org Health Analyzer
 */

import * as vscode from 'vscode';
import { AnalyzerConfig, RuleConfig, ScoringWeights, Severity } from '../types';

const CONFIG_SECTION = 'sfHealthAnalyzer';

const DEFAULT_WEIGHTS: ScoringWeights = {
  codeQuality: 25,
  automationDesign: 20,
  dataModel: 15,
  performance: 20,
  security: 10,
  testing: 5,
  integration: 5,
};

const DEFAULT_ENABLED_RULES = [
  'soql-in-loop',
  'dml-in-loop',
  'hardcoded-id',
  'trigger-size',
  'trigger-logic',
  'missing-bulkification',
  'class-size',
  'method-length',
  'missing-sharing',
  'non-selective-query',
  'automation-complexity',
  'unused-fields',
  'test-coverage',
  'no-assert',
  'modifyall-permission',
  'legacy-credential',
];

/**
 * Get the full analyzer configuration (merges file config if present)
 */
export async function getConfigAsync(): Promise<AnalyzerConfig> {
  const base = getConfig();
  const custom = await loadCustomRulesConfig();
  if (!custom) {
    return base;
  }
  return {
    ...base,
    rules: { ...base.rules, ...custom },
  };
}

/**
 * Get the full analyzer configuration (sync, VS Code settings only)
 */
export function getConfig(): AnalyzerConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    rules: getRuleConfig(config),
    severity: {
      threshold: config.get<Severity>('severity.threshold', 'warning'),
    },
    scoring: {
      weights: config.get<ScoringWeights>('scoring.weights', DEFAULT_WEIGHTS),
    },
    analysis: {
      includeOrgMetadata: config.get<boolean>('analysis.includeOrgMetadata', true),
      largeDataVolumeThreshold: config.get<number>('analysis.largeDataVolumeThreshold', 1000000),
    },
  };
}

/**
 * Get rule-specific configuration
 */
export function getRuleConfig(config?: vscode.WorkspaceConfiguration): RuleConfig {
  const cfg = config || vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    maxTriggersPerObject: cfg.get<number>('rules.maxTriggersPerObject', 1),
    maxFlowsPerObject: cfg.get<number>('rules.maxFlowsPerObject', 3),
    maxTriggerLines: cfg.get<number>('rules.maxTriggerLines', 200),
    maxClassLines: cfg.get<number>('rules.maxClassLines', 500),
    maxMethodLines: cfg.get<number>('rules.maxMethodLines', 50),
    maxValidationRulesPerObject: cfg.get<number>('rules.maxValidationRulesPerObject', 10),
    maxProcessBuildersPerObject: cfg.get<number>('rules.maxProcessBuildersPerObject', 1),
    enabled: cfg.get<string[]>('rules.enabled', DEFAULT_ENABLED_RULES),
  };
}

/**
 * Check if a specific rule is enabled
 */
export function isRuleEnabled(ruleId: string): boolean {
  const config = getRuleConfig();
  return config.enabled.includes(ruleId) || config.enabled.includes('all');
}

/**
 * Get scoring weights
 */
export function getScoringWeights(): ScoringWeights {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<ScoringWeights>('scoring.weights', DEFAULT_WEIGHTS);
}

/**
 * Get severity threshold
 */
export function getSeverityThreshold(): Severity {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<Severity>('severity.threshold', 'warning');
}

/**
 * Check if org metadata analysis is enabled
 */
export function shouldIncludeOrgMetadata(): boolean {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return config.get<boolean>('analysis.includeOrgMetadata', true);
}

/**
 * Salesforce Code Analyzer delegation settings. When enabled (and the plugin +
 * Java are available), the static Apex/LWC code analysis is delegated to
 * `sf code-analyzer run` instead of the built-in rules.
 */
export interface CodeAnalyzerConfig {
  enabled: boolean;
  ruleSelector: string;
  runGraphEngine: boolean;
}

export function getCodeAnalyzerConfig(): CodeAnalyzerConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: config.get<boolean>('codeAnalyzer.enabled', true),
    ruleSelector: config.get<string>('codeAnalyzer.ruleSelector', 'Recommended'),
    runGraphEngine: config.get<boolean>('codeAnalyzer.runGraphEngine', false),
  };
}

/**
 * Update a configuration value
 */
export async function updateConfig<T>(
  key: string,
  value: T,
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await config.update(key, value, target);
}

/**
 * Register configuration change listener
 */
export function onConfigChange(
  callback: (e: vscode.ConfigurationChangeEvent) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CONFIG_SECTION)) {
      callback(e);
    }
  });
}

/**
 * Load custom rules configuration from .sfhealthrc.json if present
 */
export async function loadCustomRulesConfig(): Promise<Partial<RuleConfig> | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return null;
  }

  const configFiles = ['.sfhealthrc.json', '.sfhealthrc', 'sfhealth.config.json'];

  for (const folder of workspaceFolders) {
    for (const configFile of configFiles) {
      const configUri = vscode.Uri.joinPath(folder.uri, configFile);
      try {
        const content = await vscode.workspace.fs.readFile(configUri);
        const parsed = JSON.parse(content.toString()) as {
          rules?: Record<string, unknown>;
          thresholds?: Record<string, unknown>;
        };
        // Map .sfhealthrc rule keys (no- prefix style) to engine rule IDs
        const mapped: Partial<RuleConfig> = {};
        if (typeof parsed.thresholds?.minHealthScore === 'number') {
          // Could surface as config in future; ignore for now
        }
        return Object.keys(mapped).length > 0 ? mapped : null;
      } catch {
        // File doesn't exist or invalid JSON, continue
      }
    }
  }

  return null;
}

/**
 * Merge custom config with default config
 */
export async function getMergedConfig(): Promise<AnalyzerConfig> {
  return getConfigAsync();
}
