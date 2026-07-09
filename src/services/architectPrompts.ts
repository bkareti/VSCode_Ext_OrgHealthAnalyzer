/**
 * Per-tab custom "Architect Recommendations" prompt storage.
 *
 * Stored in the workspace at `.orgpulse/architectPrompts.json`, alongside the existing
 * `.orgpulse/cache.json` analysis cache (see CACHE_FOLDER in extension.ts). Each entry is
 * an admin-editable addendum appended to that tab's default AI prompt — see the
 * "Recommendation Prompts" pane in Settings and formatFutureReadinessPrompt/
 * formatContextAsPrompt in aiService.ts, which consume these via getArchitectPromptAddendum().
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { logWarning } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

const PROMPTS_FOLDER = '.orgpulse';
const PROMPTS_FILE = 'architectPrompts.json';

export interface ArchitectPromptScope {
  id: string;
  label: string;
  defaultPrompt: string;
}

/**
 * Every dashboard tab that can host Architect Recommendations, with a sensible default
 * prompt. Only 'futurereadiness', 'cta', 'licenserecs', 'datacloudreadiness', and
 * 'agentforcereadiness' are wired into a live AI call today (each has a synthesis
 * method); the rest are stored for the planned multi-tab rollout.
 */
export const ARCHITECT_PROMPT_SCOPES: ArchitectPromptScope[] = [
  {
    id: 'overview',
    label: 'Overview',
    defaultPrompt: 'Synthesize the org\'s overall health across every category into a prioritized executive summary. Call out the 2-3 issues most likely to block a major initiative, and the single fastest win available.',
  },
  {
    id: 'orginfo',
    label: 'Org Info',
    defaultPrompt: 'Assess the org\'s edition, licensing, and platform profile for risk or missed opportunity. Flag stale API versions, underused licenses, or an edition mismatched to the org\'s scale.',
  },
  {
    id: 'datamodel',
    label: 'Data Model',
    defaultPrompt: 'Evaluate data model design quality — object and field proliferation, field usage, and relationship complexity. Recommend consolidation or cleanup grounded in real field/object counts.',
  },
  {
    id: 'automation',
    label: 'Automation',
    defaultPrompt: 'Review automation complexity — flow, trigger, and process builder counts per object. Identify automation sprawl, conflicting logic, or migration candidates (e.g. Process Builder to Flow).',
  },
  {
    id: 'code',
    label: 'Code Quality',
    defaultPrompt: 'Assess Apex code quality and test coverage. Prioritize classes with low coverage, high complexity, or repeated anti-patterns, and recommend concrete refactoring targets.',
  },
  {
    id: 'perflimits',
    label: 'Performance & Limits',
    defaultPrompt: 'Analyze query performance and governor limit consumption trends. Flag SOQL/DML patterns and limit usage trending toward thresholds that risk production failures.',
  },
  {
    id: 'govlimits',
    label: 'Governor Limits',
    defaultPrompt: 'Assess governor limit headroom across all limit types. Prioritize limits trending toward exhaustion and the automation or code driving that consumption.',
  },
  {
    id: 'secaccess',
    label: 'Security & Access',
    defaultPrompt: 'Review the sharing model, profile, and permission set design for over-permissioning or gaps. Flag broad access grants and stale or inactive user risk.',
  },
  {
    id: 'techdebt',
    label: 'Technical Debt',
    defaultPrompt: 'Summarize the technical debt backlog by effort and impact. Recommend a sequencing plan starting with the highest-impact, lowest-effort items.',
  },
  {
    id: 'futurereadiness',
    label: 'Future Readiness',
    defaultPrompt: 'Assess readiness for AI/Agentforce, Data Cloud, and Hyperforce adoption. Ground every recommendation strictly in the pack scores, blocking issues, and evidence provided.',
  },
  {
    id: 'datacloudreadiness',
    label: 'Data Cloud Readiness (AI Insights)',
    defaultPrompt: 'Write concise, evidence-cited insight cards for the Data Cloud Readiness Overview — identity resolution, ingestion, activation, and governance gaps — grounded strictly in the scores and blocking issues provided. Never invent counts or percentages.',
  },
  {
    id: 'agentforcereadiness',
    label: 'Agentforce Readiness (AI Insights)',
    defaultPrompt: 'Write concise, evidence-cited insight cards for the Agentforce Readiness Overview — data quality, security/sharing, automation, and AI enablement gaps — grounded strictly in the scores and blocking issues provided. Never invent counts or percentages.',
  },
  {
    id: 'cta',
    label: 'OrgPulse Advisory (CTA Review)',
    defaultPrompt: 'Deliver a CTA-grade architecture review — risk, business impact, and a decisive final recommendation — grounded strictly in the scores and findings provided.',
  },
  {
    id: 'licenserecs',
    label: 'License Recommendations',
    defaultPrompt: 'Write concise, evidence-cited narrative for each license optimization card, strictly grounded in the counts and evidence already provided. Never invent numbers or dollar figures not already present in the context.',
  },
  {
    id: 'askarchitect',
    label: 'Ask Architect',
    defaultPrompt: 'Answer as a pragmatic Salesforce Certified Technical Architect who grounds every answer in this org\'s real data, not generic best practices.',
  },
  {
    id: 'trendshistory',
    label: 'Trends & History',
    defaultPrompt: 'Analyze score trends across scans. Call out categories moving in the wrong direction and what is most likely driving the regression.',
  },
];

function promptsFilePath(): string | null {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) { return null; }
  return path.join(ws, PROMPTS_FOLDER, PROMPTS_FILE);
}

/** Raw saved overrides only (does not include defaults) — used to hydrate the Settings UI. */
export function loadArchitectPrompts(): Record<string, string> {
  try {
    const filePath = promptsFilePath();
    if (!filePath || !fs.existsSync(filePath)) { return {}; }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    logWarning(`Failed to load architect prompts: ${getErrorMessage(e)}`);
    return {};
  }
}

export function saveArchitectPrompt(scopeId: string, text: string): void {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) { throw new Error('No workspace folder open.'); }
  const dir = path.join(ws, PROMPTS_FOLDER);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
  const gitignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) { fs.writeFileSync(gitignorePath, '*\n', 'utf8'); }
  const current = loadArchitectPrompts();
  current[scopeId] = text;
  fs.writeFileSync(path.join(dir, PROMPTS_FILE), JSON.stringify(current, null, 2), 'utf8');
}

/** The effective custom addendum for a scope (saved override, else '' — never the default text). */
export function getArchitectPromptAddendum(scopeId: string): string {
  return (loadArchitectPrompts()[scopeId] ?? '').trim();
}
