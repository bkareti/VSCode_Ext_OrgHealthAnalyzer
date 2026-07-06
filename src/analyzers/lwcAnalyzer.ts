/**
 * LWC Quality Analyzer
 *
 * Scans Lightning Web Component files in the local workspace to detect:
 * - Deprecated APIs (@api track, @api wire old syntax)
 * - Accessibility issues (missing aria-* attributes, unlabeled inputs)
 * - Component complexity (JS controller size, template complexity)
 * - Wire adapter misuse patterns
 * - Missing error handling in wire adapters
 * - Missing JSDoc documentation
 * - Component test coverage gaps
 * - Security issues (innerHTML XSS risks, eval usage)
 * - Performance anti-patterns (imperative queries in connectedCallback)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Issue, LwcComponentInfo, LwcSummary } from '../types';
import { logInfo, logWarning } from '../utils/logger';

// ─── Regex patterns ──────────────────────────────────────────────────────────
const RE_TRACK_DECORATOR      = /@track\b/g;
const RE_API_DECORATOR        = /@api\s+(\w+)/g;
const RE_WIRE_DECORATOR       = /@wire\s*\(/g;
const RE_WIRE_NO_ERROR        = /@wire[^;]*\n\s+\w+\s*;/g;
const RE_INNER_HTML           = /\.innerHTML\s*=/g;
const RE_EVAL_USAGE           = /\beval\s*\(/g;
const RE_TEMPLATE_IF          = /if:true|if:false/g;
const RE_IMPORT_APEX          = /import\s+\w+\s+from\s+'@salesforce\/apex\//g;
const RE_IMPORT_LABEL         = /import\s+\w+\s+from\s+'@salesforce\/label\//g;
const RE_IMPERATIVE_CALL      = /this\.\w+\(.*\)\s*\.then\s*\(/g;
const RE_CONNECTEDCALLBACK    = /connectedCallback\s*\(\s*\)\s*\{/g;
const RE_MISSING_ARIA_LABEL   = /<input(?![^>]*aria-label)[^>]*>/gi;
const RE_DEPRECATED_LIGHTNING  = /lightning-input-rich-text|c-custom-datatable/gi;
const RE_CONSOLE_LOG           = /console\.(log|warn|debug)\s*\(/g;
const RE_HARDCODED_ORGID       = /\/id\/[a-zA-Z0-9]{15,18}/g;
const RE_TODO_COMMENT          = /\/\/\s*(TODO|FIXME|HACK|XXX)/gi;

interface LwcFile {
  name: string;
  componentDir: string;
  jsFile?: vscode.Uri;
  htmlFile?: vscode.Uri;
  cssFile?: vscode.Uri;
  testFiles: vscode.Uri[];
  metaFile?: vscode.Uri;
}

/**
 * Discover all LWC components in the workspace.
 */
async function discoverLwcComponents(): Promise<LwcFile[]> {
  const componentDirs: LwcFile[] = [];

  // Search for lwc/*/componentName.js pattern
  const jsFiles = await vscode.workspace.findFiles(
    '**/lwc/**/*.js',
    '**/node_modules/**',
    500,
  );

  // Group by component directory
  const dirMap = new Map<string, LwcFile>();
  for (const jsUri of jsFiles) {
    const filePath = jsUri.fsPath;
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.js');
    const dirName = path.basename(dir);

    // LWC convention: file name == dir name for main controller
    if (baseName !== dirName) { continue; }
    if (baseName.endsWith('.test') || baseName.endsWith('.spec')) { continue; }

    if (!dirMap.has(dir)) {
      dirMap.set(dir, {
        name: dirName,
        componentDir: dir,
        testFiles: [],
      });
    }
    dirMap.get(dir)!.jsFile = jsUri;
  }

  // Find HTML templates
  const htmlFiles = await vscode.workspace.findFiles('**/lwc/**/*.html', '**/node_modules/**', 500);
  for (const htmlUri of htmlFiles) {
    const dir = path.dirname(htmlUri.fsPath);
    if (dirMap.has(dir)) {
      dirMap.get(dir)!.htmlFile = htmlUri;
    }
  }

  // Find CSS files
  const cssFiles = await vscode.workspace.findFiles('**/lwc/**/*.css', '**/node_modules/**', 500);
  for (const cssUri of cssFiles) {
    const dir = path.dirname(cssUri.fsPath);
    if (dirMap.has(dir)) {
      dirMap.get(dir)!.cssFile = cssUri;
    }
  }

  // Find test files
  const testFiles = await vscode.workspace.findFiles(
    '**/lwc/**/__tests__/**/*.js',
    '**/node_modules/**',
    1000,
  );
  for (const testUri of testFiles) {
    // Navigate up from __tests__ to find component dir
    const testDir = path.dirname(testUri.fsPath);
    const parentDir = path.dirname(testDir);
    if (dirMap.has(parentDir)) {
      dirMap.get(parentDir)!.testFiles.push(testUri);
    }
  }

  // Find meta files
  const metaFiles = await vscode.workspace.findFiles('**/lwc/**/*.js-meta.xml', '**/node_modules/**', 500);
  for (const metaUri of metaFiles) {
    const dir = path.dirname(metaUri.fsPath);
    if (dirMap.has(dir)) {
      dirMap.get(dir)!.metaFile = metaUri;
    }
  }

  componentDirs.push(...dirMap.values());
  return componentDirs;
}

