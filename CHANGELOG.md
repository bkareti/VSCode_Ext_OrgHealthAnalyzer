# Change Log

All notable changes to **OrgPulse — Salesforce Architecture Health & Insights** are documented here.

---

## [1.14.0] — 2026-06-23 🛠️ Dashboard Fixes, Security Depth & Reliable CTA Review

### Fixes

- **Overview counts fixed** — Apex Classes, Triggers, and Flows no longer show **0**. `createAnalysisResult` was dropping these metadata fields before they reached the dashboard; all canonical counts now flow through.
- **Code Quality dead space removed** — eliminated the doubled bottom margin that left a large empty gap below the inventory cards.
- **CTA Review no longer hangs silently** — the loading spinner always resolves: on success it renders the review, otherwise it shows a clear, actionable error (e.g. consent declined, model needs sign-in, or AI disabled). The command handler now wraps the call in try/catch and always posts a terminal message back to the webview.

### Improvements

- **Change model & re-run CTA review** — after a review is generated, a **🔁 Re-run review** toolbar now sits above the report with the model picker, a Claude-authorize control, and an **↻ Regenerate** button. Switching the model (or clicking Regenerate) bypasses the cache and produces a fresh review without re-analysing the org. Reviews are now cached per-model.
- **Ask the Architect works on Claude** — the chat had no Anthropic path, so with Claude selected it silently failed. Added a full Claude tool-use loop (the same read-only org tools: SOQL, Tooling SOQL, explain-query, limits, licenses), so the agent answers from the analysed dashboard data and fetches more from the org as needed. All Ask-the-Architect failures now surface a clear reason in the chat instead of returning nothing.
- **CTA review now actually generates on Claude** — fixed the real cause of empty/stub reviews: the Anthropic call capped output at 4096 tokens, truncating the report JSON so it failed to parse and fell back to a stub. Output budget raised to 8192, JSON extraction hardened against any preamble/markdown, and a placeholder bug (`{{SNAPSHO}}`) that dropped the org snapshot from a custom prompt template was fixed (the snapshot is now always included even if the placeholder is missing).
- **More professional CTA report** — rewrote the built-in CTA prompt to the standard a review-board CTA would actually sign off on: evidence-led (must name the specific class/object/flow/metric), business-quantified (blast radius, governor headroom, $/probability/timeframe), decisive verdict, and genuinely actionable recommendations — no filler, no generic statements, and honest credit where the org is healthy.
- **Authorize Claude (Anthropic API key)** — new **🔑 Authorize Claude** button in the CTA tab. The standalone Claude VS Code extension doesn't expose its models to VS Code, so OrgPulse now connects directly to the Anthropic API: paste your key once (stored in VS Code Secret Storage — never written to settings or synced), and your Claude models appear in the picker with a **Claude (auto)** option. CTA review and Ask-the-Architect can then run on Claude.
- **CTA model picker** — only lists language models VS Code can actually use (filters out models reporting no usable context window). Added an in-panel note explaining that GitHub Copilot models work in-place, while a Claude subscription can be connected via **Authorize Claude** (or any OpenAI-compatible endpoint via Settings → `sfHealthAnalyzer.ai.custom`). Model errors now surface a specific, actionable reason.
- **Security & Access tab** — added **Permission Sets** and **Permission Set Groups** tables with active-user counts (new `PermissionSetAssignment` aggregate query), dangerous-permission flags, and group status; **Users by Profile** now lists all profiles (paginated); new grouped **Security Vulnerabilities** section summarising every security / profile-security / user-governance finding by severity with why-it-matters and remediation.
- **Performance & Limits instructions** — added plain-language "How to read this" guidance to the **Governor Limits Simulator**, **Apex Classes at Risk**, and **Predicted Governor Limit Usage (Worst-Case Class)** sections, plus a friendly empty-state explaining why the simulator may show few/no classes (only loop-based / high-risk code is simulated).
- **Dependencies graph redesigned** — replaced the unreadable single-ring layout (overlapping nodes/labels) with a hub-focused view: the most-connected component at the centre, top hubs ringed around it with legible labelled pills and only the edges between them; the full ranking remains in the companion table.
- **Per-tab pointers** — every tab now shows a short, always-visible "what this tab shows / how to read it" intro (the detailed data-source notes remain in the collapsible *About this tab* panel).
- **Less repetition** — the Org Info tab no longer restates component counts that belong to other tabs (Apex/Flows on Code Quality, objects/fields on Data Model, permission sets on Security), with a pointer to where each lives.

