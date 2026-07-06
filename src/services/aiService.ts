/**
 * AI Service — Phase 5 (v1.4.0)
 *
 * Provides AI-powered issue explanations and CTA-tier architectural synthesis via:
 *   1. Anthropic Claude (claude-opus-4-8 / claude-opus-4-7 / claude-sonnet-4-6) via vscode.lm
 *   2. GitHub Copilot (gpt-4o) via vscode.lm — fallback
 *   3. Any available vscode.lm model — final fallback
 *
 * Model matching is by vendor + family *prefix* (e.g. any "claude-opus-4-*"),
 * picking the newest available — exact-string matching would silently fall
 * through to "any model" whenever the LM provider exposes a different family
 * string than the one hardcoded here.
 *
 * Design principles:
 *   - User consent is requested ONCE and remembered in globalState
 *   - NO issue data leaves the machine without explicit user approval
 *   - Gracefully degrades when no AI provider is available
 *   - Separate consent gate for CTA Review (more data is included)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Issue, AnalysisResult, CTAReview, CtaDomainFinding } from '../types';
import { logInfo, logError, logWarning } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { getSalesforceService } from './salesforceService';
import { AssessmentContextService, IAssessmentContextService } from './assessmentContext';
import { AssessmentContext } from '../types/assessmentContext';
import { PiiSanitizer } from './assessmentContext/piiSanitizer';
import { FutureReadinessService, IFutureReadinessService } from './futureReadiness';
import { FutureReadinessReport, FutureReadinessContext } from '../types/futureReadiness';

// ============================================================================
// Types
// ============================================================================

export type AIProviderName = 'claude' | 'copilot' | 'custom' | 'none';

/** Which transport a model is reached through. */
export type AiBackend = 'vscode-lm' | 'custom' | 'anthropic';

/** A selectable model surfaced to the dashboard model picker. */
export interface ModelOption {
  /** Selector id: 'auto', '<vendor>/<family>' (vscode-lm), or 'custom:<model>'. */
  id: string;
  label: string;
  backend: AiBackend;
  vendor?: string;
  family?: string;
}

export interface AIExplanation {
  summary: string;       // 1–2 sentence plain-English summary
  impact: string;        // Why this matters in a Salesforce context
  howToFix: string;      // Concrete fix guidance
  codeExample?: string;  // Optional Apex / config snippet
  provider: AIProviderName;
}

// ============================================================================
// Consent keys stored in globalState
// ============================================================================

const CONSENT_KEY = 'sfHealthAnalyzer.ai.consentGranted';
const CTA_CONSENT_KEY = 'sfHealthAnalyzer.ai.ctaReviewConsent';

// ============================================================================
// Direct Anthropic Claude backend (API-key based, stored in Secret Storage)
//
// The standalone Anthropic "Claude" VS Code extension does NOT register itself
// as a vscode.lm chat provider, so its subscription models cannot be reached
// through selectChatModels(). To let users with a Claude/Anthropic key use
// Claude for CTA review, we call the Anthropic Messages API directly. The key
// is held in Secret Storage and mirrored into this module-level cache so the
// stateless backend helpers below can read it.
// ============================================================================

const ANTHROPIC_SECRET_KEY = 'sfHealthAnalyzer.ai.anthropicApiKey';
const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicModel { id: string; display_name: string; }
let anthropicKeyCache: string | undefined;
let anthropicModelsCache: AnthropicModel[] = [];

/** List the Claude models the given key can access (also validates the key). */
async function listAnthropicModels(key: string): Promise<AnthropicModel[]> {
  const resp = await fetch(`${ANTHROPIC_API_BASE}/v1/models?limit=100`, {
    method: 'GET',
    headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status} ${resp.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }
  const data = (await resp.json()) as { data?: Array<{ id: string; display_name?: string }> };
  return (data.data || []).map(m => ({ id: m.id, display_name: m.display_name || m.id }));
}

/** Pick the best Claude model id from the discovered list (Opus → Sonnet → first). */
function pickBestAnthropicModel(): string {
  const ids = anthropicModelsCache.map(m => m.id);
  return (
    ids.find(i => /opus/i.test(i)) ||
    ids.find(i => /sonnet/i.test(i)) ||
    ids[0] ||
    'claude-3-5-sonnet-latest'
  );
}

/**
 * Single-shot completion against the Anthropic Messages API.
 *
 * `maxTokens` defaults to 16 384 — the CTA report is a large JSON document and
 * anything below ~12 000 risks truncation mid-JSON, which silently degrades to a
 * stub review. All current Claude models (3.5 Sonnet, Opus 4, etc.) support at
 * least 16 384 output tokens. The optional `system` instruction is forwarded as a
 * top-level system prompt (nudges the model to emit raw JSON only for the CTA call).
 */
async function callAnthropic(prompt: string, model?: string, system?: string, maxTokens = 16384): Promise<string> {
  const key = anthropicKeyCache;
  if (!key) {
    throw new Error('Claude is not authorized. Click "Authorize Claude" in the CTA tab and paste an Anthropic API key.');
  }
  const useModel = model && model !== 'auto' ? model : pickBestAnthropicModel();
  const body: Record<string, unknown> = {
    model: useModel,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) { body.system = system; }
  const resp = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`Anthropic API ${resp.status} ${resp.statusText}${errBody ? ` — ${errBody.slice(0, 300)}` : ''}`);
  }
  const data = (await resp.json()) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string };
  const text = (data.content || [])
    .filter(c => c.type === 'text' && typeof c.text === 'string')
    .map(c => c.text)
    .join('');
  if (data.stop_reason === 'max_tokens') {
    logWarning('AI: Anthropic response hit max_tokens — report JSON may be truncated.');
  }
  return text;
}

// In-memory AI response cache keyed by ruleId + message
const aiCache = new Map<string, AIExplanation>();
const ctaCache = new Map<string, CTAReview>();
const futureReadinessCache = new Map<string, FutureReadinessReport>();
const AI_DEBOUNCE_MS = 2000;
let lastAiCallTs = 0;

function aiCacheKey(issue: Issue): string {
  return `${issue.ruleId}::${issue.message}`;
}

// ============================================================================
// Model selection helper — tries Claude first, then Copilot, then any
// ============================================================================

interface SelectedModel {
  model: vscode.LanguageModelChat;
  provider: AIProviderName;
}

/** Ordered family *prefixes* to prefer for a given vendor (newest first). */
interface ModelCandidate { vendor: string; familyPrefixes: string[]; provider: AIProviderName }

/**
 * Resolve the first available model whose family starts with one of the given
 * prefixes. Queries by vendor only (not exact family) so we match whatever
 * concrete family string the LM provider exposes (e.g. "claude-opus-4.8",
 * "claude-3.7-sonnet"), and pick the most-preferred available one.
 */
async function resolveCandidate(candidate: ModelCandidate): Promise<vscode.LanguageModelChat | undefined> {
  let models: readonly vscode.LanguageModelChat[] = [];
  try {
    models = await vscode.lm.selectChatModels({ vendor: candidate.vendor });
  } catch {
    return undefined;
  }
  if (!models || models.length === 0) { return undefined; }

  for (const prefix of candidate.familyPrefixes) {
    const match = models.find(m => (m.family || '').toLowerCase().startsWith(prefix.toLowerCase()));
    if (match) { return match; }
  }
  // Vendor present but no family matched a preferred prefix — use its first model.
  return models[0];
}

async function selectBestModel(overridePreference?: string): Promise<SelectedModel> {
  if (!vscode.lm) {
    throw new Error('VS Code Language Model API not available');
  }

  // Read user preference from settings (can be overridden by caller).
  // Precedence: explicit arg → ai.preferredModel → legacy ai.ctaModel → 'auto'.
  const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
  const preference = overridePreference
    ?? cfg.get<string>('preferredModel')
    ?? cfg.get<string>('ctaModel', 'auto')
    ?? 'auto';

  // Exact model selector "vendor/family" coming from the dynamic picker.
  if (preference && preference.includes('/') && !preference.startsWith('custom:')) {
    const slash = preference.indexOf('/');
    const vendor = preference.slice(0, slash);
    const family = preference.slice(slash + 1);
    try {
      const exact = await vscode.lm.selectChatModels({ vendor, family });
      if (exact && exact.length > 0) {
        logInfo(`AI: selected model ${exact[0].name} (exact ${preference})`);
        return { model: exact[0], provider: vendor === 'anthropic' ? 'claude' : 'copilot' };
      }
    } catch {
      // exact selector unavailable — fall through to heuristic
    }
  }

  const claudeOpus: ModelCandidate = { vendor: 'anthropic', familyPrefixes: ['claude-opus-4-8', 'claude-opus-4', 'claude-opus', 'claude'], provider: 'claude' };
  const claudeSonnet: ModelCandidate = { vendor: 'anthropic', familyPrefixes: ['claude-sonnet-4-6', 'claude-sonnet', 'claude'], provider: 'claude' };
  const copilotGpt: ModelCandidate = { vendor: 'copilot', familyPrefixes: ['gpt-4o', 'gpt-4', 'gpt'], provider: 'copilot' };

  let candidates: ModelCandidate[];
  switch (preference) {
    case 'claude-sonnet':
      candidates = [claudeSonnet, claudeOpus, copilotGpt];
      break;
    case 'claude-opus':
      candidates = [claudeOpus, claudeSonnet, copilotGpt];
      break;
    case 'gpt-4o':
      candidates = [copilotGpt, claudeOpus, claudeSonnet];
      break;
    default: // 'auto' — best Claude first, then Copilot
      candidates = [claudeOpus, claudeSonnet, copilotGpt];
  }

  for (const candidate of candidates) {
    const model = await resolveCandidate(candidate);
    if (model) {
      logInfo(`AI: selected model ${model.name} (vendor=${model.vendor}, family=${model.family})`);
      return { model, provider: candidate.provider };
    }
  }

  // Final fallback: any model from any vendor
  const anyModels = await vscode.lm.selectChatModels();
  if (anyModels && anyModels.length > 0) {
    const m = anyModels[0];
    logWarning(`AI: no preferred model found — falling back to ${m.name} (vendor=${m.vendor}, family=${m.family})`);
    return { model: m, provider: m.vendor === 'anthropic' ? 'claude' : 'copilot' };
  }

  throw new Error('No AI language model available. Install GitHub Copilot Chat, an Anthropic extension, or configure a local endpoint (Settings → sfHealthAnalyzer.ai.custom).');
}

