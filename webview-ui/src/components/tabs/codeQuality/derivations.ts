/**
 * Pure derivation helpers for the Code Quality → Overview tab.
 * Every value returned here traces back to a real analyzer field (Issue[], DebtSummary,
 * DependencyGraph, GovernorRiskDetail[], classCoverageDetails) — nothing here invents a
 * number. Metrics with no real backing source live in the SAMPLE_* constants at the
 * bottom of this file instead, so the UI can mark them clearly as sample data.
 */
import type { Issue, DebtItem, DebtSummary, DependencyGraph, GovernorRiskDetail } from '@/types';

// ── Governor-risk pattern parsing ────────────────────────────────────────────
// governorLimitsAnalyzer only emits free-text pattern strings (e.g.
// "SOQL inside loop(s): 3 occurrence(s)") — no aggregate counts — so we parse them.

export interface GovernorPatternCounts {
  soqlInLoopInstances: number;
  soqlInLoopClasses: number;
  dmlInLoopInstances: number;
  dmlInLoopClasses: number;
  heapRiskHigh: number;
  cpuRiskHigh: number;
}

const SOQL_LOOP_RE = /SOQL inside loop\(s\):\s*(\d+)/i;
const DML_LOOP_RE = /DML inside loop\(s\):\s*(\d+)/i;

export function governorPatternCounts(governorRisks: GovernorRiskDetail[] = []): GovernorPatternCounts {
  let soqlInLoopInstances = 0;
  let soqlInLoopClasses = 0;
  let dmlInLoopInstances = 0;
  let dmlInLoopClasses = 0;
  let heapRiskHigh = 0;
  let cpuRiskHigh = 0;

  for (const risk of governorRisks) {
    let classHasSoqlLoop = false;
    let classHasDmlLoop = false;
    for (const pattern of risk.patterns ?? []) {
      const soqlMatch = pattern.match(SOQL_LOOP_RE);
      if (soqlMatch) { soqlInLoopInstances += Number(soqlMatch[1]); classHasSoqlLoop = true; }
      const dmlMatch = pattern.match(DML_LOOP_RE);
      if (dmlMatch) { dmlInLoopInstances += Number(dmlMatch[1]); classHasDmlLoop = true; }
    }
    if (classHasSoqlLoop) { soqlInLoopClasses++; }
    if (classHasDmlLoop) { dmlInLoopClasses++; }
    if (risk.prediction?.heapSize?.risk === 'high') { heapRiskHigh++; }
    if (risk.prediction?.cpuTime?.risk === 'high') { cpuRiskHigh++; }
  }

  return { soqlInLoopInstances, soqlInLoopClasses, dmlInLoopInstances, dmlInLoopClasses, heapRiskHigh, cpuRiskHigh };
}

// ── Complexity metrics ───────────────────────────────────────────────────────

export interface ComplexityMetrics {
  longMethods: number;
  largeClasses: number;
  deepNesting: number;
  highFanIn: number;
  highFanOut: number;
}

export function complexityMetrics(
  issues: Issue[],
  debtSummary: DebtSummary | undefined,
  dependencyGraph: DependencyGraph | undefined
): ComplexityMetrics {
  const longMethods = issues.filter((i) => i.ruleId === 'method-length').length;
  const largeClasses = issues.filter((i) => i.ruleId === 'class-size').length;

  const debtItems: DebtItem[] = [
    ...(debtSummary?.quickWins ?? []),
    ...(debtSummary?.mediumItems ?? []),
    ...(debtSummary?.largeItems ?? []),
  ];
  const deepNesting = debtItems.filter((d) => /deep nesting/i.test(d.description)).length;

  const nodes = dependencyGraph?.nodes ?? [];
  const highFanIn = nodes.filter((n) => (n.fanIn ?? 0) > 20).length;
  const highFanOut = nodes.filter((n) => (n.fanOut ?? 0) > 20).length;

  return { longMethods, largeClasses, deepNesting, highFanIn, highFanOut };
}

// ── Component-type breakdown (for the "Issues by Component Type" chart) ─────

