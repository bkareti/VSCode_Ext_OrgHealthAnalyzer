/**
 * AI Service — Phase 5 (v1.4.0)
 *
 * Provides AI-powered issue explanations and CTA-tier architectural synthesis via:
 *   1. Anthropic Claude (claude-sonnet-4-6 / claude-opus-4-6) via vscode.lm
 *   2. GitHub Copilot (gpt-4o) via vscode.lm — fallback
 *   3. Any available vscode.lm model — final fallback
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

// ============================================================================
// Types
// ============================================================================

export type AIProviderName = 'claude' | 'copilot' | 'none';

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

// In-memory AI response cache keyed by ruleId + message
const aiCache = new Map<string, AIExplanation>();
const ctaCache = new Map<string, CTAReview>();
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

async function selectBestModel(overridePreference?: string): Promise<SelectedModel> {
  if (!vscode.lm) {
    throw new Error('VS Code Language Model API not available');
  }

  // Read user preference from settings (can be overridden by caller)
  const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
  const preference = overridePreference ?? cfg.get<string>('ctaModel', 'auto');

  type ModelCandidate = { vendor: string; family: string; provider: AIProviderName };

  let candidates: ModelCandidate[];
  switch (preference) {
    case 'claude-sonnet':
      candidates = [{ vendor: 'anthropic', family: 'claude-sonnet-4-6', provider: 'claude' }];
      break;
    case 'claude-opus':
      candidates = [{ vendor: 'anthropic', family: 'claude-opus-4-6', provider: 'claude' }];
      break;
    case 'gpt-4o':
      candidates = [{ vendor: 'copilot', family: 'gpt-4o', provider: 'copilot' }];
      break;
    default: // 'auto' — try best available
      candidates = [
        { vendor: 'anthropic', family: 'claude-sonnet-4-6', provider: 'claude' },
        { vendor: 'anthropic', family: 'claude-opus-4-6', provider: 'claude' },
        { vendor: 'copilot', family: 'gpt-4o', provider: 'copilot' },
      ];
  }

  for (const candidate of candidates) {
    try {
      const models = await vscode.lm.selectChatModels({ vendor: candidate.vendor, family: candidate.family });
      if (models && models.length > 0) {
        logInfo(`AI: selected model ${models[0].name} (${candidate.vendor}/${candidate.family})`);
        return { model: models[0], provider: candidate.provider };
      }
    } catch {
      // model not available — continue
    }
  }

  // Final fallback: any model
  const anyModels = await vscode.lm.selectChatModels();
  if (anyModels && anyModels.length > 0) {
    logInfo(`AI: fallback to any model — ${anyModels[0].name}`);
    return { model: anyModels[0], provider: 'copilot' };
  }

  throw new Error('No AI language model available. Install GitHub Copilot Chat or an Anthropic extension.');
}

// ============================================================================
// Strip markdown fences from model output
// ============================================================================

function stripFences(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\n?([\s\S]*?)```/);
  if (fenceMatch) { return fenceMatch[1].trim(); }
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
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
  const totalCustomFields = dataModelStats.reduce((sum, s) => sum + (s.customFields ?? s.totalFields ?? 0), 0);

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

  const snapshot = `Health Scores: codeQuality=${scores.codeQuality ?? 'N/A'}, automationDesign=${scores.automationDesign ?? 'N/A'}, dataModel=${scores.dataModel ?? 'N/A'}, overall=${scores.overall ?? 'N/A'}

Org Inventory:
- Apex Classes: ${orgInv.apexClassCount ?? 0}, Apex Triggers: ${orgInv.apexTriggerCount ?? 0}
- Flows: ${orgInv.flowCount ?? 0}
- Profiles: ${orgInv.profileCount ?? 0}, Permission Sets: ${orgInv.permissionSetCount ?? 0}
- Custom Objects: ${orgInv.customObjectCount ?? 0} (total custom fields: ${totalCustomFields})
- Validation Rules: ${orgInv.validationRuleCount ?? 0}
- Record Types: ${orgInv.recordTypeCount ?? 0}, Page Layouts: ${orgInv.pageLayoutCount ?? 0}, Lightning Pages: ${orgInv.flexiPageCount ?? 0}

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
          return template.replace('{{SNAPSHOT}}', snapshot);
        }
      }
    }
  } catch (e) {
    logWarning(`Could not load custom CTA prompt: ${String(e)}`);
  }

  // Default built-in prompt (mirrors cta-prompt.md — keep in sync)
  return `You are a Salesforce Certified Technical Architect (CTA) and enterprise transformation advisor.
Produce a premium 12-section executive architecture report. Be CONCISE — 1-2 sentences per string field. No filler.

ARCHITECTURE MATURITY LEVELS: 1=Ad Hoc, 2=Repeatable, 3=Defined, 4=Managed, 5=Optimised.
BENCHMARK REFERENCE: Code coverage avg 78%/top 92%; Triggers-per-object avg 1.2/top 1.0; Flow:Apex ratio avg 2.5:1/top 4:1; Custom fields/object avg 38/top <25; Profile count avg 22/top <12.

Return ONLY valid JSON (no markdown fences) with ALL 15 keys:
{
  "verdict": "Go"|"Conditional Go"|"No-Go",
  "executiveSummary": "<3-4 sentences for C-suite. Lead with most critical finding.>",
  "architectureMaturity": { "level": <1-5>, "label": "<Ad Hoc|Repeatable|Defined|Managed|Optimised>", "summary": "<1-2 sentences with 2 evidence points.>" },
  "businessImpactSummary": { "revenueRisk": "<1 sentence>", "operationalRisk": "<1 sentence>", "complianceRisk": "<1 sentence>", "overallSeverity": "Low"|"Medium"|"High"|"Critical" },
  "orgProfile": { "complexity": "Simple"|"Moderate"|"Complex"|"Enterprise", "userScale": "<e.g. 500-1000 users>", "integrationFootprint": "<brief>", "customizationLevel": "<brief>" },
  "healthScoreBreakdown": [
    { "area": "Code Quality", "score": <exact score from snapshot>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence>" },
    { "area": "Automation Design", "score": <exact score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence>" },
    { "area": "Data Model", "score": <exact score>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence>" },
    { "area": "Security", "score": <derive from Security domain finding>, "maxScore": 100, "trend": "improving"|"stable"|"declining", "keyFinding": "<1 sentence>" }
  ],
  "topCriticalIssues": [
    { "rank": 1, "title": "<title>", "severity": "Critical"|"High", "domain": "<domain>", "impact": "<1 sentence>", "remediation": "<1 sentence>", "effortEstimate": "<e.g. 1-2 days>" }
    ...up to 10 items
  ],
  "riskAnalysis": {
    "probabilityOfIncident": "<1 sentence with % estimate and timeframe>",
    "timeToRisk": "<e.g. 3-6 months>",
    "riskHeatmap": [
      { "domain": "System Architecture", "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Security", "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Data Architecture", "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Integration", "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" },
      { "domain": "Solution Architecture", "likelihood": "Low"|"Medium"|"High", "impact": "Low"|"Medium"|"High" }
    ]
  },
  "benchmarkComparison": [
    { "metric": "<metric>", "orgValue": "<value>", "industryAvg": "<avg>", "topQuartile": "<top>", "status": "Below"|"At"|"Above" }
    ...3-5 items
  ],
  "domainFindings": [
    { "domain": "System Architecture", "status": "Pass"|"Warning"|"Fail", "analysis": "<2 sentences>", "risks": ["<specific>"], "recommendations": ["<concrete>"] },
    { "domain": "Security", ... },
    { "domain": "Data Architecture", ... },
    { "domain": "Integration", ... },
    { "domain": "Solution Architecture", ... }
  ],
  "aiInsights": { "hiddenRisks": ["<max 3>"], "predictions": ["<max 3>"], "unusualPatterns": ["<max 3>"] },
  "architectureObservations": [
    { "observation": "<1 sentence>", "classification": "Strength"|"Weakness"|"Opportunity"|"Threat" }
    ...4-8 items covering all 4 classifications
  ],
  "recommendations": {
    "quickWins": [ { "action": "<action>", "effort": "Low"|"Medium"|"High", "impact": "<impact>" } ...3-5 items ],
    "strategic": [ { "action": "<action>", "timeline": "<e.g. Q3 2026>", "effort": "Low"|"Medium"|"High", "impact": "<impact>" } ...3-5 items ]
  },
  "costOfInaction": { "financialImpact": "<1 sentence>", "technicalDebtGrowth": "<1 sentence>", "risks": ["<max 3>"] },
  "finalRecommendation": { "summary": "<2-3 sentences>", "nextSteps": ["<max 5 immediate actions>"], "proposedTimeline": "<90-day plan>" }
}

RULES: Exactly 5 domainFindings. healthScoreBreakdown scores must match snapshot values. LDV >500k → Data Architecture Warning/Fail. Multi-trigger objects → name them in System Architecture. @RestResource without sharing → flag in Security. Be specific — name classes/objects.

=== ORG HEALTH SNAPSHOT ===
${snapshot}
`;
}

// ============================================================================
// Core AI call helper
// ============================================================================

async function callModel(prompt: string, modelPreference?: string): Promise<{ text: string; provider: AIProviderName }> {
  const { model, provider } = await selectBestModel(modelPreference);

  const messages = [vscode.LanguageModelChatMessage.User(prompt)];
  const response = await model.sendRequest(
    messages,
    { justification: 'OrgPulse Salesforce Health Analyzer — generating architectural review.' }
  );

  let raw = '';
  for await (const chunk of response.text) {
    raw += chunk;
  }

  return { text: raw, provider };
}

// ============================================================================
// AIService — singleton
// ============================================================================

export class AIService {
  private context: vscode.ExtensionContext;
  private consentGranted: boolean;
  private ctaConsentGranted: boolean;

  constructor(context: vscode.ExtensionContext) {
    this.context             = context;
    this.consentGranted      = context.globalState.get<boolean>(CONSENT_KEY, false);
    this.ctaConsentGranted   = context.globalState.get<boolean>(CTA_CONSENT_KEY, false);
  }

  // ---------------------------------------------------------------------------
  // Consent helpers
  // ---------------------------------------------------------------------------

  private async ensureConsent(): Promise<boolean> {
    if (this.consentGranted) { return true; }

    const choice = await vscode.window.showInformationMessage(
      'Salesforce Health Analyzer wants to send the selected issue details to your AI model (running locally in VS Code via vscode.lm). No data leaves your machine via this extension.',
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

  private async ensureCtaConsent(): Promise<boolean> {
    if (this.ctaConsentGranted) { return true; }

    const choice = await vscode.window.showInformationMessage(
      'CTA Architecture Review will send your org health snapshot (scores, issue summaries, inventory counts, licence data) to an AI model via VS Code\'s language model API. The data stays within VS Code. Proceed?',
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
  // CTA Architecture Synthesis
  // ---------------------------------------------------------------------------

  public async synthesizeCtaReview(result: AnalysisResult, modelPreference?: string): Promise<CTAReview | null> {
    const cfg = vscode.workspace.getConfiguration('sfHealthAnalyzer.ai');
    if (!cfg.get<boolean>('enabled', true)) {
      vscode.window.showInformationMessage(
        'AI features are disabled. Enable them in Settings → sfHealthAnalyzer.ai.enabled.'
      );
      return null;
    }

    // CTA review cache keyed by analysis timestamp (or fallback to issues count)
    const cacheKey = result.timestamp
      ? result.timestamp.toISOString()
      : String(result.issues?.length ?? 0);
    const cached = ctaCache.get(cacheKey);
    if (cached) {
      logInfo('AI: returning cached CTA review');
      return cached;
    }

    const consented = await this.ensureCtaConsent();
    if (!consented) { return null; }

    try {
      const { text, provider } = await callModel(buildCtaPrompt(result), modelPreference);
      const cleaned = stripFences(text);

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
      vscode.window.showWarningMessage(`CTA Architecture Review failed: ${msg}`);
      return null;
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
    vscode.window.showInformationMessage('AI consent revoked. All cached AI results cleared.');
  }
}

// ============================================================================
// Singleton factory
// ============================================================================

let _aiService: AIService | null = null;

export function initAIService(context: vscode.ExtensionContext): AIService {
  _aiService = new AIService(context);
  return _aiService;
}

export function getAIService(): AIService | null {
  return _aiService;
}