// ============================================================================
// Backend selection + dynamic model discovery
// ============================================================================

interface CustomConfig { baseUrl: string; model: string; apiKey: string; }

/** Read the custom / local OpenAI-compatible backend configuration. */
function getCustomConfig(): CustomConfig {
  const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
  return {
    baseUrl: (cfg.get<string>('custom.baseUrl', 'http://localhost:11434/v1') || '').trim().replace(/\/+$/, ''),
    model: (cfg.get<string>('custom.model', '') || '').trim(),
    apiKey: (cfg.get<string>('custom.apiKey', '') || '').trim(),
  };
}

function isCustomConfigured(): boolean {
  const c = getCustomConfig();
  return !!c.baseUrl && !!c.model;
}

/** Is the configured custom endpoint local (data never leaves the machine)? */
function isLocalEndpoint(baseUrl: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(baseUrl);
}

/**
 * Map a selector to its backend + concrete custom model.
 * Precedence: explicit 'custom:' selector → ai.provider='custom' switch →
 * persisted preferred/legacy selector → default vscode-lm.
 */
function resolveBackend(selectorId?: string): { backend: AiBackend; customModel?: string } {
  const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
  let sel = (selectorId || '').trim();
  if (!sel) {
    sel = (cfg.get<string>('preferredModel') || cfg.get<string>('ctaModel', 'auto') || 'auto').trim();
  }
  if (sel.startsWith('anthropic:')) {
    return { backend: 'anthropic', customModel: sel.slice('anthropic:'.length) };
  }
  if (sel.startsWith('custom:')) {
    return { backend: 'custom', customModel: sel.slice('custom:'.length) || getCustomConfig().model };
  }
  const provider = cfg.get<string>('provider', 'auto');
  if (provider === 'custom' && isCustomConfigured()) {
    return { backend: 'custom', customModel: getCustomConfig().model };
  }
  return { backend: 'vscode-lm' };
}

/**
 * Enumerate every model the user can actually use right now:
 *   - all VS Code Language Model API models (any provider — Copilot's Claude/GPT/
 *     Gemini/o-series, Codex, or any third-party provider extension)
 *   - the configured local/custom endpoint's models (Ollama / OpenAI-compatible)
 */
async function listModelOptions(): Promise<ModelOption[]> {
  const options: ModelOption[] = [{ id: 'auto', label: 'Auto (best available)', backend: 'vscode-lm' }];

  // Direct Anthropic Claude (API key) — surfaced first when authorized so users
  // who connected Claude see their subscription models immediately.
  if (anthropicKeyCache) {
    options.push({ id: 'anthropic:auto', label: 'Claude (auto — best available)', backend: 'anthropic' });
    for (const m of anthropicModelsCache) {
      options.push({ id: `anthropic:${m.id}`, label: `Claude: ${m.display_name}`, backend: 'anthropic' });
    }
  }

  // VS Code LM providers — dynamic, not restricted to Copilot.
  // selectChatModels() only returns models from installed/registered providers
  // that VS Code considers selectable; we further drop any that report a
  // non-positive context window (a reliable "not actually usable" signal) so the
  // picker doesn't list models that will fail the moment they're sent a request.
  try {
    if (vscode.lm) {
      const models = await vscode.lm.selectChatModels();
      const seen = new Set<string>();
      for (const m of models) {
        if (typeof m.maxInputTokens === 'number' && m.maxInputTokens <= 0) { continue; }
        const id = `${m.vendor}/${m.family}`;
        if (seen.has(id)) { continue; }
        seen.add(id);
        options.push({ id, label: `${m.name} (${m.vendor})`, backend: 'vscode-lm', vendor: m.vendor, family: m.family });
      }
    }
  } catch (e) {
    logWarning(`AI: could not enumerate VS Code LM models: ${getErrorMessage(e)}`);
  }

  // Local / custom OpenAI-compatible endpoint.
  const custom = getCustomConfig();
  if (custom.baseUrl) {
    const local = isLocalEndpoint(custom.baseUrl);
    const tag = local ? 'Local' : 'Custom';
    const discovered = await listCustomModels(custom);
    if (discovered.length > 0) {
      for (const model of discovered) {
        options.push({ id: `custom:${model}`, label: `${tag}: ${model}`, backend: 'custom' });
      }
    } else if (custom.model) {
      options.push({ id: `custom:${custom.model}`, label: `${tag}: ${custom.model}`, backend: 'custom' });
    }
  }

  return options;
}