---

## [1.13.0] — 2026-06-23 🎨 Dashboard Redesign & Consistent Counts

### Improvements & Fixes

- **Consistent counts across tabs** — Apex classes, triggers, flows, LWC, and objects now come from a single canonical source, so the Overview, Code Quality, Automation, and Data Model tabs always agree. (Previously "Objects" counted only objects with automation, and "Flows" excluded screen flows / process builders.)
- **Overview tab redesign** — Connected Org is now a header band (name, edition, instance, API version, trust status); removed the *Top Critical Issues* section; added a consistent KPI grid (now including **LWC**), an **Apex code-size usage** gauge (vs the ~6 MB limit), and **Data/File storage** bars; added padding to the Data & Security panel.
- **Code Quality tab (now includes LWC)** — The standalone LWC tab is merged in. New per-component-type inventory (Apex, Triggers, LWC, Flows, **Batch**, **Queueable**, **Schedulable**, **Scheduled Jobs**) plus a dedicated **Test Coverage** section (org-wide average, classes below 75%, zero-coverage, offenders table).
- **Automation tab rebuilt** — Full inventory: Flows by type (Screen / Record-Triggered / Scheduled / Platform-Event / Auto-Launched), **Process Builders**, classic **Workflow Rules**, Triggers, and Validation Rules, with architecture signals (deprecated automation, multiple-trigger objects, over-automation) and a real per-object automation matrix.
- **Data Model tab** — Removed the *Standard Fields* column/count; added a clear note that *Unused* fields are derived from the Salesforce Dependency API (reference-based, not last-used date).
- **Tabs reordered** — Overview → Org Info → Data Model → Code Quality → Automation → Performance & Limits → Security & Access → Dependencies → Stale Metadata → CTA Review.

### New data fetched

- Active scheduled Apex jobs (`CronTrigger`), classic Workflow Rules (`WorkflowRule`), Apex code-size aggregation, and a persisted org-wide test-coverage summary.

---

## [1.12.0] — 2026-06-23 🔬 Salesforce Code Analyzer & Dependency-API Accuracy

### New Features

- **Salesforce Code Analyzer delegation (opt-in)** — Static Apex/LWC analysis can be delegated to **Salesforce Code Analyzer v5** (`sf code-analyzer run`), so the PMD/ESLint/RetireJS/CPD engines own the rule logic instead of OrgPulse's built-in regex rules. Findings map onto the existing issue model and scoring. Enable via `sfHealthAnalyzer.codeAnalyzer.enabled` (with `.ruleSelector` and `.runGraphEngine`). Requires the `code-analyzer` CLI plugin and a Java runtime; **falls back to the built-in rules automatically** when they're unavailable, so existing behaviour never regresses.

### Improvements & Fixes

- **Accurate unused-field detection (Dependency API)** — The Data Model tab now uses the Salesforce **`MetadataComponentDependency`** (Dependency API) to determine which custom fields are genuinely unreferenced (by Id, name, or workspace usage), replacing the previous workspace-only estimate. Unused fields are surfaced as one summary finding per object and reduce the Data Model score when significant. Falls back to the prior estimate when the Dependency API is unavailable.
- **Richer dependency graph** — The dependency analyzer no longer caps at the first 100 components; it now queries the Dependency API for the full class/trigger set (chunked, up to 2,000 components) for more complete fan-in/fan-out and unused-component detection.

---

## [1.11.0] — 2026-06-18 🧠 Any AI Model, Local Agents & Dashboard Cleanup

### New Features

