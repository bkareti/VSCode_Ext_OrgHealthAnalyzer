/**
 * Configuration management for the Salesforce Org Health Analyzer
 */

import * as vscode from 'vscode';
import { AnalyzerConfig, RuleConfig, ScoringWeights, Severity } from '../types';

const CONFIG_SECTION = 'sfHealthAnalyzer';

/**
 * Get the full analyzer configuration
 */
export function getConfig(): AnalyzerConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    rules: getRuleConfig(config),
    severity: {
      threshold: config.get<Severity>('severity.threshold', 'warning'),
    },
    scoring: {
      weights: config.get<ScoringWeights>('scoring.weights', {
        codeQuality: 30,
        automationDesign: 25,
        dataModel: 20,
        performance: 25,
      }),
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
    enabled: cfg.get<string[]>('rules.enabled', [
      'soql-in-loop',
      'dml-in-loop',
      'hardcoded-id',
      'trigger-size',
      'trigger-logic',
      'missing-bulkification',
      'non-selective-query',
      'automation-complexity',
      'unused-fields',
    ]),
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
  return config.get<ScoringWeights>('scoring.weights', {
    codeQuality: 30,
    automationDesign: 25,
    dataModel: 20,
    performance: 25,
  });
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
        const config = JSON.parse(content.toString());
        return config as Partial<RuleConfig>;
      } catch {
        // File doesn't exist or is invalid, continue
      }
    }
  }

  return null;
}

/**
 * Merge custom config with default config
 */
export async function getMergedConfig(): Promise<AnalyzerConfig> {
  const defaultConfig = getConfig();
  const customConfig = await loadCustomRulesConfig();

  if (!customConfig) {
    return defaultConfig;
  }

  return {
    ...defaultConfig,
    rules: {
      ...defaultConfig.rules,
      ...customConfig,
    },
  };
}
