# OrgPulse — Data Wiring Reference

> **Last verified: 2026-07-09** (against branch `feature/security-screen-redesign`).
> **Purpose**: answer "is this screen real or sample data, and what field would I use
> instead?" without re-reading `src/analyzers/`, `src/services/`, or the webview tabs.
> **This is a snapshot, not live code.** If a claim below looks wrong — a field renamed,
> a screen re-wired, a new analyzer added — trust the source over this doc, then fix
> this doc. Re-verify wholesale roughly whenever a batch of screens gets wired, not
> continuously.
>
> For the narrative "how the pipeline works" deep-dive (auth flow, scoring math, message
> contracts), see [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — note that doc is itself
> stale in one spot (it still describes the retired `media/dashboard.js` webview; the
> real webview is the React app in `webview-ui/`, per `CLAUDE.md`).

---

## A. Data flow cheat sheet

- **Auth**: `sf` CLI is used only to bootstrap credentials (`sf org display --json`,
  `sf org auth show-access-token --json`). No jsforce, no stored password.
- **Data access**: everything else is direct authenticated HTTPS calls from
  `src/services/salesforceService.ts` via two primitives — `query<T>(soql)` (Data/REST
  API, auto-paginated) and `toolingQuery<T>(soql)` (Tooling API) — plus `compositeQuery()`
  for batched round trips. No per-call CLI spawns. A per-scan `memo()` cache dedupes
  repeated fetches (e.g. `getApexTriggers()` across analyzers).
- **Orchestration**: `runFullAnalysis()` in `src/extension.ts` (triggered by
  `sfHealthAnalyzer.analyzeOrg`) is the *only* orchestrator. `codeAnalyzerService.ts` is
  **not** an orchestrator — it's a thin wrapper around the external Salesforce Code
  Analyzer v5 CLI (PMD/ESLint/etc.), used as an optional Apex/LWC rule substitute.
- **Contract**: everything funnels into one ever-growing `AnalysisResult` object
  (`src/types/index.ts`) — `issues`, `scores`, `summary`, `metadata`, plus ~25 optional
  analyzer-specific sections (see table B).
- **To webview**: a generic `analysisResults` postMessage dumps the *entire*
  `AnalysisResult` into `useOrgStore.results` (`webview-ui/src/store/slices/orgStore.ts`).
  Every field reaches the webview this way. On top of that, **4 domains get a dedicated
  round trip** (separate store slice + on-demand refresh message): License, OrgInfo,
  GovernorLimits, FutureReadiness recommendations — plus CTA Review (AI-only, on-demand).
  **Security recommendations have no dedicated round trip**: `securityRecommendations`
  rides inside the generic blob only (see D/F).
- **Failure model**: almost every analyzer/service call is individually try/caught and
  degrades to `[]`/defaults — a single failing query never aborts the whole scan.

---

## B. Per-analyzer capability table (`src/analyzers/`)

| Analyzer | Real org data fetched | Local static analysis | Derives / computes | Populates (`AnalysisResult` field) |
|---|---|---|---|---|
| `apexAnalyzer.ts` | Takes `ApexClass[]`/`ApexTrigger[]` passed in (fetched once upstream) | Yes — regex/AST-ish rule scan of `.cls`/`.trigger` body via rules engine | Rule violations (SOQL-in-loop, DML-in-loop, missing sharing, etc.) | `issues[]` (category `code-quality`); skipped if Code Analyzer CLI (`scaActive`) is on |
| `queryAnalyzer.ts` | `explainQuery()` (Tooling `/query/?explain=`) on SOQL extracted from Apex | No | Query selectivity/index-usage findings | `issues[]`, feeds `queryExplainResults` |
| `automationAnalyzer.ts` | `getFlows()`, `getWorkflowRules()`, `getScheduledApexJobs()`, validation rules | No | Flow/trigger/workflow inventory & complexity | `automationSummary` (objectMap, totalFlows/Triggers/ValidationRules, by-type/status breakdowns, flowInventory, workflowInventory) — **populated but unused by Automation tab today**, see E |
| `dataModelAnalyzer.ts` | `getCustomFields()`, `getEntityDefinitions()`, `getObjectDataModelCounts()`, `getFieldDefinitions()` | No | Field-limit %, relationship density, per-object stats | `dataModelStats`, `dataModelSummary`, `dataModel*Details` |
| `testCoverageAnalyzer.ts` | `getApexCodeCoverage()` (`ApexCodeCoverageAggregate`) | No | Coverage % per class/trigger, org-wide coverage | `testCoverageSummary` |
| `orgInventoryAnalyzer.ts` | `getInstalledPackages()`, `getVisualforcePages()`, `getCustomLabels()`, `getRecordTypes()`, `getPageLayouts()`, `getFlexiPages()` | No | Metadata inventory rollups | `orgInventory` |
| `scaleCenterAnalyzer.ts` | Uses fetched classes/triggers + record counts | No | Transaction-level scale metrics | `scaleCenterMetrics` (`TransactionMetric[]`) — **populated but zero UI consumers anywhere**, see E |
| `lwcAnalyzer.ts` | Local only | Yes — LWC bundle static scan | Component-quality findings | `issues[]`, `lwcSummary`; skipped if `scaActive` |
| `integrationAnalyzer.ts` | `getNamedCredentials()`, `getConnectedApps()` | No | Integration surface findings | `issues[]` (category `integration`) |
| `dependencyAnalyzer.ts` | `getMetadataComponentDependencies()` | Uses passed-in classes/triggers | Dependency graph | `dependencyGraph` |
| `profileSecurityAnalyzer.ts` | `getProfilesWithPermissions()`, `getProfileUserCounts()`, `getPermissionSetGroups()`, `getPermissionSetAssignmentCounts()` | No | Over-permissioned profile findings | `issues[]` (category `profile-security`), `profileSummary` |
| `governorLimitsAnalyzer.ts` | Sync, given classes+triggers (no live call itself) | Yes — pattern scan for governor-limit risk | Risk findings | `issues[]`, `governorRisks` |
| `technicalDebtAnalyzer.ts` | Given classes+triggers | Yes | Debt scoring/categorization | `debtSummary` (totalHours, quickWins, mediumItems, largeItems, categories) — **populated, used correctly in Overview, but unused by TechnicalDebt tab**, see E |
| `staleMetadataAnalyzer.ts` | `getStaleReports()`, `getStaleDashboards()` (180-day cutoff) | No | Stale-metadata findings | `issues[]`, `staleMetadata` |
| `permissionAnalyzer.ts` | `getPermissionSets()` | No | Permission-set risk findings | `issues[]` |
| `userGovernanceAnalyzer.ts` | `getActiveUsers()`/`getAllUsers()`, `getUserRoles()` | No | Dormant-user / governance findings | `issues[]` (category `user-governance`), `userSummary` (incl. `dormantUsers`) |
| `ctaArchitectureAnalyzer.ts` | `getUserLicenseSummary()`, `explainQuery()` on up to 10 SOQL snippets from other issues | No | CTA-tier architecture assessment inputs | `licenseSummary`, `queryExplainResults`, `objectRecordCounts`, `entryPoints` |

Orchestration order in `runFullAnalysis()`: Batch 1 (12 analyzers, parallel) →
health scores computed → Batch 2 (userGovernance, profileSecurity, staleMetadata,
orgInventory — need the assembled result) → CTA analyzer (sequential) → live org
limits + org-info-extended batch → deterministic recommendation bases → trend history
→ Future Readiness → Security recommendations base.

---

## C. Service layer

### `salesforceService.ts` — transport layer, grouped by domain

All methods degrade to `[]`/defaults on failure (logged, doesn't abort the scan) except
auth failures (`connect()`/`getOrgInfo()`), which throw `SalesforceAuthError`; non-2xx
REST responses throw `SalesforceQueryError`.

| Domain | Key methods | Notes |
|---|---|---|
| Org/auth | `connect()`, `getOrgInfo()`, `listOrgs()`, `getOrgEdition()`, `getOrgExtendedDetails()` | `getOrgExtendedDetails` → `Organization` (edition, sandbox, timezone, created date) |
| Apex/code | `getApexClasses()`, `getApexTriggers()` (memoized), `getApexCodeCoverage()` | `ApexClass`/`ApexTrigger` fetched once, reused across analyzers |
| Automation | `getFlows()`, `getWorkflowRules()`, `getScheduledApexJobs()`, `getValidationRules()` | `getFlows()` has a Tooling-API fallback if `FlowDefinitionView` fails |
| Data model | `getCustomFields()`, `getEntityDefinitions()`, `getObjectDataModelCounts()`, `getFieldDefinitions()`, `getRecordCount()`/`getObjectRecordCountsBatch()` | Multi-tier fallback queries (drop joins/filters progressively) |
| Security/users | `getActiveUsers()`/`getAllUsers()`, `getProfilesWithPermissions()`, `getProfileUserCounts()`, `getUserRoles()`, `getPermissionSets()`, `getPermissionSetGroups()`, `getPermissionSetAssignmentCounts()` | |
| Limits/licenses | `getOrgLimits()` (`GET /limits`), `getUserLicenseSummary()`, `getFeatureLicenses()` | |
| Integrations | `getNamedCredentials()`, `getConnectedApps()`, `getInstalledPackages()` | |
| Inventory | `getVisualforcePages()`, `getCustomLabels()`, `getRecordTypes()`, `getPageLayouts()`, `getFlexiPages()`, `getCustomMetadataTypes()`, `getPlatformEvents()`, `getInstalledApps()` | |
| Org-info-extended batch | `getEnvironmentsSummary()`, `getIntegrationsSummary()`, `getQuickFactsCounts()`, `getDataModelTypeCounts()`, `getDataCloudIdentityCounts()`, `classifyPackages()`, `getAppTypeSummary()` | Feeds `orgInfoData.{environments,integrations,quickFacts,clouds,packagesByType,appsByType}` |
| Misc | `explainQuery()` (`GET /query/?explain=`), `getStaleReports()`/`getStaleDashboards()`, `getTrustInstanceStatus()`/`getNextReleaseInfo()` (public status.salesforce.com, no auth) | |
| CLI helpers | `isSfCliInstalled()`, `isCodeAnalyzerInstalled()`, `isJavaInstalled()`, `ensureCodeAnalyzer()` | Gate the optional Code Analyzer CLI path |

### `aiService.ts` — multi-backend AI gateway

Backends: `vscode-lm` (Copilot/Claude extensions), or direct API keys for Anthropic,
OpenAI, Gemini, or a custom OpenAI-compatible endpoint (Ollama/LM Studio/vLLM).

| Entry point | Gated by | Touches real numbers? |
|---|---|---|
| `explainIssue(issue)` | `ai.enabled` + cache + 2s debounce + one-time consent | No — narrative only |
| `synthesizeCtaReview(result)` | `ai.enabled` + separate CTA consent | No — builds `AssessmentContext` (PII-sanitized), model authors narrative + verdict, never recalculates scores |
| `synthesizeFutureReadiness(result)` | `ai.enabled` + CTA consent | No — scores/grades/roadmap are deterministic; AI only fills `narrative.*` |
| `synthesizeLicenseRecommendations` / `synthesizeOrgInfoRecommendations` / `synthesizeGovernorLimitsRecommendations` | `ai.enabled` + CTA consent | No — sends only `{id,title,value,valueLabel,impact}` per card, splices back `evidencePoints` bullets only; numbers come from the deterministic `build*Base()` |
| `askArchitect(question)` | CTA consent | Tool-augmented Q&A; gives the model 5 **read-only** SOQL/limits tools guarded by `isReadOnlySoql()` (must start with `SELECT`, no DML) |

**No `synthesizeSecurityRecommendations` exists** — confirmed via grep, zero references
in `aiService.ts`. See F.

### Recommendation-builder services — deterministic `build*Base(result)` pattern

All four follow the same shape: pure function over already-collected `AnalysisResult`
fields → 5 `*RecommendationCard`s (`{id, title, icon, impact, value, valueLabel,
sample, evidencePoints?}`). `evidencePoints` stays `undefined` until (if) the matching
`aiService.synthesize*` call splices in AI-authored bullets.

| File | Input fields | Real or sample? | AI narrative counterpart? |
|---|---|---|---|
| `orgInfoRecommendations.ts` | `licenseSummary`, `orgInfoData.{extended,clouds,integrations}`, `orgDetails` | All 5 cards real (`sample: false`) | Yes (`synthesizeOrgInfoRecommendations`) |
| `licenseRecommendations.ts` | `licenseSummary`, `featureLicenses`, `userSummary.dormantUsers` | **All 5 cards `sample: true`** — dollar "savings" figures are hardcoded (no license-pricing data exists anywhere); only raw counts are real | Yes (`synthesizeLicenseRecommendations`) |
| `governorLimitsRecommendations.ts` (new) | `orgLimits` | All 5 cards real (`sample: false`); synthetic `capacityScore` computed from limit-usage penalties | Yes (`synthesizeGovernorLimitsRecommendations`) — **fully wired end-to-end**, including webview store/command |
| `securityRecommendations.ts` (new) | `issues` (security/profile-security/user-governance categories), `securityCollectorData.mfaRequired` | Real findings ranked by severity, **padded with 4 fixed `SAMPLE_PADDING_CARDS`** when fewer than 5 real findings exist | **No** — no synth method, no command, no store slice. Component explicitly labels this "deterministic only, nothing AI-generated." |

Both new files (`governorLimitsRecommendations.ts`, `securityRecommendations.ts`) **are
wired into the real pipeline** (imported and called in `extension.ts`'s
`runFullAnalysis`) — neither is orphaned scaffolding. The gap is specifically the
missing AI-narrative round trip for Security (no command/store), not the base data.

`architectPrompts.ts` — per-tab custom AI-prompt override store (13 scope ids,
persisted to `.orgpulse/architectPrompts.json`). 5 scopes are actually wired into a live
AI call today (`futurereadiness`, `cta`, `licenserecs`, `orginfo`, `govlimits`) — the
file's own doc-comment claiming only 3 is stale. `secaccess` has no synthesis method.

### `assessmentContext/` and `futureReadiness/` — one-liners

- **`assessmentContext/`** — builds the privacy-safe, token-budgeted JSON context sent
  to the AI for the CTA review. Pipeline: `PiiSanitizer` (strips IDs/emails/URLs/IPs) →
  `FindingNormalizer` (17 issue categories → 9 display domains) →
  `BusinessContextEngine`/`QuickWinEngine`/`ScoreCalculator`/`TrendAnalyzer` (all
  rule-based, no AI) → `PayloadOptimizer` (enforces ~12k token budget by truncating).
- **`futureReadiness/`** — fully deterministic "AI/Agentforce, Data Cloud, Hyperforce
  readiness" scoring engine; 3 packs (`aiReadinessPack`, `dataCloudReadinessPack`,
  `hyperforceReadinessPack`) each score/gap-analyze/roadmap independently, then get
  averaged. AI is added *after*, as narrative only (`aiService.synthesizeFutureReadiness`).
  Collectors (`collectReadinessData()`) fetch Data Cloud objects, duplicate/matching
  rules, trust-surface metadata (remote sites, certs, IP ranges, connected apps), and
  platform feature enablement (Data Cloud/Einstein/Agentforce feature licenses, MFA).

---

## D. Screen-by-screen wiring status (the centerpiece)

| Tab | Wired? | Feeds from | Real fields already used | Still sample (file) |
|---|---|---|---|---|
| **Overview** | ✅ Yes | `orgStore.results` | scores, trends, issues, summary, `debtSummary.quickWins`, dataModelStats, automationSummary, futureReadiness, metadata, orgDetails | none |
| **OrgInfo** | 🟡 Partial | `orgStore.results` + `orgInfoRecommendationsStore` | orgDetails, `orgInfoData.*`, orgInventory, licenseSummary, featureLicenses, `userSummary.dormantUsers` | perm-set licenses, login-recency buckets, license trend, "waste" indicators (`orgInfo/sampleData.ts`) |
| **DataModel** | ✅ Yes | `orgStore.results` | dataModelStats + all `dataModel*Details`, dataModelSummary | none |
| **Automation** | 🔴 No | `orgStore.results` (header/scan-history popover only) | none in body | **100%** — `<AutomationSummary />` takes no props; everything from `automationSummary/sampleData.ts`. `results.automationSummary` exists and is unused (quick win, see E) |
| **CodeQuality** | 🟡 Partial | `orgStore.results` via `codeQuality/derivations.ts` | codeInventory, testCoverageSummary, governorRisks, lwcSummary, debtSummary | EQI/tech-debt/complexity scores, sparkline trends, static rows (`SAMPLE_*` constants in `derivations.ts`) |
| **Integrations** | 🔴 No | `orgStore.results` (Scan-History popover only: `orgDetails.orgId`) | none in body | **100%** — footer literally says "Illustrative — not yet wired to live scan data." `orgInfoData.integrations` + `entryPoints` unused (quick win, see E) |
| **SecurityAccess** | 🟡 Partial (most mature) | `orgStore.results` (direct props) | issues (filtered), trends, userSummary, profileSummary, `orgInfoData.quickFacts`/`integrations`, securityCollectorData, `scores.security`, dataModelStats, entryPoints, `securityRecommendations.cards` | password policy, session mgmt, IP-hours, data classification, Shield status, event monitoring (`security/sampleData.ts`) — each individually flagged with a `sample`/`sampleNote` prop, not blanket-faked |
| **PerfLimits** | 🔴 No | `orgStore.results` (header only) | none in body | **100%** — `<PerfLimitsSummary />` takes no props. `scaleCenterMetrics`, `dataModelStats`, `codeInventory`, `queryExplainResults` all unused (quick win, see E) |
| **GovernorLimits** | 🟡 Partial | `orgStore.results` (props) + `governorLimitsRecommendationsStore` | orgLimits, dataModelStats, governorLimitsRecommendations | trends/forecast sparklines, top consumers, quick wins card, need-more-capacity, per-object storage estimate (heuristic, not real) |
| **TechnicalDebt** | 🔴 No | `dashboardStore.results` (header only) | none in body | **100%** — only the "Overview" sub-tab is implemented (others are "coming soon"). `results.debtSummary` exists, is unused here, but is *already used correctly* in Overview (quick win, see E) |
| **FutureReadiness** | ✅ Yes | `futureReadinessStore` | full deterministic `FutureReadinessReport` + AI narrative | none |
| **CTAReview** | ✅ Yes (on-demand) | `ctaStore` | AI-generated `CTAReview`, requires explicit `runCtaReview` action | none |
| **AskArchitect** | ✅ Yes (on-demand) | `aiStore`/`architectPromptsStore` | live AI chat, not `AnalysisResult`-based | none |
| **TrendsHistory** | ✅ Yes | `orgStore.results` + `orgHistory` | trends, scan history | none |
| **Settings** | ✅ Yes | `aiStore` | AI provider auth/config, not analyzer-based | none |

**Message plumbing recap**: every field reaches the webview via the generic
`analysisResults` → `orgStore.results`. Only License/OrgInfo/GovernorLimits/
FutureReadiness recommendations (+ CTA) get a dedicated store slice and on-demand
refresh command (`runLicenseRecommendations`, `runOrgInfoRecommendations`,
`runGovernorLimitsRecommendations`, `runFutureReadiness`, `runCtaReview`). There is
**no** `runSecurityRecommendations` / `runTechnicalDebtRecommendations` /
`runAutomationRecommendations` / `runPerfLimitsRecommendations` command — wiring those
4 tabs' recommendation cards to AI (if ever desired) needs new IPC, not just a UI change.

---

## E. Ready-to-wire quick wins (data exists, no screen reads it yet)

These fields are already populated every scan by the extension — wiring the relevant
screen to them is pure frontend work, no new analyzer/collector needed:

| Field | Populated by | Natural home | Currently used? |
|---|---|---|---|
| `automationSummary` | `automationAnalyzer.ts` | **Automation tab** (KPI row, by-type/status donuts, top objects table) | Used correctly in Overview's insight card only |
| `debtSummary` | `technicalDebtAnalyzer.ts` | **TechnicalDebt tab** (distribution, by-severity, quick wins list) | Used correctly in Overview's Quick Wins sidebar only |
| `scaleCenterMetrics` | `scaleCenterAnalyzer.ts` | **PerfLimits tab** ("Runtime Performance" / Level 3) | Zero consumers anywhere in webview-ui |
| `queryExplainResults` | `ctaArchitectureAnalyzer.ts` / `queryAnalyzer.ts` | **PerfLimits tab** (query/index health card) | Zero consumers anywhere in webview-ui |
| `objectRecordCounts` | `ctaArchitectureAnalyzer.ts` | **GovernorLimits tab** (top consumers / forecast cards) | Zero consumers anywhere in webview-ui |
| `orgInfoData.integrations` + `entryPoints` | `salesforceService.ts` / `ctaArchitectureAnalyzer.ts` | **Integrations tab** (already used by OrgInfo's "Integrations Overview" card, proving it's populated) | Unused by Integrations tab itself |

`limitsSimulatorData` also exists on `AnalysisResult` but has **zero references
anywhere in `webview-ui/src`** (confirmed by grep) — flag for a product decision
(is this field still needed / where should it render?) rather than treating it as a
simple wiring task.

---

## F. Genuine sample-only gaps (no backing field — wiring alone won't fix these)

These need new analyzer/collector/service work, not just a frontend change:

- **License $ savings figures** (`licenseRecommendations.ts`) — no license-pricing data
  exists anywhere in the app; only raw counts (dormant users, underutilized feature
  licenses) are real.
- **Permission-set licenses, login-recency buckets, license trend, "waste" indicators**
  (OrgInfo → `orgInfo/sampleData.ts`) — no backing collector.
- **Security tab**: password policy, session management, IP-login-hours restriction,
  data classification labels, Shield product status, event monitoring counts,
  connected-app refresh-token/privilege/usage-age (`security/sampleData.ts`) — would need
  new Tooling queries (e.g. `SecuritySettings`/Shield metadata isn't currently collected).
- **Automation Level 2/3** (execution logs, Shield Event Monitoring) — no backing field
  in `AnalysisResult` at all yet.
- **Security recommendations AI narrative** — deterministic cards exist
  (`securityRecommendations.ts`), but there's no `synthesizeSecurityRecommendations`
  method, no `runSecurityRecommendations` command, and no store slice. Bringing this to
  parity with Governor Limits Recommendations is new plumbing work (service method +
  IPC command + Zustand slice + message handler), not just a data question.
- **GovernorLimits**: trend/forecast sparklines, "top consumers," "need more capacity,"
  and per-object storage (currently an `estimateStorageMB` heuristic, not a real figure)
  have no precise backing field.

---

## Maintenance note

Update the relevant section(s) whenever an analyzer, service, or screen changes shape —
don't let this doc silently drift. Bump the "Last verified" date at the top whenever you
touch it. If you're about to spend real effort reading `src/analyzers/` or
`src/services/` from scratch to answer "is X real," check here first; only fall back to
source if this doc's answer looks stale or incomplete.