- **Dynamic AI model discovery** — The model picker now lists *every* model you actually have via the VS Code Language Model API (Copilot's Claude/GPT/Codex/Gemini and any third-party provider), instead of a fixed Copilot-centric list. Pick any of them for CTA Review and Ask the Architect.
- **Local / custom AI backend** — Run AI with **no Copilot dependency** via a configurable OpenAI-compatible endpoint (`sfHealthAnalyzer.ai.custom.baseUrl/model/apiKey`), defaulting to Ollama (`http://localhost:11434/v1`); also works with LM Studio, vLLM, OpenAI, Codex, and Azure. Local models appear in the same picker as "Local: …". **Ask the Architect's live-org tool calling works on the local backend too** (read-only SOQL/limits/explain), degrading gracefully when a model lacks tool support. Consent prompts are backend-aware (localhost = data stays on your machine).

### Improvements & Fixes

- **Data Model — Standard Fields no longer always 0** — The total-fields aggregate now uses the required `EntityDefinition.IsCustomizable = true` filter (an unfiltered `FieldDefinition` aggregate is rejected by the Tooling API and silently returned zero).
- **Cleaner dashboards** — Removed the License/Limits snapshot from the Overview tab (governor limits remain in Performance & Limits), removed the boilerplate "Recommendations" sections from every domain tab (AI-generated recommendations live in the CTA Review report), and removed the count badge next to each tab label.

---

## [1.10.0] — 2026-06-18 🤖 Ask the Architect, Executive Overview & Live Limits

### New Features

- **Ask the Architect (AI)** — A conversational, tool-augmented Q&A that lets Claude/Copilot query the connected org **live and read-only** to answer architecture questions. Built on the VS Code Language Model API with in-process tools wrapping existing org queries (`run_soql`, `run_tooling_soql`, `explain_query`, `get_org_limits`, `get_license_summary`); SELECT-only guarded, consent-gated, and disabled in Safe Mode. Available via the **OrgPulse: Ask the Architect** command and a Q&A box on the CTA tab.
- **Executive Overview** — The Overview tab now shows a **run-over-run trend** (▲/▼ vs the previous scan, backed by a 10-run history buffer), a **license utilisation** snapshot, and a **top governor limits** snapshot.
- **Live Governor Limits** — New REST `/limits` integration surfaces real org utilisation (daily API requests, data/file storage, async/bulk jobs) in the Performance & Limits tab and the Overview snapshot.
- **Permission Set Group health** — Detects Outdated Permission Set Groups (aggregate permissions needing recalculation).

### Improvements & Fixes

- **AI model selection modernised & hardened** — Prefers the newest available Claude Opus (e.g. `claude-opus-4-8`), then Sonnet, then GPT-4o, matching by family **prefix** so selection no longer silently falls back to "any model" when the provider exposes a different family string. The resolved model is logged.
- **Single source of truth for the Salesforce API version** — Resolves the connected org's version once at connect and threads it through all REST calls, replacing hardcoded `v63.0`/`62.0`/`60.0` references.
- **Partial-failure transparency** — Analysis steps that fail are now recorded and surfaced as an "incomplete results" banner, so a section showing "0 issues" is never confused with a failed scan.

---

## [1.9.5] — 2026-04-19 🖨️ Full CTA PDF Export & Data Model Fixes

### Bug Fixes

- **CTA Review — Export PDF now exports all 14 sections** — Previously only 3 sections appeared. The exporter now captures the fully-rendered tab DOM (Verdict, Executive Summary, Architecture Maturity, Business Impact, Org Profile, Health Score Breakdown, Critical Issues, Risk Analysis, Benchmarks, Domain Findings, AI Insights, SWOT, Recommendations, Cost of Inaction, Final Recommendation), strips interactive controls, resolves VS Code CSS variables for browser rendering, and opens in the default browser for Print → Save as PDF.
- **Export PDF delivery fixed** — Replaced blocked `URL.createObjectURL` + `window.open()` with `vscode.postMessage` → Save Dialog → `vscode.workspace.fs.writeFile` → `vscode.env.openExternal`.
- **Data Model tab — standard field counts now populate** — Fixed `getObjectDataModelCounts()` with a `mapGet()` helper using 15-character DurableId prefix fallback.
- **Data Model tab — column sorting fixed** — All data tables now support ascending/descending sort on any column header.
- **Data Model CSV export fixed** — Routes via `vscode.postMessage` instead of blocked `URL.createObjectURL`.
- **SOQL query fixes** — Flow: 3-tier fallback, removed `IsTemplate = false`; CustomField: 4-tier fallback; Dashboard: 3-tier fallback; removed invalid `EntityDefinition.NamespacePrefix=null`.
- **FeatureLicense** — Demoted noisy `logWarning` to `logDebug`.

---

## [1.9.4] — 2026-04-13 📊 Data Model Health Tab

### New Features

- Data Model Health tab with field limit percentage bars per object
- Custom and standard field count breakdown table with CSV export
- Objects approaching the 800-field governor limit highlighted as Critical / At-Risk / Caution
- Pagination and column sorting for all large data tables

---

## [1.9.3] — 2026-04-11 🏛️ CTA Architecture Review — Full 14-Section Report

### New Features

- **Full 14-section CTA Architecture Review** — Architecture Maturity gauge (levels 1–5), Business Impact scorecard, Org Profile, Health Score Breakdown bars, Critical Issues table, Risk Heatmap, Benchmark Comparison, Domain Findings grid, AI Insights, Architecture Observations (SWOT), Recommendations (quick wins + strategic), Cost of Inaction, and Final CTA Recommendation
- Verdict banner updated with maturity badge and Regenerate button
- Stale-review banner for legacy reviews missing `architectureMaturity`

---

## [1.9.2] — 2026-04-10 🔍 Scale Center, LWC, Governance & Inventory

### New Features

- Scale Center / EventLogFile performance analytics (Enterprise Edition+)
- LWC component quality analysis from workspace files
- User Governance analysis (dormant users, super-admins, role hierarchy depth)
- Profile & Permission Set dangerous permissions audit
- Stale Metadata detection (reports/dashboards idle 180+ days)
- Org Inventory (installed packages, Visualforce pages, custom labels)
- Technical Debt Backlog CSV export

---

## [1.9.1] — 2026-04-09 🔐 Enterprise Security Modes & Zero-PII Architecture

### New Features

- **Security Mode Selection** — Before every scan, users must choose one of three security modes:
  - **🟢 Safe Mode** (default, recommended for enterprises): 100% local analysis, zero AI usage, no external data sharing
  - **🟡 Standard Mode**: AI used only for summarising aggregated, anonymised insights — no sensitive or raw metadata shared
  - **🔴 Advanced Mode**: Enriched AI insights with richer context — still no raw code, PII, or field values
- **Pre-scan consent modal** — Users must explicitly select a mode and check a consent box before analysis begins. No scan runs without user acknowledgement.
- **CTA Review disabled in Safe Mode** — The CTA Architecture Review tab shows a clear banner explaining that AI features are disabled, with an option to re-analyse in a different mode.
- **AI Explain Issue gated** — The "Explain with AI" button in the issue drill-down panel shows an inline Safe Mode message instead of calling AI when in Safe Mode.
- **PDF AI summary gated** — Leadership PDF Report generation skips the AI consent dialog entirely in Safe Mode and generates reports without AI.
- **Data Usage & Security transparency panel** — A new section in the Overview tab displays real-time security posture:
  - ✔ No record data accessed
  - ✔ No PII processed (emails, names, IPs)
  - ✔ No data stored externally
  - ✔ AI usage status based on selected mode
  - ✔ Current mode badge with description

### Enhancements

- Extension description updated: _"Built with security-first AI — no sensitive data ever leaves your org"_
- New `sfHealthAnalyzer.ai.securityMode` setting with `safe`/`standard`/`advanced` options and per-mode descriptions
- `setSecurityMode` message type added to dashboard ↔ extension communication
- Security mode persisted in webview state across session restores
- Dashboard message handler in `dashboard.ts` gates AI calls (`explainIssue`, `runCtaReview`, `generateAiPdfReport`) server-side based on active mode — defence in depth
- Mode badge shown on CTA review intro screen and PDF consent modal for full transparency

### Security Principles (implemented)

1. **Data minimisation**: Only metadata structure and aggregated counts processed — never records, field values, or PII
2. **Local-first processing**: All scanning, rule detection, and analysis happens inside VS Code
3. **AI usage policy**: AI receives only safe, aggregated payloads (issue counts, scores, patterns) — never raw Apex code or object schemas
4. **User consent**: Mandatory modal before every scan with explicit mode selection
5. **No external storage**: All data stays in-memory or in local workspace cache (`.orgpulse/`)
6. **Defence in depth**: Security mode enforced both in webview (dashboard.js) and extension host (dashboard.ts)

---

## [1.9.0] — 2025-06-26 ✨ AI-Style Scanning Screen Redesign

### New Features

- **AI-style scanning experience** — The org scanning progress screen has been completely redesigned with a modern, conversational UX inspired by ChatGPT, GitHub Copilot, and Cursor:
  - **Gradient pulsing orb** with radar sweep animation replaces the old spinning rings
  - **Conversational AI messages** rotate naturally every 3.5 seconds — "Reading your codebase…", "Mapping your automation landscape…", etc.
  - **Live insight teasers** — real-time feedback cards appear as analysis progresses (e.g., "Found 142 Apex classes and 38 triggers to analyse", "Flagged 3 governor limit risks")
  - **Minimal cognitive load** — only 1–2 messages shown at a time instead of a long 20-step checklist
  - **Collapsible technical details** — the full step-by-step checklist is hidden behind a "View technical details" toggle for power users
  - **Smooth progress bar** with glow effect, percentage, elapsed time, and ETA — all updating in real time
  - **Concentric ring pulse** animation radiating outward from the orb for depth

### Enhancements

- Extension progress messages now include optional `meta` fields with real counts (classes, triggers, flows, objects, users, components, issues) for live insight teasers
- DOM patching on same-step updates avoids full re-renders, enabling smoother CSS transitions
- Empty state ("Ready to Analyse") now features the gradient orb visual instead of the old 🔬 microscope icon
- Message cycling uses `setInterval` with CSS `ai-msg-enter` transitions for fade/slide effects

---

## [1.8.0] — 2025-06-25 💾 Local Cache, CTA PDF Export & ETA Timer

### New Features

- **File-based analysis cache** — Analysis results are automatically saved to `.orgpulse/cache.json` in the project folder. When you re-open the dashboard, cached results load instantly without re-scanning the org. A `.gitignore` is auto-created inside `.orgpulse/` to keep cache out of version control.
- **Re-Analyse fetches fresh data** — The "Re-Analyse" button in the dashboard header always bypasses the cache and fetches fresh data from the connected org. The initial "Run Analysis" button loads from cache if available.
- **CTA Review data cached** — CTA Architecture Review results are persisted alongside analysis data. Clicking "Regenerate" always calls AI fresh to produce a new review, while the initial load shows the cached review if available.
- **CTA Review in PDF export** — The exported Leadership PDF Report now includes a full CTA Architecture Review page at the end (when a review has been generated): verdict, executive summary, domain findings, critical risks, and config-first opportunities.
- **Estimated time remaining** — The scanning progress screen now shows elapsed time and estimated remaining time (minutes:seconds) calculated from average step duration. Updates live as each step completes.

### Enhancements

- Cache location uses `.orgpulse/cache.json` in workspace root with auto-generated `.gitignore`
- "Run Analysis" on empty screen tries cache first, then falls back to org scan
- "Re-Analyse" and "Refresh" commands always force a full org scan
- Progress footer updated from static "30–120 seconds" to dynamic "Analysing org metadata across 20 categories"

---

## [1.7.0] — 2025-06-24 🎨 Dashboard v2.0 — Consolidated Tabs & Reusable Tables

### Breaking Changes

- **Tab consolidation: 18 → 11 tabs.** Several tabs merged for a cleaner experience:
  - **Code Quality** now includes Technical Debt summary, anti-pattern badges, and CTA-style recommendations
  - **Performance & Limits** merges Performance + Governor Limits + Limits Simulator into one tab
  - **Security & Access** merges Users governance + Profile security into one tab
  - **Stale Metadata** merges Stale Metadata + Org Inventory into one tab
  - **Testing** tab removed; overall test coverage % shown on Overview tab

### New Features

- **Reusable paginated data table** — `renderPaginatedDataTable()` component with consistent 10-rows-per-page pagination, used across Data Model, Performance & Limits, LWC Quality, and Code Quality tabs
- **Export All Issues** — Overview tab now has CSV, Excel, and PDF export buttons for all issues across the org
- **Test Coverage on Overview** — overall Apex test coverage percentage displayed in the Overview header

### Enhancements

- **Data Model tab** — shows ALL custom objects (not just first 60) with paginated table; added Rollups column alongside Triggers, Validations, Fields, and Relationships counts
- **Code Quality tab** — CTA-style summary with anti-pattern badges, top 10 classes table (paginated), tech debt priority items merged, category breakdown bar chart
- **Performance & Limits tab** — combined performance summary cards + governor gauge charts + Apex classes at risk (paginated 10/page) + interactive Simulator (with data-action handlers instead of inline onclick) + LDV objects + entry points + recommendations
- **LWC Quality tab** — CTA-style issue summary + paginated component table (10/page)
- **Dependencies tab** — redesigned with clear "What is this?" explanation header; kept dependency graph, cycle detection, and top-10 connected components
- **Stale Metadata tab** — description header explaining what the tab shows; merged org component counts, installed packages, VF pages, and custom labels from Org Inventory
- **Security & Access tab** — combined user governance summary cards, profile security matrix, users by profile/license tables, and security recommendations
- **Limits Simulator** — fixed bug where inline `<script>` didn't work in VS Code webview; now uses event delegation with `data-action` handlers and `runSimulator()` function
- **Issue lists removed** from individual tabs per user feedback; all issues exportable from Overview

### Technical Changes

- Dashboard version bumped to v2.0.0
- `ISSUE_PAGE_SIZE` changed from 25 → 10
- New state: `dataTablePageState`, `DATA_TABLE_PAGE_SIZE = 10`
- New functions: `renderPaginatedDataTable()`, `refreshDataTable()`, `runSimulator()`
- Removed ~1200 lines of dead code: `renderPerformance()`, `renderLimits()`, `renderLimitsSimulator()`, `renderDebt()`, `renderUsers()`, `renderProfiles()`, `renderOrgInventory()`, `renderIssuePanel()`, `renderDebtTreemap()`, `applyDebtFilter()`
- Event delegation handlers added for: `data-table-prev`, `data-table-next`, `data-table-go`, `export-issues-*`, `sim-set-volume`

---

## [1.6.0] — 2026-04-08 🏗️ CTA-Grade Architectural Intelligence

### New Features

- **Limits Simulator** — new dedicated tab with an interactive volume slider (200–50k records); shows projected SOQL/DML/CPU/Heap consumption per class at any data volume; "BREACH" warning when limits will be exceeded. Game-changer for proving architecture will survive at scale.
- **Live LDV Detection** — CTA Architecture Analysis now fetches real record counts for Account, Case, Opportunity, Contact, Lead, Asset; flags objects above 500k as LDV risks with specific indexed-field recommendations
- **Ownership Skew Detection** — identifies objects with >500k records and high automation density; flags the CTA anti-pattern of single-owner record concentration
- **Async Pattern Analysis** — detects Queueable daisy-chaining (enqueueJob inside execute()), @future method chains, and concurrent Batch Apex row-lock risk on LDV objects
- **Public Entry Point Map** — maps all @RestResource and InboundEmailHandler classes; flags any that use "without sharing"; shows in Limits Simulator tab as an attack surface map
- **Integration Governance** — detects "Wild West" multi-trigger pattern (>1 trigger per object); flags missing Trigger Handler Framework; flags missing idempotency (insert without upsert+external ID in callout handlers)
- **Implicit Sharing Risk** — warns when Apex classes perform DML on User/Group/UserRole objects that can trigger system-wide sharing recalculations

### Enhancements

- **CTA Review prompt** (`cta-prompt.md`) now includes 4 architectural pillars: LDV context, system stability, security entry points, integration governance. AI produces more specific, named-object recommendations.
- **AI snapshot** enriched with: live object record counts, detected entry points, async anti-patterns, Wild West trigger objects, idempotency gaps
- **Governor Limits tab** now surfaces Limits Simulator data alongside classic gauge view
- **Org Info tab** adds live LDV object count cards with color-coded risk tiers (🔴 >2M, 🟠 >1M, 🟡 >500k)

### Architecture Changes

- `ctaArchitectureAnalyzer.ts`: Added 5 new analysis phases (LDV with live counts, async patterns, entry points, integration governance, implicit sharing)
- `governorLimitsAnalyzer.ts`: Produces `LimitsSimulatorClassData` per risky class with loop SOQL/DML counts and per-1k-records CPU/heap estimates
- `types/index.ts`: New `LimitsSimulatorClassData` interface; `AnalysisResult` adds `objectRecordCounts`, `entryPoints`, `limitsSimulatorData`

---

## [1.5.0] — 2026-04-08 🚀

### New Features

- **Org Info tab** — new dedicated tab showing org type, edition, instance URL/code, license availability (user + feature licenses), Salesforce Trust Center instance status (incidents/maintenance), and upcoming release schedule
- **Apps inventory** — count of Console vs. Standard Salesforce apps shown in Org Info and Org Inventory
- **CTA Prompt customisation** — user-editable `cta-prompt.md` in workspace root; edit the AI review prompt without touching extension code
- **Release notes panel** — `changelog.md` now surfaced as structured per-version history

### Enhancements

- Issue tables now have **sortable columns** (Severity / Finding / Category / Location) and **pagination** (25 rows/page) across all tabs
- **Live analysis progress** — dashboard opens immediately on analysis start and shows an animated 20-step checklist updating in real time
- **Data Model tab** now fetches and displays Record Types, Page Layouts, and Lightning (Flexi) Pages counts
- **CTA Review** redesigned with gradient verdict banner, glassmorphism domain cards, color-coded risk/effort badges, numbered quick-wins list
- **Export → PDF** now opens print-ready HTML in a browser tab triggering the OS Print → Save as PDF dialog (no more `.html` download)

### Bug Fixes

- Export modal PDF option now defaults to selected (was HTML)
- Analysis progress screen no longer replaces dashboard — renders inside webview

---

## [1.4.0] — 2026-04-07

### New Features

- **CTA Architecture Review** — AI-generated board-quality architectural review with verdict (Go / Conditional Go / No-Go), domain findings, critical risks, config-first opportunities, and quick wins
- **CTA Architecture Analyzer** — automated rule-based pre-checks (trigger bulkification, flow count, SOQL in loops, profile sprawl, coverage thresholds) feeding the AI review
- **AI model fallback** — cascades through available GitHub Copilot models (GPT-4o → Claude Sonnet → GPT-4 Turbo)

### Enhancements

- Query explain results included in CTA review AI prompt for richer analysis
- License utilisation surfaced in CTA review prompt context

---

## [1.3.0] — 2026-04-05

### New Features

- **Stale Metadata Analyzer** — flags reports/dashboards/flows not touched in 180+ days
- **Org Inventory tab** — installed packages, Visualforce pages, custom labels, component counts
- **Profile Security Analyzer** — tracks over-permissioned profiles, Modify All Data, View All Data
- **User Governance Analyzer** — inactive users, login policy, licence waste

### Enhancements

- Org Inventory now fetches Record Types, Page Layouts, and Lightning Pages (FlexiPage)
- Total component count includes all newly tracked metadata types

---

## [1.2.0] — 2026-04-03

### New Features

- **Scale Center Metrics** — EventLogFile-based performance insights (SOQL rows, API calls, CPU time)
- **Dependency Graph** — Apex class/trigger/flow dependency map with cycle detection
- **Technical Debt Analyzer** — sprint-based backlog: quick wins, medium, and large items with hour estimates
- **LWC Quality Analyzer** — unused imports, missing error boundaries, wire adapter misuse

### Enhancements

- Governor Limits Analyzer added (SOQL-in-loop, DML-in-loop, unbounded queries)
- Dashboard re-analysis button and export modal

---

## [1.1.0] — 2026-04-02

### New Features

- **Historical trend tracking** — health score trend points persisted across runs
- **Query Explain integration** — live selectivity checks via Salesforce Query Explain API
- **PDF report** — print-optimised multi-page HTML export via `printReportDirectly()`
- **SARIF export** — GitHub Code Scanning compatible output

### Enhancements

- File-hash analysis cache — skips unchanged Apex files, speeds up re-runs
- FileSystem watcher auto-invalidates cache on `.cls`/`.trigger` save
- Third-party plugin API (`HealthAnalyzerPlugin`) for custom rules

---

## [1.0.0] — 2026-04-01 🎉 GA Release

### New Features

- **Rebranded** to OrgPulse — Salesforce Architecture Health & Insights
- **AI-powered issue explanations** via GitHub Copilot (`vscode.lm` API) with consent gate
- `sfHealthAnalyzer.ai.enabled` / `sfHealthAnalyzer.ai.provider` configuration
- `sfHealthAnalyzer.plugins` configuration for plugin file paths
- New commands: Export SARIF, Clear Cache, Revoke AI Consent, Explain Issue with AI

---

## [0.0.4]

### Added

- Enterprise 7-tab interactive dashboard (Overview, Code, Automation, Data Model, Performance, Security, Testing)
- 3 new analyzers: Test Coverage, Security & Permissions, Integrations
- 17 built-in rules across 7 categories
- Org metadata analysis via Salesforce Tooling API
- Drill-down issue panels in dashboard

## [0.0.3]

- Improved extension icon clarity for Marketplace display

## [0.0.2]

- Initial release
