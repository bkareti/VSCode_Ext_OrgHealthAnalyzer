
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**OrgPulse** (`sf-health-analyzer`) is a VS Code extension that analyzes Salesforce org health across many dimensions (Apex quality, automation complexity, data model, query performance, test coverage, security, governor limits, plus a CTA architecture tier). It activates when a workspace contains `sfdx-project.json`. There are **zero runtime dependencies** — everything ships in a single esbuild bundle and relies only on the VS Code API and the Salesforce CLI.

## Commands

```bash
npm run compile      # check-types + lint + esbuild bundle → dist/extension.js
npm run watch        # parallel watch (tsc --noEmit + esbuild --watch); used by F5 debug
npm run package      # production build (minified, no sourcemaps) → dist/extension.js
npm run check-types  # tsc --noEmit (no emit; type check only)
npm run lint         # eslint src
npm run test         # vscode-test (integration tests in an Extension Host)
npm run compile-tests # tsc -p . --outDir out (test build path)
```

Press **F5** to launch the Extension Development Host (runs the `watch` task first). Tests live in `src/test/*.test.ts` and run via `@vscode/test-cli` — they need a real VS Code instance, so they cannot run headless without it.

### Two separate TypeScript outputs (important)
- **Runtime:** esbuild bundles `src/extension.ts` → `dist/extension.js` (this is `main`). `tsc` is used only for type-checking here, not emit.
- **Tests:** `tsc -p .` emits to `out/`. Don't confuse `dist/` (shipped) with `out/` (test compile).

## Architecture

The extension cleanly separates the **extension host** (Node-side services + analyzers, in `src/`) from the **webview UI** (`webview-ui/` React app), communicating only via `postMessage`.

### Entry point — `src/extension.ts`
`activate()` wires everything: initializes the logger, registers built-in rules (`registerBuiltInRules()`), initializes the AI service (`initAIService`) and cache, loads plugins, registers the tree view, and registers all 14 `sfHealthAnalyzer.*` commands. The flagship command `sfHealthAnalyzer.analyzeOrg` runs the full multi-step analysis pipeline that fans out across every analyzer and aggregates results.

### Services — `src/services/`
- **`salesforceService.ts`** — All org access goes through the **Salesforce CLI** (`sf`) via `child_process.execFile`, parsing `--json` output (e.g. `sf org display --json`, Tooling API and Data API SOQL). There is **no jsforce / direct REST client**. Auth relies on the CLI's cached org auth. Errors are normalized into `SalesforceAuthError` vs `SalesforceConnectionError`.
- **`aiService.ts`** — AI is accessed through VS Code's Language Model API (`vscode.lm.selectChatModels`), **not** a direct Anthropic/OpenAI HTTP client. Model preference order: Anthropic `claude-sonnet-4-6` / `claude-opus-4-6`, then GitHub Copilot `gpt-4o`, then any available model. AI is **consent-gated** via `globalState` flags (separate consent for issue explanations vs CTA review) and degrades gracefully when no model is available. Key entry points: `explainIssue()` and `synthesizeCtaReview()`.

### Analyzers — `src/analyzers/` (17 modules)
Each analyzer covers one domain (`apexAnalyzer`, `automationAnalyzer`, `queryAnalyzer`, `dataModelAnalyzer`, `testCoverageAnalyzer`, `permissionAnalyzer`, `integrationAnalyzer`, `governorLimitsAnalyzer`, `lwcAnalyzer`, `technicalDebtAnalyzer`, `scaleCenterAnalyzer`, `dependencyAnalyzer`, `userGovernanceAnalyzer`, `profileSecurityAnalyzer`, `staleMetadataAnalyzer`, `orgInventoryAnalyzer`, `ctaArchitectureAnalyzer`). They mix **org metadata analysis** (Tooling/Data API via the SF CLI) with **local static analysis** of workspace `.cls`/`.trigger`/LWC files. Analyzers emit `Issue[]` and optional structured summaries that flow into the `AnalysisResult`.