export function componentTypeBreakdown(
  issues: Issue[],
  inferType: (name: string) => string
): { name: string; value: number }[] {
  const map: Record<string, number> = {};
  for (const i of issues) {
    const key = i.file ?? i.object;
    if (!key) { continue; }
    const type = inferType(key);
    map[type] = (map[type] ?? 0) + 1;
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// ── Coverage lookup (joins classCoverageDetails onto any component list) ────

export function buildCoverageLookup(
  classCoverageDetails: { name: string; pct: number }[] = []
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of classCoverageDetails) {
    const basename = c.name.split('/').pop()?.split('\\').pop() ?? c.name;
    map[basename] = c.pct;
    map[c.name] = c.pct;
  }
  return map;
}

// ── Test quality breakdown ────────────────────────────────────────────────

export interface TestQualityBreakdown {
  atOrAbove75: number;
  below75: number;
  untestedClasses: number;
  untestedTriggers: number;
}

export function testQualityBreakdown(
  details: { pct: number; type: 'Class' | 'Trigger' }[] = []
): TestQualityBreakdown {
  return {
    atOrAbove75: details.filter((d) => d.pct >= 75).length,
    below75: details.filter((d) => d.pct < 75).length,
    untestedClasses: details.filter((d) => d.pct === 0 && d.type === 'Class').length,
    untestedTriggers: details.filter((d) => d.pct === 0 && d.type === 'Trigger').length,
  };
}

// ── Technical debt by component type (Files/Violations columns only — the
// Debt Score / Quality Grade columns have no real backing and stay static) ──

export interface DebtTypeRow {
  component: string;
  files: number;
  violations: number;
}

export function debtByComponentType(params: {
  debtItems: DebtItem[];
  inferType: (name: string) => string;
  apexClasses: number;
  apexTriggers: number;
  lwcCount: number;
  auraCount: number;
  vfCount: number;
}): DebtTypeRow[] {
  const violationsByType: Record<string, number> = {};
  for (const item of params.debtItems) {
    if (!item.file) { continue; }
    const type = params.inferType(item.file);
    violationsByType[type] = (violationsByType[type] ?? 0) + 1;
  }
  return [
    { component: 'Apex Classes', files: params.apexClasses, violations: violationsByType['Apex Class'] ?? 0 },
    { component: 'Triggers', files: params.apexTriggers, violations: violationsByType['Trigger'] ?? 0 },
    { component: 'LWC', files: params.lwcCount, violations: violationsByType['LWC'] ?? 0 },
    { component: 'Aura', files: params.auraCount, violations: violationsByType['Aura'] ?? 0 },
    { component: 'Visualforce', files: params.vfCount, violations: violationsByType['Visualforce'] ?? 0 },
  ].filter((r) => r.files > 0 || r.violations > 0);
}

// ── AI Architect Observations (deterministic, no LLM call) ──────────────────

export interface ObservationCard {
  icon: string;
  title: string;
  text: string;
  sample?: boolean;
}

export function buildObservations(input: {
  coveragePct: number;
  debtHours: number;
  largeItemsCount: number;
  soqlInLoopInstances: number;
  soqlInLoopClasses: number;
  outdatedApiCount: number;
}): ObservationCard[] {
  const cards: ObservationCard[] = [];

  cards.push(
    input.coveragePct >= 70
      ? { icon: '✅', title: 'Good test coverage', text: `Overall test coverage is ${input.coveragePct.toFixed(1)}%, above the 70% baseline.` }
      : { icon: '⚠️', title: 'Low test coverage', text: `Overall test coverage is ${input.coveragePct.toFixed(1)}%, below the 70% baseline.` }
  );

  cards.push(
    input.debtHours > 200
      ? { icon: '⚠️', title: 'High technical debt', text: `Estimated technical debt is ${input.debtHours} hours, including ${input.largeItemsCount} large refactoring item(s).` }
      : { icon: '✅', title: 'Manageable technical debt', text: `Estimated technical debt is ${input.debtHours} hours across ${input.largeItemsCount} large item(s).` }
  );

  if (input.soqlInLoopInstances > 0) {
    cards.push({
      icon: '🔴',
      title: 'SOQL in loops detected',
      text: `${input.soqlInLoopInstances} instance(s) of SOQL in loops found across ${input.soqlInLoopClasses} class(es).`,
    });
  }

  if (input.outdatedApiCount > 0) {
    cards.push({
      icon: '📦',
      title: 'Outdated components',
      text: `${input.outdatedApiCount} component(s) reference outdated API versions or deprecated patterns.`,
    });
  }

  cards.push({
    icon: '📄',
    title: 'Documentation gaps',
    text: 'ApexDoc / comment coverage is not yet measured by the analyzers.',
    sample: true,
  });

  return cards;
}

// ── Recommended Improvements (AI) (deterministic, no LLM call) ─────────────

export interface RecommendationCard {
  icon: string;
  title: string;
  impact: 'High' | 'Medium';
  text: string;
  sample?: boolean;
}

export function buildRecommendations(input: {
  soqlInLoopInstances: number;
  below75Count: number;
  largeClasses: number;
  longMethods: number;
  securityIssueCount: number;
}): RecommendationCard[] {
  const cards: RecommendationCard[] = [];

  if (input.soqlInLoopInstances > 0) {
    cards.push({ icon: '🔧', title: 'Fix SOQL in Loops', impact: 'High', text: `${input.soqlInLoopInstances} instance(s) of SOQL in loops can cause performance issues.` });
  }
  if (input.below75Count > 0) {
    cards.push({ icon: '📈', title: 'Increase Test Coverage', impact: 'High', text: `Increase coverage for ${input.below75Count} classes below 75%.` });
  }
  if (input.largeClasses > 0 || input.longMethods > 0) {
    cards.push({ icon: '🧹', title: 'Reduce Technical Debt', impact: 'Medium', text: `Refactor ${input.largeClasses} large classes and ${input.longMethods} long methods.` });
  }
  if (input.securityIssueCount > 0) {
    cards.push({ icon: '🔒', title: 'Resolve Security Issues', impact: 'High', text: `Fix ${input.securityIssueCount} security issue(s) flagged by static analysis.` });
  }
  cards.push({
    icon: '📝',
    title: 'Improve Documentation',
    impact: 'Medium',
    text: 'Add ApexDoc comments and improve inline documentation coverage.',
    sample: true,
  });

  return cards;
}

// ============================================================================
// Sample / static data — metrics with no real analyzer source today.
// Every export in this section is intentionally fabricated for layout preview
// and MUST be surfaced with a "Sample" badge wherever it's rendered.
// ============================================================================

export const SAMPLE_ENGINEERING_QUALITY_INDEX = 87;
export const SAMPLE_TECH_DEBT_SCORE = 68;
export const SAMPLE_COMPLEXITY_SCORE = 71;

export const SAMPLE_EQI_SPARKLINE = [79, 81, 80, 83, 85, 87].map((value) => ({ value }));
export const SAMPLE_DEBT_SCORE_SPARKLINE = [74, 73, 75, 71, 70, 68].map((value) => ({ value }));
export const SAMPLE_COMPLEXITY_SPARKLINE = [76, 75, 73, 74, 72, 71].map((value) => ({ value }));

export const SAMPLE_TECH_DEBT_TREND = [72, 70, 74, 71, 73, 68].map((value, i) => ({ label: `Scan ${i + 1}`, value }));
export const SAMPLE_COVERAGE_TREND = [68, 70, 71, 73, 74, 76.4].map((value, i) => ({ label: `Scan ${i + 1}`, value }));

export const SAMPLE_COMPLEXITY_STATIC_ROWS: { label: string; value: string }[] = [
  { label: 'Cyclomatic Complexity', value: '2,341' },
  { label: 'Cognitive Complexity', value: '1,812' },
  { label: 'Duplicate Code', value: '6.4%' },
];

export const SAMPLE_GOVERNOR_STATIC_ROWS: { label: string; value: number; risk: 'high' | 'medium' | 'low' }[] = [
  { label: 'Recursive Triggers', value: 8, risk: 'high' },
  { label: 'Future in Loops', value: 5, risk: 'medium' },
  { label: 'Callout in Loops', value: 6, risk: 'medium' },
];

export const SAMPLE_DOCUMENTATION_QUALITY: { label: string; value: number; pct: number }[] = [
  { label: 'Missing ApexDoc', value: 926, pct: 32 },
  { label: 'Classes without Comments', value: 812, pct: 28 },
  { label: 'Methods without Comments', value: 1847, pct: 34 },
  { label: 'Objects without Description', value: 164, pct: 18 },
  { label: 'Fields without Description', value: 1256, pct: 21 },
];

export const SAMPLE_TEST_EXECUTION_STATS = {
  testMethods: 18642,
  failedTests: 32,
  assertions: 124871,
  avgTestTimeSec: 4.2,
};

export const SAMPLE_CODE_INVENTORY_EXTRA: { label: string; value: number }[] = [
  { label: 'Test Classes', value: 1985 },
  { label: 'Interfaces', value: 156 },
  { label: 'Enums', value: 128 },
  { label: 'REST Services', value: 73 },
  { label: 'SOAP Services', value: 18 },
];

export const SAMPLE_DEBT_SCORE_BY_COMPONENT: Record<string, { debtScore: number; grade: string }> = {
  'Apex Classes': { debtScore: 42, grade: 'B-' },
  Triggers: { debtScore: 68, grade: 'C+' },
  LWC: { debtScore: 36, grade: 'B' },
  Aura: { debtScore: 72, grade: 'C' },
  Visualforce: { debtScore: 60, grade: 'C+' },
};