/** Try GET {baseUrl}/models (OpenAI-compatible) to list installed models. */
async function listCustomModels(custom: CustomConfig): Promise<string[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (custom.apiKey) { headers['Authorization'] = `Bearer ${custom.apiKey}`; }
    const resp = await fetch(`${custom.baseUrl}/models`, { headers });
    if (!resp.ok) { return []; }
    const json = await resp.json() as { data?: Array<{ id?: string }> };
    return (json.data ?? []).map(d => d.id).filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

// ============================================================================
// Strip markdown fences from model output
// ============================================================================

function stripFences(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\n?([\s\S]*?)```/);
  if (fenceMatch) { return fenceMatch[1].trim(); }
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

/**
 * Pull the JSON object out of a model response that may include a preamble
 * ("Here is the report:"), trailing prose, or markdown fences. Falls back to the
 * fence-stripped text when no clean object boundary is found.
 */
function extractJsonObject(raw: string): string {
  const stripped = stripFences(raw);
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return stripped.slice(first, last + 1).trim();
  }
  return stripped;
}

// ============================================================================
// Prompt builders
// ============================================================================

function buildIssuePrompt(issue: Issue): string {
  const location = issue.file
    ? `File: ${issue.file}${issue.line ? ` (line ${issue.line})` : ''}`
    : issue.object
    ? `Salesforce Object: ${issue.object}`
    : '';

  return `You are a senior Salesforce architect reviewing a static-analysis finding.
Provide a concise, actionable explanation in this exact JSON structure (no markdown fences):
{
  "summary": "<1-2 sentence plain-English summary of what the rule detected>",
  "impact": "<why this matters: governor limits, security, maintainability, deployment risk>",
  "howToFix": "<concrete, step-by-step fix for a Salesforce developer>",
  "codeExample": "<optional short Apex or config example showing the correct pattern, or omit key>"
}

Issue details:
- Rule ID:    ${issue.ruleId}
- Severity:   ${issue.severity}
- Category:   ${issue.category}
- Message:    ${issue.message}
${issue.description ? `- Description: ${issue.description}` : ''}
${location}
${issue.suggestion ? `- Existing suggestion: ${issue.suggestion}` : ''}

Keep each field under 120 words. Focus on Salesforce best practices.`;
}

function buildCtaPrompt(result: AnalysisResult): string {
  const scores = result.scores ?? {};
  const topIssues = (result.issues ?? [])
    .filter(i => i.severity === 'error')
    .slice(0, 25)
    .map(i => `[${i.category}/${i.severity}] ${i.ruleId}: ${i.message.slice(0, 120)}`)
    .join('\n');

  const orgInv = result.orgInventory ?? {} as Partial<import('../types').OrgInventorySummary>;
  const dataModelStats = result.dataModelStats ?? [];
  const autoSummary = (result.automationSummary ?? {}) as Partial<{ totalFlows: number; totalTriggers: number; totalValidationRules: number; objectMap: Record<string, { triggers: number; flows: number; validations: number; total: number }> }>;
  const licenses = (result.licenseSummary ?? []).map(l => `${l.name}: ${l.usedLicenses}/${l.totalLicenses} (${l.usedPct}%)`).join(', ');
  const queryExplains = (result.queryExplainResults ?? [])
    .filter(q => q.isFullTableScan || q.sforcePerformanceLevel === 'Unacceptable')
    .slice(0, 5)
    .map(q => `[${q.sforcePerformanceLevel}${q.isFullTableScan ? ' FULL_SCAN' : ''}] ${q.soql.slice(0, 100)}`)
    .join('\n');
  // Use only genuine custom fields (not total fields fallback) for accuracy
  const totalCustomFields = dataModelStats.reduce((sum, s) => sum + (s.customFields ?? 0), 0);
  // Live active user count from userSummary (exact from org — do NOT guess this)
  const activeUserCount = result.userSummary?.totalActiveUsers ?? result.metadata?.analyzedUsers ?? 0;
  const customObjectCount = dataModelStats.filter(s => s.objectName.endsWith('__c')).length;

  // ── DATA MODEL HIGHLIGHTS (req 6: send only highlight info) ─────────────
  // Merge dataModelStats + automationSummary.objectMap for object highlights
  const objectMap = autoSummary.objectMap ?? {};
  const allObjNames = new Set([
    ...dataModelStats.map(s => s.objectName),
    ...Object.keys(objectMap),
  ]);
  const mergedObjRows = Array.from(allObjNames).map(obj => {
    const fs = dataModelStats.find(s => s.objectName === obj) ?? {};
    const am = objectMap[obj] ?? { triggers: 0, flows: 0, validations: 0, total: 0 };
    const custFields = (fs as { customFields?: number; totalFields?: number }).customFields
      ?? (fs as { totalFields?: number }).totalFields ?? 0;
    return {
      obj,
      custFields,
      triggers: am.triggers ?? (fs as { triggers?: number }).triggers ?? 0,
      flows: am.flows ?? 0,
      validations: am.validations ?? (fs as { validationRules?: number }).validationRules ?? 0,
      fieldLimitPct: (fs as { fieldLimitPct?: number }).fieldLimitPct ?? 0,
    };
  }).filter(r =>
    r.obj.endsWith('__c') || r.custFields > 0 || r.triggers > 0 || r.flows > 0 || r.validations > 0
  );

  // Top 10 by custom fields — these are the heavy-weight objects for Data Architecture analysis
  const topByFields = [...mergedObjRows]
    .sort((a, b) => b.custFields - a.custFields)
    .slice(0, 10)
    .map(r => `  ${r.obj}: ${r.custFields} custom fields, ${r.triggers} trigger(s), ${r.flows} flow(s), ${r.validations} validation(s)${r.fieldLimitPct > 25 ? ` ⚠️ ${r.fieldLimitPct}% of 800-field limit` : ''}`)
    .join('\n');

  // Automation hotspots: objects with multi-trigger or heavy automation
  const automationHotspots = mergedObjRows
    .filter(r => r.triggers > 1 || r.flows + r.triggers + r.validations > 5)
    .sort((a, b) => (b.triggers + b.flows + b.validations) - (a.triggers + a.flows + a.validations))
    .slice(0, 10)
    .map(r => `  ${r.obj}: ${r.triggers} trigger(s), ${r.flows} flow(s), ${r.validations} validation(s)${r.triggers > 1 ? ' ⚠️ MULTI-TRIGGER' : ''}`)
    .join('\n');

  // Custom objects summary (all __c objects)
  const customObjects = mergedObjRows
    .filter(r => r.obj.endsWith('__c'))
    .sort((a, b) => b.custFields - a.custFields)
    .map(r => `  ${r.obj}: ${r.custFields} custom fields`)
    .join('\n');

  // New v1.6.0 signals
  const recordCounts = result.objectRecordCounts ?? {};
  const ldvObjects = Object.entries(recordCounts)
    .filter(([, cnt]) => cnt >= 500_000)
    .sort((a, b) => b[1] - a[1])
    .map(([obj, cnt]) => `${obj}: ${cnt.toLocaleString()} records`)
    .join(', ') || 'None detected above 500k threshold';

  const entryPoints = (result.entryPoints ?? [])
    .map(ep => `${ep.name} (${ep.type}: ${ep.annotation})`)
    .join(', ') || 'None detected';

  // Trigger governance: identify multi-trigger objects
  const multiTriggerObjects = mergedObjRows
    .filter(r => r.triggers > 1)
    .map(r => `${r.obj} (${r.triggers} triggers)`)
    .join(', ') || 'None detected';

  // Async anti-patterns from CTA issues
  const asyncIssues = (result.issues ?? [])
    .filter(i => i.ruleId === 'async-queueable-daisy-chain' || i.ruleId === 'row-lock-concurrent-batch')
    .map(i => `- ${i.message.slice(0, 120)}`)
    .join('\n') || 'None detected';

  // Idempotency gaps
  const idempotencyIssues = (result.issues ?? [])
    .filter(i => i.ruleId === 'integration-idempotency-risk')
    .map(i => `- ${i.ruleId}: ${i.file}`)
    .join('\n') || 'None detected';

  const snapshot = `=== LIVE ORG HEALTH SCORES (use these EXACT values in healthScoreBreakdown) ===
Code Quality:      ${scores.codeQuality ?? 'N/A'}/100
Automation Design: ${scores.automationDesign ?? 'N/A'}/100
Data Model:        ${scores.dataModel ?? 'N/A'}/100
Security:          ${scores.security ?? 'N/A'}/100
Test Coverage:     ${scores.testing ?? 'N/A'}/100
Performance:       ${scores.performance ?? 'N/A'}/100
Integration:       ${scores.integration ?? 'N/A'}/100
Overall Score:     ${scores.overall ?? 'N/A'}/100

=== LIVE ORG INVENTORY (these are exact values from the org — do NOT change them) ===
Active Users: ${activeUserCount} (EXACT — use this number verbatim in orgProfile.userScale)
Apex Classes: ${orgInv.apexClassCount ?? result.metadata?.analyzedClasses ?? 0}
Apex Triggers: ${orgInv.apexTriggerCount ?? result.metadata?.analyzedTriggers ?? 0}
Flows: ${orgInv.flowCount ?? autoSummary.totalFlows ?? 0}
Profiles: ${orgInv.profileCount ?? 0}
Permission Sets: ${orgInv.permissionSetCount ?? 0}
Custom Objects: ${customObjectCount} (exact count from org)
Total Custom Fields: ${totalCustomFields} (exact count from org)
Validation Rules: ${orgInv.validationRuleCount ?? autoSummary.totalValidationRules ?? 0}
Record Types: ${orgInv.recordTypeCount ?? 0}
Page Layouts: ${orgInv.pageLayoutCount ?? 0}
Lightning Pages (FlexiPages): ${orgInv.flexiPageCount ?? 0}

Automation Summary:
- Total Flows: ${autoSummary.totalFlows ?? 0}
- Total Triggers: ${autoSummary.totalTriggers ?? 0}
- Total Validation Rules: ${autoSummary.totalValidationRules ?? 0}

License Utilisation: ${licenses || 'Not available'}

=== DATA MODEL HIGHLIGHTS (${mergedObjRows.length} objects analysed) ===

Custom Objects (${mergedObjRows.filter(r => r.obj.endsWith('__c')).length} total):
${customObjects || '  None'}

Top 10 Objects by Custom Field Count:
${topByFields || '  No data'}

Automation Hotspots (multi-trigger or high automation):
${automationHotspots || '  None detected'}

=== CTA PILLAR: DATA ARCHITECTURE (LDV) ===
Live Record Counts (LDV Threshold: 500k):
${ldvObjects}

=== CTA PILLAR: SYSTEM STABILITY ===
Async Anti-Patterns Detected:
${asyncIssues}

Wild West Multi-Trigger Objects:
${multiTriggerObjects}

Non-Selective Queries Detected:
${queryExplains || 'None detected'}

=== CTA PILLAR: SECURITY & ENTRY POINTS ===
Public API Entry Points (@RestResource, InboundEmail):
${entryPoints}

=== CTA PILLAR: INTEGRATION GOVERNANCE ===
Idempotency Risk (callout handlers without upsert):
${idempotencyIssues}

Error-Severity Issues (top 25):
${topIssues || 'None'}

Total Issues: ${result.issues?.length ?? 0}
CTA-Review Issues: ${(result.issues ?? []).filter(i => i.category === 'cta-review').length}`;

  // Try loading a user-customised prompt from workspace root (cta-prompt.md)
  try {
    const wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders && wsFolders.length > 0) {
      const customPromptPath = path.join(wsFolders[0].uri.fsPath, 'cta-prompt.md');
      if (fs.existsSync(customPromptPath)) {
        const raw = fs.readFileSync(customPromptPath, 'utf8');
        const markerIdx = raw.indexOf('--- PROMPT START ---');
        const template = markerIdx >= 0 ? raw.slice(markerIdx + '--- PROMPT START ---'.length).trim() : raw.trim();
        if (template) {
          logInfo('AI: using custom CTA prompt from cta-prompt.md');
          // Always include the org snapshot: if the placeholder is missing or
          // misspelled, append it rather than silently sending a data-less prompt.
          return template.includes('{{SNAPSHOT}}')
            ? template.replace('{{SNAPSHOT}}', snapshot)
            : `${template}\n\n=== ORG HEALTH SNAPSHOT ===\n${snapshot}`;
        }
      }
    }
  } catch (e) {
    logWarning(`Could not load custom CTA prompt: ${String(e)}`);
  }

  // Default built-in prompt (mirrors cta-prompt.md — keep in sync)
  return `You are a Salesforce Certified Technical Architect (CTA) — a review-board-certified enterprise architect with 15+ years leading large-scale Salesforce transformations. You are authoring the formal Architecture Health Assessment that will be presented to the client's CIO, VP of Engineering, and Salesforce delivery leadership. Write with the authority, rigor, and business framing of a top-tier consulting deliverable (the standard a partner at a leading Salesforce practice would sign off on).

WRITING STANDARD — this is what separates a real CTA report from a generic scan:
- EVIDENCE-LED: every assertion cites concrete evidence from the snapshot — name the exact class, trigger, object, flow, profile, or metric. Never write a generic sentence that could apply to any org.
- QUANTIFIED: translate technical findings into business consequences — governor-limit headroom, blast radius (number of dependents), user/seat impact, deployment/release risk, and a credible $ cost or risk range with a probability and timeframe where the evidence supports one.
- DECISIVE: lead with what matters most. Commit to a Go / Conditional Go / No-Go verdict and defend it with the strongest two or three findings.
- ACTIONABLE: recommendations name the specific artifact to change and the outcome it protects. "Improve test coverage" is unacceptable; "Add tests for AccountTriggerHandler (currently 0%) to protect the order-sync path before the next release" is the bar.
- BOARD-READY: professional, direct, no hype, no filler. Make each string field as long as the insight genuinely requires — executiveSummary 4–6 sentences; each domain analysis 2–4 sentences — but never pad. Precision over verbosity.
- HONEST: where the org is healthy, say so plainly and credit it; do not manufacture risk. Where data is thin, state the assumption rather than inventing specifics.

ARCHITECTURE MATURITY LEVELS: 1=Ad Hoc, 2=Repeatable, 3=Defined, 4=Managed, 5=Optimised. Anchor the level to specific evidence (e.g. multi-trigger objects + no handler pattern → Repeatable, not Defined).
BENCHMARK REFERENCE (use to position the org, not as filler): Code coverage avg 78%/top 92%; Triggers-per-object avg 1.2/top 1.0; Flow:Apex ratio avg 2.5:1/top 4:1; Custom fields/object avg 38/top <25; Profile count avg 22/top <12.

CRITICAL DATA RULES — MUST FOLLOW:
1. orgProfile.userScale MUST be the exact number from "Active Users" in the snapshot (e.g. "42 users"). Do NOT guess or approximate.
2. healthScoreBreakdown MUST use the EXACT numeric scores from "LIVE ORG HEALTH SCORES" in the snapshot. Do NOT invent or smooth scores.
3. businessImpactSummary.revenueRisk MUST describe revenue impact from: system downtime (LDV/lock risk), data integrity failures (missing validation, schema issues), integration failures (callout-in-trigger, idempotency gaps), and security exposure — NOT just test coverage. Test coverage is a code quality metric, not a revenue risk on its own.
4. Custom Objects and Total Custom Fields must reflect the EXACT counts from the snapshot.
5. ALL domain findings must be grounded in specific evidence from the snapshot (class names, object names, issue counts).

Return ONLY valid JSON (no markdown fences) with ALL 15 keys:
{
  "verdict": "Go"|"Conditional Go"|"No-Go",
  "executiveSummary": "<4-6 sentences for the C-suite. Open with the overall verdict and the single most consequential finding (name the artifact). State the org's maturity in one phrase, the top 2-3 risks with their business impact, and close with the headline recommendation. No jargon a CIO wouldn't use.>",
  "architectureMaturity": { "level": <1-5>, "label": "<Ad Hoc|Repeatable|Defined|Managed|Optimised>", "summary": "<1-2 sentences with 2 specific evidence points from the snapshot.>" },
  "businessImpactSummary": {
    "revenueRisk": "<1 sentence: describe risk of revenue loss from system failures, data loss, integration outages, or downtime — cite specific evidence>",
    "operationalRisk": "<1 sentence: describe operational disruption risk — automation failures, governor limits, LDV locks, etc.>",
    "complianceRisk": "<1 sentence: describe data exposure, sharing model gaps, without-sharing Apex, or audit trail risks>",
    "overallSeverity": "Low"|"Medium"|"High"|"Critical"
  },
  "orgProfile": {
    "complexity": "Simple"|"Moderate"|"Complex"|"Enterprise",
    "userScale": "<exact number from snapshot> users",
    "integrationFootprint": "<brief description based on Named Credentials, @RestResource count, callout patterns>",
    "customizationLevel": "<brief: reference custom objects count and custom fields count from snapshot>"
  },
  "healthScoreBreakdown": [
    { "area": "Code Quality",      "score": <EXACT value from snapshot>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Automation Design", "score": <EXACT value from snapshot>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Data Model",        "score": <EXACT value from snapshot>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Security",          "score": <EXACT value from snapshot>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Test Coverage",     "score": <EXACT value from snapshot>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Performance",       "score": <EXACT value from snapshot>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" }
  ],
  "topCriticalIssues": [
    { "rank": 1, "title": "<specific title naming the class/object>", "severity": "Critical"|"High", "domain": "<domain>", "impact": "<1 sentence>", "remediation": "<1 sentence>", "effortEstimate": "<e.g. 1-2 days>" }
    ... up to 10 items ranked by business impact
  ],
  "riskAnalysis": {
    "probabilityOfIncident": "<1 sentence with % estimate and timeframe based on evidence>",
    "timeToRisk": "<e.g. 3-6 months>",
    "riskHeatmap": [
      { "domain": "System Architecture", "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Security",            "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Data Architecture",   "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Integration",         "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Solution Architecture","likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" }
    ]
  },
  "benchmarkComparison": [
    { "metric": "<metric>", "orgValue": "<exact value from snapshot>", "industryAvg": "<avg>", "topQuartile": "<top>", "status": "Below"|"At"|"Above" }
    ... 5 items using real org values
  ],
  "domainFindings": [
    { "domain": "System Architecture", "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences with specific class/object names>", "risks": ["<specific risk>"], "recommendations": ["<concrete action>"] },
    { "domain": "Security",            "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] },
    { "domain": "Data Architecture",   "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] },
    { "domain": "Integration",         "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] },
    { "domain": "Solution Architecture","status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] }
  ],
  "aiInsights": { "hiddenRisks": ["<max 3 non-obvious risks>"], "predictions": ["<max 3 data-driven predictions>"], "unusualPatterns": ["<max 3 unusual patterns>"] },
  "architectureObservations": [
    { "observation": "<1 sentence citing specific evidence>", "classification": "Strength"|"Weakness"|"Opportunity"|"Threat" }
    ... 4-8 items covering all 4 classifications
  ],
  "recommendations": {
    "quickWins": [ { "action": "<specific action>", "effort": "Low"|"Medium"|"High", "impact": "<specific impact>" } ... 3-5 items ],
    "strategic": [ { "action": "<specific action>", "timeline": "<e.g. Q3 2026>", "effort": "Low"|"Medium"|"High", "impact": "<specific impact>" } ... 3-5 items ]
  },
  "costOfInaction": { "financialImpact": "<1 sentence with estimated cost/risk>", "technicalDebtGrowth": "<1 sentence>", "risks": ["<max 3 specific risks>"] },
  "finalRecommendation": { "summary": "<2-3 sentences>", "nextSteps": ["<max 5 immediate, actionable steps>"], "proposedTimeline": "<90-day plan with milestones>" }
}

VALIDATION RULES:
- Exactly 5 domainFindings (one per domain above).
- healthScoreBreakdown MUST have exactly 6 rows matching the 6 scores in the snapshot.
- All scores in healthScoreBreakdown must equal the snapshot values exactly.
- LDV objects >500k → Data Architecture status = Warning or Fail.
- Multi-trigger objects → name them explicitly in System Architecture analysis.
- @RestResource with "without sharing" → flag in Security as Critical.
- orgProfile.userScale must be the exact active user count (e.g. "42 users").
- benchmarkComparison orgValue fields must use exact snapshot values.

=== ORG HEALTH SNAPSHOT ===
${snapshot}
`;
}

// ============================================================================
// Core AI call helper
// ============================================================================

async function callModel(prompt: string, modelPreference?: string, system?: string): Promise<{ text: string; provider: AIProviderName }> {
  const { backend, customModel } = resolveBackend(modelPreference);
  if (backend === 'anthropic') {
    const text = await callAnthropic(prompt, customModel, system);
    return { text, provider: 'claude' };
  }
  if (backend === 'custom') {
    const text = await callCustomChat(prompt, customModel);
    return { text, provider: 'custom' };
  }

  const { model, provider } = await selectBestModel(modelPreference);

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  let response;
  try {
    response = await model.sendRequest(
      messages,
      { justification: 'OrgPulse Salesforce Health Analyzer — generating architectural review.' }
    );
  } catch (e) {
    // The model was listed but isn't actually usable — most often it needs a
    // separate sign-in/subscription (e.g. a provider extension that registers a
    // model but requires its own auth) or the user denied the LM consent prompt.
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `The selected model (${model.name}) couldn't be used: ${detail}. ` +
      `Pick a different model, sign in to that provider, or configure a Custom (API key) endpoint in Settings → sfHealthAnalyzer.ai.custom.`
    );
  }

  let raw = '';
  for await (const chunk of response.text) {
    raw += chunk;
  }

  return { text: raw, provider };
}

// ============================================================================
// Custom / local backend — OpenAI-compatible HTTP (Ollama, LM Studio, vLLM,
// OpenAI, Codex, Azure). Uses the extension host's global fetch.
// ============================================================================

interface OAToolCall { id: string; type?: string; function: { name: string; arguments: string }; }
interface OAMessage { role: string; content: string | null; tool_calls?: OAToolCall[]; tool_call_id?: string; name?: string; }

function customHeaders(custom: CustomConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (custom.apiKey) { headers['Authorization'] = `Bearer ${custom.apiKey}`; }
  return headers;
}

/** Single-shot completion against the custom endpoint (no tools). */
async function callCustomChat(prompt: string, model?: string): Promise<string> {
  const custom = getCustomConfig();
  const useModel = model || custom.model;
  if (!custom.baseUrl || !useModel) {
    throw new Error('Local/custom AI endpoint not configured (Settings → sfHealthAnalyzer.ai.custom.baseUrl and .model).');
  }
  const resp = await fetch(`${custom.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: customHeaders(custom),
    body: JSON.stringify({ model: useModel, messages: [{ role: 'user', content: prompt }], stream: false }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Local/custom endpoint error ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? '';
}

/**
 * Tool-augmented chat loop against the custom endpoint (OpenAI tools schema).
 * Falls back to a no-tools answer if the endpoint/model rejects `tools`.
 */
async function runCustomToolLoop(initial: OAMessage[], model?: string): Promise<string> {
  const custom = getCustomConfig();
  const useModel = model || custom.model;
  if (!custom.baseUrl || !useModel) {
    throw new Error('Local/custom AI endpoint not configured (Settings → sfHealthAnalyzer.ai.custom.baseUrl and .model).');
  }
  const headers = customHeaders(custom);
  const tools = ARCHITECT_TOOLS.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const messages: OAMessage[] = [...initial];
  let allowTools = true;
  let answer = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body: Record<string, unknown> = { model: useModel, messages, stream: false };
    if (allowTools) { body.tools = tools; body.tool_choice = 'auto'; }

    const resp = await fetch(`${custom.baseUrl}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      if (allowTools) {
        logWarning(`Local/custom endpoint rejected tool calling (${resp.status}) — retrying without tools`);
        allowTools = false;
        continue;
      }
      throw new Error(`Local/custom endpoint error ${resp.status}: ${txt.slice(0, 200)}`);
    }

    const json = await resp.json() as { choices?: Array<{ message?: OAMessage }> };
    const msg = json.choices?.[0]?.message;
    if (!msg) { return answer.trim(); }
    answer = msg.content || answer;

    const calls = msg.tool_calls ?? [];
    if (!allowTools || calls.length === 0) {
      return (msg.content || '').trim();
    }

    // Record the assistant turn (with its tool calls), then each tool result.
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { args = {}; }
      const out = await runArchitectTool(call.function?.name ?? '', args);
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function?.name, content: out });
    }
  }

  return answer.trim() || 'I reached the maximum number of data-gathering steps before completing an answer. Try a more specific question.';
}

