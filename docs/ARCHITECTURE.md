# OrgPulse — Architecture & Onboarding Guide

> A deep-dive for anyone new to the codebase. It explains, in plain language,
> **how OrgPulse connects to a Salesforce org, fetches metadata, scans for problems,
> scores org health, and renders everything on the dashboard** — and then closes with
> the **limitations and a concrete roadmap** for running against large enterprise orgs
> or multiple orgs.
>
> This complements the short overview in [`CLAUDE.md`](../CLAUDE.md). Where CLAUDE.md
> says *what* exists, this document says *how it works*, with the actual `sf` commands,
> SOQL, rules, scoring math, and message contracts.

---

## 1. The big picture

OrgPulse (`sf-health-analyzer`) is a VS Code extension that grades a Salesforce org
across many dimensions. It activates when the workspace contains an `sfdx-project.json`.

It has **zero runtime dependencies** — everything ships in a single esbuild bundle
([`dist/extension.js`](../dist/extension.js)) and relies only on the **VS Code API**
and the **Salesforce CLI** (`sf`). (`out/` is a separate, test-only compile — don't
confuse it with the shipped `dist/`.)

The code is split into two worlds that never share memory — they only exchange JSON
messages:

| World | Lives in | Runs as | Responsibilities |
|-------|----------|---------|------------------|
| **Extension host** | [`src/`](../src/) | Node process | Talk to the `sf` CLI, run analyzers, score, persist, call AI |
| **Webview UI** | [`media/dashboard.js`](../media/dashboard.js) (browser side) + [`src/ui/dashboard.ts`](../src/ui/dashboard.ts) (host shell) | Browser sandbox | Render tabs, charts, tables; collect user actions |

### Data flow at a glance

```
                 ┌─────────────────────── Extension Host (Node) ───────────────────────┐
  user clicks    │                                                                      │
 "Analyze Org"   │   extension.ts                salesforceService.ts                   │
      │          │   runFullAnalysis()  ──────▶  connect()  ── sf org display ──▶ Org   │
      ▼          │        │                      toolingQuery()/query() ── sf data query │
 ┌──────────┐    │        │  fan-out                                                     │
 │ Webview  │    │        ├──▶ apexAnalyzer ─┐                                           │
 │dashboard │◀───┤        ├──▶ queryAnalyzer ├─▶ rules engine ─▶ Issue[]                 │
 │  .js     │    │        ├──▶ dataModel...  ┘                    │                      │
 │          │    │        └──▶ (17 analyzers)                     ▼                      │
 │  11 tabs │    │                                  healthScore.ts  → scores + grade     │
 │  charts  │    │                                          │                            │
 │  tables  │    │                          AnalysisResult ◀┘                            │
 └──────────┘    │                                  │                                    │
   ▲   │         │              persist: globalState + .orgpulse/cache.json              │
   │   │ postMessage  ◀──── analysisResults ────────┘                                    │
   │   └────── runAnalysis / explainIssue / askArchitect / export ──▶                    │
   │          │                                                                          │
   │          └──▶ aiService.ts  ── vscode.lm.selectChatModels ──▶ Claude / Copilot      │
   └────────────────────────────── render ◀───────────────────────────────────────────-┘
```

Everything funnels into one object — **`AnalysisResult`** ([`src/types/index.ts`](../src/types/index.ts)) —
which is the contract between the analyzers, the scorer, and the dashboard.

---

## 2. How we authorize the org

**There is no jsforce, no direct REST/OAuth client, and no stored password.** All org
access piggybacks on the **Salesforce CLI's cached auth**. Whatever org you logged into
with `sf org login web` and set as default is the org OrgPulse analyzes.

The whole connection lives in [`salesforceService.ts`](../src/services/salesforceService.ts):

