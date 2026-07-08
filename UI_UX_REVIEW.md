# OrgPulse — UI/UX Review & Per-Tab Redesign Spec

Reviewed: all 14 tab components in `webview-ui/src/components/tabs/`, shared charts/commons, `src/types/index.ts`, nav (`constants/tabs.ts`), and routing (`App.tsx`).

**Verdict:** The visual foundation (GlassCard, StatCard, dark glass aesthetic, Recharts) is strong and already better-looking than SonarQube. What holds it back from Datadog-class polish is not styling — it's **information architecture**: duplicated metrics across tabs, three fully-built tabs that are unreachable, fabricated placeholder visuals that undermine trust, five conflicting score-band scales, and high-value analyzer data that is collected but never rendered. Tech debt — the product's core mission — has no dedicated home.

---

## 1. Critical Findings (ranked)

### F1 — Three built tabs are orphaned (dead code in production)
`Automation.tsx`, `Dependencies.tsx`, `StaleMetadata.tsx` exist but are **not imported in `App.tsx` and not in `NAV_GROUPS`**. Consequences:

- `dependencyGraph` (circular dependency detection! fan-in centrality!) is invisible.
- `staleMetadata` (cleanup hours, unused fields) is invisible — this is core tech-debt value.
- The flow/workflow inventory is invisible; automation data only leaks in via a DataModel donut.

### F2 — Performance tab is a strict subset of Platform Limits
`PerfLimits.tsx` renders: org-limit gauges + governor-risk table + all-limits table. `GovernorLimits.tsx` renders the same three things, better, plus 8 sub-tabs. Two nav items, one dataset. Meanwhile *actual performance data* (`scaleCenterMetrics.transactions`, `slowQueries`, `queryExplainResults`, `limitsSimulatorData`) is **never rendered anywhere**.

### F3 — Fabricated / dishonest visuals (worst credibility risk vs SonarQube/Datadog)
| Location | Problem |
|---|---|
| Security → "Compliance Score" donut | Values are arithmetic on the security score (`(100-s)*0.6`), not compliance data. Fabricated. |
| Security → "Security Score Trend (Last 7 Days)" | When no trends exist, renders 7 identical fake points and still labels it "Last 7 Days". |
| Security → Sharing/Auth/Data-Protection panels | 18 KV rows permanently showing "—"; 4 sub-tabs are pure empty states. |
| OrgInfo | Demo values (`'Acme Corporation'`, `4,250 users`, hardcoded clouds/licenses) are **blended per-field** with real data via `??` — a partial real scan silently shows fake numbers next to real ones. |
| GovernorLimits | "Limits Usage Trend", "Top API Consumers", "Top Storage by Object" — permanent empty promise cards in the default layout. |
| DataModel → "Data Growth" | A sparkline drawn from a single point, plus "Historical trend data not yet available". |
| Overview → Key Insights | Card titled "High Technical Debt" with 🔴 renders regardless of actual debt level. |

**Policy to adopt:** never render synthesized data as real; never ship permanent "not available" cards in a default layout; demo mode must be all-or-nothing with a screen-level watermark, not per-field fallbacks.

### F4 — Five conflicting score scales, three severity vocabularies
| File | Bands |
|---|---|
| Overview.tsx | 90 / 75 / 50 / 25 |
| TrendsHistory.tsx | 80 / 65 / 50 / 35 |
| SecurityAccess.tsx | 90 / 75 / 60 / 40 |
| FutureReadiness.tsx | 80 / 60 / 40 |
| GovernorLimits.tsx (usage) | 90 / 75 / 50 |

Severity labels for the same `error|warning|info` data: "Critical/High/Low" (Overview), "Error/Warning/Info" (CodeQuality), "High/Medium/Low" (Security). Same org, three languages.

Also inconsistent: page padding (`p-4` vs `p-6`), h1 sizing (`text-base` vs `text-lg`), Overview's "Welcome back, Architect!" header vs plain headers, hardcoded hex colors sprinkled alongside Tailwind tokens, and DataModel's automation legend colors relying on array index order matching the DonutChart's internal palette.