// ============================================================================
// "Ask the Architect" — tool-augmented Q&A over the live org
// ============================================================================
//
// Gives the language model read-only access to the connected org by wrapping
// existing SalesforceService methods as tools (the same tool-augmented-LLM
// pattern MCP standardises, implemented in-process with no extra dependencies).

const MAX_TOOL_ROUNDS = 5;
const TOOL_RESULT_MAX_CHARS = 6000;

const ARCHITECT_TOOLS: vscode.LanguageModelChatTool[] = [
  {
    name: 'run_soql',
    description: 'Run a READ-ONLY SELECT SOQL query against the connected Salesforce org (Data API). Use for record counts and business data, e.g. "SELECT COUNT(Id) FROM Account".',
    inputSchema: { type: 'object', properties: { soql: { type: 'string', description: 'A SELECT-only SOQL query.' } }, required: ['soql'] },
  },
  {
    name: 'run_tooling_soql',
    description: 'Run a READ-ONLY SELECT SOQL query against the Tooling API. Use for metadata objects such as ApexClass, ApexTrigger, Flow, EntityDefinition, FieldDefinition, ValidationRule, PermissionSet.',
    inputSchema: { type: 'object', properties: { soql: { type: 'string', description: 'A SELECT-only Tooling API SOQL query.' } }, required: ['soql'] },
  },
  {
    name: 'explain_query',
    description: 'Return the query plan / selectivity (EXPLAIN) for a SOQL query, including whether it triggers a full table scan. Use to assess query performance.',
    inputSchema: { type: 'object', properties: { soql: { type: 'string', description: 'The SOQL query to explain.' } }, required: ['soql'] },
  },
  {
    name: 'get_org_limits',
    description: 'Get current governor-limit utilisation (daily API requests, data/file storage, async/bulk jobs, etc.) as used vs max.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_license_summary',
    description: 'Get user-license utilisation (used vs total per license type).',
    inputSchema: { type: 'object', properties: {} },
  },
];