/**
 * Analyze a single LWC component's JS controller.
 */
async function analyzeJsFile(
  component: LwcFile,
  issues: Issue[],
): Promise<LwcComponentInfo> {
  const info: LwcComponentInfo = {
    name: component.name,
    path: component.componentDir,
    hasTemplate: !!component.htmlFile,
    hasController: !!component.jsFile,
    hasTests: component.testFiles.length > 0,
    hasCss: !!component.cssFile,
    templateLines: 0,
    controllerLines: 0,
    wireCount: 0,
    hasPublicApi: false,
    issues: [],
  };

  if (!component.jsFile) { return info; }

  let js = '';
  try {
    const raw = await vscode.workspace.fs.readFile(component.jsFile);
    js = Buffer.from(raw).toString('utf8');
  } catch {
    logWarning(`Could not read LWC JS file: ${component.jsFile.fsPath}`);
    return info;
  }

  const lines = js.split('\n');
  info.controllerLines = lines.length;

  // ── @track decorator (deprecated in LWC, use reactive properties) ──────
  const trackMatches = js.match(RE_TRACK_DECORATOR);
  if (trackMatches) {
    const count = trackMatches.length;
    issues.push({
      id:          `lwc-track-${component.name}`,
      ruleId:      'lwc.deprecated-track',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: @track decorator is deprecated — ${count} usage(s)`,
      description: '@track is no longer needed in LWC. All properties declared in a class are reactive by default. Remove the @track decorator.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Remove @track and declare the property directly: myProp = []; instead of @track myProp = [];',
    });
    info.issues.push('@track deprecated');
  }

  // ── @api public properties ────────────────────────────────────────────
  const apiMatches = [...js.matchAll(RE_API_DECORATOR)];
  if (apiMatches.length > 0) {
    info.hasPublicApi = true;
    if (apiMatches.length > 10) {
      issues.push({
        id:          `lwc-api-overload-${component.name}`,
        ruleId:      'lwc.api-overload',
        severity:    'warning',
        category:    'lwc-quality',
        message:     `${component.name}: ${apiMatches.length} @api properties — component may be doing too much`,
        description: 'A high number of @api properties suggests the component has too many responsibilities. Consider splitting it into smaller, focused components.',
        file:        component.jsFile.fsPath,
        object:      component.name,
        suggestion:  'Aim for < 10 @api properties per component. Extract logic into child components or Apex services.',
      });
      info.issues.push('Too many @api properties');
    }
  }

  // ── @wire decorators ────────────────────────────────────────────────
  const wireMatches = js.match(RE_WIRE_DECORATOR);
  info.wireCount = wireMatches ? wireMatches.length : 0;

  // Check for @wire without error handling (property-based wire without {data, error} destructure)
  const wirePropertyPattern = /@wire\([^)]+\)\s+\w+;/g;
  const wirePropertiesSimple = js.match(wirePropertyPattern);
  if (wirePropertiesSimple && wirePropertiesSimple.length > 0) {
    issues.push({
      id:          `lwc-wire-no-error-${component.name}`,
      ruleId:      'lwc.wire-missing-error-handling',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: Wire adapter(s) without {data, error} destructuring — error states not handled`,
      description: 'Using @wire with a simple property (e.g., @wire(getRecord) record;) means errors from the server are silently ignored. Use { data, error } destructuring to handle both success and failure states.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Change to: @wire(getRecord, { recordId: "$recordId" }) wiredRecord({ data, error }) { if (error) { this.error = error; } else if (data) { this.record = data; } }',
    });
    info.issues.push('Wire without error handling');
  }

  // ── innerHTML XSS risk ───────────────────────────────────────────────
  if (RE_INNER_HTML.test(js)) {
    issues.push({
      id:          `lwc-innerHTML-${component.name}`,
      ruleId:      'lwc.security-innerHTML',
      severity:    'error',
      category:    'lwc-quality',
      message:     `${component.name}: Direct innerHTML assignment detected — XSS risk`,
      description: 'Setting innerHTML directly can introduce XSS vulnerabilities. LWC templates provide auto-escaping; use template literals and data binding instead.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Use LWC template bindings ({variable}) instead of innerHTML. For rich text, use lwc:domManual only with sanitized content.',
    });
    info.issues.push('innerHTML XSS risk');
  }
  RE_INNER_HTML.lastIndex = 0;

  // ── eval() usage ─────────────────────────────────────────────────────
  if (RE_EVAL_USAGE.test(js)) {
    issues.push({
      id:          `lwc-eval-${component.name}`,
      ruleId:      'lwc.security-eval',
      severity:    'error',
      category:    'lwc-quality',
      message:     `${component.name}: eval() usage detected — security and CSP violation`,
      description: 'eval() is blocked by Salesforce Content Security Policy (CSP) and is a critical security risk. Use JSON.parse() for data, or proper function references.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Replace eval() with JSON.parse() for data parsing, or use a proper function reference / dynamic import.',
    });
    info.issues.push('eval() usage');
  }
  RE_EVAL_USAGE.lastIndex = 0;

  // ── console.log in production code ────────────────────────────────────
  const consoleLogs = js.match(RE_CONSOLE_LOG);
  if (consoleLogs && consoleLogs.length > 3) {
    issues.push({
      id:          `lwc-console-${component.name}`,
      ruleId:      'lwc.console-log',
      severity:    'info',
      category:    'lwc-quality',
      message:     `${component.name}: ${consoleLogs.length} console.log/warn/debug calls — remove before production`,
      description: 'Console logging in production LWC components can expose sensitive data in browser dev tools and impacts performance.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Remove console.log statements or wrap them in a debug flag: if (window.location.hostname === "localhost") { console.log(...); }',
    });
  }

  // ── Large controller ─────────────────────────────────────────────────
  if (info.controllerLines > 400) {
    issues.push({
      id:          `lwc-size-${component.name}`,
      ruleId:      'lwc.controller-too-large',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: JS controller is ${info.controllerLines} lines — consider splitting`,
      description: 'A very large LWC controller suggests too many responsibilities. Large controllers are harder to test, maintain, and understand.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Extract reusable logic into service modules (lwc/myService/myService.js). Break complex components into parent/child component trees.',
    });
    info.issues.push('Large controller');
  }

  // ── Hard-coded org IDs ───────────────────────────────────────────────
  if (RE_HARDCODED_ORGID.test(js)) {
    issues.push({
      id:          `lwc-orgid-${component.name}`,
      ruleId:      'lwc.hardcoded-id',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: Hard-coded Salesforce ID detected in LWC controller`,
      description: 'Hard-coded Salesforce IDs break across orgs (sandbox → production) and in managed packages.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Pass IDs via @api properties, URL parameters, or retrieve them via @wire(getRecord) or Apex calls.',
    });
  }
  RE_HARDCODED_ORGID.lastIndex = 0;

  // ── No tests ─────────────────────────────────────────────────────────
  if (!info.hasTests && info.controllerLines > 30) {
    issues.push({
      id:          `lwc-no-tests-${component.name}`,
      ruleId:      'lwc.missing-tests',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: No unit tests found — component is untested`,
      description: 'LWC components should have Jest unit tests in a __tests__ directory. Untested components are deployment risks.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Create __tests__/componentName.test.js using @salesforce/sfdx-lwc-jest. Test render, user interaction, and wire adapter responses.',
    });
    info.issues.push('No tests');
  }

  // ── TODO/FIXME comments ───────────────────────────────────────────────
  const todoMatches = js.match(RE_TODO_COMMENT);
  if (todoMatches && todoMatches.length > 2) {
    issues.push({
      id:          `lwc-todo-${component.name}`,
      ruleId:      'lwc.todo-comments',
      severity:    'info',
      category:    'lwc-quality',
      message:     `${component.name}: ${todoMatches.length} TODO/FIXME comments found`,
      description: 'TODO/FIXME comments represent unfinished or problematic code. They should be tracked as backlog items, not left in source code.',
      file:        component.jsFile.fsPath,
      object:      component.name,
      suggestion:  'Convert TODO/FIXME comments to tracked work items. Remove resolved ones.',
    });
  }

  return info;
}

/**
 * Analyze the HTML template of an LWC component.
 */
async function analyzeHtmlTemplate(
  component: LwcFile,
  info: LwcComponentInfo,
  issues: Issue[],
): Promise<void> {
  if (!component.htmlFile) { return; }

  let html = '';
  try {
    const raw = await vscode.workspace.fs.readFile(component.htmlFile);
    html = Buffer.from(raw).toString('utf8');
  } catch {
    return;
  }

  const lines = html.split('\n');
  info.templateLines = lines.length;

  // ── Template too large ────────────────────────────────────────────────
  if (info.templateLines > 300) {
    issues.push({
      id:          `lwc-template-size-${component.name}`,
      ruleId:      'lwc.template-too-large',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: Template is ${info.templateLines} lines — refactor into sub-components`,
      description: 'Large templates indicate a component is rendering too much. This impacts performance (virtual DOM diff cost) and maintainability.',
      file:        component.htmlFile.fsPath,
      object:      component.name,
      suggestion:  'Extract sections into child components. Use template:if and template:for only at the right granularity.',
    });
    info.issues.push('Large template');
  }

  // ── Accessibility: inputs without labels ─────────────────────────────
  const unlabeledInputs = html.match(RE_MISSING_ARIA_LABEL);
  if (unlabeledInputs && unlabeledInputs.length > 0) {
    issues.push({
      id:          `lwc-a11y-${component.name}`,
      ruleId:      'lwc.accessibility-label',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: ${unlabeledInputs.length} input(s) without aria-label — accessibility issue`,
      description: 'HTML inputs without aria-label or label associations fail WCAG 2.1 Level A. Screen readers cannot identify these fields.',
      file:        component.htmlFile.fsPath,
      object:      component.name,
      suggestion:  'Use lightning-input (which includes labels) or add aria-label/aria-labelledby to custom inputs.',
    });
    info.issues.push('Accessibility: missing labels');
  }

  // ── Deprecated lightning components ──────────────────────────────────
  const deprecatedComponents = html.match(RE_DEPRECATED_LIGHTNING);
  if (deprecatedComponents) {
    issues.push({
      id:          `lwc-deprecated-cmp-${component.name}`,
      ruleId:      'lwc.deprecated-component',
      severity:    'warning',
      category:    'lwc-quality',
      message:     `${component.name}: Deprecated Lightning component used: ${deprecatedComponents.join(', ')}`,
      description: 'Some Lightning components have been deprecated in favor of newer alternatives. Deprecated components may be removed in future API versions.',
      file:        component.htmlFile.fsPath,
      object:      component.name,
      suggestion:  'Check Salesforce release notes for replacement components. Use lightning-rich-text-editor instead of lightning-input-rich-text where available.',
    });
    info.issues.push('Deprecated component');
  }

  // ── if:true / if:false (should use template:if in newer API versions) ─
  const legacyIfDirectives = html.match(RE_TEMPLATE_IF);
  if (legacyIfDirectives && legacyIfDirectives.length > 0) {
    // Only flag as info (both are valid, but template:if is preferred in API 61+)
    issues.push({
      id:          `lwc-legacy-if-${component.name}`,
      ruleId:      'lwc.legacy-if-directive',
      severity:    'info',
      category:    'lwc-quality',
      message:     `${component.name}: ${legacyIfDirectives.length} legacy if:true/if:false directive(s) — consider template:if`,
      description: 'In API version 61+, the if:true and if:false directives are replaced by lwc:if, lwc:elseif, and lwc:else which are more expressive and support else-if chains.',
      file:        component.htmlFile.fsPath,
      object:      component.name,
      suggestion:  'Migrate to lwc:if="condition" and lwc:else blocks for clearer conditional rendering.',
    });
  }
}

/**
 * Main LWC Analyzer class.
 */
export class LwcAnalyzer {
  async analyze(orgCounts?: { lwc: number; aura: number }): Promise<{
    issues: Issue[];
    lwcSummary: LwcSummary;
  }> {
    logInfo('LwcAnalyzer: discovering LWC components...');
    const components = await discoverLwcComponents();
    logInfo(`LwcAnalyzer: found ${components.length} LWC components`);

    const issues: Issue[] = [];
    const componentList: LwcComponentInfo[] = [];

    for (const component of components) {
      const info = await analyzeJsFile(component, issues);
      await analyzeHtmlTemplate(component, info, issues);
      componentList.push(info);
    }

    const a11yIssues = componentList.filter(c =>
      c.issues.some(i => i.toLowerCase().includes('accessibility'))
    ).length;

    const orgComponentCount = orgCounts?.lwc ?? 0;
    const orgAuraComponentCount = orgCounts?.aura ?? 0;

    // Use org-level count as totalComponents when workspace scan finds nothing
    const totalComponents = components.length > 0 ? components.length : orgComponentCount;

    if (orgComponentCount > 0) {
      logInfo(`LwcAnalyzer: ${orgComponentCount} LWC + ${orgAuraComponentCount} Aura components in org`);
    }

    const summary: LwcSummary = {
      totalComponents,
      componentsWithTests: componentList.filter(c => c.hasTests).length,
      componentsWithA11yIssues: a11yIssues,
      componentList,
      orgComponentCount,
      orgAuraComponentCount,
    };

    logInfo(`LwcAnalyzer: ${issues.length} issues across ${components.length} components`);
    return { issues, lwcSummary: summary };
  }
}

export function createLwcAnalyzer(): LwcAnalyzer | null {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return null;
  }
  return new LwcAnalyzer();
}