### F5 — Overview duplicates its children instead of summarizing them
CategoryScoreCards rendered **twice on the same screen** (hero row of 4 + "Health by Area" row of 6, overlapping in 4). Future Readiness snapshot + Readiness Roadmap duplicate the FutureReadiness tab. Recent Scans + Health Trend duplicate TrendsHistory (which is `disabled: true` in nav despite being fully implemented — enable it). Key Org Metrics duplicates OrgInfo Quick Facts.

### F6 — Collected but never rendered (free wins)
| Data (in `AnalysisResult`) | Value |
|---|---|
| `scaleCenterMetrics.transactions` | Per-transaction SOQL/DML/CPU/heap + risk — Datadog-style workload table |
| `scaleCenterMetrics.slowQueries` | Top slow SOQL with avg ms / rows |
| `queryExplainResults` | Live selectivity: Optimal/Good/Unacceptable, full-table-scan flags |
| `limitsSimulatorData` | Interactive "what happens at 10k records" limit simulator |
| `entryPoints` | Public attack/integration surface (RestResource, InboundEmail) |
| `orgInventory.customLabels` | Inventory completeness |
| `debtSummary.byCategory` | Debt by category (only effort tiers shown today) |
| `userSummary.profileDistribution`, `usersByType` | Security identity charts |
| `dependencyGraph.circularDependencies` | Architecture risk (orphaned tab) |

### F7 — Tech debt has no home
The product pitch is tech debt + scalability + future readiness. Future readiness has a flagship tab. Scalability data is scattered (LDV in DataModel, limits in two tabs, scale metrics unrendered). Tech debt is a sub-tab of Code Quality plus two orphaned tabs. Fix with a dedicated **Technical Debt** tab (spec below).

---

## 2. Design System (single source of truth)

Create `webview-ui/src/constants/scoring.ts` and delete all local copies:

```ts
// One scale everywhere (scores 0–100)
export const SCORE_BANDS = [
  { min: 90, label: 'Excellent', token: 'score-excellent' },
  { min: 75, label: 'Good',      token: 'score-good'      },
  { min: 50, label: 'Fair',      token: 'score-fair'      },
  { min: 25, label: 'Poor',      token: 'score-poor'      },
  { min: 0,  label: 'Critical',  token: 'sev-error'       },
];
// One severity vocabulary: error → "Critical", warning → "Warning", info → "Info"
// One capacity scale (usage %): <50 ok, ≥50 watch, ≥75 warning, ≥90 critical
```

Layout contract for every tab: `p-6` page padding · header = `text-base` title + one-line muted description + actions right-aligned · Row 1 = max **6** StatCards (8 is a wall of numbers; move overflow into cards below) · charts in rows of 3 · tables last · `Sources`-free, token-only colors (no hex literals in TSX).

Chart grammar (never violate): Donut = composition, ≤6 slices · HBar = top-N ranking · Column = distribution/histogram · Line/Sparkline = time series only (≥2 real points, else hide the card) · Gauge = consumption vs hard limit only · Never render the same dataset twice on one screen (chart + table of identical data = pick one, table gets search/pagination).

Every KPI number should be **clickable** and deep-link to the tab/sub-tab/filter that explains it (pattern already started in Overview — make it universal).

---

## 3. Information Architecture

```
ORG PULSE       Overview
ARCHITECTURE    Organization · Data Model · Automation (NEW–route it) · Code Quality
                Security · Performance (rebuilt) · Platform Limits
MODERNIZATION   Technical Debt (NEW) · OrgPulse Advisory · Future Readiness
                Trends & History (enable) · Ask Architect
```

**Metric ownership matrix** — each fact renders fully in exactly one tab; everyone else links:

| Metric | Owner | Others may show |
|---|---|---|
| Overall + category scores | Overview | link only |
| Org identity, licenses, clouds, packages, environments | Organization | — |
| Objects, fields, records, LDV, relationships | Data Model | Overview: 1 KPI |
| Flows/triggers/workflow inventory + per-object density | Automation | Data Model: link |
| Issues, coverage, code inventory | Code Quality | Overview: counts |
| Users/profiles/perm-sets/dangerous perms | Security | Organization: counts only |
| Org limits consumption | Platform Limits | Performance: link |
| Governor risk, scale metrics, slow queries, simulator | Performance | — |
| Debt hours, stale metadata, circular deps, cleanup | Technical Debt | Code Quality: link |
| Scan history, score trends | Trends & History | Overview: mini trend |