/** Guard: only allow read-only SELECT queries through the SOQL tools. */
function isReadOnlySoql(soql: string): boolean {
  const trimmed = soql.trim().toLowerCase();
  if (!trimmed.startsWith('select')) { return false; }
  if (trimmed.includes(';')) { return false; }
  return !/\b(insert|update|delete|upsert|merge|undelete)\b/.test(trimmed);
}

function truncateJson(value: unknown): string {
  let text: string;
  try { text = JSON.stringify(value); } catch { text = String(value); }
  if (text.length > TOOL_RESULT_MAX_CHARS) {
    return text.slice(0, TOOL_RESULT_MAX_CHARS) + ' …(truncated)';
  }
  return text;
}

/** Execute one architect tool call against the live org (read-only). */
async function runArchitectTool(name: string, input: Record<string, unknown>): Promise<string> {
  const sf = getSalesforceService();
  try {
    switch (name) {
      case 'run_soql': {
        const soql = String(input?.soql ?? '');
        if (!isReadOnlySoql(soql)) { return 'Rejected: only read-only SELECT queries are permitted.'; }
        return truncateJson(await sf.query(soql));
      }
      case 'run_tooling_soql': {
        const soql = String(input?.soql ?? '');
        if (!isReadOnlySoql(soql)) { return 'Rejected: only read-only SELECT queries are permitted.'; }
        return truncateJson(await sf.toolingQuery(soql));
      }
      case 'explain_query': {
        const soql = String(input?.soql ?? '');
        if (!isReadOnlySoql(soql)) { return 'Rejected: only read-only SELECT queries are permitted.'; }
        return truncateJson(await sf.explainQuery(soql));
      }
      case 'get_org_limits':
        return truncateJson(await sf.getOrgLimits());
      case 'get_license_summary':
        return truncateJson(await sf.getUserLicenseSummary());
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (e) {
    return `Tool error: ${getErrorMessage(e)}`;
  }
}

/**
 * Tool-augmented chat loop against the Anthropic Messages API (Claude tool use).
 * Mirrors runCustomToolLoop but with Anthropic's tool schema / tool_result wire
 * format, so an authorized Claude key can answer "Ask the Architect" questions
 * with live read-only org queries.
 */
type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

async function runAnthropicToolLoop(system: string, question: string, model?: string): Promise<string> {
  const key = anthropicKeyCache;
  if (!key) {
    throw new Error('Claude is not authorized. Click "Authorize Claude" in the CTA tab and paste an Anthropic API key.');
  }
  const useModel = model && model !== 'auto' ? model : pickBestAnthropicModel();
  const tools = ARCHITECT_TOOLS.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  const messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }> = [
    { role: 'user', content: question.trim() },
  ];
  let answer = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({ model: useModel, max_tokens: 4096, system, tools, messages }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Anthropic API ${resp.status} ${resp.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`);
    }
    const data = (await resp.json()) as { content?: AnthropicContentBlock[]; stop_reason?: string };
    const content = data.content ?? [];
    answer = content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('');

    const toolUses = content.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use',
    );
    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      return answer.trim();
    }

    // Echo the assistant turn (incl. tool_use blocks), then return tool results.
    messages.push({ role: 'assistant', content });
    const results: AnthropicContentBlock[] = [];
    for (const tu of toolUses) {
      const out = await runArchitectTool(tu.name, tu.input || {});
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }

  return answer.trim() || 'I reached the maximum number of data-gathering steps before completing an answer. Try a more specific question.';
}

/** Build a grounding system prompt from the latest analysis (if available). */
function buildArchitectSystemPrompt(result?: AnalysisResult | null): string {
  const lines: string[] = [
    'You are a Salesforce Certified Technical Architect (CTA) embedded in the OrgPulse VS Code extension.',
    'Answer the user\'s question about THIS connected Salesforce org. Be concise, concrete, and architecture-focused.',
    'You have read-only tools to query the org live (run_soql, run_tooling_soql, explain_query, get_org_limits, get_license_summary). Use them when the answer depends on current org data you do not already have; otherwise answer directly. Never claim to modify the org — the tools are read-only.',
    'When you cite numbers, prefer values returned by a tool or the snapshot below over guesses.',
  ];
  if (result) {
    const s = result.scores ?? {} as AnalysisResult['scores'];
    const m = result.metadata ?? {};
    const topIssues = (result.issues ?? [])
      .filter(i => i.severity === 'error')
      .slice(0, 10)
      .map(i => `- [${i.category}] ${i.ruleId}: ${i.message.slice(0, 120)}`)
      .join('\n');
    lines.push(
      '',
      '=== LATEST ORGPULSE ANALYSIS SNAPSHOT ===',
      `Org: ${m.orgUsername ?? m.orgAlias ?? 'connected org'} (edition: ${m.orgEdition ?? 'unknown'})`,
      `Overall health: ${s.overall ?? 'N/A'}/100 — Code ${s.codeQuality ?? 'N/A'}, Automation ${s.automationDesign ?? 'N/A'}, Data ${s.dataModel ?? 'N/A'}, Security ${s.security ?? 'N/A'}, Testing ${s.testing ?? 'N/A'}, Performance ${s.performance ?? 'N/A'}.`,
      `Totals: ${result.summary?.totalIssues ?? 0} issues (${result.summary?.errorCount ?? 0} critical), ${m.analyzedClasses ?? 0} classes, ${m.analyzedTriggers ?? 0} triggers, ${m.analyzedUsers ?? 0} active users.`,
      topIssues ? `Top critical findings:\n${topIssues}` : 'No critical findings recorded.',
    );
  } else {
    lines.push('', 'No prior analysis is loaded — run an Org Health Analysis first, or use the tools to gather data live.');
  }
  return lines.join('\n');
}

// ============================================================================
// AIService — singleton
// ============================================================================

export class AIService {
  private context: vscode.ExtensionContext;
  private consentGranted: boolean;
  private ctaConsentGranted: boolean;
  private assessmentContextService: IAssessmentContextService;
  private futureReadinessService: IFutureReadinessService;

  constructor(
    context: vscode.ExtensionContext,
    assessmentContextService?: IAssessmentContextService,
    futureReadinessService?: IFutureReadinessService,
  ) {
    this.context                    = context;
    this.consentGranted             = context.globalState.get<boolean>(CONSENT_KEY, false);
    this.ctaConsentGranted          = context.globalState.get<boolean>(CTA_CONSENT_KEY, false);
    this.assessmentContextService   = assessmentContextService ?? AssessmentContextService.createDefault();
    this.futureReadinessService     = futureReadinessService ?? FutureReadinessService.createDefault();
    void this.loadAnthropicKey();
  }

  // ---------------------------------------------------------------------------
  // Claude (Anthropic API key) authorization
  // ---------------------------------------------------------------------------

  /** Load any stored Anthropic key from Secret Storage into the module cache. */
  private async loadAnthropicKey(): Promise<void> {
    try {
      const key = await this.context.secrets.get(ANTHROPIC_SECRET_KEY);
      anthropicKeyCache = key || undefined;
      if (anthropicKeyCache && !anthropicModelsCache.length) {
        try { anthropicModelsCache = await listAnthropicModels(anthropicKeyCache); } catch { /* offline / invalid */ }
      }
    } catch { /* secrets unavailable */ }
  }

  /** Whether a Claude (Anthropic) API key is currently connected. */
  public isClaudeAuthorized(): boolean {
    return !!anthropicKeyCache;
  }

  /**
   * Authorize Claude by validating and storing an Anthropic API key. If no key
   * is passed, prompts the user for one (stored securely in Secret Storage).
   * Returns the number of Claude models discovered on success.
   */
  public async authorizeClaude(apiKey?: string): Promise<{ ok: boolean; count?: number; error?: string }> {
    let key = (apiKey || '').trim();
    if (!key) {
      key = ((await vscode.window.showInputBox({
        title: 'Authorize Claude — Anthropic API key',
        prompt: 'Paste your Anthropic API key (sk-ant-…). Stored securely in VS Code Secret Storage; never written to settings or synced.',
        placeHolder: 'sk-ant-...',
        password: true,
        ignoreFocusOut: true,
      })) || '').trim();
    }
    if (!key) { return { ok: false, error: 'No API key entered.' }; }

    let models: AnthropicModel[];
    try {
      models = await listAnthropicModels(key);
    } catch (e) {
      return { ok: false, error: `Could not validate the key: ${getErrorMessage(e)}` };
    }
    if (!models.length) {
      return { ok: false, error: 'Key accepted but no Claude models were returned for this account.' };
    }

    await this.context.secrets.store(ANTHROPIC_SECRET_KEY, key);
    anthropicKeyCache = key;
    anthropicModelsCache = models;
    logInfo(`AI: Claude authorized — ${models.length} model(s) available.`);
    return { ok: true, count: models.length };
  }

  /** Remove the stored Anthropic key (disconnect Claude). */
  public async disconnectClaude(): Promise<void> {
    try { await this.context.secrets.delete(ANTHROPIC_SECRET_KEY); } catch { /* ignore */ }
    anthropicKeyCache = undefined;
    anthropicModelsCache = [];
    logInfo('AI: Claude disconnected.');
  }

  // ---------------------------------------------------------------------------
  // Model discovery
  // ---------------------------------------------------------------------------

  /** All models the user can currently use (VS Code LM providers + local/custom). */
  public async listModels(): Promise<ModelOption[]> {
    return listModelOptions();
  }

  // ---------------------------------------------------------------------------
  // Consent helpers
  // ---------------------------------------------------------------------------

  /** Describe where data will be sent, for the consent prompt. */
  private aiDestination(modelPreference?: string): string {
    const { backend } = resolveBackend(modelPreference);
    if (backend === 'anthropic') {
      return 'the Anthropic Claude API (api.anthropic.com) using your connected API key — an external service';
    }
    if (backend === 'custom') {
      const c = getCustomConfig();
      return isLocalEndpoint(c.baseUrl)
        ? `your local AI endpoint (${c.baseUrl}) — data stays on your machine`
        : `your configured AI endpoint (${c.baseUrl}) — note this is an external service`;
    }
    return 'an AI model via VS Code\'s Language Model API (stays within VS Code)';
  }

  private async ensureConsent(): Promise<boolean> {
    if (this.consentGranted) { return true; }

    const choice = await vscode.window.showInformationMessage(
      `Salesforce Health Analyzer wants to send the selected issue details to ${this.aiDestination()}. Proceed?`,
      { modal: true },
      'Allow',
      'Deny'
    );

    if (choice === 'Allow') {
      this.consentGranted = true;
      await this.context.globalState.update(CONSENT_KEY, true);
      return true;
    }
    return false;
  }

  private async ensureCtaConsent(modelPreference?: string): Promise<boolean> {
    if (this.ctaConsentGranted) { return true; }

    const choice = await vscode.window.showInformationMessage(
      `CTA Architecture Review / Ask the Architect will send your org health snapshot (scores, issue summaries, inventory counts, licence data) and live read-only query results to ${this.aiDestination(modelPreference)}. Proceed?`,
      { modal: true },
      'Allow',
      'Deny'
    );

    if (choice === 'Allow') {
      this.ctaConsentGranted = true;
      await this.context.globalState.update(CTA_CONSENT_KEY, true);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Explain a single issue (existing capability, now with model fallback)
  // ---------------------------------------------------------------------------

  public async explainIssue(issue: Issue): Promise<AIExplanation | null> {
    const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
    if (!cfg.get<boolean>('enabled', true)) {
      vscode.window.showInformationMessage(
        'AI explanations are disabled. Enable them in Settings → sfHealthAnalyzer.ai.enabled.'
      );
      return null;
    }

    const cKey = aiCacheKey(issue);
    const cached = aiCache.get(cKey);
    if (cached) {
      logInfo('AI: returning cached explanation');
      return cached;
    }

    const now = Date.now();
    if (now - lastAiCallTs < AI_DEBOUNCE_MS) {
      logInfo('AI: debounce — skipping duplicate call');
      return null;
    }
    lastAiCallTs = now;

    const consented = await this.ensureConsent();
    if (!consented) { return null; }

    try {
      const { text, provider } = await callModel(buildIssuePrompt(issue));
      const cleaned = stripFences(text);

      let parsed: Partial<AIExplanation>;
      try {
        parsed = JSON.parse(cleaned) as Partial<AIExplanation>;
      } catch {
        parsed = { summary: cleaned.slice(0, 400), impact: '', howToFix: '' };
      }

      const result: AIExplanation = {
        summary:     parsed.summary     || issue.message,
        impact:      parsed.impact      || '',
        howToFix:    parsed.howToFix    || issue.suggestion || '',
        codeExample: parsed.codeExample,
        provider,
      };

      aiCache.set(cKey, result);
      return result;
    } catch (err) {
      logError('AI explanation failed', err as Error);
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(`AI explanation unavailable: ${msg}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Assessment Context → AI Prompt formatting
  // ---------------------------------------------------------------------------

  /**
   * Converts a pre-computed AssessmentContext into the full CTA prompt string.
   * Retains the CTA persona, output schema, and validation rules; replaces the
   * old inline snapshot section with the structured, privacy-safe JSON context.
   */
  private formatContextAsPrompt(context: AssessmentContext): string {
    // Load custom prompt template from workspace if present (same logic as buildCtaPrompt).
    let customPromptTemplate: string | null = null;
    try {
      const folders = vscode.workspace.workspaceFolders;
      if (folders?.length) {
        const promptPath = path.join(folders[0].uri.fsPath, 'cta-prompt.md');
        if (fs.existsSync(promptPath)) {
          const raw = fs.readFileSync(promptPath, 'utf8');
          const match = raw.match(/---\s*PROMPT START\s*---\s*([\s\S]*?)\s*---\s*PROMPT END\s*---/i) ??
                        raw.match(/---\s*START\s*---\s*([\s\S]*?)\s*---\s*END\s*---/i);
          if (match) { customPromptTemplate = match[1].trim(); }
          else if (raw.trim().length > 100) { customPromptTemplate = raw.trim(); }
        }
      }
    } catch { /* ignore */ }

    const contextJson = JSON.stringify(context, null, 2);

    if (customPromptTemplate) {
      return customPromptTemplate.replace('{{SNAPSHOT}}', contextJson);
    }

    // Built-in CTA prompt — persona + output schema from buildCtaPrompt(), with JSON context injected.
    return `You are a Salesforce Certified Technical Architect (CTA) — a review-board-certified enterprise architect with 15+ years leading large-scale Salesforce transformations. You are authoring the formal Architecture Health Assessment that will be presented to the client's CIO, VP of Engineering, and Salesforce delivery leadership. Write with the authority, rigor, and business framing of a top-tier consulting deliverable (the standard a partner at a leading Salesforce practice would sign off on).

WRITING STANDARD — this is what separates a real CTA report from a generic scan:
- EVIDENCE-LED: every assertion cites concrete evidence from the snapshot — name the exact class, trigger, object, flow, profile, or metric. Never write a generic sentence that could apply to any org.
- QUANTIFIED: translate technical findings into business consequences — governor-limit headroom, blast radius (number of dependents), user/seat impact, deployment/release risk, and a credible $ cost or risk range with a probability and timeframe where the evidence supports one.
- DECISIVE: lead with what matters most. Commit to a Go / Conditional Go / No-Go verdict and defend it with the strongest two or three findings.
- ACTIONABLE: recommendations name the specific artifact to change and the outcome it protects. "Improve test coverage" is unacceptable; "Add tests for AccountTriggerHandler (currently 0%) to protect the order-sync path before the next release" is the bar.
- BOARD-READY: professional, direct, no hype, no filler. Make each string field as long as the insight genuinely requires — executiveSummary 4–6 sentences; each domain analysis 2–4 sentences — but never pad. Precision over verbosity.
- HONEST: where the org is healthy, say so plainly and credit it; do not manufacture risk. Where data is thin, state the assumption rather than inventing specifics.

ARCHITECTURE MATURITY LEVELS: 1=Ad Hoc, 2=Repeatable, 3=Defined, 4=Managed, 5=Optimised. Anchor the level to specific evidence (e.g. multi-trigger objects + no handler pattern → Repeatable, not Defined).
BENCHMARK REFERENCE (use to position the org, not as filler): Code coverage avg 78%/top 92%; Triggers-per-object avg 1.2/top 1.0; Flow:Apex ratio avg 2.5:1/top 4:1; Custom fields/object avg 38/top <25; Profile count avg 22/top <12.

CRITICAL DATA RULES — MUST FOLLOW:
1. orgProfile.userScale MUST be the exact number from businessContext.orgComplexityEvidence.activeUsers (e.g. "42 users"). Do NOT guess or approximate.
2. healthScoreBreakdown MUST use the EXACT numeric scores from the scores[] array in the context (dimension values). Do NOT invent or smooth scores.
3. businessImpactSummary.revenueRisk MUST describe revenue impact from: system downtime (LDV/lock risk), data integrity failures (missing validation, schema issues), integration failures (callout-in-trigger, idempotency gaps), and security exposure — NOT just test coverage.
4. Custom Objects and Total Custom Fields must reflect the EXACT counts from architectureSummary.
5. ALL domain findings must be grounded in specific evidence from the findings[] array (class names, object names, issue counts).
6. Scores in healthScoreBreakdown must equal the scores[] array dimension values exactly — never recalculate.

Return ONLY valid JSON (no markdown fences) with ALL 15 keys:
{
  "verdict": "Go"|"Conditional Go"|"No-Go",
  "executiveSummary": "<4-6 sentences for the C-suite. Open with the overall verdict and the single most consequential finding (name the artifact). State the org's maturity in one phrase, the top 2-3 risks with their business impact, and close with the headline recommendation. No jargon a CIO wouldn't use.>",
  "architectureMaturity": { "level": <1-5>, "label": "<Ad Hoc|Repeatable|Defined|Managed|Optimised>", "summary": "<1-2 sentences with 2 specific evidence points from the context.>" },
  "businessImpactSummary": {
    "revenueRisk": "<1 sentence: describe risk of revenue loss from system failures, data loss, integration outages, or downtime — cite specific evidence>",
    "operationalRisk": "<1 sentence: describe operational disruption risk — automation failures, governor limits, LDV locks, etc.>",
    "complianceRisk": "<1 sentence: describe data exposure, sharing model gaps, without-sharing Apex, or audit trail risks>",
    "overallSeverity": "Low"|"Medium"|"High"|"Critical"
  },
  "orgProfile": {
    "complexity": "Simple"|"Moderate"|"Complex"|"Enterprise",
    "userScale": "<exact number from businessContext.orgComplexityEvidence.activeUsers> users",
    "integrationFootprint": "<brief description based on securitySummary.publicApiEntryPoints and integration findings>",
    "customizationLevel": "<brief: reference architectureSummary.totalCustomObjects and totalCustomFields>"
  },
  "healthScoreBreakdown": [
    { "area": "Code Quality",      "score": <EXACT value from scores[codeQuality].score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Automation Design", "score": <EXACT value from scores[automationDesign].score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Data Model",        "score": <EXACT value from scores[dataModel].score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Security",          "score": <EXACT value from scores[security].score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Test Coverage",     "score": <EXACT value from scores[testing].score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" },
    { "area": "Performance",       "score": <EXACT value from scores[performance].score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence with specific evidence>" }
  ],
  "topCriticalIssues": [
    { "rank": 1, "title": "<specific title naming the class/object>", "severity": "Critical"|"High", "domain": "<domain>", "impact": "<1 sentence>", "remediation": "<1 sentence>", "effortEstimate": "<e.g. 1-2 days>" }
  ],
  "riskAnalysis": {
    "probabilityOfIncident": "<1 sentence with % estimate and timeframe based on evidence>",
    "timeToRisk": "<e.g. 3-6 months>",
    "riskHeatmap": [
      { "domain": "System Architecture", "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Security",            "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Data Architecture",   "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Integration",         "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Solution Architecture","likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" }
    ]
  },
  "benchmarkComparison": [
    { "metric": "<metric>", "orgValue": "<exact value from context>", "industryAvg": "<avg>", "topQuartile": "<top>", "status": "Below"|"At"|"Above" }
  ],
  "domainFindings": [
    { "domain": "System Architecture", "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences with specific class/object names>", "risks": ["<specific risk>"], "recommendations": ["<concrete action>"] },
    { "domain": "Security",            "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] },
    { "domain": "Data Architecture",   "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] },
    { "domain": "Integration",         "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] },
    { "domain": "Solution Architecture","status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] }
  ],
  "aiInsights": { "hiddenRisks": ["<max 3 non-obvious risks>"], "predictions": ["<max 3 data-driven predictions>"], "unusualPatterns": ["<max 3 unusual patterns>"] },
  "architectureObservations": [
    { "observation": "<1 sentence citing specific evidence>", "classification": "Strength"|"Weakness"|"Opportunity"|"Threat" }
  ],
  "recommendations": {
    "quickWins": [ { "action": "<specific action>", "effort": "Low"|"Medium"|"High", "impact": "<specific impact>" } ],
    "strategic": [ { "action": "<specific action>", "timeline": "<e.g. Q3 2026>", "effort": "Low"|"Medium"|"High", "impact": "<specific impact>" } ]
  },
  "costOfInaction": { "financialImpact": "<1 sentence with estimated cost/risk>", "technicalDebtGrowth": "<1 sentence>", "risks": ["<max 3 specific risks>"] },
  "finalRecommendation": { "summary": "<2-3 sentences>", "nextSteps": ["<max 5 immediate, actionable steps>"], "proposedTimeline": "<90-day plan with milestones>" }
}

VALIDATION RULES:
- Exactly 5 domainFindings (one per domain above).
- healthScoreBreakdown MUST have exactly 6 rows matching the 6 scores in the context.
- All scores in healthScoreBreakdown must equal the context scores[] dimension values exactly.
- LDV objects in performanceSummary.ldvObjects → Data Architecture status = Warning or Fail.
- multiTriggerObjectCount > 0 → name them explicitly in System Architecture analysis.
- apexWithoutSharingCount > 0 with publicApiEntryPoints > 0 → flag in Security as Critical.
- orgProfile.userScale must be the exact active user count from businessContext.orgComplexityEvidence.activeUsers.
- benchmarkComparison orgValue fields must use exact values from the context.

=== ORG HEALTH ASSESSMENT CONTEXT ===
${contextJson}
`;
  }

  // ---------------------------------------------------------------------------
  // CTA Architecture Synthesis
  // ---------------------------------------------------------------------------

  public async synthesizeCtaReview(result: AnalysisResult, modelPreference?: string, force = false): Promise<CTAReview | null> {
    const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
    if (!cfg.get<boolean>('enabled', true)) {
      throw new Error('AI features are disabled. Enable them in Settings → sfHealthAnalyzer.ai.enabled.');
    }

    // Cache key includes the chosen model so switching models produces a fresh
    // review; `force` (Regenerate) bypasses the cache entirely.
    const baseKey = result.timestamp
      ? result.timestamp.toISOString()
      : String(result.issues?.length ?? 0);
    const cacheKey = `${baseKey}::${modelPreference || 'auto'}`;
    const cached = force ? undefined : ctaCache.get(cacheKey);
    if (cached) {
      logInfo('AI: returning cached CTA review');
      return cached;
    }

    const consented = await this.ensureCtaConsent(modelPreference);
    if (!consented) {
      throw new Error('CTA Architecture Review cancelled — you declined to send the org health snapshot to the AI model.');
    }

    try {
      const ctaSystem = 'You are a Salesforce CTA. Respond with ONLY valid JSON — no markdown fences, no preamble, no commentary, nothing before the opening { or after the closing }.';
      const assessmentContext = this.assessmentContextService.build(result);
      const { text, provider } = await callModel(this.formatContextAsPrompt(assessmentContext), modelPreference, ctaSystem);
      const cleaned = extractJsonObject(text);

      let parsed: Partial<CTAReview>;
      try {
        parsed = JSON.parse(cleaned) as Partial<CTAReview>;
      } catch (parseErr) {
        logWarning(`CTA review JSON parse failed: ${String(parseErr)}\nRaw: ${cleaned.slice(0, 300)}`);
        const minimalReview: CTAReview = {
          verdict: 'Conditional Go',
          executiveSummary: cleaned.slice(0, 600),
          domainFindings: [],
          modelUsed: provider,
          generatedAt: new Date().toISOString(),
        };
        ctaCache.set(cacheKey, minimalReview);
        return minimalReview;
      }

      // Normalise domain findings — ensure all 5 domains exist
      const DOMAINS: CtaDomainFinding['domain'][] = ['System Architecture', 'Security', 'Data Architecture', 'Integration', 'Solution Architecture'];
      const incoming = parsed.domainFindings ?? [];
      const domainFindings: CtaDomainFinding[] = DOMAINS.map(d => {
        const found = incoming.find(f => f.domain?.toLowerCase() === d.toLowerCase()) ?? null;
        return found ?? {
          domain: d,
          status: 'Warning' as const,
          analysis: 'Insufficient data to assess this domain.',
          risks: [],
          recommendations: [],
        };
      });

      // Normalise new v1.9.2 sections with safe defaults
      // Handle legacy formats: old criticalRisks → topCriticalIssues, old quickWins → recommendations.quickWins
      const topCriticalIssues = parsed.topCriticalIssues?.length
        ? parsed.topCriticalIssues
        : (parsed.criticalRisks ?? []).slice(0, 10).map((r, i) => ({
            rank: i + 1,
            title: r.risk,
            severity: 'High' as const,
            domain: 'System Architecture',
            impact: r.impact,
            remediation: r.mitigation,
            effortEstimate: 'Unknown',
          }));

      const recommendationsQuickWins = parsed.recommendations?.quickWins?.length
        ? parsed.recommendations.quickWins
        : (parsed.quickWins ?? []).map(w => ({ action: w, effort: 'Low' as const, impact: 'TBD' }));

      const recommendationsStrategic = parsed.recommendations?.strategic ?? [];

      const recommendations = { quickWins: recommendationsQuickWins, strategic: recommendationsStrategic };

      const review: CTAReview = {
        verdict:                   parsed.verdict ?? 'Conditional Go',
        executiveSummary:          parsed.executiveSummary ?? '',
        architectureMaturity:      parsed.architectureMaturity,
        businessImpactSummary:     parsed.businessImpactSummary,
        orgProfile:                parsed.orgProfile,
        healthScoreBreakdown:      parsed.healthScoreBreakdown ?? [],
        topCriticalIssues,
        riskAnalysis:              parsed.riskAnalysis,
        benchmarkComparison:       parsed.benchmarkComparison ?? [],
        domainFindings,
        aiInsights:                parsed.aiInsights,
        architectureObservations:  parsed.architectureObservations ?? [],
        recommendations,
        costOfInaction:            parsed.costOfInaction,
        finalRecommendation:       parsed.finalRecommendation,
        // Legacy fields preserved for older cached reviews
        criticalRisks:             parsed.criticalRisks,
        configFirstOpportunities:  parsed.configFirstOpportunities,
        quickWins:                 parsed.quickWins,
        modelUsed:                 provider,
        generatedAt:               new Date().toISOString(),
      };

      ctaCache.set(cacheKey, review);
      logInfo(`CTA review complete — verdict: ${review.verdict}, sections: ${review.architectureMaturity ? '12-section v1.9.2' : 'legacy'}, model: ${provider}`);
      return review;
    } catch (err) {
      logError('CTA review generation failed', err as Error);
      const msg = err instanceof Error ? err.message : String(err);
      // Re-throw so the command handler can surface a terminal error to the
      // webview (otherwise the loading spinner hangs forever). See #11.
      throw new Error(msg);
    }
  }

  // ---------------------------------------------------------------------------
  // Future Readiness — AI narrative over the deterministic assessment
  // ---------------------------------------------------------------------------

  /**
   * Enriches the deterministic Future Readiness result with an AI-authored
   * narrative. Scores, grades, gaps, and the roadmap are computed entirely by
   * OrgPulse and passed through verbatim — the model only writes prose. Degrades
   * to the score-only report if parsing fails.
   */
  public async synthesizeFutureReadiness(
    result: AnalysisResult,
    modelPreference?: string,
    force = false,
  ): Promise<FutureReadinessReport | null> {
    const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
    if (!cfg.get<boolean>('enabled', true)) {
      throw new Error('AI features are disabled. Enable them in Settings → sfHealthAnalyzer.ai.enabled.');
    }

    // Reuse the deterministic assessment computed during analysis when present;
    // otherwise compute it now (collector-derived checks degrade to 'na').
    const base: FutureReadinessReport =
      result.futureReadiness ?? this.futureReadinessService.assess({ result, collectors: {} });

    const cacheKey = `${base.generatedAt}::${modelPreference || 'auto'}`;
    const cached = force ? undefined : futureReadinessCache.get(cacheKey);
    if (cached) {
      logInfo('AI: returning cached Future Readiness narrative');
      return cached;
    }

    const consented = await this.ensureCtaConsent(modelPreference);
    if (!consented) {
      throw new Error('Future Readiness narrative cancelled — you declined to send the assessment context to the AI model.');
    }

    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

    try {
      const system = 'You are a Salesforce CTA. Respond with ONLY valid JSON — no markdown fences, no preamble, nothing before the opening { or after the closing }.';
      const context = this.futureReadinessService.buildContext(base, result);
      // Defence-in-depth: strip any residual PII before the context leaves the machine.
      const safeContext = new PiiSanitizer().sanitize(context);
      const { text, provider } = await callModel(this.formatFutureReadinessPrompt(safeContext), modelPreference, system);
      const cleaned = extractJsonObject(text);

      let parsed: {
        executiveSummary?: string;
        overallMaturity?: string;
        packs?: Array<{ packId?: string; currentMaturity?: string; businessImpact?: string; summary?: string }>;
      };
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        logWarning(`Future Readiness narrative JSON parse failed: ${String(parseErr)}`);
        const fallback: FutureReadinessReport = { ...base, modelUsed: provider };
        futureReadinessCache.set(cacheKey, fallback);
        return fallback;
      }

      const narrativeByPack = new Map((parsed.packs ?? []).map((p) => [p.packId, p]));
      const packs = base.packs.map((p) => {
        const n = narrativeByPack.get(p.packId);
        if (!n) { return p; }
        // Scores/grades come from `base` — the model never overwrites them.
        return {
          ...p,
          narrative: { currentMaturity: str(n.currentMaturity), businessImpact: str(n.businessImpact), summary: str(n.summary) },
        };
      });

      const report: FutureReadinessReport = {
        ...base,
        packs,
        narrative: { executiveSummary: str(parsed.executiveSummary), overallMaturity: str(parsed.overallMaturity) },
        modelUsed: provider,
      };

      futureReadinessCache.set(cacheKey, report);
      logInfo(`Future Readiness narrative complete — overall ${report.overall.score}/${report.overall.grade}, model: ${provider}`);
      return report;
    } catch (err) {
      logError('Future Readiness narrative generation failed', err as Error);
      throw new Error(err instanceof Error ? err.message : String(err));
    }
  }

  /** Builds the narrative prompt. Supports a `future-readiness-prompt.md` workspace override. */
  private formatFutureReadinessPrompt(context: FutureReadinessContext): string {
    let customTemplate: string | null = null;
    try {
      const folders = vscode.workspace.workspaceFolders;
      if (folders?.length) {
        const promptPath = path.join(folders[0].uri.fsPath, 'future-readiness-prompt.md');
        if (fs.existsSync(promptPath)) {
          const raw = fs.readFileSync(promptPath, 'utf8');
          if (raw.trim().length > 100) { customTemplate = raw.trim(); }
        }
      }
    } catch { /* ignore */ }

    const contextJson = JSON.stringify(context, null, 2);
    if (customTemplate) {
      return customTemplate.replace('{{CONTEXT}}', contextJson);
    }

    return `You are a Salesforce Certified Technical Architect authoring a Future Readiness Assessment for the client's architecture and executive leadership. The assessment evaluates whether the org is ready to adopt AI / Agentforce, Data Cloud, and Hyperforce.

CRITICAL RULES:
- The scores, grades, blocking issues, and roadmap in the context are AUTHORITATIVE and computed by OrgPulse. NEVER recalculate, restate different numbers, or contradict them.
- Your job is INTERPRETATION only: explain what the scores mean, why they matter to the business, and how to sequence the work.
- Ground every statement in the evidence provided (counts, sObject names, metrics). No generic filler that could apply to any org.
- Be decisive and board-ready: concise, professional, no hype.

Return ONLY valid JSON (no markdown fences) with exactly these keys:
{
  "executiveSummary": "<4-6 sentences: the org's overall future-readiness posture, the single most consequential blocker, and the headline recommendation. Reference the overall score/grade verbatim.>",
  "overallMaturity": "<1-2 sentences positioning the org's overall maturity across the three capabilities, citing specific evidence.>",
  "packs": [
    { "packId": "ai-agentforce", "currentMaturity": "<1-2 sentences on current AI/Agentforce readiness, citing the pack score and weakest dimension.>", "businessImpact": "<1-2 sentences on the business consequence of the gaps.>", "summary": "<1 sentence headline recommendation for this pack.>" },
    { "packId": "data-cloud", "currentMaturity": "<…>", "businessImpact": "<…>", "summary": "<…>" },
    { "packId": "hyperforce", "currentMaturity": "<…>", "businessImpact": "<…>", "summary": "<…>" }
  ]
}

=== FUTURE READINESS CONTEXT ===
${contextJson}
`;
  }

  // ---------------------------------------------------------------------------
  // Ask the Architect — tool-augmented Q&A over the live org
  // ---------------------------------------------------------------------------

  public async askArchitect(question: string, result?: AnalysisResult | null, modelSelector?: string): Promise<string | null> {
    const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
    if (!cfg.get<boolean>('enabled', true)) {
      throw new Error('AI features are disabled. Enable them in Settings → sfHealthAnalyzer.ai.enabled.');
    }
    if (!question || !question.trim()) { return null; }

    // Reuses the CTA consent gate — this can send org data to the model and query live.
    const consented = await this.ensureCtaConsent(modelSelector);
    if (!consented) {
      throw new Error('Ask the Architect cancelled — you declined to send org data to the AI model.');
    }

    const { backend, customModel } = resolveBackend(modelSelector);

    // ── Direct Anthropic Claude backend (API key + tool use) ─────────────────
    if (backend === 'anthropic') {
      try {
        const answer = await runAnthropicToolLoop(buildArchitectSystemPrompt(result), question.trim(), customModel);
        logInfo('Ask the Architect answered (backend: anthropic)');
        return answer.trim();
      } catch (err) {
        logError('Ask the Architect (anthropic backend) failed', err as Error);
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }

    // ── Local / custom backend (OpenAI-compatible tool calling) ──────────────
    if (backend === 'custom') {
      try {
        const answer = await runCustomToolLoop(
          [
            { role: 'system', content: buildArchitectSystemPrompt(result) },
            { role: 'user', content: question.trim() },
          ],
          customModel,
        );
        logInfo('Ask the Architect answered (backend: custom)');
        return answer.trim();
      } catch (err) {
        logError('Ask the Architect (custom backend) failed', err as Error);
        throw new Error(err instanceof Error ? err.message : String(err));
      }
    }

    // ── VS Code Language Model backend ───────────────────────────────────────
    try {
      const { model, provider } = await selectBestModel(modelSelector);
      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(buildArchitectSystemPrompt(result)),
        vscode.LanguageModelChatMessage.User(question.trim()),
      ];

      let answer = '';
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await model.sendRequest(
          messages,
          { tools: ARCHITECT_TOOLS, justification: 'OrgPulse — answering an architecture question using read-only org queries.' }
        );

        const assistantParts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];
        const toolCalls: vscode.LanguageModelToolCallPart[] = [];
        answer = '';
        for await (const part of response.stream) {
          if (part instanceof vscode.LanguageModelTextPart) {
            answer += part.value;
            assistantParts.push(part);
          } else if (part instanceof vscode.LanguageModelToolCallPart) {
            toolCalls.push(part);
            assistantParts.push(part);
          }
        }

        if (toolCalls.length === 0) {
          logInfo(`Ask the Architect answered (model: ${provider}, rounds: ${round})`);
          return answer.trim();
        }

        // Feed the assistant's tool calls + their results back for the next round.
        messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));
        const resultParts: vscode.LanguageModelToolResultPart[] = [];
        for (const call of toolCalls) {
          const out = await runArchitectTool(call.name, call.input as Record<string, unknown>);
          resultParts.push(new vscode.LanguageModelToolResultPart(call.callId, [new vscode.LanguageModelTextPart(out)]));
        }
        messages.push(vscode.LanguageModelChatMessage.User(resultParts));
      }

      return answer.trim() || 'I reached the maximum number of data-gathering steps before completing an answer. Try a more specific question.';
    } catch (err) {
      logError('Ask the Architect failed', err as Error);
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `${msg}. Tip: connect Claude (🔑 Authorize Claude), sign in to GitHub Copilot, or configure a Custom (API key) endpoint, then pick that model.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Consent management
  // ---------------------------------------------------------------------------

  public async revokeConsent(): Promise<void> {
    this.consentGranted    = false;
    this.ctaConsentGranted = false;
    await this.context.globalState.update(CONSENT_KEY, false);
    await this.context.globalState.update(CTA_CONSENT_KEY, false);
    aiCache.clear();
    ctaCache.clear();
    futureReadinessCache.clear();
    vscode.window.showInformationMessage('AI consent revoked. All cached AI results cleared.');
  }
}

// ============================================================================
// Singleton factory
// ============================================================================

let _aiService: AIService | null = null;

export function initAIService(
  context: vscode.ExtensionContext,
  assessmentContextService?: IAssessmentContextService,
  futureReadinessService?: IFutureReadinessService,
): AIService {
  _aiService = new AIService(context, assessmentContextService, futureReadinessService);
  return _aiService;
}

export function getAIService(): AIService | null {
  return _aiService;
}

