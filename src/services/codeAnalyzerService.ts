/**
 * Code Analyzer Service — delegates static code analysis to Salesforce Code
 * Analyzer v5 (`sf code-analyzer run`) and maps its violations onto OrgPulse's
 * `Issue` model so they flow into the existing scoring/dashboard pipeline.
 *
 * Prerequisites (the `code-analyzer` CLI plugin + a Java runtime) are detected by
 * `ensureCodeAnalyzer()` in salesforceService; this module assumes they are present.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Issue, IssueCategory, Severity } from '../types';
import { logInfo, logWarning, logError } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

const execFileAsync = promisify(execFile);

/** Shape of a single violation in the `code-analyzer run` JSON output. */
interface ScaLocation {
  file?: string;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
  comment?: string;
}

interface ScaViolation {
  rule?: string;
  engine?: string;
  severity?: number;
  tags?: string[];
  primaryLocationIndex?: number;
  locations?: ScaLocation[];
  message?: string;
  resources?: string[];
}

interface ScaRunOutput {
  runDir?: string;
  violations?: ScaViolation[];
}

/**
 * Map a Code Analyzer severity (1 Critical … 5 Info) onto OrgPulse's severity.
 */
function mapSeverity(severity: number | undefined): Severity {
  if (severity === undefined) { return 'warning'; }
  if (severity <= 2) { return 'error'; }
  if (severity === 3) { return 'warning'; }
  return 'info';
}

/**
 * Map an engine + its tags onto an OrgPulse `IssueCategory`.
 */
function mapCategory(engine: string, tags: string[]): IssueCategory {
  const lowerTags = tags.map(t => t.toLowerCase());
  const hasTag = (needle: string): boolean => lowerTags.some(t => t.includes(needle));

  switch (engine) {
    case 'eslint':
      return 'lwc-quality';
    case 'retire-js':
      return 'security';
    case 'cpd':
      return 'technical-debt';
    case 'sfge':
      // Salesforce Graph Engine is data-flow security analysis (CRUD/FLS).
      return 'security';
    case 'pmd':
    case 'regex':
    case 'flow':
    default:
      if (hasTag('security')) { return 'security'; }
      if (hasTag('performance')) { return 'performance'; }
      return 'code-quality';
  }
}

/**
 * Convert a single Code Analyzer violation into an OrgPulse `Issue`.
 * `runDir` is used to resolve relative file paths to absolute ones so the
 * dashboard "open file" action works.
 */
function mapViolationToIssue(v: ScaViolation, index: number, runDir: string): Issue {
  const engine = v.engine ?? 'code-analyzer';
  const rule = v.rule ?? 'unknown';
  const tags = v.tags ?? [];
  const locations = v.locations ?? [];
  const primary = locations[v.primaryLocationIndex ?? 0] ?? locations[0];

  let file: string | undefined = primary?.file;
  if (file && !path.isAbsolute(file) && runDir) {
    file = path.resolve(runDir, file);
  }

  const resourceUrl = v.resources && v.resources.length > 0 ? v.resources[0] : undefined;
  const suggestion = resourceUrl
    ? `See the rule documentation: ${resourceUrl}`
    : undefined;

  return {
    id: `sca-${engine}-${rule}-${index}`,
    ruleId: `${engine}:${rule}`,
    severity: mapSeverity(v.severity),
    category: mapCategory(engine, tags),
    message: `[${engine}] ${v.message ?? rule}`,
    description: primary?.comment,
    file,
    line: primary?.startLine,
    column: primary?.startColumn,
    endLine: primary?.endLine,
    endColumn: primary?.endColumn,
    suggestion,
  };
}

/**
 * Run Salesforce Code Analyzer against a local source path and return the
 * violations mapped to OrgPulse issues. Returns an empty array on any failure
 * (the caller falls back to the built-in rules).
 *
 * @param workspacePath Absolute path to the source to scan (e.g. force-app).
 * @param ruleSelector  Code Analyzer rule selector (default "Recommended").
 * @param runGraphEngine Include the Salesforce Graph Engine (slower; default off).
 */
export async function runCodeAnalyzer(
  workspacePath: string,
  ruleSelector: string = 'Recommended',
  runGraphEngine: boolean = false
): Promise<Issue[]> {
  const outputFile = path.join(
    os.tmpdir(),
    `orgpulse-sca-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  const selector = runGraphEngine ? `${ruleSelector},sfge` : ruleSelector;
  const args = [
    'code-analyzer', 'run',
    '--workspace', workspacePath,
    '--rule-selector', selector,
    '--output-file', outputFile,
  ];

  logInfo(`Running Salesforce Code Analyzer on ${workspacePath} (selector: ${selector})`);

  try {
    // `code-analyzer run` exits 0 even with violations unless a severity
    // threshold is set, so a normal resolution is expected. If it throws we
    // still attempt to read any output file that was produced before failing.
    await execFileAsync('sf', args, { maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    logWarning(`code-analyzer run exited non-zero: ${getErrorMessage(err)} — attempting to read partial output`);
  }

  let raw: string;
  try {
    raw = await fs.readFile(outputFile, 'utf8');
  } catch {
    logError('Code Analyzer produced no output file; skipping (built-in rules will be used).');
    return [];
  } finally {
    void fs.unlink(outputFile).catch(() => { /* best-effort cleanup */ });
  }

  let parsed: ScaRunOutput;
  try {
    parsed = JSON.parse(raw) as ScaRunOutput;
  } catch (err) {
    logError(`Failed to parse Code Analyzer output: ${getErrorMessage(err)}`);
    return [];
  }

  const violations = parsed.violations ?? [];
  const runDir = parsed.runDir ?? workspacePath;
  const issues = violations.map((v, i) => mapViolationToIssue(v, i, runDir));
  logInfo(`Code Analyzer reported ${issues.length} violations`);
  return issues;
}