---

## 4. Per-Tab Specs

### 4.1 Overview — "the 30-second architect briefing"
Keep: gauge hero, clickable category cards, Top Risks, severity donut, org name/run-scan header.

| Change | Detail |
|---|---|
| **Remove** duplicate category row | Kill "Health by Area"; make the hero row show all 6 categories (Architecture, Code, Security, Performance, Data Model, Governor Limits) with sparkline + delta |
| **Remove** FR snapshot + Readiness Roadmap | Replace both with a single compact "Modernization" card: 3 pack scores + overall FR % + link. Roadmap lives in Future Readiness only |
| **Remove** Recent Scans list | Replace with one overall-score sparkline + "View history →" (enable TrendsHistory) |
| **Fix** Key Insights | Make them data-driven verdicts, not hardcoded titles: debt card shows `debtSummary.totalHours` with severity-based icon/color; automation card counts real overlap issues; add a "Top blocker" card from `futureReadiness` |
| **Replace** Key Org Metrics strip | It duplicates OrgInfo Quick Facts. Replace with **"What changed since last scan"** (new issues, resolved issues, score deltas from `orgHistory`) — the one thing no other tab shows |
| **Keep** Quick Wins card | But source from `debtSummary.quickWins` (real effort data), not info-severity issue groups |

Hero KPIs (6): Overall score (gauge) · Critical issues · Debt hours · Test coverage · Limits ≥75% count · FR overall %.

### 4.2 Organization (OrgInfo)
Strong tab. Fixes are honesty + dedup:

- Demo mode: all-or-nothing. If `results` exists, never fall back to demo constants per-field. Add a diagonal "DEMO" watermark on the demo screen.
- KPI strip: cut from 8 to 6 (drop Integrations + Packages from strip; their cards are directly below).
- Quick Facts strip: remove security-adjacent counts (roles, profiles, perm sets, PS groups, public groups) — Security owns those. Keep build inventory (objects, flows, apex, LWC, triggers).
- Add `orgDetails.trustStatus` + `trustIncidents` as a status pill in the header row (data exists, unrendered).
- Feature Usage sub-tab: merge into Clouds & Licenses (same domain, one screen).

### 4.3 Data Model
Best tab today. Trim duplication, sharpen the scalability story:

- **Remove** "Object Automation Overview" donut (Automation tab owns it; also has the fragile index-based legend colors).
- **Remove** "Data Growth" fake sparkline until ≥2 scans of record-count history exist; then render real growth from scan history.
- Row-1 KPIs: cut to 6 — Custom Objects, Standard Objects, Total Fields, Total Records, **LDV Objects (>10M)**, **Objects >70% field limit** (scalability headline; count exists via `fieldLimitPct`).
- Records Overview + Records Distribution: merge into one card (distribution chart + 3 stat lines under it).
- Add a **"Field Limit Pressure"** HBar: top 10 objects by `fieldLimitPct` with 70/90% threshold coloring — the single best scalability chart this tab can show; today the data is buried in a table column.
- Overview Row 5 (three Top-10 lists for record types / layouts / record pages) → one card with a segmented toggle; three list cards of the same shape is repetition without information gain.

### 4.4 Automation (NEW — route the orphaned tab)
Purpose: automation complexity + deprecation debt (core tech-debt story).

- KPIs (6): Total automations · Record-triggered flows · Triggers · Validation rules · **Process Builders (deprecated)** · **Workflow Rules (deprecated)** — deprecated ones in warning color with "migrate" badge.
- Charts: Automation by Type (column, exists) · **Objects with multiple triggers** (HBar from `objectMap` where `triggers > 1` — the classic anti-pattern, data already there) · Active vs Inactive flows donut (from `flowInventory.isActive`).
- Tables: Flow Inventory (add search + pagination + ProcessType filter; exists) · Workflow inventory (`workflowInventory`, currently unused).
- Issues: automation-design IssueTable (exists in orphan).