- `connect()` ([`salesforceService.ts:97`](../src/services/salesforceService.ts#L97))
  calls `getOrgInfo()`, which runs:

  ```bash
  sf org display --json
  ```

  and reads `id`, `accessToken`, `instanceUrl`, `username`, `alias`, and `apiVersion`
  off the result.

- **API version**: defaults to `63.0` ([`DEFAULT_API_VERSION`](../src/services/salesforceService.ts#L55))
  until the live org's version is resolved at connect time. `normalizeApiVersion()`
  turns `"62"` into `"62.0"`. All REST paths are built via
  `restPath()` → `/services/data/v{version}/{resource}`.

- **Single default org only.** A `listOrgs()` method exists (it shells out to
  `sf org list --json`) but **nothing in the analysis pipeline calls it** — there is no
  org picker. This is the single most important fact for multi-org work (see §10).

### Error model

Connection failures are normalized into two typed errors
([`src/utils/errors.ts`](../src/utils/errors.ts)):

| Error | When | Code |
|-------|------|------|
| `SalesforceAuthError` | message contains `"No default"` / `"not authenticated"`, or CLI status ≠ 0 | `AUTH_ERROR` |
| `SalesforceConnectionError` | any other connect failure (network, instance) | `CONNECTION_ERROR` |

The pipeline checks `isAuthError()` and, on auth failure, tells the user to run
`sf org login web --set-default` and stops early
([`extension.ts` around the connect step](../src/extension.ts)). Before any of this,
`ensureSfCli()` verifies the CLI is installed.

After a successful connect, several **non-critical** extras are fetched in parallel and
never block the run: org edition, Salesforce **Trust** instance status & next-release
info (public APIs, no auth, 8s timeout), feature licenses, and installed apps.

---

## 3. How we fetch metadata

### The transport layer

Every org read goes through one tiny helper
([`runSfJson`](../src/services/salesforceService.ts#L57)):

```ts
async function runSfJson(args: string[]) {
  const { stdout } = await execFileAsync('sf', args, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout);
}
```

It spawns the `sf` CLI with `execFile`, asks for `--json`, and parses stdout. The
`50 MB` buffer is the hard ceiling on a single command's output.

Two readers sit on top, both with **automatic pagination**:

- **`toolingQuery<T>()`** → `sf data query --query "…" --use-tooling-api --json`
- **`query<T>()`** → `sf data query --query "…" --json` (Data API)

Pagination logic (identical in both,
[`salesforceService.ts:204`](../src/services/salesforceService.ts#L204) and
[`:258`](../src/services/salesforceService.ts#L258)):

1. If the query already contains `LIMIT`, run it once and return.
2. Otherwise append `LIMIT 2000 OFFSET n`, looping `n = 0, 2000`.
3. **Stop conditions:** a page returns fewer than 2000 rows, **or** offset would
   exceed `MAX_OFFSET = 2000`. In the latter case it logs
   *"…query truncated… Consider adding WHERE filters"* and stops.

> ⚠️ **This means any unfiltered query silently caps at ~4000 records.** Fine for most
> orgs; a real problem for enterprise scale (see §10).

### REST calls

A couple of things aren't SOQL — they go through `sf api request rest`:

- **Governor limits**: `GET /services/data/v{ver}/limits`
- **Query selectivity**: `GET /services/data/v{ver}/query/?explain={soql}` (returns a
  query plan + `sforcePerformanceLevel`)

### What we actually query

All of the following are read-only. Most Tooling queries add `NamespacePrefix = null`
to exclude managed-package metadata.

| Domain | Object(s) | API | Notes |
|--------|-----------|-----|-------|
| Apex code | `ApexClass`, `ApexTrigger` (`Status='Active'`) | Tooling | Body included for static analysis |
| Automation | `Flow` → falls back to `FlowDefinition` on older orgs; `FlowVersion` (chunked by 200) for object resolution | Tooling | Multi-version fallback handles API drift |
| Validation | `ValidationRule` (joins `EntityDefinition`) | Tooling | |
| Data model | `EntityDefinition`, `CustomField`, `FieldDefinition` + `COUNT(Id) … GROUP BY EntityDefinitionId` aggregates | Tooling | Aggregates carry an explicit `LIMIT 2000` so they don't trigger OFFSET paging |
| Users & security | `User`, `Profile`, `PermissionSet`, `PermissionSetGroup`, `NamedCredential` | mixed | `User`/`Profile` via Data API (support `ORDER BY`); perm sets via Tooling |
| Licenses | `UserLicense`, `FeatureLicense` | Data | `FeatureLicense` absent on some editions → handled gracefully |
| Stale metadata | `Report`, `Dashboard` (LastModified < 180 days) | Data | |
| Inventory | `InstalledSubscriberPackage`, `AppDefinition`, custom metadata (`%__mdt`), platform events (`%__e`) | Tooling | |
| Test coverage | `ApexCodeCoverageAggregate` | Tooling | Aggregated per class |

### Resilience patterns worth knowing

- **Managed-package filtering in JS.** `NamespacePrefix` filtering is unreliable on the
  Tooling API for some editions, so the data-model path queries broadly and filters
  managed objects in JavaScript instead.
- **Progressive fallbacks.** Several queries try `ORDER BY` → drop `ORDER BY` →
  fetch-all-and-sort-in-JS; Flows try modern fields → minimal fields → legacy object.
- **Retries.** Both readers wrap calls in `withRetry()` (3 attempts, exponential
  backoff; **auth errors are never retried**).

### Caching & persistence

| Layer | Where | Lifetime | Purpose |
|-------|-------|----------|---------|
| Last result + score history (10 points) | VS Code `globalState` | until overwritten | survives reload; trend chart |
| Full `AnalysisResult` | `.orgpulse/cache.json` (auto-`.gitignore`d) | until "Re-Analyse" | instant reopen; user forces fresh run |
| Per-file Apex analysis | `globalState` keyed by content hash (djb2) | 24h TTL | skip re-analyzing unchanged `.cls`/`.trigger` |

A file watcher on `**/*.{cls,trigger}` invalidates the per-file cache on edit/create/delete
([`src/utils/cache.ts`](../src/utils/cache.ts)).

---

## 4. How we scan — the rules engine + 17 analyzers

OrgPulse scans in **two modes**, often for the same concern:

- **Local static analysis** — regex/pattern matching over the `.cls`, `.trigger`, and
  LWC files open in the workspace.
- **Org metadata analysis** — Tooling/Data API queries plus live signals (record
  counts, code coverage, governor-limit usage, query EXPLAIN).

### The rules engine

The reusable checks live in a small engine ([`src/rules/engine.ts`](../src/rules/engine.ts)):

```ts
interface Rule<T = unknown> {
  meta: RuleMeta;                              // id, name, category, severity, enabled…
  analyze(data: T, context: RuleContext): void; // calls context.report(issue)
}
```

- `ruleRegistry` holds every rule; `registerBuiltInRules()` registers the built-ins at
  activation ([`src/rules/index.ts`](../src/rules/index.ts)).
- `RuleEngine.run(ruleIds, data, opts)` executes rules with **per-rule error isolation**
  (one rule throwing doesn't kill the run) and stamps each finding with a unique id +
  ruleId.
- Shared Apex helpers: `APEX_PATTERNS` (regexes for SOQL, DML, hardcoded IDs, loops,
  `System.debug`, etc.), `findPatternMatches()` (returns match + line/column), and
  `isInsideLoop()` (brace-depth heuristic).
- **Custom rules** can be loaded from user config via the plugin loader
  ([`src/rules/plugin.ts`](../src/rules/plugin.ts), setting `sfHealthAnalyzer.plugins`).

### The built-in rule catalog

These are the 16 registered rules ([`src/rules/index.ts`](../src/rules/index.ts)),
grouped by the concerns you asked about:

**Static code violations & antipatterns**
- `soql-in-loop`, `dml-in-loop` — queries/DML inside loops (governor-limit killers) → *error*
- `hardcoded-id` — 15/18-char Salesforce IDs in code (skips tests) → *warning*
- `missing-bulkification` — `Trigger.new[0]` single-record access → *warning*
- `trigger-size`, `trigger-logic` — oversized triggers / business logic in triggers
- `class-size`, `method-length` — configurable size thresholds
- `system-debug` — `System.debug()` left in production code → *info*

**Security**
- `missing-sharing` — class with no `with/without/inherited sharing` → *warning*
- `modifyall-permission` — "Modify All Data" (*error*) / "View All Data" (*warning*) on
  perm sets/profiles
- Plus deeper checks in `profileSecurityAnalyzer` (dangerous permission *combinations*,
  over-privileged profiles).

**Performance**
- `non-selective-query` — no `WHERE`/`LIMIT`, `!=` / `NOT IN`, leading-wildcard `LIKE '%…'`,
  or filtering only on non-indexed fields; **LDV-aware** when org record counts and the
  query EXPLAIN plan are available.

**Test coverage**
- `test-coverage` — below Salesforce's 75% minimum → *warning* (0% → *error*); also flags
  test classes with no `System.assert*`.

**Automation design**
- `automation-complexity` — too many triggers/flows/process-builders/validation-rules on
  one object; recursion risk.

**Data model**
- `unused-fields` (custom fields never referenced in code), plus isolated / over-coupled
  objects and field-limit risk emitted by `dataModelAnalyzer`.

**Integration**
- `legacy-credential` — Named Credentials using password auth instead of OAuth.

### The analyzer roster (17)

Each analyzer owns one domain and emits `Issue[]` plus optional structured summaries
that ride along in `AnalysisResult`.

| Analyzer | Data source | What it finds |
|----------|-------------|---------------|
| `apexAnalyzer` | local + org | Code-quality rules, callout-in-trigger, unbounded date-range SOQL heap risk |
| `queryAnalyzer` | local + org | SOQL extraction & selectivity, LDV warnings |
| `automationAnalyzer` | org (+local triggers) | Per-object automation map, Process Builder deprecation |
| `dataModelAnalyzer` | org + workspace scan | Field counts/object, unused fields, coupling, field-limit risk |
| `testCoverageAnalyzer` | org | Coverage % per class, classes below 75%, zero-coverage |
| `permissionAnalyzer` | org | Modify/View All, outdated permission-set groups |
| `profileSecurityAnalyzer` | org | Dangerous permission combos, over-privileged profiles |
| `technicalDebtAnalyzer` | org + local | TODO/FIXME, outdated API, dead code, complexity → **debt-hours estimate** |
| `governorLimitsAnalyzer` | org | Predicts SOQL/DML/CPU/heap risk; feeds the **Limits Simulator** |
| `ctaArchitectureAnalyzer` | org + EXPLAIN + counts | License misalignment, query selectivity, async anti-patterns, ownership skew, wild-west triggers, idempotency gaps, public entry points |
| `lwcAnalyzer` | local | LWC complexity, wire usage, accessibility |
| `integrationAnalyzer` | org | Named credentials, deprecated auth/API |
| `dependencyAnalyzer` | local + org | Dependency graph, fan-in/out, hotspots |
| `staleMetadataAnalyzer` | org | Old reports/dashboards/fields + cleanup estimate |
| `orgInventoryAnalyzer` | org | Packages, VF pages, labels, component counts |
| `userGovernanceAnalyzer` | org | Inactive/dormant users, profile distribution |
| `scaleCenterAnalyzer` | org (Enterprise+) | EventLogFile metrics, slow queries, async queue depth |

### How a finding is represented

Every issue is an `Issue` ([`src/types/index.ts`](../src/types/index.ts)):

```ts
interface Issue {
  id: string; ruleId: string;
  severity: 'error' | 'warning' | 'info';
  category: IssueCategory;          // ~18 categories (code-quality, security, performance, …)
  message: string; description?: string;
  file?: string; line?: number; column?: number;   // local issues
  object?: string;                                 // org-metadata issues
  suggestion?: string;
  aiExplanation?: string; aiSuggestion?: string;   // filled lazily by AI
}
```

---

## 5. How we score

Scoring lives in [`src/reports/healthScore.ts`](../src/reports/healthScore.ts).

**Per category** (`calculateCategoryScore`, starts at 100):

| Severity | Points deducted |
|----------|-----------------|
| error | −10 |
| warning | −5 |
| info | −2 |

Deductions are **capped at 80%** of the max (`MAX_DEDUCTION_PERCENT = 80`), so no
category drops below 20. Final = `round(max(0, 100 − cappedDeduction))`.

**Overall** (`calculateOverallScore`) is a weighted average using the default weights
([`src/utils/config.ts`](../src/utils/config.ts#L10), overridable via
`sfHealthAnalyzer.scoring.weights`):

| Category | Weight |
|----------|--------|
| Code Quality | 25 |
| Automation Design | 20 |
| Performance | 20 |
| Data Model | 15 |
| Security | 10 |
| Testing | 5 |
| Integration | 5 |

Overall = `Σ(score × weight) / Σ(weights)` (weights sum to 100).

**Grade** (`getGrade`): A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F — each with a color.

---

## 6. What the dashboard shows (tab by tab)

The UI is a **thin host shell** + a **fat browser script**:

- [`src/ui/dashboard.ts`](../src/ui/dashboard.ts) — creates the `WebviewPanel`, injects
  a CSP nonce + media URIs, holds the "security mode" state, and routes messages. Small.
- [`media/dashboard.js`](../media/dashboard.js) — ~6k lines of **dependency-free vanilla
  JS**: event delegation (every `[data-action]` bound to one document listener),
  paginated/sortable tables, a drill-down side panel, and state persisted via
  `vscode.setState()`.

The **11 tabs** ([`media/dashboard.js:1211`](../media/dashboard.js#L1211)):

| Tab | Shows |
|-----|-------|
| 📊 Overview | Health gauge, 7 category score cards, issue counts, quick links |
| 💻 Code Quality | SOQL/DML-in-loop, class/method metrics, per-class coverage; sortable issue table |
| ⚡ Automation | Triggers/flows/process-builders/validation rules per object; hotspots |
| 🗄️ Data Model | Custom fields per object, field types, unused fields; **CSV export** |
| 🚀 Performance & Limits | **Interactive governor-limits simulator** (volume slider → SOQL/DML/CPU/heap bars), LDV objects |
| 🛡️ Security & Access | Profiles, permission sets, users by role, security issues |
| 🧩 LWC Quality | Component inventory, coverage, accessibility, deprecated API |
| 🕸️ Dependencies | Dependency graph, fan-in/out hotspots, cycles |
| 🧹 Stale Metadata | Unused reports/dashboards/fields + cleanup-hours estimate |
| 🏢 Org Info | Edition, Trust status, release schedule, license utilization, packages, apps |
| 🧠 CTA Review | AI architecture review — **sub-tabs**: Overview / Architecture Analysis / Recommendations / **Ask the Architect** |

There's also a secondary **tree view** ([`src/ui/treeProvider.ts`](../src/ui/treeProvider.ts))
for browsing issues hierarchically in the sidebar.

---

## 7. The message protocol (host ⇄ webview)

They communicate only via `postMessage`. Host messages use `{ type }`; webview commands
use `{ command }`.

**Extension → Webview** (`{ type: … }`):
`analysisResults`, `analysisProgress`, `loading`, `aiExplanation` (+ `aiExplanationLoading`),
`aiPdfSummary`, `ctaReview` (+ `ctaReviewLoading`), `architectAnswer`
(+ `architectAnswerLoading`), `availableModels`.

**Webview → Extension** (`{ command: … }`):
`runAnalysis`, `cancelAnalysis`, `refresh`, `openFile`, `explainIssue`, `runCtaReview`,
`askArchitect`, `exportReport`, `exportDataModelCsv`, `exportCtaHtml`,
`generateAiPdfReport`, `setSecurityMode`, `getModels`.

---

## 8. AI features

AI is accessed through **VS Code's Language Model API**
(`vscode.lm.selectChatModels`) — *not* a direct Anthropic/OpenAI HTTP client — so it
reuses whatever model the user already has (Copilot, Claude, etc.). An optional
OpenAI-compatible custom endpoint (e.g. local Ollama/LM Studio) is also supported.
See [`src/services/aiService.ts`](../src/services/aiService.ts).

- **Model preference order:** an exact selector from settings → Claude Opus → Claude
  Sonnet → Copilot `gpt-4o` → any available model → custom endpoint.
- **Consent-gated.** Separate one-time consent flags (in `globalState`) for issue
  explanations vs the CTA review, **plus** a UI "security mode" (safe / standard /
  advanced) where *safe* disables AI entirely. It degrades gracefully when no model
  exists.

Three entry points:

| Function | What it does |
|----------|--------------|
| `explainIssue(issue)` | Returns `{ summary, impact, howToFix, codeExample }` for one finding; cached by ruleId+message |
| `synthesizeCtaReview(result)` | Large prompt → a structured multi-section `CTAReview` |
| `askArchitect(question, result)` | **Tool-augmented** Q&A over the live org with read-only tools: `run_soql`, `run_tooling_soql`, `explain_query`, `get_org_limits`, `get_license_summary` (loop capped at 5 rounds; SOQL guarded read-only) |

---

## 9. Exports

[`src/reports/reportGenerator.ts`](../src/reports/reportGenerator.ts) produces **HTML,
JSON, SARIF 2.1.0, and text** reports (SARIF is for GitHub Code Scanning — it
de-duplicates rules and maps file issues to physical locations, org issues to logical
locations).

**CSV** (data model) and **PDF** are built client-side in the webview. PDF is done via
**browser print** — the webview opens a print-optimized HTML page and calls
`window.print()` so the user "Saves as PDF". The health-report PDF can optionally
include an AI-generated executive summary (consent-gated).

---

## 10. Enterprise & multi-org — limitations + roadmap

### Current limitations

1. **Single org, hard-wired.** Everything targets the CLI's *default* org. There's no
   picker, and `listOrgs()` is unused. Caches (`globalState`, `.orgpulse/cache.json`)
   are **not keyed by org id**, so switching the default org silently mixes/overwrites
   results.
2. **~4000-record truncation.** The `LIMIT 2000 OFFSET ≤2000` pagination caps any
   unfiltered query at ~4000 rows and only *logs* a warning
   ([`salesforceService.ts:227`](../src/services/salesforceService.ts#L227)). An
   enterprise org with >4000 Apex classes, custom fields, or users **silently loses
   data**. Aggregate `GROUP BY` queries are likewise capped at 2000 groups.
3. **No throttling or per-query timeout.** Pagination is serial and the only timeouts
   are the 8s ones on external Trust calls. Large orgs mean slow, unbounded runs and a
   risk of hitting the `50 MB` `maxBuffer` ceiling on a single command.
4. **Edition variance.** `NamespacePrefix` filtering is unreliable across editions
   (mitigated today by JS-side filtering and progressive query fallbacks).
5. **Local scan = open workspace only.** Static analysis sees only the files checked out
   in the workspace, not all Apex/LWC in the org.

### Concrete roadmap (design-level, with pointers)

**Multi-org support**
- Wire the existing `listOrgs()` into a VS Code `QuickPick` org selector.
- Thread a chosen org alias through `SalesforceService` by adding `--target-org <alias>`
  to every `sf` invocation in `runSfJson`/`toolingQuery`/`query`.
- **Namespace all caches by org id** — both the `globalState` keys
  ([`extension.ts`](../src/extension.ts)) and `.orgpulse/cache.json` — so results don't
  collide across orgs.
- Optionally add an **org-vs-org comparison** view (diff two `AnalysisResult`s).

**Fix truncation**
- Replace `LIMIT/OFFSET` paging with cursor-based paging (`nextRecordsUrl` from the REST
  query response, or the CLI bulk/`--result-format` options) so all records are read.
- Split aggregates by key ranges (e.g. KeyPrefix buckets) to get past the 2000-group cap.
- Surface truncation as a **visible banner in the UI**, not just a log line.

**Scale & throughput**
- Add a per-query timeout, a concurrency cap on parallel analyzers, and retry/backoff
  specifically on rate-limit responses.
- Stream large query results to disk instead of buffering 50 MB in memory.

**Coverage**
- Offer an optional `sf project retrieve` step so static analysis can cover org code
  that isn't in the local workspace.

---

## Quick reference — where things live

| Concern | File |
|---------|------|
| Activation & pipeline | [`src/extension.ts`](../src/extension.ts) |
| Org access (auth, queries, REST) | [`src/services/salesforceService.ts`](../src/services/salesforceService.ts) |
| AI (explain / CTA / ask) | [`src/services/aiService.ts`](../src/services/aiService.ts) |
| Rules engine & built-ins | [`src/rules/`](../src/rules/) |
| Analyzers (17) | [`src/analyzers/`](../src/analyzers/) |
| Scoring | [`src/reports/healthScore.ts`](../src/reports/healthScore.ts) |
| Exports | [`src/reports/reportGenerator.ts`](../src/reports/reportGenerator.ts) |
| Dashboard host / UI | [`src/ui/dashboard.ts`](../src/ui/dashboard.ts) · [`media/dashboard.js`](../media/dashboard.js) |
| Caching / config / errors | [`src/utils/`](../src/utils/) |
| Core types (`AnalysisResult`, `Issue`) | [`src/types/index.ts`](../src/types/index.ts) |