### Rules engine — `src/rules/`
Analyzers delegate reusable checks to a central rule engine.
- `engine.ts` — `Rule` interface (`meta: RuleMeta` + `analyze(data, context)`, where `context.report(issue)` emits findings), plus `RuleEngine`/`ruleEngine`, `ruleRegistry`, and shared Apex helpers (`APEX_PATTERNS`, `findPatternMatches`, `isInsideLoop`).
- `index.ts` — built-in rule definitions; `registerBuiltInRules()` registers them at activation.
- `plugin.ts` — loads third-party/custom rules from user config.

**To add a rule:** define it in `src/rules/index.ts`, register it inside `registerBuiltInRules()`, and add any user-facing config under `sfHealthAnalyzer.*` in `package.json`.

### Reports & scoring — `src/reports/`
`healthScore.ts` computes per-category scores (0–100) and the overall grade from issue counts/severity into an `AnalysisResult`. `reportGenerator.ts` produces HTML / JSON / SARIF / text exports.

### UI — `webview-ui/` (React) + `src/ui/`

> **IMPORTANT: All frontend/UI changes must be made in `webview-ui/src/`.  
> `media/dashboard.js` and `media/dashboard.css` are dead code — they are NOT served by the active webview and edits there have no effect.**

The active webview is a **React + Vite + Tailwind** app in `webview-ui/`:
- `webview-ui/src/components/tabs/` — one file per dashboard tab (OrgInfo, Overview, DataModel, etc.)
- `webview-ui/src/components/common/` — shared UI: `GlassCard`, `StatCard`, `EmptyState`, etc.
- `webview-ui/src/components/charts/` — `DonutChart` (Recharts PieChart), `ColumnChart` (Recharts BarChart)
- `webview-ui/src/store/` — Zustand slices (`orgStore`, `uiStore`, `dashboardStore`)
- `webview-ui/src/types/index.ts` — re-exports all types from `src/types/index.ts`

`src/ui/dashboard.ts` is the **host-side shell**: it calls `buildHtml()` which reads `webview-ui/dist/index.html` (the Vite build output), rewrites asset paths to webview URIs, and injects the CSP. It then proxies messages between the extension host and the React app. Extension → webview messages use `{ type: ... }` (e.g. `analysisResults`, `analysisProgress`, `aiExplanation`). Webview → extension uses `{ command: ... }` (e.g. `runAnalysis`, `explainIssue`, `exportReport`).

**Build:** `npm run compile` runs `build:webview` (Vite bundles `webview-ui/` → `webview-ui/dist/`) before the extension esbuild step. Always run `npm run compile` after changing any file under `webview-ui/src/`.

`treeProvider.ts` backs the sidebar results tree view (extension host only, not the webview).

### Persistence — `src/utils/`
Results persist to VS Code `globalState` (survives reload) and to a workspace `.orgpulse/cache.json` file (auto-gitignored). A file watcher invalidates the cache on `.cls`/`.trigger` changes. `config.ts` reads settings from `sfHealthAnalyzer.*` and an optional `.sfhealthrc.json`. `errors.ts` and `logger.ts` provide typed errors and an output-channel logger.

### Types — `src/types/index.ts`
Central type definitions; `AnalysisResult` is the core payload tying analyzers, scoring, and the dashboard together.

### Data wiring reference — `docs/DATA_WIRING_REFERENCE.md`
Before investigating whether a screen renders real analyzer output or sample/mock data, or which `AnalysisResult` field to wire a screen to, check this doc first — it's a maintained per-analyzer/per-service/per-screen index built specifically to avoid re-reading `src/analyzers/`, `src/services/`, and the webview tabs from scratch. Only fall back to reading source if the doc's claim looks stale (it's a dated snapshot, not generated from live code).

## Conventions

- **ESLint** (`eslint.config.mjs`) enforces (as warnings): semicolons, `===` over `==`, curly braces, no throwing literals, and camelCase/PascalCase import naming.
- TypeScript is **strict** (`tsconfig.json`), target ES2022 / module Node16.
- Add new commands under the `sfHealthAnalyzer.*` id prefix (user-visible category: **OrgPulse**) and declare them in `package.json` `contributes.commands`.
- Keep the zero-runtime-dependency constraint: prefer the VS Code API and the `sf` CLI over adding npm packages.