### 4.5 Code Quality
Right structure (sub-tabs), too much repetition on Summary:

- **Remove** "Issues by Category Breakdown" card (table+donut) — exact repeat of the "Issues by Category" HBar next to it.
- **Remove** "Debt at a Glance" *and* "Technical Debt Summary" cards → single compact debt card linking to the new Technical Debt tab; drop the `technical-debt` sub-tab here.
- Coverage appears 3× on Summary (KPI, Test Coverage Summary card, coverage bars). Keep the KPI + one card; the Coverage sub-tab owns the rest.
- KPI row: 8 → 6: Score · Critical · Warnings · Coverage % · **Apex code size vs 6M-char limit** (as `X% of limit`, not raw chars — `apexCodeCharLimit` exists and is unused) · Components.
- Add to Coverage sub-tab: coverage **histogram** (0-25/25-50/50-75/75-100 buckets from `classCoverageDetails`) — better shape-of-problem view than 3 buckets.
- Adopt SonarQube's best idea: a **Quality Gate** strip at top of Summary — pass/fail on 4 conditions (coverage ≥75, 0 critical issues, debt < N hrs, deprecated automation = 0). Binary verdicts drive action; scores alone don't.

### 4.6 Security
Biggest honesty gap. Make it smaller and true:

- **Remove** fabricated Compliance donut, fake 7-day sparkline (render trend only from real `trends`), and all permanent "—" KV rows.
- **Cut sub-tabs 8 → 4**: Overview · Identity & Access · Integrations · Risks. Sharing/Auth/Data-Protection/Compliance return only when their analyzers exist (roadmap, not UI).
- KPI row (6): Security score · Critical risks · **Super admins** (`userSummary.superAdmins` — headline-worthy, currently buried in Identity) · **Dormant users** · Profiles with Modify All · Connected Apps.
- Overview keeps: severity donut, Top Risk Categories HBar, Top 5 Profiles/PermSets by users (dedupe the raw user/profile/permset counts out of the KPI row — they're identity facts, shown once in Identity panel).
- Add to Identity: **profile distribution donut** (`profileDistribution`) and **users by type** (`usersByType`) — both unused.
- Add to Integrations: **`entryPoints` table** (RestResource / InboundEmail public surface) — unused, and it's exactly what a security reviewer wants.

### 4.7 Performance (rebuild — currently a duplicate of Platform Limits)
Delete every org-limit gauge/table from this tab (Platform Limits owns consumption). Rebuild around *runtime performance*, all from currently-unrendered data:

| Section | Source |
|---|---|
| KPIs: High-risk classes · Full-table-scan queries · Slow query count · Async failure rate % · Bulk job failures (7d) | `governorRisks`, `queryExplainResults`, `scaleCenterMetrics` |
| **Transaction Performance table** — name, avg SOQL/DML/CPU/heap, calls, risk chip | `scaleCenterMetrics.transactions` |
| **Slow Queries table** — SOQL, avg ms, avg rows, count, class | `scaleCenterMetrics.slowQueries` |
| **Query Selectivity** — Optimal/Good/Unacceptable donut + unacceptable-queries table with notes | `queryExplainResults` |
| **Governor Risk matrix** — classes × SOQL/DML/CPU/heap risk (keep, moved from both old tabs; render risk as colored chips, this is the one copy) | `governorRisks` |
| **Limits Simulator** — slider "records processed: 200 → 50k", live projected SOQL/DML/CPU/heap vs limits per class | `limitsSimulatorData` (built for exactly this, never used) |
| Performance issues IssueTable | `issues` |

The simulator is the tab's signature feature — nothing in SonarQube/Datadog answers "will this Apex class blow up at 10k records" pre-deployment.

### 4.8 Platform Limits (GovernorLimits)
Owns consumption. Mostly good:

- Remove the three permanent empty cards (Trend / API Consumers / Storage by Object) and the Forecast sub-tab until data exists.
- Remove `ApexRisksTable` from here (Performance owns it) — currently rendered in 2 sub-tabs of this tab *and* in PerfLimits.
- Sub-tabs 9 → 6: Summary · API · Storage · Apex & Async (merge) · Email & Events (merge) · Data.
- Summary Row 2: replace the donut of "average usage across all limits" (an average of unrelated percentages is meaningless) with **"Limits at risk"** — HBar of every limit ≥50%, colored by band. Keep the alerts table.
- Add per-gauge **days-to-exhaustion** once ≥2 scans exist (store `orgLimits` snapshots in scan history) — Datadog-style burn rate.

### 4.9 Technical Debt (NEW tab — the product's thesis)
Consolidates `debtSummary` + orphaned StaleMetadata + orphaned Dependencies:

- Hero: **Total debt hours** big number + sprint cycles + trend vs last scan · Quick wins count · Stale items count · Circular dependency count.
- Charts: Debt by category HBar (`debtSummary.byCategory` — unused) · Debt by effort tier · Cleanup value scatter *(effort hrs vs count)* per category.
- **Quick Wins list** — actual `DebtItem`s with file links (click → `openFile`), not category names.
- **Stale Metadata section** — unused fields / stale reports / dashboards tables + `estimatedCleanupHours` (from orphan tab).
- **Architecture Risk section** — circular dependency chains (error card) + Most Referenced components top-10 (from orphan Dependencies tab; the full edges table adds nothing — drop it, keep counts + cycles + hubs).
- Header: **"Debt Payoff Plan"** — auto-slot quick wins into next 2 sprints using the 20%-capacity model already documented in the CodeQuality banner.

### 4.10 OrgPulse Advisory (CTA) & Future Readiness
Both are strong and own unique AI content. Only dedup notes:

- FutureReadiness owns the roadmap visual; Overview links to it (per 4.1).
- CTA "Health Score Breakdown" section repeats the score cards from Overview — render AI `keyFinding` text per area, skip the numeric repeat.
- CTA and FR both render "Quick Wins" sections from different sources (AI vs deterministic). Label them distinctly: "AI-recommended actions" (CTA) vs "Deterministic quick wins" (FR) so they don't read as duplicate features.

### 4.11 Trends & History
Fully built; flip `disabled: true` → enabled in `constants/tabs.ts`. Align its score bands to the shared scale. Add per-category deltas column. Long-term: persist `orgLimits` + record counts per scan to power growth/burn charts (4.3, 4.8).

### 4.12 Ask Architect
Fine as-is. Two touches: render answers as markdown (currently `<pre>`), and add per-tab context chips ("Ask about this tab" prefills a question) — cheap, differentiating.

---

## 5. Competitive Positioning Notes

| Pattern | Source | Adopt as |
|---|---|---|
| Quality Gate (binary pass/fail conditions) | SonarQube | Code Quality header strip (4.5) |
| Focus on "new code" vs overall | SonarQube | "What changed since last scan" on Overview (4.1) |
| Burn rate / days-to-exhaustion | Datadog | Platform Limits gauges (4.8) |
| Single owner per metric, everything links | Datadog dashboards | Ownership matrix (§3) |
| No fabricated placeholders — hide, don't fake | Both | Honesty policy (F3) |
| Pre-deployment limit simulation | **Neither has this** | Limits Simulator (4.7) — lead with it |

---

## 6. Implementation Plan

**P0 — Trust & consistency (no new features):**
shared `scoring.ts` + one severity vocabulary → remove fabricated visuals (F3) → fix OrgInfo demo blending → dedupe Overview + CodeQuality Summary + Security KPI row → enable Trends & History.

**P1 — Structure:**
route Automation tab → merge PerfLimits into GovernorLimits, retire the duplicate → create Technical Debt tab from `debtSummary` + orphan StaleMetadata/Dependencies content → nav regroup (§3).

**P2 — New value (unused data):**
rebuild Performance tab (transactions, slow queries, selectivity, simulator) → Field Limit Pressure chart → quality gate strip → entry-points table → burn-rate deltas from scan history.

Each phase ends with `npm run compile` green; P0/P1 are pure webview work (`webview-ui/src/` only), P2 needs no new analyzers — only rendering of existing `AnalysisResult` fields.
