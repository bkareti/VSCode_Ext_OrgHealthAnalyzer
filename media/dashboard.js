/**
 * OrgPulse — Salesforce Architecture Health & Insights
 * Dashboard UI v2.0.0. Runs inside the VS Code Webview. No external dependencies.
 */
/* global acquireVsCodeApi */
(function () {
  "use strict";

  // ── VS Code API ──────────────────────────────────────────────────────────
  const vscode = acquireVsCodeApi();

  // ── State ────────────────────────────────────────────────────────────────
  let results = null;
  let activeTab = "overview";
  let selectedIssue = null;
  let filters = { category: "all", severity: "all", search: "" };
  // Security mode: "safe" | "standard" | "advanced" — user must choose before scan
  let securityMode = null; // null = not yet selected
  // Registry: stable integer index → issue object, rebuilt on each renderAll()
  const issueRegistry = [];
  // Per-panel sort/page state: panelId → { sortCol, sortDir, page, pageSize }
  const issueTableState = {};
  const ISSUE_PAGE_SIZE = 10;
  // Per-data-table page+sort state: tableId → { page, sortCol, sortDir }
  const dataTablePageState = {};
  const DATA_TABLE_PAGE_SIZE = 10;
  // Dynamically-discovered AI models (VS Code LM providers + local/custom endpoint)
  let availableModels = [{ id: "auto", label: "Auto (best available)", backend: "vscode-lm" }];
  let selectedModelId = "auto";
  let claudeAuthorized = false;

  function registerIssue(iss) {
    issueRegistry.push(iss);
    return issueRegistry.length - 1;
  }

  // Restore persisted state
  const saved = vscode.getState();
  if (saved) {
    activeTab = saved.activeTab || "overview";
    // 'lwc' tab was merged into Code Quality — redirect any persisted state.
    if (activeTab === "lwc") { activeTab = "code"; }
    filters = saved.filters || filters;
    securityMode = saved.securityMode || null;
    selectedModelId = saved.selectedModelId || "auto";
  }

  // ── AI model picker (dynamic, backend-agnostic) ───────────────────────────
  function modelOptionsHtml(selectedId) {
    return availableModels
      .map(
        (m) =>
          `<option value="${escHtml(m.id)}"${m.id === selectedId ? " selected" : ""}>${escHtml(m.label)}</option>`,
      )
      .join("");
  }

  function renderModelSelect(id) {
    return `<select id="${id}" data-model-select="1" style="padding:6px 12px;border-radius:6px;border:1px solid var(--vscode-input-border,#444);background:var(--vscode-input-background,#1e1e1e);color:var(--vscode-input-foreground,#ccc);font-size:13px;cursor:pointer">${modelOptionsHtml(selectedModelId)}</select>`;
  }

  function populateModelSelects() {
    document.querySelectorAll("[data-model-select]").forEach((sel) => {
      sel.innerHTML = modelOptionsHtml(selectedModelId);
    });
  }

  function noModelsAvailable() {
    return !availableModels.some((m) => m.id !== "auto");
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const appEl = document.getElementById("app");
  // overlay + drill panel live in the STATIC HTML body — capture once, attach listener once
  const overlayEl = document.getElementById("drill-overlay");
  const drillPanel = document.getElementById("drill-panel");
  if (overlayEl) {
    overlayEl.addEventListener("click", function () {
      closeDrill();
    });
  }

  // ── Event Delegation (replaces all inline onclick/onchange/oninput) ───────
  document.addEventListener("click", function (e) {
    const el = e.target.closest("[data-action]");
    if (!el) {
      return;
    }
    const a = el.dataset.action;
    if (a === "activate-tab") {
      activateTab(el.dataset.tab);
    } else if (a === "orginfo-subtab") {
      activateOrgInfoSubtab(el.dataset.sub);
    } else if (a === "run-analysis") {
      runAnalysis();
    } else if (a === "run-analysis-initial") {
      runAnalysisInitial();
    } else if (a === "export-report") {
      showExportModal();
    } else if (a === "export-modal-confirm") {
      var modal = document.getElementById("export-modal-overlay");
      var fmt = modal
        ? (modal.querySelector("input[name='export-fmt']:checked") || {})
            .value || "html"
        : "html";
      var name = modal
        ? ((modal.querySelector("#export-filename") || {}).value || "").trim()
        : "";
      dismissExportModal();
      exportReport(fmt, name);
    } else if (a === "export-modal-cancel") {
      dismissExportModal();
    } else if (a === "generate-pdf-report") {
      showPdfConsentModal();
    } else if (a === "open-drill") {
      openDrill(Number(el.dataset.idx));
    } else if (a === "close-drill") {
      closeDrill();
    } else if (a === "explain-issue") {
      explainIssue();
    } else if (a === "open-file") {
      doOpenFile(el.dataset.file, Number(el.dataset.line || 0));
    } else if (a === "pdf-consent-accept") {
      dismissConsentModal();
      generatePdfReport(true);
    } else if (a === "pdf-consent-decline") {
      dismissConsentModal();
      generatePdfReport(false);
    } else if (a === "pdf-consent-cancel") {
      dismissConsentModal();
    } else if (a === "run-cta-review") {
      if (securityMode === "safe") {
        // Safe mode — CTA disabled, do nothing
        return;
      }
      const modelSelect = document.getElementById("cta-model-select");
      const selectedModel = modelSelect ? modelSelect.value : "auto";
      vscode.postMessage({ command: "runCtaReview", model: selectedModel });
    } else if (a === "regenerate-cta-review") {
      if (securityMode === "safe") return;
      const modelSelect = document.getElementById("cta-model-select");
      const selectedModel = modelSelect ? modelSelect.value : "auto";
      vscode.postMessage({ command: "runCtaReview", model: selectedModel, force: true });
    } else if (a === "authorize-claude") {
      const btn = document.getElementById("authorize-claude-btn");
      if (btn) { btn.textContent = "⏳ Connecting Claude…"; btn.setAttribute("disabled", "true"); }
      vscode.postMessage({ command: "authorizeClaude" });
    } else if (a === "disconnect-claude") {
      vscode.postMessage({ command: "disconnectClaude" });
    } else if (a === "ask-architect") {
      if (securityMode === "safe") return;
      const input = document.getElementById("ask-architect-input");
      const q = input ? input.value.trim() : "";
      if (!q) return;
      const out = document.getElementById("ask-architect-answer");
      if (out) {
        out.innerHTML = `<div style="opacity:.6;font-size:13px">🤖 Thinking… querying the org…</div>`;
      }
      const askSel = document.getElementById("ask-model-select");
      const askModel = askSel ? askSel.value : selectedModelId;
      vscode.postMessage({ command: "askArchitect", data: { question: q, model: askModel } });
    } else if (a === "select-security-mode") {
      // Mode card clicked — select that mode
      const mode = el.dataset.mode;
      if (mode) {
        document
          .querySelectorAll(".sec-mode-card")
          .forEach((c) => c.classList.remove("selected"));
        el.classList.add("selected");
        const cb = document.getElementById("sec-consent-cb");
        const btn = document.getElementById("sec-start-btn");
        if (btn) btn.disabled = !(cb && cb.checked);
      }
    } else if (a === "sec-start-analysis") {
      const selected = document.querySelector(".sec-mode-card.selected");
      const cb = document.getElementById("sec-consent-cb");
      if (!selected || !cb || !cb.checked) return;
      securityMode = selected.dataset.mode;
      vscode.setState({ ...vscode.getState(), securityMode });
      // Tell extension which mode the user chose
      vscode.postMessage({
        command: "setSecurityMode",
        data: { mode: securityMode },
      });
      // Dismiss modal and start analysis
      const forceRefresh = _secModalForceRefresh;
      dismissSecurityModeModal();
      if (forceRefresh) {
        runAnalysis();
      } else {
        runAnalysisInitial();
      }
    } else if (a === "sec-modal-cancel") {
      dismissSecurityModeModal();
    } else if (a === "toggle-scan-details") {
      const panel = document.getElementById("scan-details-panel");
      const chevron = el.querySelector(".scan-details-chevron");
      if (panel) {
        const isOpen = panel.classList.toggle("open");
        if (chevron) chevron.style.transform = isOpen ? "rotate(180deg)" : "";
      }
    } else if (a === "issue-sort") {
      const panel = el.dataset.panel;
      const col = el.dataset.col;
      if (!issueTableState[panel])
        issueTableState[panel] = { sortCol: col, sortDir: "asc", page: 0 };
      const st = issueTableState[panel];
      if (st.sortCol === col) {
        st.sortDir = st.sortDir === "asc" ? "desc" : "asc";
      } else {
        st.sortCol = col;
        st.sortDir = "asc";
      }
      st.page = 0;
      refreshIssueTable(panel);
    } else if (a === "issue-page-prev") {
      const panel = el.dataset.panel;
      if (issueTableState[panel] && issueTableState[panel].page > 0) {
        issueTableState[panel].page--;
        refreshIssueTable(panel);
      }
    } else if (a === "issue-page-next") {
      const panel = el.dataset.panel;
      if (issueTableState[panel]) {
        issueTableState[panel].page++;
        refreshIssueTable(panel);
      }
    } else if (a === "issue-page-go") {
      const panel = el.dataset.panel;
      if (issueTableState[panel]) {
        issueTableState[panel].page = parseInt(el.dataset.pg, 10);
        refreshIssueTable(panel);
      }
    } else if (a === "dt-sort") {
      const tid = el.dataset.table;
      const col = parseInt(el.dataset.col, 10);
      if (!dataTablePageState[tid]) dataTablePageState[tid] = { page: 0 };
      const st = dataTablePageState[tid];
      if (st.sortCol === col) {
        st.sortDir = st.sortDir === "asc" ? "desc" : "asc";
      } else {
        st.sortCol = col;
        st.sortDir = "asc";
      }
      st.page = 0;
      refreshDataTable(tid);
    } else if (a === "dt-page-prev") {
      const tid = el.dataset.table;
      if (dataTablePageState[tid] && dataTablePageState[tid].page > 0) {
        dataTablePageState[tid].page--;
        refreshDataTable(tid);
      }
    } else if (a === "dt-page-next") {
      const tid = el.dataset.table;
      if (dataTablePageState[tid]) {
        dataTablePageState[tid].page++;
        refreshDataTable(tid);
      }
    } else if (a === "dt-page-go") {
      const tid = el.dataset.table;
      if (dataTablePageState[tid]) {
        dataTablePageState[tid].page = parseInt(el.dataset.pg, 10);
        refreshDataTable(tid);
      }
    } else if (a === "export-dm-csv") {
      exportDataModelCsv();
    } else if (
      a === "export-issues-csv" ||
      a === "export-issues-excel" ||
      a === "export-issues-pdf"
    ) {
      const fmt = a.replace("export-issues-", "");
      vscode.postMessage({ command: "exportIssues", format: fmt });
    } else if (a === "sim-set-volume") {
      const vol = Number(el.dataset.vol);
      const inp = document.getElementById("sim-volume-input");
      const disp = document.getElementById("sim-volume-display");
      if (inp) inp.value = vol;
      if (disp) disp.textContent = vol.toLocaleString();
      runSimulator(vol);
    } else if (a === "cancel-scan") {
      vscode.postMessage({ command: "cancelAnalysis" });
    } else if (a === "export-cta-pdf") {
      fetchIconDataUri(function (iconDataUri) {
        exportCtaPdf(iconDataUri);
      });
    } else if (a === "cta-sub-tab") {
      const tab = el.dataset.tab;
      const ctaPanel = document.getElementById("panel-cta");
      if (ctaPanel) {
        ctaPanel
          .querySelectorAll(".cta-dash-tab-btn")
          .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
        ctaPanel
          .querySelectorAll(".cta-dash-panel")
          .forEach((p) =>
            p.classList.toggle("hidden", p.dataset.panel !== tab),
          );
      }
    } else if (a === "cta-risk-filter") {
      const sev = el.dataset.sev;
      const ctaPanel = document.getElementById("panel-cta");
      if (ctaPanel) {
        ctaPanel
          .querySelectorAll(".cta-risk-filter-btn")
          .forEach((b) => b.classList.toggle("active", b.dataset.sev === sev));
        ctaPanel.querySelectorAll(".cta-issue-card").forEach((c) => {
          c.style.display =
            sev === "all" || c.dataset.sev === sev ? "" : "none";
        });
      }
    }
  });

  function refreshIssueTable(panelId) {
    // Re-render just the issue table for this panel
    const wrap = document.getElementById("issue-table-" + panelId);
    if (!wrap) {
      return;
    }
    // Find which issues belong to this panel by re-filtering
    const cats =
      (wrap.closest("[data-cats]") || { dataset: {} }).dataset.cats || "";
    let issues;
    if (cats) {
      const catArr = cats.split(",");
      issues = (results ? results.issues : []).filter((i) =>
        catArr.includes(i.category),
      );
    } else {
      // Fallback: collect from the visible list container
      const listEl = wrap.closest('[id^="list-"]');
      const listId = listEl ? listEl.id.replace("list-", "") : panelId;
      const toolbar = document.getElementById("toolbar-" + listId);
      const sevEl = toolbar ? toolbar.querySelector("select") : null;
      const srchEl = toolbar ? toolbar.querySelector("input") : null;
      const sev = sevEl ? sevEl.value : "all";
      const srch = srchEl ? srchEl.value : "";
      // Try to infer cats from data attribute on the list container
      const listContainer = document.getElementById("list-" + panelId);
      const catsAttr = listContainer ? listContainer.dataset.cats : "";
      const catArr2 = catsAttr ? catsAttr.split(",") : [];
      issues = (results ? results.issues : []).filter(
        (i) => catArr2.length === 0 || catArr2.includes(i.category),
      );
      if (sev && sev !== "all")
        issues = issues.filter((i) => i.severity === sev);
      if (srch && srch.trim()) {
        const q = srch.toLowerCase();
        issues = issues.filter(
          (i) =>
            (i.message || "").toLowerCase().includes(q) ||
            (i.file || "").toLowerCase().includes(q),
        );
      }
    }
    const newHtml = renderIssueTable(issues, panelId);
    wrap.outerHTML = newHtml;
  }

  /** Refresh a paginated data-table in-place. Expects a global registry of table configs. */
  const dataTableRegistry = {};
  function refreshDataTable(tableId) {
    const wrap = document.getElementById("dt-wrap-" + tableId);
    if (!wrap || !dataTableRegistry[tableId]) return;
    const cfg = dataTableRegistry[tableId];
    wrap.outerHTML = renderPaginatedDataTable(
      tableId,
      cfg.headers,
      cfg.rows,
      cfg.opts,
    );
  }

  /**
   * Reusable paginated data-table renderer.
   * @param {string} tableId   Unique id for this table.
   * @param {string[]} headers Column headers.
   * @param {string[][]} rows  Array of row arrays (pre-escaped HTML strings).
   * @param {object} [opts]    { pageSize, emptyMsg, sortable }
   * @returns {string} HTML
   */

  /**
   * Renders a collapsible info banner for a tab.
   * @param {string} id      Unique id suffix for the toggle.
   * @param {string[]} items Bullet point strings (6-7 recommended).
   * @returns {string} HTML
   */
  function renderTabInfo(id, items) {
    const listHtml = items.map((s) => `<li>${s}</li>`).join("");
    return `
      <details id="tab-info-${id}" class="tab-info-panel">
        <summary class="tab-info-summary">
          <span>ℹ️</span><span>About this tab — how data is fetched &amp; filtered</span>
          <span style="margin-left:auto;opacity:.5;font-size:11px">click to expand</span>
        </summary>
        <ul class="tab-info-list">${listHtml}</ul>
      </details>`;
  }

  // Short, always-visible plain-language pointer shown at the top of every tab
  // so users immediately know what the tab is for and how to read it (#6).
  const TAB_INTROS = {
    overview:
      "<strong>Start here.</strong> A one-glance health snapshot: overall grade, per-category scores, and headline counts for your org. Use it to spot which area needs attention, then open that tab for detail.",
    orginfo:
      "<strong>Org facts.</strong> Edition, instance, API version, limits and licence usage for the connected org — the environment context behind every other tab.",
    datamodel:
      "<strong>Objects &amp; fields.</strong> Custom objects, field counts and unused custom fields. \"Unused\" = no references found via the Salesforce Dependency API. Trim unused fields to reduce page-layout and reporting clutter.",
    code:
      "<strong>Apex, LWC, Flows &amp; Triggers quality.</strong> Static-analysis findings, anti-patterns, code inventory and test coverage. Tackle errors first, then warnings; aim for 75%+ org-wide coverage.",
    automation:
      "<strong>How work is automated.</strong> Inventory of Flows (by type), Process Builders, Workflow Rules, Triggers and Validation Rules, with per-object complexity. Watch for multiple automations on the same object — a common source of conflicts.",
    perflimits:
      "<strong>Will it scale?</strong> Predicted governor-limit usage, classes at risk, a what-if simulator, and large-data-volume objects. Red means a class may breach a limit under load — read the \"How to read this\" note in each section.",
    security:
      "<strong>Who can do what.</strong> Users by profile, permission sets and groups (with user counts), and a grouped list of security findings. Focus on broad permissions (Modify/View All Data) and dormant or over-privileged access.",
    dependencies:
      "<strong>What's connected to what.</strong> Component relationships, most-connected hubs and circular dependencies. High fan-in = wide blast radius if changed; circular deps block clean deployments.",
    stalemetadata:
      "<strong>Cleanup candidates.</strong> Reports, dashboards and metadata untouched for a long time, plus org inventory. Use it to plan hygiene sprints that reduce clutter and maintenance load.",
    cta:
      "<strong>AI architecture review.</strong> An optional, consent-gated AI summary that turns this org's health snapshot into a CTA-grade verdict with risks and recommendations. Pick a model and generate.",
    askarchitect:
      "<strong>Ask the Architect.</strong> Ask any question about this org and get an AI answer backed by live Salesforce CLI queries — read-only. Great for drilling into specific issues flagged in other tabs.",
  };

  function renderTabIntro(id) {
    const text = TAB_INTROS[id];
    if (!text) { return ""; }
    return `<div class="tab-intro">${text}</div>`;
  }

  function renderPaginatedDataTable(tableId, headers, rows, opts) {
    opts = opts || {};
    const PAGE = opts.pageSize || DATA_TABLE_PAGE_SIZE;
    const emptyMsg = opts.emptyMsg || "No data available";
    const sortable = opts.sortable !== false; // sortable by default

    if (!dataTablePageState[tableId]) dataTablePageState[tableId] = { page: 0 };
    const st = dataTablePageState[tableId];

    // Sort rows if sort state is set
    let sortedRows = rows;
    if (sortable && st.sortCol != null) {
      const col = st.sortCol;
      const dir = st.sortDir === "desc" ? -1 : 1;
      sortedRows = rows.slice().sort((a, b) => {
        // Strip HTML tags for comparison
        const strip = (s) =>
          String(s || "")
            .replace(/<[^>]*>/g, "")
            .trim();
        const av = strip(a[col]);
        const bv = strip(b[col]);
        // Numeric comparison if both look like numbers
        const an = parseFloat(av),
          bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
        return av.localeCompare(bv) * dir;
      });
    }

    const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE));
    if (st.page >= totalPages) st.page = totalPages - 1;

    const start = st.page * PAGE;
    const pageRows = sortedRows.slice(start, start + PAGE);

    const headHtml = `<tr>${headers
      .map((h, i) => {
        if (!sortable) return `<th>${h}</th>`;
        const isSorted = st.sortCol === i;
        const arrow = isSorted ? (st.sortDir === "asc" ? " ▲" : " ▼") : " ⇅";
        return `<th data-action="dt-sort" data-table="${tableId}" data-col="${i}" style="cursor:pointer;user-select:none" title="Click to sort">${h}<span style="opacity:${isSorted ? 1 : 0.3};font-size:10px">${arrow}</span></th>`;
      })
      .join("")}</tr>`;
    const bodyHtml = pageRows.length
      ? pageRows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("")
      : `<tr><td colspan="${headers.length}" style="text-align:center;padding:20px;color:var(--sf-text-muted)">${emptyMsg}</td></tr>`;

    const showingFrom = sortedRows.length ? start + 1 : 0;
    const showingTo = Math.min(start + PAGE, sortedRows.length);

    const pagHtml =
      totalPages > 1
        ? `
      <div class="pagination-bar">
        <span style="opacity:.6">${showingFrom}–${showingTo} of ${sortedRows.length}</span>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" data-action="dt-page-prev" data-table="${tableId}" ${st.page === 0 ? "disabled" : ""}>‹ Prev</button>
        ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const pg =
            totalPages <= 7
              ? i
              : st.page < 4
                ? i
                : Math.min(st.page - 3 + i, totalPages - 1);
          if (pg >= totalPages || pg < 0) return "";
          return `<button class="btn ${pg === st.page ? "btn-primary" : "btn-ghost"}" data-action="dt-page-go" data-table="${tableId}" data-pg="${pg}">${pg + 1}</button>`;
        }).join("")}
        <button class="btn btn-ghost" data-action="dt-page-next" data-table="${tableId}" ${st.page >= totalPages - 1 ? "disabled" : ""}>Next ›</button>
      </div>`
        : "";

    // Store config for refresh (raw unsorted rows for re-sort on click)
    dataTableRegistry[tableId] = { headers, rows, opts };

    return `<div class="data-table-wrap" id="dt-wrap-${tableId}">
      <table class="sf-table sf-table--sortable"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>
      ${pagHtml}
    </div>`;
  }

  /** Limits Simulator engine — replaces inline <script> block */
  let SIM_DATA = [];
  const SOQL_LIMIT = 100,
    DML_LIMIT = 150,
    CPU_LIMIT = 10000,
    HEAP_LIMIT_KB = 6000;

  function runSimulator(volume) {
    const v = Number(volume) || 200;
    const tbody = document.getElementById("sim-results-tbody");
    if (!tbody || !SIM_DATA || !SIM_DATA.length) return;

    const rows = SIM_DATA.map(function (c) {
      const iterations = Math.max(1, Math.ceil(v / 200));
      const soql = c.baseSoql + c.loopSoql * iterations;
      const dml = c.baseDml + c.loopDml * iterations;
      const cpu = Math.round(c.baseCpuMs + c.cpuPerKRecords * (v / 1000));
      const heap = Math.round(
        (c.baseHeapBytes + c.heapPerKRecords * (v / 1000)) / 1024,
      );

      const soqlPct = Math.min(soql / SOQL_LIMIT, 1);
      const dmlPct = Math.min(dml / DML_LIMIT, 1);
      const cpuPct = Math.min(cpu / CPU_LIMIT, 1);
      const heapPct = Math.min(heap / HEAP_LIMIT_KB, 1);
      const maxPct = Math.max(soqlPct, dmlPct, cpuPct, heapPct);

      const risk =
        maxPct >= 1
          ? "BREACH"
          : maxPct >= 0.8
            ? "CRITICAL"
            : maxPct >= 0.5
              ? "HIGH"
              : maxPct >= 0.3
                ? "MEDIUM"
                : "LOW";
      const riskColor =
        maxPct >= 1
          ? "#ef4444"
          : maxPct >= 0.8
            ? "#ef4444"
            : maxPct >= 0.5
              ? "#f59e0b"
              : maxPct >= 0.3
                ? "#eab308"
                : "#22c55e";

      function bar(pct, val, limit) {
        const col = pct >= 1 ? "#ef4444" : pct >= 0.7 ? "#f59e0b" : "#22c55e";
        return (
          '<div style="min-width:80px">' +
          '<div style="font-size:12px;font-weight:700;color:' +
          col +
          '">' +
          val +
          "</div>" +
          '<div style="height:4px;border-radius:2px;background:var(--vscode-widget-border);margin-top:3px;overflow:hidden">' +
          '<div style="height:4px;border-radius:2px;background:' +
          col +
          ";width:" +
          Math.round(pct * 100) +
          '%"></div>' +
          "</div>" +
          '<div style="font-size:9px;opacity:.4;margin-top:1px">' +
          Math.round(pct * 100) +
          "% of " +
          limit +
          "</div>" +
          "</div>"
        );
      }

      return (
        '<tr style="border-bottom:1px solid var(--vscode-widget-border)">' +
        '<td style="padding:10px 12px;font-weight:600;font-size:13px">' +
        escHtml(c.className) +
        "</td>" +
        '<td style="padding:10px 12px">' +
        bar(soqlPct, soql, SOQL_LIMIT) +
        "</td>" +
        '<td style="padding:10px 12px">' +
        bar(dmlPct, dml, DML_LIMIT) +
        "</td>" +
        '<td style="padding:10px 12px">' +
        bar(cpuPct, cpu, CPU_LIMIT) +
        "</td>" +
        '<td style="padding:10px 12px">' +
        bar(heapPct, heap, HEAP_LIMIT_KB) +
        "</td>" +
        '<td style="padding:10px 12px;text-align:center"><span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;background:' +
        riskColor +
        "20;color:" +
        riskColor +
        '">' +
        risk +
        "</span></td>" +
        "</tr>"
      );
    });

    tbody.innerHTML =
      rows.join("") ||
      '<tr><td colspan="6" style="padding:20px;text-align:center;opacity:.5">No risky classes found at this volume.</td></tr>';
  }

  document.addEventListener("change", function (e) {
    // AI model picker — keep all selects + persisted state in sync
    const modelSel = e.target.closest("[data-model-select]");
    if (modelSel) {
      selectedModelId = modelSel.value || "auto";
      vscode.setState({ ...vscode.getState(), selectedModelId });
      populateModelSelects();
      return;
    }
    const el = e.target.closest("[data-filter-panel]");
    if (el) {
      filterPanel(
        el.dataset.filterPanel,
        el.dataset.cats,
        el.value,
        null,
        null,
      );
      return;
    }
  });
  document.addEventListener("input", function (e) {
    const el = e.target.closest("[data-search-panel]");
    if (el) {
      filterPanel(
        el.dataset.searchPanel,
        el.dataset.cats,
        null,
        null,
        el.value,
      );
      return;
    }
    // Simulator slider
    if (e.target.id === "sim-volume-input") {
      const v = Number(e.target.value);
      const disp = document.getElementById("sim-volume-display");
      if (disp) disp.textContent = v.toLocaleString();
      runSimulator(v);
    }
  });

  // ── Message listener ─────────────────────────────────────────────────────
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "analysisResults":
        results = msg.data;
        renderAll();
        break;
      case "availableModels": {
        if (Array.isArray(msg.data) && msg.data.length) {
          availableModels = msg.data;
          // If the previously-selected model is gone, fall back to auto
          if (!availableModels.some((m) => m.id === selectedModelId)) {
            selectedModelId = "auto";
          }
          populateModelSelects();
        }
        break;
      }
      case "claudeAuthStatus": {
        claudeAuthorized = !!msg.authorized;
        // On a fresh successful connection, default the picker to Claude (auto).
        if (claudeAuthorized && availableModels.some((m) => m.id === "anthropic:auto")) {
          selectedModelId = "anthropic:auto";
        } else if (!claudeAuthorized && selectedModelId.indexOf("anthropic:") === 0) {
          selectedModelId = "auto";
        }
        // Re-render the CTA panel so the button + model picker reflect the new
        // state (covers both the pre-review screen and the regenerate bar shown
        // above an already-generated review).
        if (results) {
          const ctaPanel = document.getElementById("panel-cta");
          if (ctaPanel) {
            ctaPanel.innerHTML = renderTabIntro("cta") + renderCtaReview();
          }
        }
        populateModelSelects();
        if (msg.error) {
          const btn = document.getElementById("authorize-claude-btn");
          if (btn) { btn.removeAttribute("disabled"); }
        }
        break;
      }
      case "analysisProgress": {
        // Show the progress overlay in appEl directly (before results arrive)
        const stepIdx = typeof msg.step === "number" ? msg.step : -1;
        const stepLabel = msg.label || STEPS[stepIdx] || "";
        // Accumulate insight meta from extension
        if (msg.meta) {
          Object.assign(scanMeta, msg.meta);
        }
        showAnalysisProgress(stepIdx, stepLabel);
        break;
      }
      case "loading":
        if (msg.data) showLoading(msg.step || null);
        break;
      case "aiExplanationLoading":
        renderAiExplanationLoading();
        break;
      case "aiExplanation":
        if (msg.error) {
          renderAiExplanationError(msg.error);
        } else if (msg.data) {
          renderAiExplanation(msg.data);
        }
        break;
      case "aiPdfSummary":
        if (typeof window.receiveAiPdfSummary === "function") {
          window.receiveAiPdfSummary(msg.data || null);
        }
        break;
      case "ctaReviewLoading": {
        const panel = document.getElementById("panel-cta");
        if (panel) {
          panel.innerHTML = `
            <div class="cta-loading-scene">
              <!-- Scan lines background -->
              <div class="cta-scan-lines">
                <div class="cta-scan-line"></div>
                <div class="cta-scan-line"></div>
                <div class="cta-scan-line"></div>
              </div>

              <!-- Central brain with orbiting documents -->
              <div class="cta-brain-container">
                <div class="cta-brain-ring"></div>
                <div class="cta-brain-ring-2"></div>
                <div class="cta-brain-ring-3"></div>
                <div class="cta-brain-icon">🧠</div>

                <!-- Orbiting documents -->
                <div class="cta-orbit">
                  <div class="cta-orbit-item">📄</div>
                  <div class="cta-orbit-item">⚙️</div>
                  <div class="cta-orbit-item">🔍</div>
                  <div class="cta-orbit-item">📊</div>
                </div>
                <div class="cta-orbit">
                  <div class="cta-orbit-item">🏗️</div>
                  <div class="cta-orbit-item">🔐</div>
                  <div class="cta-orbit-item">🗄️</div>
                  <div class="cta-orbit-item">🔌</div>
                </div>
              </div>

              <!-- Title -->
              <h3 style="margin:0 0 6px;font-size:20px;font-weight:800;z-index:1">AI Architecture Review</h3>
              <p style="margin:0 0 8px;opacity:.6;font-size:13px;z-index:1">Analysing your org against CTA-grade standards…</p>

              <!-- Animated steps -->
              <div class="cta-loading-steps" id="cta-loading-steps">
                <div class="cta-loading-step active" style="animation-delay:0s"><span class="cta-step-dot"></span> Scanning architecture patterns…</div>
                <div class="cta-loading-step" style="animation-delay:3s"><span class="cta-step-dot"></span> Reviewing security posture…</div>
                <div class="cta-loading-step" style="animation-delay:6s"><span class="cta-step-dot"></span> Evaluating data model design…</div>
                <div class="cta-loading-step" style="animation-delay:9s"><span class="cta-step-dot"></span> Analysing integration health…</div>
                <div class="cta-loading-step" style="animation-delay:12s"><span class="cta-step-dot"></span> Generating CTA verdict…</div>
              </div>
            </div>`;

          // Animate the steps sequentially
          let ctaStepIdx = 0;
          const ctaStepInterval = setInterval(() => {
            ctaStepIdx++;
            const steps = document.querySelectorAll(
              "#cta-loading-steps .cta-loading-step",
            );
            if (!steps.length || ctaStepIdx >= steps.length) {
              clearInterval(ctaStepInterval);
              return;
            }
            steps.forEach((s, i) => {
              s.classList.toggle("active", i === ctaStepIdx);
              if (i < ctaStepIdx) s.style.opacity = "0.5";
            });
          }, 3000);
        }
        activateTab("cta");
        break;
      }
      case "ctaReview": {
        if (results) {
          results.ctaReview = msg.data;
        }
        const ctaPanel = document.getElementById("panel-cta");
        if (ctaPanel) {
          ctaPanel.innerHTML =
            renderCtaRegenerateBar() + renderCtaReviewContent(msg.data);
          populateModelSelects();
        }
        activateTab("cta");
        break;
      }
      case "ctaReviewError": {
        // Always unblock the loading spinner with a readable, actionable error (#11).
        const ctaPanelErr = document.getElementById("panel-cta");
        if (ctaPanelErr) {
          ctaPanelErr.innerHTML =
            `<div class="cta-error-banner" style="margin:16px 0;padding:16px 18px;border:1px solid var(--err-border,#f5c2c7);background:var(--err-bg,#fff5f5);border-radius:10px">
               <div style="font-size:14px;font-weight:700;color:#b42318;margin-bottom:6px">⚠️ CTA Architecture Review couldn't run</div>
               <div style="font-size:12.5px;color:#1f2937;line-height:1.6">${escHtml(msg.message || "Unknown error.")}</div>
               <div style="font-size:11.5px;color:#6b7280;margin-top:10px;line-height:1.6">
                 Tip: GitHub Copilot models work in-place once Copilot Chat is signed in. For a Claude or ChatGPT
                 subscription, add an API key under <b>Settings → sfHealthAnalyzer.ai.custom</b> (baseUrl + model + apiKey),
                 then pick the <b>Custom (API key)</b> model and try again.
               </div>
             </div>` + renderCtaReview();
        }
        activateTab("cta");
        break;
      }
      case "architectAnswerLoading": {
        const out = document.getElementById("ask-architect-answer");
        if (out) {
          out.innerHTML = `<div style="opacity:.6;font-size:13px">🤖 Thinking… querying the org…</div>`;
        }
        break;
      }
      case "architectAnswer": {
        const out = document.getElementById("ask-architect-answer");
        if (out) {
          if (msg.error) {
            out.innerHTML = `<div class="c-critical" style="font-size:13px">⚠️ ${escHtml(msg.error)}</div>`;
          } else if (msg.data) {
            out.innerHTML = `<div class="architect-answer" style="font-size:13px;line-height:1.6;white-space:pre-wrap;background:var(--vscode-editor-background);border-left:3px solid var(--sf-primary,#0176d3);padding:12px 14px;border-radius:6px">${escHtml(msg.data)}</div>`;
          } else {
            out.innerHTML = `<div style="opacity:.6;font-size:13px">No answer returned.</div>`;
          }
        }
        break;
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LOADING SCREEN — AI-Style Conversational UX
  // ═══════════════════════════════════════════════════════════════════════════
  const STEPS = [
    "Connecting to Salesforce org",
    "Fetching Apex classes & triggers",
    "Analysing SOQL queries",
    "Analysing automation complexity",
    "Analysing data model",
    "Fetching test coverage",
    "Analysing permissions & security",
    "Analysing integrations",
    "Calculating health scores",
    "Scanning governor limit risks",
    "Analysing LWC components",
    "Calculating technical debt",
    "Fetching Scale Center metrics",
    "Building dependency graph",
    "Scoring & preparing dashboard",
    "Analysing user governance",
    "Analysing profile security",
    "Scanning stale metadata",
    "Building org inventory",
    "Running CTA architecture checks",
  ];

  // Conversational AI messages mapped to step ranges
  const AI_MESSAGES = [
    {
      from: 0,
      to: 0,
      msgs: [
        "Connecting to your org…",
        "Establishing a secure connection…",
        "Reaching out to Salesforce…",
      ],
    },
    {
      from: 1,
      to: 2,
      msgs: [
        "Reading your codebase…",
        "Scanning Apex classes and triggers…",
        "Diving into your source code…",
      ],
    },
    {
      from: 3,
      to: 4,
      msgs: [
        "Mapping your automation landscape…",
        "Tracing flows and process builders…",
        "Understanding how your org automates…",
      ],
    },
    {
      from: 5,
      to: 6,
      msgs: [
        "Evaluating test health…",
        "Checking your safety net…",
        "Reviewing test coverage patterns…",
      ],
    },
    {
      from: 7,
      to: 8,
      msgs: [
        "Inspecting security posture…",
        "Analysing permission structures…",
        "Checking access control layers…",
      ],
    },
    {
      from: 9,
      to: 10,
      msgs: [
        "Looking for performance risks…",
        "Stress-testing governor limits…",
        "Checking for scalability concerns…",
      ],
    },
    {
      from: 11,
      to: 13,
      msgs: [
        "Measuring technical debt…",
        "Mapping component dependencies…",
        "Calculating maintenance effort…",
      ],
    },
    {
      from: 14,
      to: 16,
      msgs: [
        "Crunching the numbers…",
        "Building your health score…",
        "Reviewing user governance…",
      ],
    },
    {
      from: 17,
      to: 18,
      msgs: [
        "Hunting stale metadata…",
        "Cataloguing org inventory…",
        "Almost there — tidying up…",
      ],
    },
    {
      from: 19,
      to: 19,
      msgs: [
        "Running architecture review…",
        "Final CTA checks in progress…",
        "Wrapping up the deep dive…",
      ],
    },
  ];

  // Insight templates that use real meta from extension.ts
  const INSIGHT_TEMPLATES = [
    {
      key: "classCount",
      tpl: (m) =>
        `Found <strong>${m.classCount}</strong> Apex classes and <strong>${m.triggerCount}</strong> triggers to analyse`,
    },
    {
      key: "flowCount",
      tpl: (m) =>
        `Detected <strong>${m.flowCount}</strong> flows, <strong>${m.totalTriggers}</strong> triggers, and <strong>${m.totalValidationRules}</strong> validation rules`,
    },
    {
      key: "objectCount",
      tpl: (m) =>
        `Scanning <strong>${m.objectCount}</strong> custom objects for field usage patterns`,
    },
    {
      key: "coverageIssues",
      tpl: (m) =>
        m.coverageIssues > 0
          ? `Identified <strong>${m.coverageIssues}</strong> test coverage concern${m.coverageIssues > 1 ? "s" : ""} so far`
          : "Test coverage looks healthy so far ✓",
    },
    {
      key: "governorRiskCount",
      tpl: (m) =>
        m.governorRiskCount > 0
          ? `Flagged <strong>${m.governorRiskCount}</strong> potential governor limit risk${m.governorRiskCount > 1 ? "s" : ""}`
          : "No governor limit risks detected ✓",
    },
    {
      key: "lwcComponentCount",
      tpl: (m) =>
        m.lwcComponentCount > 0
          ? `Reviewing <strong>${m.lwcComponentCount}</strong> Lightning Web Components`
          : null,
    },
    {
      key: "activeUsers",
      tpl: (m) =>
        m.activeUsers > 0
          ? `Analysed governance for <strong>${m.activeUsers}</strong> active users`
          : null,
    },
    {
      key: "totalIssues",
      tpl: (m) =>
        `Compiled <strong>${m.totalIssues}</strong> findings — preparing your report`,
    },
  ];

  // Accumulated meta from extension progress messages
  let scanMeta = {};
  let scanMsgCycleIdx = 0;
  let scanMsgInterval = null;
  let scanLastRenderedStep = -2; // track to avoid full re-render on same step

  function showLoading(currentStep) {
    // Reset timer on first step
    if (
      currentStep === 0 ||
      currentStep === null ||
      currentStep === undefined
    ) {
      scanStartTime = Date.now();
      scanStepTimestamps = [];
      scanMeta = {};
      scanMsgCycleIdx = 0;
      scanLastRenderedStep = -2;
      if (scanMsgInterval) {
        clearInterval(scanMsgInterval);
        scanMsgInterval = null;
      }
    }
    showAnalysisProgress(
      typeof currentStep === "number" ? currentStep : -1,
      "",
    );
  }

  // Scan timer state
  let scanStartTime = 0;
  let scanStepTimestamps = [];

  function formatTime(ms) {
    const totalSecs = Math.max(0, Math.round(ms / 1000));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return mins > 0 ? `${mins}m ${secs < 10 ? "0" : ""}${secs}s` : `${secs}s`;
  }

  function _getAiMessage(stepIndex) {
    const group = AI_MESSAGES.find(
      (g) => stepIndex >= g.from && stepIndex <= g.to,
    );
    if (!group) return "Analysing your org…";
    return group.msgs[scanMsgCycleIdx % group.msgs.length];
  }

  function _getLatestInsight() {
    // Walk templates in reverse priority, return first that has matching meta
    for (let i = INSIGHT_TEMPLATES.length - 1; i >= 0; i--) {
      const t = INSIGHT_TEMPLATES[i];
      if (scanMeta[t.key] !== undefined) {
        const result = t.tpl(scanMeta);
        if (result) return result;
      }
    }
    return null;
  }

  function showAnalysisProgress(stepIndex, currentLabel) {
    const progressPct =
      stepIndex >= 0
        ? Math.min(100, Math.round(((stepIndex + 1) / STEPS.length) * 100))
        : 0;
    const doneCount = stepIndex >= 0 ? stepIndex : 0;
    const totalSteps = STEPS.length;

    // Track step timestamps for ETA calculation
    if (stepIndex >= 0 && scanStepTimestamps.length <= stepIndex) {
      scanStepTimestamps[stepIndex] = Date.now();
    }

    // Calculate elapsed time
    const elapsed = scanStartTime > 0 ? Date.now() - scanStartTime : 0;
    const elapsedStr = formatTime(elapsed);

    // Estimate remaining time
    let etaStr = "—";
    if (stepIndex > 0 && elapsed > 0) {
      const avgTimePerStep = elapsed / (stepIndex + 1);
      const remainingSteps = totalSteps - (stepIndex + 1);
      const estimatedRemaining = avgTimePerStep * remainingSteps;
      etaStr = "~" + formatTime(estimatedRemaining);
    } else if (stepIndex === 0) {
      etaStr = "calculating…";
    }

    const aiMsg = _getAiMessage(stepIndex);
    const insight = _getLatestInsight();

    // Only do a full DOM rebuild when the step changes; for msg cycling just update text
    const needsFullRender = scanLastRenderedStep !== stepIndex;
    scanLastRenderedStep = stepIndex;

    if (needsFullRender) {
      // Clear any old message cycling interval
      if (scanMsgInterval) {
        clearInterval(scanMsgInterval);
        scanMsgInterval = null;
      }

      appEl.innerHTML = `
        <div class="scan-ai-container">
          <!-- Shield ECG Animation -->
          <div class="shield-ecg-wrap">
            <svg class="shield-svg" viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"  stop-color="#38bdf8"/>
                  <stop offset="50%" stop-color="#0176d3"/>
                  <stop offset="100%" stop-color="#6d28d9"/>
                </linearGradient>
                <clipPath id="shieldClip">
                  <path d="M50 4 L92 18 L92 56 Q92 85 50 111 Q8 85 8 56 L8 18 Z"/>
                </clipPath>
              </defs>
              <!-- Shield body -->
              <path class="shield-body" d="M50 4 L92 18 L92 56 Q92 85 50 111 Q8 85 8 56 L8 18 Z"/>
              <!-- ECG line clipped to shield -->
              <g clip-path="url(#shieldClip)">
                <polyline class="ecg-line" points="6,58 18,58 25,38 32,78 39,22 46,88 52,58 60,58 66,50 72,66 78,58 96,58"/>
              </g>
            </svg>
          </div>

          <!-- Conversational AI message -->
          <div class="ai-msg-area">
            <p class="ai-msg" id="scan-ai-msg">${escHtml(aiMsg)}</p>
          </div>

          <!-- Slim progress bar -->
          <div class="scan-ai-progress">
            <div class="scan-progress-track">
              <div class="scan-progress-fill" style="width:${progressPct}%"></div>
              <div class="scan-progress-glow" style="left:${progressPct}%"></div>
            </div>
            <div class="scan-ai-progress-meta">
              <span class="scan-ai-pct">${progressPct}%</span>
              <span class="scan-ai-timer">⏱ ${elapsedStr}${etaStr !== "—" ? " · est. " + etaStr : ""}</span>
            </div>
          </div>

          <!-- Insight teaser card -->
          <div class="insight-card-area" id="scan-insight-area">
            ${insight ? `<div class="insight-card"><span class="insight-icon">💡</span><span class="insight-text">${insight}</span></div>` : ""}
          </div>

          <!-- Collapsible technical details -->
          <button class="scan-details-toggle" data-action="toggle-scan-details">
            <span class="scan-details-chevron">▾</span> View technical details
          </button>
          <div class="scan-details-panel" id="scan-details-panel">
            <div class="scan-details-grid">
              ${STEPS.map((s, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return `<div class="scan-step-mini ${done ? "done" : active ? "active" : "pending"}">
                  <span class="scan-step-mini-icon">${done ? "✓" : active ? "●" : "○"}</span>
                  <span>${s}</span>
                </div>`;
              }).join("")}
            </div>
          </div>

          <!-- Cancel scan -->
          <div style="text-align:center;margin-top:20px">
            <button class="scan-cancel-btn" data-action="cancel-scan">✕ Cancel Scan</button>
          </div>
        </div>`;

      // Start cycling conversational messages every 3.5 seconds
      scanMsgInterval = setInterval(() => {
        scanMsgCycleIdx++;
        const el = document.getElementById("scan-ai-msg");
        if (el) {
          el.classList.remove("ai-msg-enter");
          void el.offsetWidth; // trigger reflow
          el.textContent = _getAiMessage(scanLastRenderedStep);
          el.classList.add("ai-msg-enter");
        }
      }, 3500);
    } else {
      // Lightweight DOM update — just patch progress bar, timer, and insight
      const fillEl = appEl.querySelector(".scan-progress-fill");
      const glowEl = appEl.querySelector(".scan-progress-glow");
      const pctEl = appEl.querySelector(".scan-ai-pct");
      const timerEl = appEl.querySelector(".scan-ai-timer");
      if (fillEl) fillEl.style.width = progressPct + "%";
      if (glowEl) glowEl.style.left = progressPct + "%";
      if (pctEl) pctEl.textContent = progressPct + "%";
      if (timerEl)
        timerEl.textContent = `⏱ ${elapsedStr}${etaStr !== "—" ? " · est. " + etaStr : ""}`;

      // Update insight if new meta arrived
      if (insight) {
        const insightArea = document.getElementById("scan-insight-area");
        if (insightArea && !insightArea.querySelector(".insight-card")) {
          insightArea.innerHTML = `<div class="insight-card insight-card-enter"><span class="insight-icon">💡</span><span class="insight-text">${insight}</span></div>`;
        } else if (insightArea) {
          const textEl = insightArea.querySelector(".insight-text");
          if (textEl && textEl.innerHTML !== insight) {
            const card = insightArea.querySelector(".insight-card");
            if (card) {
              card.classList.remove("insight-card-enter");
              void card.offsetWidth;
              card.classList.add("insight-card-enter");
            }
            textEl.innerHTML = insight;
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  function renderAll() {
    if (!results) {
      showEmpty();
      return;
    }
    issueRegistry.length = 0; // reset index registry on each render
    buildShell();
    activateTab(activeTab, false);
  }

  function showEmpty() {
    appEl.innerHTML = `
      <div class="dashboard-header">
        <div class="header-brand">
          <span class="logo"><img class="logo-icon-img" src="${window.ORGPULSE_ICON_URI || ""}" alt="OrgPulse" /></span>
          <h1>OrgPulse</h1>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" data-action="run-analysis-initial">🔍 Run Analysis</button>
        </div>
      </div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center">
        <div class="state-screen" style="position:relative">
          <div class="shield-ecg-wrap shield-sm">
            <svg class="shield-svg" viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="shieldGradSm" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"  stop-color="#38bdf8"/>
                  <stop offset="50%" stop-color="#0176d3"/>
                  <stop offset="100%" stop-color="#6d28d9"/>
                </linearGradient>
                <clipPath id="shieldClipSm">
                  <path d="M50 4 L92 18 L92 56 Q92 85 50 111 Q8 85 8 56 L8 18 Z"/>
                </clipPath>
              </defs>
              <path d="M50 4 L92 18 L92 56 Q92 85 50 111 Q8 85 8 56 L8 18 Z" fill="url(#shieldGradSm)" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
              <g clip-path="url(#shieldClipSm)">
                <polyline class="ecg-line" points="6,58 18,58 25,38 32,78 39,22 46,88 52,58 60,58 66,50 72,66 78,58 96,58"/>
              </g>
            </svg>
          </div>
          <h2>Ready to Analyse</h2>
          <p>Connect to a Salesforce org and run a deep health check — code quality, automation, security, performance, and more.</p>
          <button class="btn btn-primary" data-action="run-analysis-initial">🔍 Run Analysis</button>
        </div>
      </div>`;
  }

  function buildShell() {
    const meta = results.metadata || {};
    const scores = results.scores || {};
    const orgLabel = meta.orgUsername || meta.orgAlias || "Connected Org";

    const tabs = [
      { id: "overview", icon: "📊", label: "Overview" },
      { id: "orginfo", icon: "🏢", label: "Org Info" },
      { id: "datamodel", icon: "🗄️", label: "Data Model" },
      { id: "code", icon: "💻", label: "Code Quality" },
      { id: "automation", icon: "⚡", label: "Automation" },
      { id: "perflimits", icon: "🚀", label: "Performance & Limits" },
      { id: "secaccess", icon: "🛡️", label: "Security & Access" },
      { id: "dependencies", icon: "🕸️", label: "Dependencies" },
      { id: "stalemetadata", icon: "🧹", label: "Stale Metadata" },
      { id: "cta", icon: "🧠", label: "CTA Review" },
      { id: "askarchitect", icon: "💬", label: "Ask Architect" },
    ];

    appEl.innerHTML = `
      <div class="dashboard-header">
        <div class="header-brand">
          <span class="logo"><img class="logo-icon-img" src="${window.ORGPULSE_ICON_URI || ""}" alt="OrgPulse" /></span>
          <h1>OrgPulse</h1>
          <span class="org-conn-chip"><span class="org-conn-dot"></span>${escHtml(orgLabel)}</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-ghost" data-action="export-report">Export</button>
          <button class="btn btn-primary" data-action="run-analysis">Re-Analyse</button>
        </div>
      </div>

      <nav class="tab-nav" id="tab-nav">
        ${tabs
          .map(
            (t) => `
          <button class="tab-btn" id="tab-btn-${t.id}" data-action="activate-tab" data-tab="${t.id}">
            ${t.label}
          </button>`,
          )
          .join("")}
      </nav>

      <div class="tab-panels" id="tab-panels">
        <div class="tab-panel" id="panel-overview">${renderTabIntro("overview")}${renderOverview()}</div>
        <div class="tab-panel" id="panel-orginfo">${renderTabIntro("orginfo")}${renderOrgInfo()}</div>
        <div class="tab-panel" id="panel-datamodel">${renderTabIntro("datamodel")}${renderDataModel()}</div>
        <div class="tab-panel" id="panel-code">${renderTabIntro("code")}${renderCodeQuality()}</div>
        <div class="tab-panel" id="panel-automation">${renderTabIntro("automation")}${renderAutomation()}</div>
        <div class="tab-panel" id="panel-perflimits">${renderTabIntro("perflimits")}${renderPerformanceLimits()}</div>
        <div class="tab-panel" id="panel-secaccess">${renderTabIntro("security")}${renderSecurityAccess()}</div>
        <div class="tab-panel" id="panel-dependencies">${renderTabIntro("dependencies")}${renderDependencies()}</div>
        <div class="tab-panel" id="panel-stalemetadata">${renderTabIntro("stalemetadata")}${renderStaleMetadata()}</div>
        <div class="tab-panel" id="panel-cta">${renderTabIntro("cta")}${renderCtaReview()}</div>
        <div class="tab-panel" id="panel-askarchitect">${renderTabIntro("askarchitect")}${renderAskArchitect()}</div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORG INFO TAB
  // ═══════════════════════════════════════════════════════════════════════════
  // ── SVG Donut chart helper ──────────────────────────────────────────────
  function renderDonutChart(segments, opts) {
    opts = opts || {};
    const W = opts.size || 140;
    const CX = W / 2, CY = W / 2, R = W / 2 - 14, IR = R * 0.58;
    const total = segments.reduce(function(s, seg) { return s + (seg.value || 0); }, 0);
    if (!total) { return '<svg viewBox="0 0 ' + W + ' ' + W + '" style="width:' + W + 'px;height:' + W + 'px"><circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" stroke="var(--vscode-widget-border)" stroke-width="' + (R - IR) + '"/><text x="' + CX + '" y="' + (CY + 4) + '" text-anchor="middle" font-size="12" fill="var(--sf-text-secondary)">—</text></svg>'; }
    var angle = -Math.PI / 2;
    var paths = segments.map(function(seg, idx) {
      var frac = (seg.value || 0) / total;
      var color = seg.color || ('var(--chart-' + ((idx % 7) + 1) + ')');
      // A single 100% segment can't be drawn as one arc (start == end point),
      // so render it as a full stroked ring instead.
      if (frac >= 0.9999) {
        return '<circle cx="' + CX + '" cy="' + CY + '" r="' + ((R + IR) / 2) + '" fill="none" stroke="' + color + '" stroke-width="' + (R - IR) + '" opacity="0.9"/>';
      }
      var sweep = frac * 2 * Math.PI;
      var x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
      var x2 = CX + R * Math.cos(angle + sweep), y2 = CY + R * Math.sin(angle + sweep);
      var xi1 = CX + IR * Math.cos(angle), yi1 = CY + IR * Math.sin(angle);
      var xi2 = CX + IR * Math.cos(angle + sweep), yi2 = CY + IR * Math.sin(angle + sweep);
      var large = sweep > Math.PI ? 1 : 0;
      var d = 'M' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + large + ',1 ' + x2 + ',' + y2 + ' L' + xi2 + ',' + yi2 + ' A' + IR + ',' + IR + ' 0 ' + large + ',0 ' + xi1 + ',' + yi1 + ' Z';
      angle += sweep;
      return '<path d="' + d + '" fill="' + color + '" opacity="0.9"/>';
    }).join('');
    var pct = opts.centerLabel !== undefined ? opts.centerLabel : Math.round((segments[0] ? segments[0].value / total * 100 : 0)) + '%';
    var center = '<text x="' + CX + '" y="' + (CY + 4) + '" text-anchor="middle" font-size="13" font-weight="700" fill="var(--sf-text-primary)">' + escHtml(String(pct)) + '</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + W + '" xmlns="http://www.w3.org/2000/svg" style="width:' + W + 'px;height:' + W + 'px;flex-shrink:0">' + paths + center + '</svg>';
  }

  function renderDonutWithLegend(segments, opts) {
    opts = opts || {};
    var total = segments.reduce(function(s, seg) { return s + (seg.value || 0); }, 0);
    var legend = segments.map(function(seg, i) {
      var pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
      var color = seg.color || ('var(--chart-' + ((i % 7) + 1) + ')');
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<div style="width:10px;height:10px;border-radius:50%;background:' + color + ';flex-shrink:0"></div>' +
        '<span style="font-size:12px;flex:1">' + escHtml(seg.label) + '</span>' +
        '<span style="font-size:12px;font-weight:700">' + seg.value + '</span>' +
        '<span style="font-size:11px;opacity:.5;margin-left:2px">(' + pct + '%)</span>' +
        '</div>';
    }).join('');
    return '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
      renderDonutChart(segments, opts) +
      '<div style="flex:1;min-width:120px">' + legend + '</div>' +
      '</div>';
  }

  /** Vertical column (bar) chart — value above each column, wrapped label beneath. */
  function renderColumnChart(items, opts) {
    items = (items || []).filter(function(i){ return i; });
    if (!items.length) { return '<p style="opacity:.5;font-size:12px;margin:8px 0">No data available.</p>'; }
    opts = opts || {};
    const COLORS = ['var(--chart-1)','var(--chart-2)','var(--chart-3)','var(--chart-4)','var(--chart-5)','var(--chart-6)','var(--chart-7)'];
    const colW = opts.colWidth || 56;
    const gap = opts.gap || 14;
    const plotH = opts.plotHeight || 150;
    const labelH = 34;
    const topPad = 18;
    const W = items.length * colW + (items.length - 1) * gap + 8;
    const H = topPad + plotH + labelH;
    const maxVal = Math.max.apply(null, items.map(function(i){ return i.value || 0; }).concat([1]));
    const baseY = topPad + plotH;
    const cols = items.map(function(item, idx){
      const val = item.value || 0;
      const h = Math.max((val / maxVal) * plotH, val > 0 ? 3 : 0);
      const x = 4 + idx * (colW + gap);
      const y = baseY - h;
      const color = item.color || COLORS[idx % COLORS.length];
      const words = String(item.label).split(' ');
      const lines = words.length > 1
        ? [words.slice(0, Math.ceil(words.length/2)).join(' '), words.slice(Math.ceil(words.length/2)).join(' ')]
        : [String(item.label)];
      const labelSvg = lines.map(function(ln, li){
        return '<text x="' + (x + colW/2) + '" y="' + (baseY + 14 + li*11) + '" text-anchor="middle" font-size="10" fill="var(--sf-text-secondary)">' + escHtml(ln) + '</text>';
      }).join('');
      return '<text x="' + (x + colW/2) + '" y="' + (y - 5) + '" text-anchor="middle" font-size="12" font-weight="700" fill="var(--sf-text-primary)">' + val + '</text>' +
        '<rect x="' + x + '" y="' + y + '" width="' + colW + '" height="' + h + '" rx="4" fill="' + color + '" class="chart-bar" style="animation-delay:' + (idx*0.04) + 's"/>' +
        labelSvg;
    }).join('');
    const axis = '<line x1="0" y1="' + baseY + '" x2="' + W + '" y2="' + baseY + '" stroke="var(--sf-border)" stroke-width="1"/>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;overflow:visible">' + axis + cols + '</svg>';
  }

  /** Classify a package row into Managed / Unlocked / Local (mirrors service classifyPackages). */
  function packageType(pkg) {
    const ns = pkg && pkg.SubscriberPackage && pkg.SubscriberPackage.NamespacePrefix;
    if (ns && String(ns).trim()) { return 'Managed'; }
    if (pkg && pkg.SubscriberPackageVersion) { return 'Unlocked'; }
    return 'Local';
  }

  function renderOrgInfo() {
    const od = results && results.orgDetails;
    const inv = results && results.orgInventory;
    const licenses = (results && results.licenseSummary) || [];
    const oid = (results && results.orgInfoData) || {};

    if (!od) {
      return `<div style="padding:48px 32px;text-align:center;opacity:.6">
        <div style="font-size:48px;margin-bottom:16px">🏢</div>
        <h3 style="margin:0 0 8px">No Org Details Available</h3>
        <p style="margin:0;font-size:13px">Re-run analysis to collect org details.</p>
      </div>`;
    }

    const ext    = oid.extended    || {};
    const clouds = oid.clouds      || [];
    const envSum = oid.environments || null;
    const intSum = oid.integrations || null;
    const appSum = oid.appsByType  || null;
    const pkgSum = oid.packagesByType || null;
    const qf     = oid.quickFacts  || null;

    const TRUST_CFG = {
      OK:             { color: "#22c55e", bg: "rgba(34,197,94,.1)",   icon: "✅" },
      Informational:  { color: "#3b82f6", bg: "rgba(59,130,246,.1)",  icon: "ℹ️" },
      "Minor Incident":{ color: "#f59e0b", bg: "rgba(245,158,11,.1)", icon: "⚠️" },
      "Major Incident":{ color: "#ef4444", bg: "rgba(239,68,68,.1)",  icon: "🚨" },
      Maintenance:    { color: "#8b5cf6", bg: "rgba(139,92,246,.1)",  icon: "🔧" },
      Unknown:        { color: "#6b7280", bg: "rgba(107,114,128,.1)", icon: "❓" },
    };
    const tc = TRUST_CFG[od.trustStatus || "Unknown"] || TRUST_CFG["Unknown"];
    const activeIncidents = (od.trustIncidents || []).filter(i => i.status !== "Resolved");

    // subtitle is trusted HTML — caller is responsible for escaping data within it
    function kpiCard(icon, value, label, color, subtitle, iconBg) {
      const safeVal = escHtml(String(value !== undefined && value !== null ? value : '—'));
      const bg = iconBg || 'rgba(1,118,211,.12)';
      return `<div class="stat-card" style="flex-direction:column;text-align:center;padding:14px 10px;min-width:90px">
        <div style="width:34px;height:34px;border-radius:8px;background:${bg};display:inline-flex;align-items:center;justify-content:center;font-size:17px;margin:0 auto 6px">${icon}</div>
        <div class="stat-value" style="font-size:18px">${safeVal}</div>
        ${subtitle ? `<div style="font-size:10px;opacity:.55;margin-top:1px;line-height:1.3">${subtitle}</div>` : ''}
        <div class="stat-label" style="font-size:10px;margin-top:2px">${escHtml(label)}</div>
      </div>`;
    }

    function dtRow(label, value) {
      if (!value && value !== 0) { return ''; }
      return `<tr><td style="padding:5px 0;font-size:12px;opacity:.6;width:45%;vertical-align:top">${escHtml(label)}</td>` +
             `<td style="padding:5px 0;font-size:12px;font-weight:500;padding-left:8px">${value}</td></tr>`;
    }

    function listRow(label, value) {
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--vscode-widget-border,rgba(255,255,255,.1))">` +
        `<span style="font-size:12px">${escHtml(label)}</span>` +
        `<span style="font-size:12px;font-weight:700">${value !== undefined ? value : '—'}</span></div>`;
    }

    // ── Top 8-metric strip ────────────────────────────────────────────────
    const totalUsedLicenses = licenses.reduce((s, l) => s + l.usedLicenses, 0);
    // License allocation totals (moved up so topStrip can reference totalLic)
    const allocatedLics = licenses.filter(l => l.totalLicenses > 0);
    const totalLic = allocatedLics.reduce((s, l) => s + l.totalLicenses, 0);
    const usedLic  = allocatedLics.reduce((s, l) => s + l.usedLicenses, 0);
    const licUtilPct = totalLic > 0 ? Math.round(usedLic / totalLic * 100) : 0;
    const pkgCount = inv ? (inv.installedPackages || []).length : (oid.activeLicenses || 0);

    // Derive edition main/sub from orgType (e.g. "Enterprise Edition" → "Enterprise" + "Edition")
    const orgTypeWords = (od.orgType || '').split(' ');
    const editionMain = orgTypeWords[0] || od.orgType || '—';
    const editionSub  = orgTypeWords.length > 1 ? escHtml(orgTypeWords.slice(1).join(' ')) : null;

    // Derive region label heuristically from instance name prefix
    const instPfx = (od.instanceName || '').replace(/\d+$/, '').toUpperCase();
    const regionMap = { NA: 'North America', EU: 'Europe', AP: 'Asia Pacific', CS: 'CS Sandbox', IN: 'India', AU: 'Australia', USA: 'North America' };
    const regionLabel = regionMap[instPfx] || null;
    const instanceSub = regionLabel
      ? `${escHtml(regionLabel)}<sup title="Derived from instance name prefix" style="font-size:8px;opacity:.4;margin-left:2px;cursor:help">◎</sup>`
      : null;

    const orgTypeMain = ext.isSandbox != null ? (ext.isSandbox ? 'Sandbox' : 'Production') : '—';
    const orgTypeSub  = ext.isHyperforce ? 'Hyperforce' : null;

    const topStrip = `<div class="stat-cards mb-24" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">
      ${kpiCard('👑', editionMain, 'Edition',           '', editionSub,                                  'rgba(245,158,11,.12)')}
      ${kpiCard('🌐', od.instanceName || '—', 'Instance', '', instanceSub,                              'rgba(1,118,211,.12)')}
      ${kpiCard('☁️', orgTypeMain,  'Org Type',          '', orgTypeSub,                                 'rgba(20,184,166,.12)')}
      ${kpiCard('📡', od.apiVersion || '—', 'API Version', '', od.nextReleaseName ? escHtml(od.nextReleaseName) : null, 'rgba(139,92,246,.12)')}
      ${kpiCard('👤', qf ? qf.users : (oid.activeUsers || '—'), 'Users', '', 'Active Users',            'rgba(34,197,94,.12)')}
      ${kpiCard('🪪', usedLic ? usedLic.toLocaleString() : (totalUsedLicenses || '—'), 'Active Licenses', '', totalLic ? 'of ' + totalLic.toLocaleString() : null, 'rgba(59,130,246,.12)')}
      ${kpiCard('📦', inv ? (inv.installedPackages || []).length : '—', 'Installed Packages', '', 'Total Packages', 'rgba(139,92,246,.12)')}
      ${kpiCard('🔌', intSum ? intSum.total : '—', 'Integrations', '', 'Total Integrations',             'rgba(245,158,11,.12)')}
    </div>`;

    // ── Row 1 Col 1: Organization Details ────────────────────────────────
    const storageUsedGB  = ext.storageUsedMB  ? (ext.storageUsedMB  / 1024).toFixed(1) : null;
    const storageLimitGB = ext.storageLimitMB ? (ext.storageLimitMB / 1024).toFixed(0) : null;
    const storagePct     = (ext.storageUsedMB && ext.storageLimitMB) ? Math.round(ext.storageUsedMB / ext.storageLimitMB * 100) : 0;
    const storageBar = storageUsedGB ? `${storageUsedGB} GB of ${storageLimitGB} GB
      <div style="height:5px;border-radius:3px;background:var(--vscode-widget-border);overflow:hidden;margin-top:4px">
        <div style="height:5px;background:${storagePct>80?'#ef4444':storagePct>60?'#f59e0b':'#22c55e'};width:${storagePct}%"></div>
      </div><span style="font-size:10px;opacity:.5">${storagePct}%</span>` : null;

    const lastScan = (results && results.timestamp) ? new Date(results.timestamp) : null;
    const lastScanLabel = lastScan && !isNaN(lastScan.getTime()) ? lastScan.toLocaleString() : null;

    const pageViews = (ext.monthlyPageViewsUsed != null && ext.monthlyPageViewsEntitlement != null)
      ? `${ext.monthlyPageViewsUsed.toLocaleString()} / ${ext.monthlyPageViewsEntitlement.toLocaleString()}`
      : null;
    const orgDetailsLeft = `<table style="width:100%;border-collapse:collapse">
        ${dtRow('Org Name', escHtml(od.orgName || od.username))}
        ${dtRow('Organization ID', `<code style="font-size:10px;opacity:.8">${escHtml(od.orgId)}</code>`)}
        ${dtRow('Primary Contact', ext.primaryContact ? escHtml(ext.primaryContact) : null)}
        ${dtRow('Division', ext.division ? escHtml(ext.division) : null)}
        ${dtRow('Address', ext.address ? escHtml(ext.address) : null)}
        ${dtRow('Phone', ext.phone ? escHtml(ext.phone) : null)}
        ${dtRow('Fax', ext.fax ? escHtml(ext.fax) : null)}
        ${dtRow('Created Date', ext.createdDate ? new Date(ext.createdDate).toLocaleDateString() : null)}
        ${dtRow('My Domain', ext.myDomain ? escHtml(ext.myDomain) : null)}
        ${dtRow('Login URL', od.instanceUrl ? `<a href="${escHtml(od.instanceUrl)}" style="color:var(--sf-blue,#0176d3);text-decoration:none;font-size:11px">${escHtml(od.instanceUrl)}</a>` : null)}
      </table>`;
    const orgDetailsRight = `<table style="width:100%;border-collapse:collapse">
        ${dtRow('📅 Current Release', od.nextReleaseName ? escHtml(od.nextReleaseName) : null)}
        ${dtRow('🌐 Instance', escHtml(od.instanceName))}
        ${dtRow('📡 API Version', escHtml(od.apiVersion))}
        ${dtRow('🔨 Salesforce CD', ext.buildVersion ? escHtml(ext.buildVersion) : null)}
        ${dtRow('🏷️ Org Namespace', ext.namespacePrefix ? escHtml(ext.namespacePrefix) : null)}
        ${dtRow('🕐 Time Zone', ext.timezone ? escHtml(ext.timezone) : null)}
        ${dtRow('💬 Language', ext.defaultLocale ? escHtml(ext.defaultLocale) : (ext.language ? escHtml(ext.language) : null))}
        ${dtRow('💱 Currency', ext.currency ? escHtml(ext.currency) : null)}
        ${dtRow('📆 Fiscal Year Start', ext.fiscalYearStartMonth ? escHtml(ext.fiscalYearStartMonth) : null)}
        ${dtRow('📄 Monthly Page Views', pageViews ? escHtml(pageViews) : null)}
        ${dtRow('☁️ Hyperforce', ext.isHyperforce != null ? (ext.isHyperforce ? '✅ Yes' : 'No') : null)}
        ${dtRow('🏢 Data Center', ext.dataCenter ? escHtml(ext.dataCenter) : null)}
        ${dtRow('💾 Storage Used', storageBar)}
        ${dtRow('🔍 Last Scan', lastScanLabel ? escHtml(lastScanLabel) : null)}
        ${dtRow('🛡️ Trust Status', `<span style="color:${tc.color};font-weight:600">${tc.icon} ${escHtml(od.trustStatus || 'Unknown')}</span>`)}
      </table>`;

    const orgDetailsCard = `<div class="info-card" style="height:100%">
      <div class="section-header-row">
        <div class="section-header-icon icon-blue">🏢</div>
        <span style="font-size:14px;font-weight:700">Organization Details</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px">
        <div>${orgDetailsLeft}</div>
        <div>${orgDetailsRight}</div>
      </div>
    </div>`;

    // ── Row 1 Col 2: Clouds Overview ─────────────────────────────────────
    const cloudsEnabled = clouds.filter(c => c.enabled).length;
    const cloudsDisabled = clouds.length - cloudsEnabled;
    const cloudGrid = clouds.length > 0
      ? clouds.map(c => {
          const en = c.enabled;
          return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;
            background:${en ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.05)'};
            border:1px solid ${en ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.18)'}">
            <span style="font-size:12px;flex:1;font-weight:${en?'500':'400'}">${escHtml(c.name)}</span>
            <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:10px;
              background:${en ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.12)'};
              color:${en ? '#22c55e' : '#ef4444'}">${en ? 'Enabled' : 'Disabled'}</span>
          </div>`;
        }).join('')
      : `<p style="opacity:.5;font-size:12px;margin:8px 0">Requires feature licenses in org.</p>`;

    const cloudsCard = `<div class="info-card" style="height:100%">
      <div class="section-header-row">
        <div class="section-header-icon" style="background:rgba(1,118,211,.12)">☁️</div>
        <span style="font-size:14px;font-weight:700">Clouds Overview</span>
        ${clouds.length ? `<span style="margin-left:auto;font-size:11px;opacity:.5">Total: ${clouds.length}</span>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">${cloudGrid}</div>
      ${clouds.length ? `<div style="display:flex;gap:16px;justify-content:center;margin-top:10px;font-size:11px">
        <span style="color:#22c55e;font-weight:600">● Enabled (${cloudsEnabled})</span>
        <span style="color:#ef4444;font-weight:600">● Disabled (${cloudsDisabled})</span>
      </div>` : ''}
    </div>`;

    // ── Row 1 Col 3: License Summary ─────────────────────────────────────
    const licDonutSegs = licenses.slice(0, 6).map((l, i) => ({
      label: l.name, value: l.usedLicenses,
      color: `var(--chart-${(i % 7) + 1})`,
    }));
    // (allocatedLics / totalLic / usedLic / licUtilPct computed earlier before topStrip)
    const licPctLabel = usedLic.toLocaleString();
    const licRows = licenses.slice(0, 10).map((l, i) => {
      const pct = l.totalLicenses > 0 ? Math.round(l.usedLicenses / l.totalLicenses * 100) : 0;
      const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
      return `<tr style="background:${i%2?'var(--vscode-editor-background)':'transparent'}">
        <td style="padding:5px 6px;font-size:11px">${escHtml(l.name)}</td>
        <td style="padding:5px 6px;font-size:11px;text-align:center">${l.usedLicenses}</td>
        <td style="padding:5px 6px;font-size:11px;text-align:center">${l.totalLicenses - l.usedLicenses}</td>
        <td style="padding:5px 6px;min-width:70px">
          <div style="height:4px;border-radius:2px;background:var(--vscode-widget-border);overflow:hidden">
            <div style="height:4px;background:${barColor};width:${pct}%"></div>
          </div>
        </td>
      </tr>`;
    }).join('');

    const licenseCard = `<div class="info-card" style="height:100%">
      <div class="section-header-row">
        <div class="section-header-icon icon-amber">🪪</div>
        <span style="font-size:14px;font-weight:700">License Summary</span>
        ${licenses.length ? `<a class="orginfo-viewall" data-action="orginfo-subtab" data-sub="clouds" style="margin-left:auto">All Licenses →</a>` : ''}
      </div>
      ${licDonutSegs.length > 0
        ? `<div style="margin-bottom:6px">${renderDonutWithLegend(licDonutSegs, { size: 120, centerLabel: licPctLabel })}</div>
           <div style="text-align:center;margin-bottom:14px">
             <div style="font-size:13px;font-weight:700">${usedLic.toLocaleString()} <span style="opacity:.5;font-weight:400">of</span> ${totalLic.toLocaleString()}</div>
             <div style="font-size:11px;color:${licUtilPct > 90 ? '#ef4444' : licUtilPct > 70 ? '#f59e0b' : '#22c55e'};font-weight:600;margin-top:2px">${licUtilPct}% Utilization</div>
           </div>`
        : ''}
      ${licRows ? `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--vscode-widget-border)">
          <th style="text-align:left;padding:4px 6px;font-size:10px;opacity:.6">Type</th>
          <th style="text-align:center;padding:4px 6px;font-size:10px;opacity:.6">Assigned</th>
          <th style="text-align:center;padding:4px 6px;font-size:10px;opacity:.6">Available</th>
          <th style="padding:4px 6px;font-size:10px;opacity:.6">Utilization</th>
        </tr></thead>
        <tbody>${licRows}</tbody>
      </table>` : '<p style="opacity:.5;font-size:12px">No license data.</p>'}
    </div>`;

    // ── Row 2 Sec 1: Installed Packages by Type ───────────────────────────
    const pkgSegs = pkgSum ? [
      { label: 'Managed',  value: pkgSum.managed,  color: 'var(--chart-1)' },
      { label: 'Unlocked', value: pkgSum.unlocked, color: 'var(--chart-2)' },
      { label: 'Local',    value: pkgSum.local,    color: 'var(--chart-3)' },
    ].filter(s => s.value > 0) : [];
    const totalPkgs = inv ? (inv.installedPackages || []).length : 0;

    const packagesCard = `<div class="info-card" style="height:100%">
      <div class="section-header-row">
        <div class="section-header-icon icon-purple">📦</div>
        <span style="font-size:14px;font-weight:700">Packages by Type</span>
        ${totalPkgs ? `<span style="margin-left:auto;font-size:11px;opacity:.5">Total: ${totalPkgs}</span>` : ''}
      </div>
      ${pkgSegs.length > 0
        ? renderDonutWithLegend(pkgSegs, { size: 110, centerLabel: totalPkgs })
        : `<p style="opacity:.5;font-size:12px;margin:8px 0">${totalPkgs === 0 ? 'No installed packages.' : 'Re-run analysis for type breakdown.'}</p>`}
      ${totalPkgs ? `<div style="margin-top:10px;text-align:center"><a class="orginfo-viewall" data-action="orginfo-subtab" data-sub="packages">View all packages →</a></div>` : ''}
    </div>`;

    // ── Row 2 Sec 2: Applications Summary ────────────────────────────────
    const appBarItems = appSum ? [
      { label: 'Lightning Apps',    value: appSum.lightningApps,    color: 'var(--chart-1)' },
      { label: 'Experience Sites',  value: appSum.experienceSites,  color: 'var(--chart-2)' },
      { label: 'Console Apps',      value: appSum.consoleApps,      color: 'var(--chart-3)' },
      { label: 'Connected Apps',    value: appSum.connectedApps,    color: 'var(--chart-4)' },
      { label: 'Mobile Apps',       value: appSum.mobileApps,       color: 'var(--chart-5)' },
      { label: 'OmniStudio Apps',   value: appSum.omniStudioApps,   color: 'var(--chart-6)' },
    ].filter(b => b.value > 0) : (od.apps && od.apps.length ? [
      { label: 'Console Apps',  value: od.consoleAppCount || 0,  color: 'var(--chart-1)' },
      { label: 'Standard Apps', value: od.standardAppCount || 0, color: 'var(--chart-2)' },
    ] : []);
    const totalApps = appSum ? appSum.total : od.apps ? od.apps.length : 0;

    const appsCard = `<div class="info-card" style="height:100%">
      <div class="section-header-row">
        <div class="section-header-icon icon-blue">📱</div>
        <span style="font-size:14px;font-weight:700">Applications</span>
        ${totalApps ? `<span style="margin-left:auto;font-size:11px;opacity:.5">Total: ${totalApps}</span>` : ''}
      </div>
      ${appBarItems.length > 0
        ? `<div style="display:flex;justify-content:center;overflow-x:auto">${renderColumnChart(appBarItems, { colWidth: 30, gap: 10, plotHeight: 70 })}</div>`
        : '<p style="opacity:.5;font-size:12px;margin:8px 0">No app data available.</p>'}
      ${(od.apps && od.apps.length) ? `<div style="margin-top:8px;text-align:center"><a class="orginfo-viewall" data-action="orginfo-subtab" data-sub="applications">View all applications →</a></div>` : ''}
    </div>`;

    // ── Row 2 Sec 3: Environments Summary ────────────────────────────────
    const envItems = envSum ? [
      { label: 'Production',          value: envSum.production },
      { label: 'Full Sandboxes',      value: envSum.fullSandboxes },
      { label: 'Partial Sandboxes',   value: envSum.partialSandboxes },
      { label: 'Developer Sandboxes', value: envSum.developerSandboxes },
      { label: 'Scratch Orgs',        value: envSum.scratchOrgs },
    ].filter(e => e.value > 0) : [];

    const envsCard = `<div class="info-card" style="height:100%">
      <div class="section-header-row">
        <div class="section-header-icon" style="background:rgba(20,184,166,.12)">🌍</div>
        <span style="font-size:14px;font-weight:700">Environments</span>
        ${envSum ? `<span style="margin-left:auto;font-size:11px;opacity:.5">Total: ${envSum.total}</span>` : ''}
      </div>
      ${envItems.length > 0
        ? envItems.map(e => listRow(e.label, e.value)).join('') +
          `<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:13px">
            <span>Total</span><span style="color:var(--sf-blue,#0176d3)">${envSum.total}</span></div>`
        : '<p style="opacity:.5;font-size:12px;margin:8px 0">Sandbox data not available for this org.</p>'}
    </div>`;

    // ── Row 2 Sec 4: Integrations Overview ───────────────────────────────
    const intItems = intSum ? [
      { icon: '🔑', bg: 'rgba(20,184,166,.15)',  label: 'Named Credentials',    value: intSum.namedCredentials },
      { icon: '🔗', bg: 'rgba(59,130,246,.15)',  label: 'Connected Apps',       value: intSum.connectedApps },
      { icon: '🌐', bg: 'rgba(139,92,246,.15)',  label: 'External Credentials', value: intSum.externalCredentials },
      { icon: '📡', bg: 'rgba(245,158,11,.15)',  label: 'Remote Sites',         value: intSum.remoteSites },
      { icon: '🛡️', bg: 'rgba(34,197,94,.15)',  label: 'Auth. Providers',      value: intSum.authProviders },
      { icon: '📜', bg: 'rgba(249,115,22,.15)',  label: 'Certificates',         value: intSum.certificates },
    ] : [];

    function intIconRow(icon, iconBg, label, value) {
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--vscode-widget-border,rgba(255,255,255,.1))">
        <div style="width:26px;height:26px;border-radius:6px;background:${iconBg};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">${icon}</div>
        <span style="font-size:12px;flex:1">${escHtml(label)}</span>
        <span style="font-size:12px;font-weight:700">${value !== undefined ? value : '—'}</span>
      </div>`;
    }

    const intCard = `<div class="info-card" style="height:100%">
      <div class="section-header-row">
        <div class="section-header-icon icon-amber">🔌</div>
        <span style="font-size:14px;font-weight:700">Integrations Overview</span>
        ${intSum ? `<span style="margin-left:auto;font-size:11px;opacity:.5">Total: ${intSum.total}</span>` : ''}
      </div>
      ${intItems.length > 0
        ? intItems.map(e => intIconRow(e.icon, e.bg, e.label, e.value)).join('') +
          `<div style="display:flex;justify-content:space-between;padding:8px 0;font-weight:700;font-size:13px">
            <span>Total</span><span style="color:var(--sf-blue,#0176d3)">${intSum.total}</span></div>`
        : '<p style="opacity:.5;font-size:12px;margin:8px 0">Integration data not available.</p>'}
    </div>`;

    // ── Quick Facts strip ─────────────────────────────────────────────────
    // A null/undefined value means the connected org didn't return the metric → N/A.
    const qfItems = qf ? [
      { icon: '🗃️', label: 'Custom Objects',       value: qf.customObjects },
      { icon: '📋', label: 'Standard Objects',     value: inv ? inv.standardObjectCount : null },
      { icon: '👤', label: 'Users',                value: qf.users },
      { icon: '📊', label: 'Roles',                value: qf.roles },
      { icon: '🪪', label: 'Profiles',             value: qf.profiles },
      { icon: '🔑', label: 'Permission Sets',      value: qf.permissionSets },
      { icon: '🗂️', label: 'PS Groups',           value: qf.permissionSetGroups },
      { icon: '👥', label: 'Public Groups',        value: qf.publicGroups },
      { icon: '📥', label: 'Queues',               value: qf.queues },
      { icon: '⚡', label: 'Flows',                value: qf.flows },
      { icon: '💻', label: 'Apex Classes',         value: qf.apexClasses },
      { icon: '⚙️', label: 'Triggers',             value: qf.triggers },
      { icon: '🧩', label: 'LWC Components',      value: qf.lwcComponents },
    ] : [];
    const qfUnavailable = qfItems.filter(f => f.value === null || f.value === undefined).map(f => f.label);

    const quickFactsHtml = qfItems.length > 0 ? `
    <div class="info-card mb-0" style="overflow-x:auto">
      <div class="section-header-row" style="margin-bottom:12px">
        <div class="section-header-icon" style="background:rgba(20,184,166,.12)">📌</div>
        <span style="font-size:14px;font-weight:700">Quick Facts</span>
      </div>
      <div class="orginfo-qf-strip">
        ${qfItems.map((f, idx) => {
          const isNA = f.value === null || f.value === undefined;
          const divider = idx < qfItems.length - 1
            ? '<div class="orginfo-qf-divider"></div>'
            : '';
          return `<div class="orginfo-qf-item">
            <div class="orginfo-qf-icon">${f.icon}</div>
            <div class="orginfo-qf-value${isNA ? ' orginfo-qf-na' : ''}">${isNA ? 'N/A' : Number(f.value).toLocaleString()}</div>
            <div class="orginfo-qf-label">${escHtml(f.label)}</div>
          </div>${divider}`;
        }).join('')}
      </div>
      ${qfUnavailable.length ? `<div style="margin-top:8px;font-size:11px;opacity:.5">ℹ️ Not available: ${escHtml(qfUnavailable.join(', '))}</div>` : ''}
    </div>` : '';

    // ── Trust Incidents ───────────────────────────────────────────────────
    const trustBanner = activeIncidents.length
      ? `<div class="info-card info-card--error">
          <div class="section-header-row">
            <div class="section-header-icon" style="background:rgba(239,68,68,.15)">🚨</div>
            <span style="font-size:14px;font-weight:700;color:var(--score-critical)">Active Trust Incidents (${activeIncidents.length})</span>
          </div>
          ${activeIncidents.map(inc => `<div style="border-radius:8px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.06);padding:12px 14px;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:12px;font-weight:700;color:#ef4444">🚨 ${escHtml(inc.severity || 'Incident')}</span>
              <span style="font-size:11px;opacity:.5">${inc.createdAt ? new Date(inc.createdAt).toLocaleString() : ''}</span>
            </div>
            <p style="margin:0;font-size:12px;opacity:.9">${escHtml(inc.message || '')}</p>
          </div>`).join('')}
        </div>`
      : `<div style="background:var(--vscode-editor-background);border:1px solid rgba(34,197,94,.25);border-radius:12px;padding:12px 20px;display:flex;align-items:center;gap:10px">
          <span style="font-size:16px">✅</span>
          <span style="font-size:12px;font-weight:600;color:#22c55e">No active Trust Center incidents for ${escHtml(od.instanceName || 'this instance')}</span>
          <a href="https://status.salesforce.com" target="_blank" style="margin-left:auto;font-size:11px;opacity:.5;text-decoration:underline">status.salesforce.com</a>
        </div>`;

    // ── Feature Licenses table (retained) ────────────────────────────────
    const featLicRows = (od.featureLicenses || []).map((fl, i) => {
      const pct = fl.totalLicenses > 0 ? Math.round(fl.usedLicenses / fl.totalLicenses * 100) : 0;
      const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
      return `<tr style="background:${i%2?'var(--vscode-editor-background)':'transparent'}">
        <td style="padding:6px 10px;font-size:12px;font-weight:600">${escHtml(fl.name)}</td>
        <td style="padding:6px 10px;font-size:11px;text-align:center">
          <span style="padding:1px 7px;border-radius:10px;background:${fl.status==='Active'?'rgba(34,197,94,.15)':'rgba(107,114,128,.15)'};
            color:${fl.status==='Active'?'#22c55e':'#6b7280'};font-size:10px;font-weight:700">${escHtml(fl.status)}</span>
        </td>
        <td style="padding:6px 10px;font-size:12px;text-align:center">${fl.usedLicenses} / ${fl.totalLicenses}</td>
        <td style="padding:6px 10px;min-width:100px">
          <div style="height:5px;border-radius:2px;background:var(--vscode-widget-border);overflow:hidden">
            <div style="height:5px;background:${barColor};width:${pct}%"></div>
          </div>
          <div style="font-size:10px;opacity:.5;text-align:right;margin-top:1px">${pct}%</div>
        </td>
      </tr>`;
    }).join('');

    const featLicCard = featLicRows ? `
    <div class="info-card">
      <div class="section-header-row">
        <div class="section-header-icon icon-amber">⭐</div>
        <span style="font-size:14px;font-weight:700">Feature Licenses</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--vscode-widget-border)">
          <th style="text-align:left;padding:4px 10px;font-size:10px;opacity:.6;text-transform:uppercase">Feature</th>
          <th style="text-align:center;padding:4px 10px;font-size:10px;opacity:.6;text-transform:uppercase">Status</th>
          <th style="text-align:center;padding:4px 10px;font-size:10px;opacity:.6;text-transform:uppercase">Used / Total</th>
          <th style="padding:4px 10px;font-size:10px;opacity:.6;text-transform:uppercase">Utilization</th>
        </tr></thead>
        <tbody>${featLicRows}</tbody>
      </table>
    </div>` : '';

    // ─── Detail sub-panels ───────────────────────────────────────────────
    function sectionHeader(icon, iconBg, title, badge) {
      return `<div class="section-header-row">
        <div class="section-header-icon" style="background:${iconBg}">${icon}</div>
        <span style="font-size:15px;font-weight:700">${escHtml(title)}</span>
        ${badge != null ? `<span style="margin-left:auto;font-size:12px;opacity:.6">${escHtml(String(badge))}</span>` : ''}
      </div>`;
    }

    // Installed Packages detail
    const pkgList = (inv && inv.installedPackages) || [];
    const pkgTableRows = pkgList.map(p => {
      const name = (p.SubscriberPackage && p.SubscriberPackage.Name) || (p.SubscriberPackageVersion && p.SubscriberPackageVersion.Name) || '—';
      const ns = (p.SubscriberPackage && p.SubscriberPackage.NamespacePrefix) || '—';
      const v = p.SubscriberPackageVersion
        ? `v${p.SubscriberPackageVersion.MajorVersion}.${p.SubscriberPackageVersion.MinorVersion}.${p.SubscriberPackageVersion.PatchVersion}`
        : '—';
      const type = packageType(p);
      const typeColor = type === 'Managed' ? '#3b82f6' : type === 'Unlocked' ? '#22c55e' : '#f59e0b';
      return [
        escHtml(name),
        `<span style="color:${typeColor};font-weight:600">${type}</span>`,
        escHtml(v),
        escHtml(ns),
      ];
    });
    const packagesPanel = `<div class="info-card">
      ${sectionHeader('📦', 'rgba(139,92,246,.12)', 'Installed Packages', `Total: ${pkgList.length}`)}
      ${pkgSegs.length > 0 ? `<div style="margin:8px 0 16px">${renderDonutWithLegend(pkgSegs, { size: 110, centerLabel: totalPkgs })}</div>` : ''}
      ${pkgTableRows.length > 0
        ? renderPaginatedDataTable('oi-packages', ['Name', 'Type', 'Version', 'Namespace'], pkgTableRows, { emptyMsg: 'No installed packages.' })
        : '<p style="opacity:.5;font-size:13px;margin:8px 0">No installed packages found in this org.</p>'}
    </div>`;

    // Applications detail
    const appList = (od.apps || []);
    const appTableRows = appList.map(ap => [
      escHtml(ap.label || '—'),
      escHtml(ap.type || 'Standard'),
      ap.isActive ? '<span style="color:#22c55e;font-weight:600">Yes</span>' : '<span style="opacity:.6">No</span>',
    ]);
    const applicationsPanel = `<div class="info-card">
      ${sectionHeader('📱', 'rgba(1,118,211,.12)', 'Applications', `Total: ${appList.length}`)}
      ${appBarItems.length > 0 ? `<div style="overflow-x:auto;margin:8px 0 16px">${renderColumnChart(appBarItems, { plotHeight: 160 })}</div>` : ''}
      ${appTableRows.length > 0
        ? renderPaginatedDataTable('oi-apps', ['Application', 'Type', 'Active'], appTableRows, { emptyMsg: 'No applications.' })
        : '<p style="opacity:.5;font-size:13px;margin:8px 0">No application data available.</p>'}
    </div>`;

    // Clouds & Licenses detail
    const fullLicRows = licenses.map(l => {
      const pct = l.totalLicenses > 0 ? Math.round(l.usedLicenses / l.totalLicenses * 100) : 0;
      const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';
      return [
        escHtml(l.name),
        String(l.usedLicenses),
        String(Math.max(l.totalLicenses - l.usedLicenses, 0)),
        String(l.totalLicenses),
        `<div style="display:flex;align-items:center;gap:6px;min-width:90px">
          <div style="flex:1;height:5px;border-radius:3px;background:var(--vscode-widget-border);overflow:hidden">
            <div style="height:5px;background:${barColor};width:${pct}%"></div></div>
          <span style="font-size:10px;opacity:.7;min-width:30px">${pct}%</span></div>`,
      ];
    });
    const cloudsPanel = `<div class="info-card" style="margin-bottom:14px">
        ${sectionHeader('☁️', 'rgba(1,118,211,.12)', 'Clouds Overview', clouds.length ? `Enabled ${cloudsEnabled} · Disabled ${cloudsDisabled}` : null)}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px">${cloudGrid}</div>
      </div>
      <div class="info-card">
        ${sectionHeader('🪪', 'rgba(245,158,11,.12)', 'License Summary', `Total: ${licenses.length}`)}
        ${fullLicRows.length > 0
          ? renderPaginatedDataTable('oi-licenses', ['License Type', 'Assigned', 'Available', 'Total', 'Utilization'], fullLicRows, { emptyMsg: 'No license data.' })
          : '<p style="opacity:.5;font-size:13px;margin:8px 0">No license data available.</p>'}
      </div>`;

    // Environments detail
    const environmentsPanel = `<div class="info-card">
      ${sectionHeader('🌍', 'rgba(20,184,166,.12)', 'Environments', envSum ? `Total: ${envSum.total}` : null)}
      ${envSum ? [
        ['Production', envSum.production],
        ['Full Sandboxes', envSum.fullSandboxes],
        ['Partial Sandboxes', envSum.partialSandboxes],
        ['Developer Sandboxes', envSum.developerSandboxes],
        ['Scratch Orgs', envSum.scratchOrgs],
      ].map(e => listRow(e[0], e[1])).join('') +
        `<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:14px">
          <span>Total Environments</span><span style="color:var(--sf-blue,#0176d3)">${envSum.total}</span></div>`
        : '<p style="opacity:.5;font-size:13px;margin:8px 0">Sandbox data not available for this org (requires production access to SandboxInfo).</p>'}
    </div>`;

    // Integrations detail
    const integrationsPanel = `<div class="info-card">
      ${sectionHeader('🔌', 'rgba(245,158,11,.12)', 'Integrations', intSum ? `Total: ${intSum.total}` : null)}
      ${intSum ? intItems.map(e => listRow(e.label, e.value)).join('') +
        `<div style="display:flex;justify-content:space-between;padding:10px 0;font-weight:700;font-size:14px">
          <span>Total Integrations</span><span style="color:var(--sf-blue,#0176d3)">${intSum.total}</span></div>`
        : '<p style="opacity:.5;font-size:13px;margin:8px 0">Integration data not available.</p>'}
    </div>`;

    // Feature Usage detail
    const featuresPanel = featLicCard || `<div class="info-card">
      ${sectionHeader('⭐', 'rgba(245,158,11,.12)', 'Feature Usage', null)}
      <p style="opacity:.5;font-size:13px;margin:8px 0">No feature license data available for this org edition.</p>
    </div>`;

    // ─── Sub-tab shell ───────────────────────────────────────────────────
    const SUBTABS = [
      { id: 'overview',     label: 'Overview' },
      { id: 'clouds',       label: 'Clouds & Licenses' },
      { id: 'packages',     label: 'Installed Packages' },
      { id: 'applications', label: 'Applications' },
      { id: 'environments', label: 'Environments' },
      { id: 'integrations', label: 'Integrations' },
      { id: 'features',     label: 'Feature Usage' },
    ];
    const active = orgInfoSubtab || 'overview';
    const subNav = `<div class="orginfo-subnav">${SUBTABS.map(t =>
      `<button class="orginfo-subtab-btn${t.id === active ? ' active' : ''}" data-action="orginfo-subtab" data-sub="${t.id}">${escHtml(t.label)}</button>`
    ).join('')}</div>`;

    const overviewPanel = `
      ${topStrip}
      <div class="orginfo-grid" style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr);gap:14px;margin-bottom:14px;align-items:stretch">
        ${orgDetailsCard}
        ${cloudsCard}
        ${licenseCard}
      </div>
      <div class="orginfo-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:14px;align-items:stretch">
        ${packagesCard}
        ${appsCard}
        ${envsCard}
        ${intCard}
      </div>
      ${quickFactsHtml}
      <div style="margin-top:14px">${trustBanner}</div>`;

    function subPanel(id, html) {
      return `<div class="orginfo-subpanel${id === active ? ' active' : ''}" id="oisub-${id}">${html}</div>`;
    }

    return `
    <div style="padding:24px 20px;max-width:1400px;margin:0 auto">
      ${subNav}
      ${subPanel('overview', overviewPanel)}
      ${subPanel('clouds', cloudsPanel)}
      ${subPanel('packages', packagesPanel)}
      ${subPanel('applications', applicationsPanel)}
      ${subPanel('environments', environmentsPanel)}
      ${subPanel('integrations', integrationsPanel)}
      ${subPanel('features', featuresPanel)}
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CTA REVIEW TAB
  // ═══════════════════════════════════════════════════════════════════════════

  // Toolbar shown above an already-generated review so the user can switch the
  // model and re-run without re-analysing the whole org.
  function renderCtaRegenerateBar() {
    if (securityMode === "safe") return "";
    return `
      <div class="cta-regen-bar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;margin-bottom:16px;border:1px solid var(--sf-border);border-radius:10px;background:var(--vscode-editor-background)">
        <span style="font-size:12.5px;font-weight:700">🔁 Re-run review</span>
        <label for="cta-model-select" style="font-size:12px;opacity:.7">Model:</label>
        ${renderModelSelect("cta-model-select")}
        ${
          claudeAuthorized
            ? `<span style="font-size:11.5px;color:var(--score-excellent,#22c55e)">✓ Claude connected</span>`
            : `<button class="btn btn-secondary" id="authorize-claude-btn" data-action="authorize-claude" style="font-size:11.5px;padding:5px 10px">🔑 Authorize Claude</button>`
        }
        <button class="btn btn-primary" data-action="regenerate-cta-review" style="font-size:12.5px;padding:6px 16px;margin-left:auto">↻ Regenerate</button>
      </div>`;
  }

  function renderCtaReview() {
    // Safe mode — CTA is disabled
    if (securityMode === "safe") {
      return `
        <div style="padding:32px;max-width:800px;margin:0 auto">
          <div class="safe-mode-cta-banner">
            <div class="safe-mode-cta-icon">🟢</div>
            <h2>CTA Review is Disabled</h2>
            <p>You selected <strong>Safe Mode</strong> — all analysis runs 100% locally with no AI usage.</p>
            <p>The CTA Architecture Review requires AI to generate board-room-quality architectural insights.
            To enable this feature, re-run the analysis and select <strong>Standard</strong> or <strong>Advanced</strong> mode.</p>
            <div class="safe-mode-cta-details">
              <div class="transparency-item"><span class="transparency-check">🔒</span><span>No data was sent to any AI service</span></div>
              <div class="transparency-item"><span class="transparency-check">✔</span><span>All ${results && results.issues ? results.issues.length : 0} findings were generated locally</span></div>
              <div class="transparency-item"><span class="transparency-check">✔</span><span>Enterprise-grade security maintained</span></div>
            </div>
            <button class="btn btn-secondary" data-action="run-analysis" style="margin-top:20px">
              🔄 Re-Analyse with a Different Mode
            </button>
          </div>
        </div>`;
    }

    if (results && results.ctaReview) {
      return renderCtaRegenerateBar() + renderCtaReviewContent(results.ctaReview);
    }
    return `
      <div style="padding:32px;max-width:800px;margin:0 auto">
        <div style="text-align:center;padding:40px 0">
          <div style="font-size:64px;margin-bottom:16px">🧠</div>
          <h2 style="margin:0 0 8px">CTA Architecture Review</h2>
          <p style="opacity:.7;margin:0 0 24px">Get a board-room-quality architectural review powered by Claude / Copilot AI.
          The AI analyses your org health snapshot (scores, issues, inventory, licence data) and produces
          a structured Salesforce CTA-grade verdict with domain findings, critical risks, and quick wins.</p>
          <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap">
            <label for="cta-model-select" style="font-size:13px;font-weight:600;opacity:.8">AI Model:</label>
            ${renderModelSelect("cta-model-select")}
            ${
              claudeAuthorized
                ? `<span style="font-size:12px;font-weight:600;color:var(--score-excellent,#22c55e)">✓ Claude connected</span>
                   <button id="disconnect-claude-btn" class="btn btn-secondary" data-action="disconnect-claude" style="font-size:11px;padding:4px 10px">Disconnect</button>`
                : `<button id="authorize-claude-btn" class="btn btn-secondary" data-action="authorize-claude" style="font-size:12px;padding:6px 14px">🔑 Authorize Claude</button>`
            }
          </div>
          ${noModelsAvailable() && !claudeAuthorized ? `<div style="font-size:12px;opacity:.65;margin-bottom:12px">No AI model detected — click <strong>Authorize Claude</strong> to connect with an Anthropic API key, sign in to GitHub Copilot, or configure a local endpoint in <strong>Settings → sfHealthAnalyzer.ai.custom</strong>.</div>` : ""}
          <div style="font-size:11.5px;opacity:.6;margin-bottom:14px;max-width:580px;margin-left:auto;margin-right:auto;line-height:1.55">
            ${
              claudeAuthorized
                ? `Claude is connected via your Anthropic API key — pick a <strong>Claude</strong> model above (or <strong>Claude (auto)</strong>) and generate. GitHub Copilot models also work in-place.`
                : `Have a <strong>Claude</strong> subscription/API key? Click <strong>Authorize Claude</strong> and paste your Anthropic key — your Claude models then appear in the picker. GitHub Copilot models work in-place. Keys are stored securely in VS Code Secret Storage.`
            }
          </div>
          <button class="btn btn-primary" data-action="run-cta-review" style="font-size:15px;padding:10px 28px">
            ✨ Generate CTA Architecture Review
          </button>
          <div style="margin-top:12px;font-size:11px;opacity:.5">${getSecurityModeLabel()} — ${escHtml(getSecurityModeDescription())}</div>
        </div>
        <div class="section-card" style="margin-top:24px">
          <div class="section-title">What this review covers</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div style="padding:12px;border-radius:8px;background:var(--vscode-editor-background)">🏗️ <strong>System Architecture</strong><br><span style="opacity:.7;font-size:12px">Apex design patterns, callout risks, batch strategy</span></div>
            <div style="padding:12px;border-radius:8px;background:var(--vscode-editor-background)">🔐 <strong>Security &amp; Access</strong><br><span style="opacity:.7;font-size:12px">Profile sprawl, permission sets, data visibility</span></div>
            <div style="padding:12px;border-radius:8px;background:var(--vscode-editor-background)">🗄️ <strong>Data Architecture</strong><br><span style="opacity:.7;font-size:12px">LDV risk, field density, relationship design</span></div>
            <div style="padding:12px;border-radius:8px;background:var(--vscode-editor-background)">🔌 <strong>Integration</strong><br><span style="opacity:.7;font-size:12px">Named credentials, callout patterns, event patterns</span></div>
            <div style="padding:12px;border-radius:8px;background:var(--vscode-editor-background);grid-column:span 2">🏇 <strong>Solution Architecture</strong><br><span style="opacity:.7;font-size:12px">Config-first vs code, automation sprawl, licence alignment</span></div>
          </div>
        </div>
      </div>`;
  }

  // ── Ask the Architect — conversational, tool-augmented Q&A ────────────────
  function renderAskArchitect() {
    if (securityMode === "safe") return "";
    return `
      <div class="mb-24" id="ask-architect" style="max-width:900px;margin:24px auto 0;padding:0 16px">
        <div class="section-card" style="background:var(--vscode-editor-background);border:1px solid var(--sf-border);border-radius:10px;padding:18px">
          <div class="section-title">💬 Ask the Architect <span style="font-size:11px;color:var(--sf-text-muted);font-weight:400">— AI can query this org live (read-only)</span></div>
          <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
            <span style="font-size:12px;opacity:.7">Model:</span>
            ${renderModelSelect("ask-model-select")}
          </div>
          <div style="display:flex;gap:10px;margin-top:10px">
            <input id="ask-architect-input" type="text" placeholder="e.g. Which objects are at LDV risk, and why?"
              style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--vscode-input-border,#444);background:var(--vscode-input-background,#1e1e1e);color:var(--vscode-input-foreground,#ccc);font-size:13px"/>
            <button class="btn btn-primary" data-action="ask-architect" style="font-size:13px;padding:8px 18px">Ask</button>
          </div>
          <div id="ask-architect-answer" style="margin-top:14px"></div>
        </div>
      </div>`;
  }

  // ── SVG gauge helper (runs in browser) — mockup-accurate ─────────────────
  function buildGaugeSvg(score) {
    const cx = 90, cy = 88, r = 68;
    const circ = 2 * Math.PI * r;
    const trackLen = circ * 0.75; // 270° arc
    const gapLen = circ - trackLen; // 90° gap at bottom
    const cs = Math.max(0, Math.min(100, score || 0));
    const fillLen = trackLen * (cs / 100);
    const gc =
      cs >= 76 ? "#22c55e" : cs >= 61 ? "#84cc16" : cs >= 41 ? "#f59e0b" : cs >= 20 ? "#f97316" : "#ef4444";
    const toRad = (d) => (d * Math.PI) / 180;
    // tick marks at 0/25/50/75/100
    let ticks = "";
    [0, 25, 50, 75, 100].forEach((pct) => {
      const deg = 225 - 270 * (pct / 100);
      const ri = r - 6, ro = r + 3;
      const x1 = (cx + ri * Math.cos(toRad(deg))).toFixed(2);
      const y1 = (cy - ri * Math.sin(toRad(deg))).toFixed(2);
      const x2 = (cx + ro * Math.cos(toRad(deg))).toFixed(2);
      const y2 = (cy - ro * Math.sin(toRad(deg))).toFixed(2);
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d1d5db" stroke-width="1.5"/>`;
    });
    // needle
    const needleDeg = 225 - 270 * (cs / 100);
    const needleLen = r - 18;
    const nx = (cx + needleLen * Math.cos(toRad(needleDeg))).toFixed(2);
    const ny = (cy - needleLen * Math.sin(toRad(needleDeg))).toFixed(2);
    // rotate(135) moves stroke start from 3-o'clock CW 135° → lands at 7:30 (lower-left = 225° gauge start)
    const rot = `rotate(135, ${cx}, ${cy})`;
    return `<svg width="180" height="145" viewBox="0 0 180 145" style="overflow:visible">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="12"
        stroke-dasharray="${trackLen.toFixed(2)} ${gapLen.toFixed(2)}"
        stroke-linecap="round" transform="${rot}"/>
      ${cs > 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${gc}" stroke-width="12"
        stroke-dasharray="${fillLen.toFixed(2)} ${(circ - fillLen).toFixed(2)}"
        stroke-linecap="round" transform="${rot}"/>` : ""}
      ${ticks}
      <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${gc}" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#fff" stroke="#e8eaed" stroke-width="1"/>
      <circle cx="${cx}" cy="${cy}" r="4.5" fill="${gc}"/>
      <text x="${cx}" y="${cy - 16}" text-anchor="middle" dominant-baseline="middle" font-size="42" font-weight="800" fill="${gc}" font-family="-apple-system,sans-serif">${cs}</text>
    </svg>`;
  }

  function renderCtaReviewContent(review) {
    if (!review) {
      return '<p style="padding:32px;opacity:.6">No CTA review data.</p>';
    }

    // ── Shared / derived values ──────────────────────────────────────────────
    const isLegacyReview = !review.architectureMaturity;
    const overallScore = (() => {
      if (typeof review.overallScore === "number") return review.overallScore;
      if (typeof review.healthScore === "number") return review.healthScore;
      const scores = review.healthScoreBreakdown || [];
      if (!scores.length) return 0;
      return Math.round(
        scores.reduce((a, x) => a + (x.score || 0), 0) / scores.length,
      );
    })();
    const matLevel = review.architectureMaturity
      ? review.architectureMaturity.level
      : 1;
    const matLabel = review.architectureMaturity
      ? review.architectureMaturity.label
      : "Ad Hoc";
    const scanDate = review.generatedAt
      ? new Date(review.generatedAt).toLocaleString()
      : "Just now";
    const modelUsed = review.modelUsed || "AI";
    const aiInsightCount =
      ((review.aiInsights || {}).hiddenRisks || []).length +
      ((review.aiInsights || {}).predictions || []).length;

    // ── Gauge SVG ─────────────────────────────────────────────────────────────
    const gaugeSvg = buildGaugeSvg(overallScore);

    // ── Maturity level badge colours ──────────────────────────────────────────
    const matColors = [
      "",
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#22c55e",
      "#0176d3",
    ];
    const matBgs = [
      "",
      "rgba(239,68,68,.12)",
      "rgba(249,115,22,.12)",
      "rgba(245,158,11,.12)",
      "rgba(34,197,94,.12)",
      "rgba(1,118,211,.12)",
    ];
    const matColor = matColors[matLevel] || "#f59e0b";
    const matBg = matBgs[matLevel] || "rgba(245,158,11,.12)";

    // ── Top 3 critical risks ──────────────────────────────────────────────────
    const top3 = (review.topCriticalIssues || []).slice(0, 3);
    const top3Html = top3.length
      ? top3
          .map((iss) => {
            const sevC = iss.severity === "Critical" ? "#ef4444" : "#f59e0b";
            const sevBg =
              iss.severity === "Critical"
                ? "rgba(239,68,68,.12)"
                : "rgba(245,158,11,.12)";
            const sevIcon = iss.severity === "Critical" ? "🐞" : "⚠️";
            return `<div class="ctad-risk-card">
            <div class="ctad-risk-icon">${sevIcon}</div>
            <div class="ctad-risk-body">
              <div class="ctad-risk-title">${escHtml(iss.title)}</div>
              <div class="ctad-risk-impact">${escHtml(iss.impact || iss.domain || "")}</div>
              <span class="ctad-risk-badge" style="color:${sevC};background:${sevBg}">${escHtml(iss.severity)}</span>
              <span class="ctad-risk-badge ctad-risk-badge-impact">Probable Impact</span>
            </div>
          </div>`;
          })
          .join("")
      : `<div class="ctad-empty-note">No critical issues identified.</div>`;

    // ── What's working well ───────────────────────────────────────────────────
    const strengths = (review.architectureObservations || [])
      .filter((o) => o.classification === "Strength")
      .slice(0, 4);
    const passDomains = (review.domainFindings || [])
      .filter((d) => d.status === "Pass")
      .slice(0, 3);
    const wellCards = strengths.length
      ? strengths
          .map(
            (o) =>
              `<div class="ctad-well-card"><div class="ctad-well-icon">✅</div><div>
            <div class="ctad-well-title">${escHtml(o.observation.split(":")[0] || o.observation)}</div>
            <div class="ctad-well-desc">${escHtml(o.observation)}</div>
          </div></div>`,
          )
          .join("")
      : passDomains
          .map(
            (d) =>
              `<div class="ctad-well-card"><div class="ctad-well-icon">✅</div><div>
            <div class="ctad-well-title">${escHtml(d.domain)}</div>
            <div class="ctad-well-desc">${escHtml(d.analysis.slice(0, 90))}${d.analysis.length > 90 ? "…" : ""}</div>
          </div></div>`,
          )
          .join("");

    // ── Org Profile right-column (icon row style per mockup) ────────────────
    const orgProf = review.orgProfile || {};
    const cxColor =
      {
        Simple: "#22c55e",
        Moderate: "#f59e0b",
        Complex: "#f97316",
        Enterprise: "#ef4444",
      }[orgProf.complexity] || "#f59e0b";

    // Derive exact counts from live results — never rely on AI-generated estimates
    const apexCount =
      results && results.metadata
        ? (results.metadata.analyzedClasses || 0) +
          (results.metadata.analyzedTriggers || 0)
        : 0;
    const customObjCount =
      results && results.dataModelStats
        ? results.dataModelStats.filter((o) =>
            (o.objectName || "").endsWith("__c"),
          ).length
        : 0;
    const stdObjCount =
      results && results.dataModelStats
        ? results.dataModelStats.filter(
            (o) => !(o.objectName || "").endsWith("__c"),
          ).length
        : 0;
    const totalCustomFields =
      results && results.dataModelStats
        ? results.dataModelStats.reduce((sum, o) => sum + (o.customFields || 0), 0)
        : 0;
    // Use live user count from userSummary; fall back to metadata, then AI text
    const activeUserCount =
      (results && results.userSummary && results.userSummary.totalActiveUsers > 0)
        ? results.userSummary.totalActiveUsers
        : (results && results.metadata && results.metadata.analyzedUsers > 0)
          ? results.metadata.analyzedUsers
          : null;
    const userScaleDisplay = activeUserCount !== null
      ? String(activeUserCount)
      : escHtml(orgProf.userScale || "—");

    const orgProfileHtml = `
      <div class="ctad-card ctad-org-profile-card">
        <div class="ctad-section-heading ctad-heading-tight">Org Profile</div>
        <div class="ctad-profile-list">
          <div class="ctad-profile-icon-row"><span class="ctad-profile-icon">📊</span><span class="ctad-profile-lbl2">${escHtml(orgProf.complexity || "Moderate")} Complexity</span></div>
          <div class="ctad-profile-icon-row"><span class="ctad-profile-icon">👥</span><span class="ctad-profile-lbl2">${userScaleDisplay} Active Users</span></div>
          <div class="ctad-profile-icon-row"><span class="ctad-profile-icon">🔌</span><span class="ctad-profile-lbl2">${escHtml(orgProf.integrationFootprint || "Minimal")} Integrations</span></div>
          <div class="ctad-profile-icon-row"><span class="ctad-profile-icon">📁</span><span class="ctad-profile-lbl2">${apexCount} Apex Classes &amp; Triggers</span></div>
          <div class="ctad-profile-icon-row"><span class="ctad-profile-icon">📦</span><span class="ctad-profile-lbl2">${customObjCount} Custom Objects · ${totalCustomFields} Custom Fields</span></div>
        </div>
      </div>`;

    // ── Score breakdown bars — merge live scores with AI key findings ──────
    // Live scores are the ground truth; AI breakdown provides key findings only.
    const liveScores = results && results.scores ? results.scores : {};
    const SCORE_MAP = [
      { area: "Code Quality",      liveKey: "codeQuality" },
      { area: "Automation Design", liveKey: "automationDesign" },
      { area: "Data Model",        liveKey: "dataModel" },
      { area: "Security",          liveKey: "security" },
      { area: "Test Coverage",     liveKey: "testing" },
      { area: "Performance",       liveKey: "performance" },
    ];
    // Build a merged row set: prefer live score, fall back to AI score
    const aiBreakdownMap = {};
    (review.healthScoreBreakdown || []).forEach((s) => {
      aiBreakdownMap[s.area] = s;
    });
    const breakdownRows = SCORE_MAP
      .map(({ area, liveKey }) => {
        const live = liveScores[liveKey];
        const aiRow = aiBreakdownMap[area] || Object.values(aiBreakdownMap).find(
          (r) => r.area && r.area.toLowerCase().includes(liveKey.toLowerCase())
        );
        const score = (typeof live === "number" && live > 0) ? live : (aiRow ? aiRow.score : null);
        if (score === null) { return null; }
        const keyFinding = aiRow ? aiRow.keyFinding || "" : "";
        const trend = aiRow ? aiRow.trend || "stable" : "stable";
        const trendIcon = trend === "improving" ? "↑" : trend === "declining" ? "↓" : "→";
        const pct = Math.min(100, Math.round(score));
        const bc = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
        return { area, score, pct, bc, keyFinding, trendIcon };
      })
      .filter(Boolean);

    const scoreBreakdownHtml = breakdownRows.length
      ? `<div class="ctad-card ctad-score-breakdown-card">
          <div class="ctad-section-heading ctad-heading-tight2">Health Score Breakdown</div>
          <div class="ctad-score-rows">
            ${breakdownRows.map((s) => `<div class="ctad-score-row">
                  <span class="ctad-score-num-badge" style="background:${s.bc}">${s.score}</span>
                  <span class="ctad-score-area">${escHtml(s.area)}</span>
                  <div class="ctad-score-bar-track"><div class="ctad-score-bar-fill" style="--score-color:${s.bc};width:${s.pct}%"></div></div>
                  <span style="font-size:10px;opacity:.55">${s.trendIcon}</span>
                </div>`).join("")}
          </div>
        </div>`
      : "";

    // ── Business impact cards ────────────────────────────────────────────────
    const biz = review.businessImpactSummary || {};
    const impactHtml =
      biz.revenueRisk || biz.operationalRisk
        ? `<div class="ctad-card ctad-impact-summary-card">
          <div class="ctad-impact-grid">
            <div class="ctad-impact-card ctad-impact-revenue">
              <div class="ctad-impact-title">🐞 Revenue Risk</div>
              <div class="ctad-impact-copy">${escHtml(biz.revenueRisk || "—")}</div>
              ${biz.overallSeverity === "Critical" ? `<span class="ctad-sev-badge ctad-sev-critical ctad-sev-inline">Critical</span>` : ""}
            </div>
            <div class="ctad-impact-card ctad-impact-ops">
              <div class="ctad-impact-title">⚙️ Operational Risk</div>
              <div class="ctad-impact-copy">${escHtml(biz.operationalRisk || "—")}</div>
              <span class="ctad-sev-badge ctad-sev-critical ctad-sev-inline">Critical</span>
            </div>
            <div class="ctad-impact-card ctad-impact-compliance">
              <div class="ctad-impact-title">🛡️ Compliance Risk</div>
              <div class="ctad-impact-copy">${escHtml(biz.complianceRisk || "—")}</div>
              <span class="ctad-sev-badge ctad-sev-high ctad-sev-inline">High</span>
            </div>
          </div>
        </div>`
        : "";

    // ── Verdict colour ────────────────────────────────────────────────────────
    const VERDICT_CFG = {
      Go: {
        color: "#22c55e",
        bg: "rgba(34,197,94,.1)",
        border: "rgba(34,197,94,.35)",
        icon: "✅",
        label: "Architecture Approved",
      },
      "No-Go": {
        color: "#ef4444",
        bg: "rgba(239,68,68,.1)",
        border: "rgba(239,68,68,.35)",
        icon: "🚫",
        label: "Significant Issues Found",
      },
      "Conditional Go": {
        color: "#f59e0b",
        bg: "rgba(245,158,11,.1)",
        border: "rgba(245,158,11,.35)",
        icon: "⚠️",
        label: "Conditional Approval",
      },
    };
    const vc = VERDICT_CFG[review.verdict] || VERDICT_CFG["Conditional Go"];
    const ec = (e) =>
      ({ Low: "#22c55e", Medium: "#f59e0b", High: "#ef4444" })[e] || "#f59e0b";
    const ecBg = (e) =>
      ({
        Low: "rgba(34,197,94,.12)",
        Medium: "rgba(245,158,11,.12)",
        High: "rgba(239,68,68,.12)",
      })[e] || "rgba(245,158,11,.12)";
    const STATUS_CFG = {
      Pass: { color: "#22c55e", bg: "rgba(34,197,94,.12)", icon: "✅" },
      Fail: { color: "#ef4444", bg: "rgba(239,68,68,.12)", icon: "❌" },
      Warning: { color: "#f59e0b", bg: "rgba(245,158,11,.12)", icon: "⚠️" },
    };
    const sc = (s) => STATUS_CFG[s] || STATUS_CFG["Warning"];
    const DOMAIN_ICONS = {
      "System Architecture": "🏗️",
      Security: "🔐",
      "Data Architecture": "🗄️",
      Integration: "🔌",
      "Solution Architecture": "🏇",
    };

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 1: OVERVIEW
    // ─────────────────────────────────────────────────────────────────────────
    const overviewPanel = `
      <div class="ctad-overview-grid-3">
        <!-- LEFT RAIL -->
        <div class="ctad-overview-rail">
          <div class="ctad-section-heading">Architecture Health Score</div>
          <div class="ctad-card ctad-gauge-card ctad-mb-12">
            <div class="ctad-gauge-row">
              <div class="ctad-gauge-wrap">
                ${gaugeSvg}
                <div class="ctad-center ctad-mt-2">
                  <span class="ctad-maturity-pill" style="color:${matColor};background:${matBg}">Level ${matLevel} - ${escHtml(matLabel)}</span>
                </div>
                <div class="ctad-scan-time">${scanDate}</div>
              </div>
            </div>
          </div>

          <div class="ctad-section-heading ctad-mt-0">Top 3 Critical Risks</div>
          <div class="ctad-card ctad-risk-list-card">${top3Html}</div>
        </div>

        <!-- CENTER -->
        <div class="ctad-overview-main">
          <div class="ctad-verdict-banner ctad-mb-12" style="border-color:${vc.border};background:${vc.bg}">
            <div class="ctad-verdict-icon">${vc.icon}</div>
            <div class="ctad-verdict-copy-wrap">
              <div class="ctad-verdict-copy">
                Final Verdict: <span style="color:${vc.color}">${escHtml(review.verdict)}</span> <span class="ctad-verdict-sub">— ${vc.label}</span>
              </div>
            </div>
          </div>

          <div class="ctad-section-heading">Business Impact Summary</div>
          ${impactHtml}

          ${
            wellCards
              ? `<div class="ctad-section-heading">What's Working Well</div>
          <div class="ctad-card ctad-mb-0">
            <div class="ctad-well-grid">${wellCards}</div>
          </div>`
              : ""
          }
        </div>

        <!-- RIGHT -->
        <div class="ctad-overview-right">
          ${orgProfileHtml}
          ${scoreBreakdownHtml}
        </div>
      </div>`;

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 2: RISKS & ISSUES
    // ─────────────────────────────────────────────────────────────────────────
    const allIssues = review.topCriticalIssues || [];
    const issueCards = allIssues
      .map((iss) => {
        const sevC =
          iss.severity === "Critical"
            ? "#ef4444"
            : iss.severity === "High"
              ? "#f97316"
              : "#f59e0b";
        const sevBg =
          iss.severity === "Critical"
            ? "rgba(239,68,68,.08)"
            : iss.severity === "High"
              ? "rgba(249,115,22,.08)"
              : "rgba(245,158,11,.08)";
        return `<div class="ctad-issue-card" data-sev="${escHtml(iss.severity)}" style="border-left-color:${sevC}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">
          <div style="font-size:14px;font-weight:700;flex:1">${escHtml(iss.title)}</div>
          <span class="ctad-sev-badge ctad-sev-${(iss.severity || "high").toLowerCase()}">${escHtml(iss.severity)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:4px">Business Impact</div>
            <div style="font-size:12px;line-height:1.5;opacity:.9">${escHtml(iss.impact || "—")}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:4px">Recommended Fix</div>
            <div style="font-size:12px;line-height:1.5;opacity:.9">${escHtml(iss.remediation || "—")}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${iss.domain ? `<span style="font-size:11px;opacity:.6">🏷 ${escHtml(iss.domain)}</span>` : ""}
          ${iss.effortEstimate ? `<span style="font-size:11px;font-weight:700;padding:1px 8px;border-radius:10px;background:rgba(107,114,128,.1);color:#6b7280">${escHtml(iss.effortEstimate)} effort</span>` : ""}
        </div>
      </div>`;
      })
      .join("");
    const filterBtns = ["all", "Critical", "High", "Medium"]
      .map(
        (s) =>
          `<button class="ctad-risk-filter-btn${s === "all" ? " active" : ""}" data-action="cta-risk-filter" data-sev="${s}">${s === "all" ? "All" : s}</button>`,
      )
      .join("");
    const riskAnalHtml = review.riskAnalysis
      ? (() => {
          const ra = review.riskAnalysis;
          const cells = (ra.riskHeatmap || [])
            .map((cell) => {
              const l = { Low: 1, Medium: 2, High: 3 }[cell.likelihood] || 1;
              const im = { Low: 1, Medium: 2, High: 3 }[cell.impact] || 1;
              const risk = l * im;
              const cc =
                risk >= 6 ? "#ef4444" : risk >= 3 ? "#f59e0b" : "#22c55e";
              return `<div style="padding:6px 10px;border-radius:6px;border:1px solid ${cc}40;background:${cc}15;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:11px;font-weight:600">${escHtml(cell.domain)}</span>
              <span style="font-size:10px;font-weight:700;color:${cc}">L:${escHtml(cell.likelihood)} × I:${escHtml(cell.impact)}</span>
            </div>`;
            })
            .join("");
          return `<div class="ctad-card" style="margin-top:16px">
            <div class="ctad-card-title">🔥 Risk Analysis</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
              <div>
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:6px">Probability of Incident</div>
                <div style="font-size:13px;line-height:1.6;opacity:.9">${escHtml(ra.probabilityOfIncident || "—")}</div>
                <div style="margin-top:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:4px">Time to Risk</div>
                <div style="font-size:14px;font-weight:800;color:#ef4444">${escHtml(ra.timeToRisk || "—")}</div></div>
              </div>
              <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:8px">Risk Heatmap (Likelihood × Impact)</div>
                <div style="display:flex;flex-direction:column;gap:5px">${cells}</div>
              </div>
            </div>
          </div>`;
        })()
      : "";
    const risksPanel = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;opacity:.6">Filter by severity:</span>
        ${filterBtns}
      </div>
      <div>${issueCards || '<div class="ctad-card"><div style="opacity:.5;padding:12px">No issues found.</div></div>'}</div>
      ${riskAnalHtml}`;

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 3: ARCHITECTURE ANALYSIS
    // ─────────────────────────────────────────────────────────────────────────
    const maturityBlockHtml = review.architectureMaturity
      ? (() => {
          const m = review.architectureMaturity;
          const matLabels = [
            "Ad Hoc",
            "Reactive",
            "Defined",
            "Managed",
            "Optimized",
          ];
          const matColors2 = [
            "#ef4444",
            "#f97316",
            "#f59e0b",
            "#22c55e",
            "#0176d3",
          ];
          const steps = matLabels
            .map((lbl, i) => {
              const active = i + 1 === m.level;
              const past = i + 1 < m.level;
              const sc2 = matColors2[i];
              return `<div class="cta-maturity-step ${active ? "active" : past ? "past" : ""}" style="${active ? `background:${sc2};color:#fff;border-color:${sc2}` : past ? `border-color:${sc2};color:${sc2}` : ""}">
          <div class="cta-maturity-num">${i + 1}</div><div class="cta-maturity-lbl">${lbl}</div>
        </div>`;
            })
            .join('<div class="cta-maturity-connector"></div>');
          return `<div class="ctad-card" style="margin-bottom:16px">
        <div class="ctad-card-title">🏅 Architecture Maturity — Level ${m.level}: ${escHtml(m.label)}</div>
        <div class="cta-maturity-gauge" style="margin:12px 0">${steps}</div>
        <p style="margin:0;font-size:13px;line-height:1.7;opacity:.9">${escHtml(m.summary || "—")}</p>
      </div>`;
        })()
      : "";
    const domainCardsHtml = (review.domainFindings || [])
      .map((d) => {
        const cfg2 = sc(d.status);
        const dIcon = DOMAIN_ICONS[d.domain] || "📋";
        return `<div style="background:var(--vscode-editor-background,#fff);border:1px solid ${cfg2.color}40;border-radius:12px;padding:20px;position:relative;overflow:hidden">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${cfg2.color}"></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:36px;height:36px;border-radius:9px;background:${cfg2.bg};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${dIcon}</div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14px;font-weight:700">${escHtml(d.domain)}</span>
              <span style="font-size:11px;font-weight:700;color:${cfg2.color};background:${cfg2.bg};padding:2px 8px;border-radius:20px">${cfg2.icon} ${escHtml(d.status)}</span>
            </div>
          </div>
        </div>
        <p style="margin:0 0 10px;font-size:12px;line-height:1.6;opacity:.9">${escHtml(d.analysis)}</p>
        ${d.risks && d.risks.length ? `<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin-bottom:5px">Risks</div>${d.risks.map((r) => `<div style="display:flex;gap:6px;margin-bottom:3px;font-size:11px"><span style="color:#ef4444;flex-shrink:0">●</span><span style="opacity:.85">${escHtml(r)}</span></div>`).join("")}</div>` : ""}
        ${d.recommendations && d.recommendations.length ? `<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin-bottom:5px">Fixes</div>${d.recommendations.map((r) => `<div style="display:flex;gap:6px;margin-bottom:3px;font-size:11px"><span style="color:#22c55e;flex-shrink:0">→</span><span style="opacity:.85">${escHtml(r)}</span></div>`).join("")}</div>` : ""}
      </div>`;
      })
      .join("");
    const benchHtml = (review.benchmarkComparison || []).length
      ? `<div class="ctad-card" style="margin-top:16px">
      <div class="ctad-card-title">📈 Benchmark Comparison</div>
      <div style="overflow-x:auto;margin-top:10px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:2px solid var(--vscode-widget-border,#e5e7eb)">
            <th style="text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Metric</th>
            <th style="text-align:center;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Your Org</th>
            <th style="text-align:center;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Industry Avg</th>
            <th style="text-align:center;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Top Quartile</th>
            <th style="text-align:center;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Status</th>
          </tr></thead>
          <tbody>${(review.benchmarkComparison || [])
            .map((b, i) => {
              const stC =
                { Above: "#22c55e", At: "#f59e0b", Below: "#ef4444" }[
                  b.status
                ] || "#f59e0b";
              const stBg =
                {
                  Above: "rgba(34,197,94,.1)",
                  At: "rgba(245,158,11,.1)",
                  Below: "rgba(239,68,68,.1)",
                }[b.status] || "rgba(245,158,11,.1)";
              return `<tr style="background:${i % 2 ? "var(--vscode-editor-background,#f9fafb)" : "transparent"}">
              <td style="padding:8px 10px;font-weight:600;border-bottom:1px solid var(--vscode-widget-border,#f3f4f6)">${escHtml(b.metric)}</td>
              <td style="padding:8px 10px;text-align:center;font-weight:700;border-bottom:1px solid var(--vscode-widget-border,#f3f4f6)">${escHtml(String(b.orgValue))}</td>
              <td style="padding:8px 10px;text-align:center;opacity:.7;border-bottom:1px solid var(--vscode-widget-border,#f3f4f6)">${escHtml(String(b.industryAvg))}</td>
              <td style="padding:8px 10px;text-align:center;opacity:.7;border-bottom:1px solid var(--vscode-widget-border,#f3f4f6)">${escHtml(String(b.topQuartile))}</td>
              <td style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--vscode-widget-border,#f3f4f6)"><span style="font-size:11px;font-weight:700;color:${stC};background:${stBg};padding:2px 8px;border-radius:20px">${escHtml(b.status)}</span></td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>
      </div>
    </div>`
      : "";
    const archPanel = `
      ${maturityBlockHtml}
      ${domainCardsHtml ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-bottom:16px">${domainCardsHtml}</div>` : ""}
      ${benchHtml}`;

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 4: RECOMMENDATIONS
    // ─────────────────────────────────────────────────────────────────────────
    const rec = review.recommendations || {};
    const qwHtml = (rec.quickWins || [])
      .map(
        (w, i) => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:10px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);margin-bottom:8px">
        <span style="width:24px;height:24px;border-radius:50%;background:#22c55e;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${i + 1}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${escHtml(w.action)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <span style="font-size:10px;font-weight:700;color:${ec(w.effort)};background:${ecBg(w.effort)};padding:1px 7px;border-radius:10px">${escHtml(w.effort || "")} Effort</span>
            <span style="font-size:11px;opacity:.6">${escHtml(w.impact || "—")}</span>
          </div>
        </div>
        <span style="font-size:10px;font-weight:700;color:#6b7280;opacity:.5">P${i + 1}</span>
      </div>`,
      )
      .join("");
    const stHtml = (rec.strategic || [])
      .map(
        (s, i) => `
      <div style="display:flex;gap:14px;padding:14px 16px;border-radius:10px;background:rgba(1,118,211,.06);border:1px solid rgba(1,118,211,.2);margin-bottom:8px">
        <div style="width:38px;height:38px;border-radius:9px;background:rgba(1,118,211,.15);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0;color:#0176d3">${i + 1}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;margin-bottom:5px">${escHtml(s.action)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${s.timeline ? `<span style="font-size:11px;opacity:.6">📅 ${escHtml(s.timeline)}</span>` : ""}
            <span style="font-size:10px;font-weight:700;color:${ec(s.effort)};background:${ecBg(s.effort)};padding:1px 7px;border-radius:10px">${escHtml(s.effort || "")} Effort</span>
            <span style="font-size:11px;opacity:.6">${escHtml(s.impact || "—")}</span>
          </div>
        </div>
      </div>`,
      )
      .join("");
    const inactionHtml = review.costOfInaction
      ? (() => {
          const c = review.costOfInaction;
          return `<div style="background:rgba(239,68,68,.06);border:1.5px solid rgba(239,68,68,.25);border-radius:12px;padding:20px;margin-top:16px">
        <div class="ctad-card-title" style="color:#ef4444;margin-bottom:12px">⏳ Cost of Inaction</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px">
          <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#ef4444;margin-bottom:6px">Financial Impact</div><div style="font-size:13px;line-height:1.5;opacity:.9">${escHtml(c.financialImpact || "—")}</div></div>
          <div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#f59e0b;margin-bottom:6px">Technical Debt Growth</div><div style="font-size:13px;line-height:1.5;opacity:.9">${escHtml(c.technicalDebtGrowth || "—")}</div></div>
        </div>
        ${c.risks && c.risks.length ? c.risks.map((r) => `<div style="display:flex;gap:6px;margin-bottom:4px;font-size:12px"><span style="color:#ef4444;flex-shrink:0">●</span><span style="opacity:.85">${escHtml(r)}</span></div>`).join("") : ""}
      </div>`;
        })()
      : "";
    const finalRecHtml = review.finalRecommendation
      ? (() => {
          const f = review.finalRecommendation;
          return `<div style="background:${vc.bg};border:1.5px solid ${vc.border};border-radius:12px;padding:20px;margin-top:16px">
        <div class="ctad-card-title" style="color:${vc.color};margin-bottom:10px">${vc.icon} Final CTA Recommendation</div>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.75;font-weight:500;opacity:.95">${escHtml(f.summary || "—")}</p>
        ${f.nextSteps && f.nextSteps.length ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:8px">Immediate Next Steps</div>${f.nextSteps.map((step, i) => `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;font-size:13px"><span style="width:20px;height:20px;border-radius:50%;background:${vc.color};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${i + 1}</span><span style="opacity:.9;line-height:1.5">${escHtml(step)}</span></div>`).join("")}` : ""}
        ${f.proposedTimeline ? `<div style="background:rgba(0,0,0,.06);border-radius:8px;padding:11px 14px;font-size:12px;opacity:.8;margin-top:10px"><span style="font-weight:700">📅 Timeline: </span>${escHtml(f.proposedTimeline)}</div>` : ""}
      </div>`;
        })()
      : "";
    const recsPanel = `
      ${
        qwHtml
          ? `<div class="ctad-card" style="margin-bottom:16px">
        <div class="ctad-card-title">🟢 Quick Wins <span style="font-size:11px;opacity:.5;font-weight:400">(1–2 sprints)</span></div>
        <div style="margin-top:12px">${qwHtml}</div>
      </div>`
          : ""
      }
      ${
        stHtml
          ? `<div class="ctad-card" style="margin-bottom:16px">
        <div class="ctad-card-title">🔵 Strategic Initiatives</div>
        <div style="margin-top:12px">${stHtml}</div>
      </div>`
          : ""
      }
      ${inactionHtml}
      ${finalRecHtml}`;

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 5: AI INSIGHTS
    // ─────────────────────────────────────────────────────────────────────────
    const ai = review.aiInsights || {};
    const aiBlock = (icon, title, items, color) =>
      items && items.length
        ? `<div class="ctad-card" style="margin-bottom:14px;border-left:3px solid ${color}">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${color};margin-bottom:10px">${icon} ${title}</div>
            ${items.map((it) => `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:7px;font-size:13px"><span style="color:${color};flex-shrink:0;margin-top:2px">▸</span><span style="opacity:.9;line-height:1.5">${escHtml(it)}</span></div>`).join("")}
          </div>`
        : "";
    const swotHtml = (review.architectureObservations || []).length
      ? (() => {
          const clrMap = {
            Strength: "#22c55e",
            Weakness: "#ef4444",
            Opportunity: "#0176d3",
            Threat: "#f59e0b",
          };
          const bgMap = {
            Strength: "rgba(34,197,94,.07)",
            Weakness: "rgba(239,68,68,.07)",
            Opportunity: "rgba(1,118,211,.07)",
            Threat: "rgba(245,158,11,.07)",
          };
          const icMap = {
            Strength: "💪",
            Weakness: "⚠️",
            Opportunity: "🚀",
            Threat: "🔴",
          };
          const grouped = {
            Strength: [],
            Weakness: [],
            Opportunity: [],
            Threat: [],
          };
          (review.architectureObservations || []).forEach((o) => {
            if (grouped[o.classification])
              grouped[o.classification].push(o.observation);
          });
          const quad = (
            cls,
          ) => `<div style="padding:14px;border-radius:10px;background:${bgMap[cls]};border:1px solid ${clrMap[cls]}30">
        <div style="font-size:11px;font-weight:700;color:${clrMap[cls]};margin-bottom:9px">${icMap[cls]} ${cls}s</div>
        ${grouped[cls].map((obs) => `<div style="font-size:12px;opacity:.85;margin-bottom:5px;display:flex;gap:6px"><span style="color:${clrMap[cls]};flex-shrink:0">·</span>${escHtml(obs)}</div>`).join("") || `<div style="font-size:12px;opacity:.35">None identified</div>`}
      </div>`;
          return `<div class="ctad-card" style="margin-top:14px">
        <div class="ctad-card-title">🔭 Architecture Observations (SWOT)</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">${quad("Strength")}${quad("Weakness")}${quad("Opportunity")}${quad("Threat")}</div>
      </div>`;
        })()
      : "";
    const aiPanel = `
      ${aiBlock("🔍", "Hidden Risks", ai.hiddenRisks, "#ef4444")}
      ${aiBlock("🔮", "Predictions", ai.predictions, "#8b5cf6")}
      ${aiBlock("⚡", "Unusual Patterns", ai.unusualPatterns, "#f59e0b")}
      ${!ai.hiddenRisks && !ai.predictions && !ai.unusualPatterns ? `<div class="ctad-card"><div style="opacity:.5;padding:12px">No AI insights available. Run a CTA Review in Standard or Advanced mode to generate insights.</div></div>` : ""}
      ${swotHtml}`;

    // ─────────────────────────────────────────────────────────────────────────
    // TAB 6: DATA CONFIDENCE
    // ─────────────────────────────────────────────────────────────────────────
    const legacyWarning = isLegacyReview
      ? `<div style="background:rgba(245,158,11,.1);border:1.5px solid rgba(245,158,11,.35);border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:12px">
          <span style="font-size:20px">⚠️</span>
          <div><div style="font-weight:700;font-size:13px">Legacy review format detected</div>
          <div style="font-size:12px;opacity:.8;margin-top:2px">This review was generated with an older version of OrgPulse. Click <strong>Regenerate</strong> for the full premium report.</div></div>
        </div>`
      : "";
    const confLevel =
      overallScore >= 70 ? "High" : overallScore >= 40 ? "Medium" : "Low";
    const confColor =
      confLevel === "High"
        ? "#22c55e"
        : confLevel === "Medium"
          ? "#f59e0b"
          : "#ef4444";
    const confidencePanel = `
      ${legacyWarning}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div class="ctad-card">
          <div class="ctad-card-title">🔐 Scan Confidence</div>
          <div style="margin-top:12px;display:flex;align-items:center;gap:12px">
            <div style="font-size:32px;font-weight:800;color:${confColor}">${confLevel}</div>
            <div style="font-size:12px;opacity:.7;line-height:1.5">Based on ${(review.healthScoreBreakdown || []).length} scoring dimensions analysed.</div>
          </div>
        </div>
        <div class="ctad-card">
          <div class="ctad-card-title">🤖 AI Model Used</div>
          <div style="margin-top:12px">
            <div style="font-size:16px;font-weight:700">${escHtml(modelUsed)}</div>
            <div style="font-size:11px;opacity:.55;margin-top:4px">Generated ${scanDate}</div>
          </div>
        </div>
      </div>
      <div class="ctad-card">
        <div class="ctad-card-title">📊 Scoring Dimensions Coverage</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:12px">
          ${(review.healthScoreBreakdown || [])
            .map((s) => {
              const pct = Math.min(
                100,
                Math.round((s.score / (s.maxScore || 100)) * 100),
              );
              const bc =
                pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
              return `<div style="padding:10px 14px;border-radius:8px;background:var(--vscode-editor-background,#f9fafb);border:1px solid var(--vscode-widget-border,#e5e7eb)">
              <div style="font-size:11px;font-weight:600;margin-bottom:6px">${escHtml(s.area)}</div>
              <div style="height:5px;border-radius:3px;background:#e5e7eb;overflow:hidden"><div style="height:5px;border-radius:3px;background:${bc};width:${pct}%"></div></div>
              <div style="font-size:10px;font-weight:700;color:${bc};margin-top:4px">${s.score} / ${s.maxScore || 100}</div>
            </div>`;
            })
            .join("")}
          ${!(review.healthScoreBreakdown || []).length ? `<div style="opacity:.5;font-size:12px">No dimension data available.</div>` : ""}
        </div>
      </div>`;

    // ─────────────────────────────────────────────────────────────────────────
    // FULL DASHBOARD WRAPPER
    // ─────────────────────────────────────────────────────────────────────────
    const tabDefs = [
      { id: "overview", label: "Overview", badge: "" },
      {
        id: "risks",
        label: "Risks & Issues",
        badge: allIssues.length ? String(allIssues.length) : "",
      },
      { id: "arch", label: "Architecture Analysis", badge: "" },
      { id: "recs", label: "Recommendations", badge: "" },
      {
        id: "ai",
        label: "AI Insights",
        badge: aiInsightCount > 0 ? String(aiInsightCount) : "",
      },
      {
        id: "confidence",
        label: "Data Confidence",
        badge: isLegacyReview ? "!" : "",
      },
    ];
    const tabNav = tabDefs
      .map((t) => {
        const active = t.id === "overview";
        return `<button class="cta-dash-tab-btn${active ? " active" : ""}" data-action="cta-sub-tab" data-tab="${t.id}">${active ? `<span class="ctad-tab-active-dot">●</span>` : ""}${t.label}${t.badge ? `<span class="ctad-tab-badge">${t.badge}</span>` : ""}</button>`;
      })
      .join("");

    const ctaHeaderLogo = window.ORGPULSE_ICON_URI
      ? `<img class="cta-dash-logo-img" src="${window.ORGPULSE_ICON_URI}" alt="OrgPulse" />`
      : "🏥";

    return `
      <div class="cta-dash-wrap">
        <div class="cta-dash-header">
          <div class="cta-dash-header-brand">
            <span class="cta-dash-logo">${ctaHeaderLogo}</span>
            <span class="cta-dash-brand-text">OrgPulse</span>
            <span class="cta-dash-breadcrumb">›</span>
            <span class="cta-dash-header-title">CTA Architecture Health Report</span>
          </div>
          <div class="cta-dash-header-actions">
            <span class="cta-dash-date">📅 ${scanDate}</span>
            <span class="cta-dash-score-pill" style="background:${matColor}20;color:${matColor};border:1px solid ${matColor}50">← ${overallScore}%</span>
            <button class="cta-dash-scan-btn" data-action="run-cta-review">🔄 Review again</button>
          </div>
        </div>
        <div class="cta-dash-tab-bar">
          <div class="cta-dash-tab-left">${tabNav}</div>
          <button class="btn btn-ghost cta-pdf-btn" data-action="export-cta-pdf">📄 Download PDF</button>
        </div>
        <div class="cta-dash-body">
          <div class="cta-dash-panel" data-panel="overview">${overviewPanel}</div>
          <div class="cta-dash-panel hidden" data-panel="risks">${risksPanel}</div>
          <div class="cta-dash-panel hidden" data-panel="arch">${archPanel}</div>
          <div class="cta-dash-panel hidden" data-panel="recs">${recsPanel}</div>
          <div class="cta-dash-panel hidden" data-panel="ai">${aiPanel}</div>
          <div class="cta-dash-panel hidden" data-panel="confidence">${confidencePanel}</div>
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERVIEW TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderOverview() {
    const s = results.scores || {};
    const sum = results.summary || {};
    const meta = results.metadata || {};
    const od = results.orgDetails || {};

    const catDefs = [
      { key: "codeQuality",     label: "Code Quality", weight: 25, tab: "code" },
      { key: "automationDesign",label: "Automation",   weight: 20, tab: "automation" },
      { key: "performance",     label: "Performance",  weight: 20, tab: "perflimits" },
      { key: "dataModel",       label: "Data Model",   weight: 15, tab: "datamodel" },
      { key: "security",        label: "Security",     weight: 10, tab: "secaccess" },
      { key: "testing",         label: "Testing",      weight:  5, tab: "code" },
      { key: "integration",     label: "Integration",  weight:  5, tab: "overview" },
    ];

    // Score color (same thresholds as the rest of the dashboard)
    const ovScoreColor = (sc) =>
      sc >= 90 ? "#3fb950" : sc >= 75 ? "#9bc24a" : sc >= 50 ? "#e0913a" : "#f0584a";

    // Test coverage
    const cov = results.testCoverageSummary;
    const testCovPct =
      cov && typeof cov.averageCoverage === "number"
        ? cov.averageCoverage
        : (s.testing != null ? s.testing : (meta.testCoverage || 0));

    // Canonical counts
    const lwcCount = (results.lwcSummary && results.lwcSummary.totalComponents) || meta.analyzedLwcComponents || 0;
    const totalIssues = (results.issues || []).length;

    // ── Incomplete banner ─────────────────────────────────────────────────
    const incompleteBanner = renderIncompleteBanner();

    // ── Org identity strip ────────────────────────────────────────────────
    const orgName = od.orgName || meta.orgUsername || meta.orgAlias || "Connected Org";
    const orgId   = meta.orgId || od.orgId || "";
    const orgIdentityStrip = `
      <div class="ovn-org-strip">
        <div>
          <div class="ovn-org-name-row">
            <div class="ovn-org-name">${escHtml(orgName)}</div>
            <span class="ovn-pill-connected"><span class="ovn-pill-connected-dot"></span>Connected</span>
          </div>
          <div class="ovn-org-chips">
            ${od.orgType     ? `<span class="ovn-chip-meta">${escHtml(od.orgType)}</span>` : ""}
            ${od.instanceName? `<span class="ovn-chip-meta">Instance ${escHtml(od.instanceName)}</span>` : ""}
            <span class="ovn-chip-meta">API v${escHtml(od.apiVersion || meta.apiVersion || "—")}</span>
            ${orgId          ? `<span class="ovn-chip-id">${escHtml(orgId)}</span>` : ""}
          </div>
        </div>
        <div class="ovn-org-meta-blocks">
          <div class="ovn-meta-block"><span class="ovn-meta-label">Scanned</span><span class="ovn-meta-val">${meta.analyzedFiles || 0} files</span></div>
          <div class="ovn-meta-block"><span class="ovn-meta-label">Duration</span><span class="ovn-meta-val">${results.duration ? (results.duration / 1000).toFixed(1) + "s" : "—"}</span></div>
          <div class="ovn-meta-block"><span class="ovn-meta-label">As of</span><span class="ovn-meta-val">${formatTs(results.timestamp)}</span></div>
        </div>
      </div>`;

    // ── Grade ring ────────────────────────────────────────────────────────
    const overallScore = s.overall || 0;
    const CIRC = 427.26;                              // 2π × 68
    const ringOffset = CIRC * (1 - overallScore / 100);
    const ringColor  = ovScoreColor(overallScore);
    const grade      = getGrade(overallScore);

    // Trend text
    const trends = results.trends || [];
    let trendText = "First run — trend appears next time";
    let trendColor = "var(--ov-faint)";
    if (trends.length >= 2) {
      const delta = Math.round((trends[trends.length - 1].overall || 0) - (trends[trends.length - 2].overall || 0));
      if (delta === 0) { trendText = "no change vs last run"; }
      else {
        const arrow = delta > 0 ? "▲" : "▼";
        trendColor = delta > 0 ? "#3fb950" : "#f0584a";
        trendText = `${arrow} ${Math.abs(delta)} pt${Math.abs(delta) !== 1 ? "s" : ""} vs last run`;
      }
    }

    const gradeCard = `
      <div class="ovn-grade-card">
        <div class="ovn-ring-wrap">
          <svg class="ovn-ring-svg" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="68" fill="none" stroke="var(--ov-p2)" stroke-width="11"></circle>
            <circle cx="80" cy="80" r="68" fill="none" stroke="${ringColor}" stroke-width="11"
              stroke-linecap="round"
              stroke-dasharray="${CIRC}"
              stroke-dashoffset="${ringOffset.toFixed(2)}"
              style="animation:ovnRing 1s ease-out"></circle>
          </svg>
          <div class="ovn-ring-center">
            <div class="ovn-ring-score" style="color:${ringColor}">${overallScore}</div>
            <div class="ovn-ring-of100">/ 100</div>
          </div>
        </div>
        <div class="ovn-grade-row">
          <span class="ovn-grade-letter" style="color:${ringColor}">${grade.grade}</span>
          <span class="ovn-grade-desc">${grade.description}</span>
        </div>
        <div class="ovn-trend" style="color:${trendColor}">${trendText}</div>
      </div>`;

    // ── Needs Attention ───────────────────────────────────────────────────
    const TAB_LABELS = {
      code: "Code Quality", datamodel: "Data Model", automation: "Automation",
      perflimits: "Performance", secaccess: "Security", dependencies: "Dependencies",
      stalemetadata: "Stale Metadata", cta: "CTA Review", overview: "Overview",
    };
    const attentionItems = [];

    // 0% test coverage is the most critical signal
    if (testCovPct < 1) {
      attentionItems.push({
        title: "No Apex test coverage",
        sub: `0% across ${meta.analyzedClasses || 0} classes — deployments at risk`,
        color: "#f0584a", tab: "code",
      });
    } else if (testCovPct < 75) {
      attentionItems.push({
        title: "Low test coverage",
        sub: `${Math.round(testCovPct)}% — below the 75% deployment threshold`,
        color: "#f0584a", tab: "code",
      });
    }
    // High error count
    if (sum.errorCount > 0) {
      attentionItems.push({
        title: `${sum.errorCount} blocking error${sum.errorCount !== 1 ? "s" : ""}`,
        sub: "Resolve before next deployment",
        color: "#f0584a", tab: "code",
      });
    }
    // Worst-scoring categories (critical then warning)
    const sortedCats = catDefs
      .map(c => ({ ...c, score: s[c.key] != null ? s[c.key] : 100 }))
      .sort((a, b) => a.score - b.score);
    for (const cat of sortedCats) {
      if (attentionItems.length >= 4) break;
      if (cat.score < 60) {
        attentionItems.push({
          title: `${cat.label} health critically low`,
          sub: `Score ${cat.score} / 100 — review ${cat.label.toLowerCase()} design`,
          color: cat.score < 40 ? "#f0584a" : "#e0913a",
          tab: cat.tab,
        });
      } else if (cat.score < 80) {
        attentionItems.push({
          title: `${cat.label} below target`,
          sub: `Score ${cat.score} / 100${sum.warningCount > 0 ? ` — ${sum.warningCount} warnings to triage` : ""}`,
          color: "#e0913a",
          tab: cat.tab,
        });
      }
    }
    // Fallback when everything looks good
    if (attentionItems.length === 0) {
      attentionItems.push({
        title: "All categories are healthy",
        sub: `Score ${overallScore} / 100 — great shape`,
        color: "#3fb950", tab: "overview",
      });
    }

    const attentionRows = attentionItems.slice(0, 4).map(item => `
      <div class="ovn-att-row" data-action="activate-tab" data-tab="${item.tab}">
        <span class="ovn-att-dot" style="background:${item.color};box-shadow:0 0 8px ${item.color}"></span>
        <div class="ovn-att-body">
          <div class="ovn-att-title">${escHtml(item.title)}</div>
          <div class="ovn-att-sub">${escHtml(item.sub)}</div>
        </div>
        <span class="ovn-att-tab">${escHtml(TAB_LABELS[item.tab] || item.tab)}</span>
        <span class="ovn-att-arrow">›</span>
      </div>`).join("");

    const attentionPanel = `
      <div class="ovn-attention-panel">
        <div class="ovn-attention-header">
          <div class="ovn-attention-title">Needs attention</div>
          <div class="ovn-attention-count">${totalIssues} issues total</div>
        </div>
        <div class="ovn-attention-list">${attentionRows}</div>
      </div>`;

    // ── Category scores ───────────────────────────────────────────────────
    const catCards = catDefs.map(cat => {
      const sc = s[cat.key] != null ? s[cat.key] : 0;
      const col = ovScoreColor(sc);
      return `
        <div class="ovn-cat-card" data-action="activate-tab" data-tab="${cat.tab}" title="View ${cat.label}">
          <div class="ovn-cat-top">
            <div class="ovn-cat-name-row">
              <span class="ovn-cat-swatch" style="background:${col}"></span>
              <span class="ovn-cat-name">${cat.label}</span>
            </div>
            <span class="ovn-cat-weight">${cat.weight}%</span>
          </div>
          <div class="ovn-cat-score-row">
            <span class="ovn-cat-score" style="color:${col}">${sc}</span>
            <span class="ovn-cat-of100">/ 100</span>
          </div>
          <div class="ovn-cat-bar"><div class="ovn-cat-fill" style="width:${sc}%;background:${col}"></div></div>
        </div>`;
    }).join("");

    // ── Headline counts ───────────────────────────────────────────────────
    const accentColor = "var(--ov-accent)";
    const textColor   = "var(--sf-text-primary)";
    const critColor   = "#f0584a";
    const warnColor   = "#e0913a";
    const countItems = [
      { value: sum.errorCount || 0,            label: "Errors",       color: critColor },
      { value: sum.warningCount || 0,           label: "Warnings",     color: warnColor },
      { value: sum.infoCount || 0,              label: "Info",         color: accentColor },
      { value: Math.round(testCovPct) + "%",    label: "Test Coverage",color: testCovPct >= 75 ? "#3fb950" : critColor },
      { value: meta.analyzedClasses || 0,       label: "Apex Classes", color: textColor },
      { value: meta.analyzedTriggers || 0,      label: "Triggers",     color: textColor },
      { value: meta.analyzedFlows || 0,         label: "Flows",        color: textColor },
      { value: lwcCount,                         label: "LWC",          color: textColor },
      { value: meta.analyzedObjects || 0,        label: "Objects",      color: textColor },
    ];
    const countCards = countItems.map(c => `
      <div class="ovn-count-card">
        <div class="ovn-count-value" style="color:${c.color}">${c.value}</div>
        <div class="ovn-count-label">${c.label}</div>
      </div>`).join("");

    // ── Apex code size ────────────────────────────────────────────────────
    const ci = results.codeInventory;
    const apexUsed  = (ci && ci.apexCodeChars) || 0;
    const apexLimit = (ci && ci.apexCodeCharLimit) || 6000000;
    const apexPct   = apexLimit > 0 ? Math.min(100, (apexUsed / apexLimit) * 100) : 0;
    const apexColor = apexPct >= 85 ? "#f0584a" : apexPct >= 60 ? "#e0913a" : "#3fb950";
    const apexCard = `
      <div class="ovn-apex-card">
        <div class="ovn-apex-header">
          <span class="ovn-apex-title">Apex code size</span>
          <span class="ovn-apex-pct" style="color:${apexColor}">${apexPct < 1 ? "<1" : Math.round(apexPct)}% of limit</span>
        </div>
        <div class="ovn-apex-track">
          <div class="ovn-apex-fill" style="width:${Math.max(apexPct, 0.2)}%;background:${apexColor}"></div>
        </div>
        <div class="ovn-apex-note">${Number(apexUsed).toLocaleString()} / ${Number(apexLimit).toLocaleString()} chars</div>
      </div>`;

    // ── Footer: data usage + export ───────────────────────────────────────
    const aiUsed = (typeof securityMode !== "undefined") && securityMode !== "safe";
    const modeLabel = (typeof getSecurityModeLabel !== "undefined") ? getSecurityModeLabel() : "Safe Mode";
    const privacyItems = [
      "No record data accessed",
      "No PII processed (emails, names, IPs)",
      "No data stored externally",
      `AI: ${aiUsed ? "anonymised insights only" : "disabled (Safe Mode)"}`,
      `User-selected scan mode`,
      "Full control over shared data",
    ];
    const footerRow = `
      <div class="ovn-footer">
        <div class="ovn-data-card">
          <div class="ovn-data-header">
            <span class="ovn-data-title">Data usage &amp; security</span>
            <span class="ovn-mode-pill">${escHtml(modeLabel)}</span>
          </div>
          <div class="ovn-privacy-grid">
            ${privacyItems.map(p => `
              <div class="ovn-privacy-item">
                <span class="ovn-check">✔</span>${escHtml(p)}
              </div>`).join("")}
          </div>
          <div class="ovn-data-footer">Enriched AI insights enabled — no raw code or PII shared.</div>
        </div>
        <div class="ovn-export-card">
          <div class="ovn-export-title">Export all issues</div>
          <div class="ovn-export-sub">${totalIssues} issues across all categories</div>
          <div class="ovn-export-btns">
            <button class="ovn-export-btn" data-action="export-issues-csv">Export CSV</button>
            <button class="ovn-export-btn" data-action="export-issues-excel">Export Excel</button>
            <button class="ovn-export-btn" data-action="export-issues-pdf">Export PDF</button>
          </div>
        </div>
      </div>`;

    return `
      ${incompleteBanner}
      ${orgIdentityStrip}
      <div class="ovn-hero">
        ${gradeCard}
        ${attentionPanel}
      </div>
      <div class="ovn-section-header">
        <span class="ovn-section-label">Category scores</span>
        <span class="ovn-section-sub">weighted contribution to overall grade</span>
      </div>
      <div class="ovn-cat-grid">${catCards}</div>
      <div class="ovn-counts-grid">${countCards}</div>
      ${apexCard}
      ${footerRow}`;
  }

  // ── Executive Overview helpers (v1.10) ────────────────────────────────────

  function renderIncompleteBanner() {
    const warnings = (results.metadata && results.metadata.warnings) || [];
    if (!warnings.length) return "";
    return `
      <div class="incomplete-banner" style="display:flex;gap:10px;align-items:flex-start;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.45);border-radius:8px;padding:12px 14px;margin-bottom:16px">
        <span style="font-size:18px;line-height:1">⚠️</span>
        <div style="font-size:12px;line-height:1.5">
          <strong>Partial results.</strong> ${warnings.length} analysis section${warnings.length > 1 ? "s" : ""} could not be completed, so a "0" there may mean "not scanned" rather than "no issues":
          <span style="color:var(--sf-text-muted)">${warnings.map(escHtml).join(", ")}</span>.
          Check the OrgPulse output channel for details and re-run.
        </div>
      </div>`;
  }

  function renderTrendBadge() {
    const trends = results.trends || [];
    if (trends.length < 2) {
      return `<div class="trend-badge" style="font-size:11px;color:var(--sf-text-muted);text-align:center;margin-top:4px">First run — trend appears next time</div>`;
    }
    const curr = trends[trends.length - 1];
    const prev = trends[trends.length - 2];
    const delta = Math.round((curr.overall || 0) - (prev.overall || 0));
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "▬";
    const col = delta > 0 ? "var(--sf-success, #2e844a)" : delta < 0 ? "var(--sf-critical, #ea001e)" : "var(--sf-text-muted)";
    const label = delta === 0 ? "no change vs last run" : `${arrow} ${Math.abs(delta)} pt${Math.abs(delta) > 1 ? "s" : ""} vs last run`;
    return `<div class="trend-badge" style="font-size:12px;font-weight:700;text-align:center;margin-top:4px;color:${col}">${label}</div>`;
  }

  function renderLiveLimitsSection() {
    const limits = (results.orgLimits || []).slice();
    if (!limits.length) return "";
    limits.sort((a, b) => (b.usedPct || 0) - (a.usedPct || 0));
    const rows = limits
      .map((l) => {
        const pct = l.usedPct || 0;
        const cls = pct >= 90 ? "c-critical" : pct >= 75 ? "c-fair" : "c-good";
        const barCol = pct >= 90 ? "#ea001e" : pct >= 75 ? "#fe9339" : "#2e844a";
        return `
        <tr>
          <td>${escHtml(l.label || l.name)}</td>
          <td style="text-align:right">${Number(l.used).toLocaleString()}</td>
          <td style="text-align:right">${Number(l.max).toLocaleString()}</td>
          <td style="width:160px">
            <div class="cat-score-bar"><div class="cat-score-bar-fill" style="width:${Math.min(100, pct)}%;background:${barCol}"></div></div>
          </td>
          <td class="${cls}" style="text-align:right;font-weight:700">${pct}%</td>
        </tr>`;
      })
      .join("");
    return `
      <div class="mb-24">
        <div class="section-title">📊 Live Governor Limits <span style="font-size:11px;color:var(--sf-text-muted);font-weight:400">(current org usage via REST /limits)</span></div>
        <table class="data-table" style="width:100%;font-size:12px">
          <thead><tr><th>Limit</th><th style="text-align:right">Used</th><th style="text-align:right">Max</th><th>Utilisation</th><th style="text-align:right">%</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderScoreRing(score) {
    const r = 52;
    const circ = 2 * Math.PI * r;
    const dash = circ * (score / 100);
    const gap = circ - dash;
    const col = scoreColor(score);
    return `
      <div class="score-ring-container">
        <svg class="score-ring-svg" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--sf-border)" stroke-width="10"/>
          <circle cx="65" cy="65" r="${r}" fill="none" stroke="${col}" stroke-width="10"
            stroke-dasharray="${dash} ${gap}"
            stroke-dashoffset="${circ * 0.25}"
            stroke-linecap="round"
            style="transition:stroke-dasharray 0.8s ease"/>
        </svg>
        <div class="score-ring-center">
          <div class="ring-value ${scoreColorClass(score)}">${score}</div>
          <div class="ring-label">/ 100</div>
        </div>
      </div>`;
  }

  function renderCatCard(cat, score) {
    const col = scoreColor(score);
    return `
      <div class="cat-score-card" data-action="activate-tab" data-tab="${cat.tab}" title="View ${cat.label} details" style="cursor:pointer">
        <div class="cat-score-header">
          <span class="cat-icon">${cat.icon}</span>
          <span class="cat-weight-pill">${cat.weight}%</span>
        </div>
        <div class="cat-score-value ${scoreColorClass(score)}">${score}</div>
        <div class="cat-score-name">${cat.label}</div>
        <div class="cat-score-bar"><div class="cat-score-bar-fill" style="width:${score}%;background:${col}"></div></div>
      </div>`;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // CODE QUALITY TAB (merged: Code Quality + Technical Debt)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderCodeQuality() {
    const codeIssues = results.issues.filter(
      (i) => i.category === "code-quality",
    );
    const debtIssues = results.issues.filter(
      (i) => i.category === "technical-debt",
    );
    const allIssues = [...codeIssues, ...debtIssues];
    const debt = results.debtSummary;
    const s = results.scores || {};

    const tabInfo = renderTabInfo("codequality", [
      "<strong>Data source</strong>: All active Apex Classes and Apex Triggers via Tooling API (<code>ApexClass WHERE Status='Active' AND NamespacePrefix=null</code>). Managed-package classes are excluded.",
      "<strong>Anti-pattern detection</strong> scans Apex class bodies for: missing <code>with sharing</code> / <code>without sharing</code>, SOQL/DML inside loops, bare try-catch blocks, hardcoded IDs, and God Classes (classes >500 lines).",
      "<strong>Test coverage</strong> is read from <code>ApexCodeCoverageAggregate</code>. Classes below 75% are flagged as warnings; below 0% test presence is an error.",
      "<strong>Technical Debt score</strong> is calculated by weighting issue counts by severity (error=10, warning=3, info=1) against total lines of Apex code analysed.",
      "<strong>Issues are categorised</strong> as: <em>code-quality</em> (structural problems in Apex) and <em>technical-debt</em> (maintainability concerns like missing descriptions, complex nesting).",
      "<strong>Apex Trigger rules</strong> enforce one-trigger-per-object, no DML/SOQL in trigger bodies, and no logic directly in the trigger (prefer handler classes).",
      "<strong>Scoring</strong>: Code Quality score starts at 100 and deducts points for each issue weighted by severity and the proportion of your codebase affected.",
      "<strong>Code inventory</strong>: Batch/Queueable/Schedulable counts are detected from class bodies (<code>implements</code> clause); Scheduled Jobs are active <code>CronTrigger</code> records (Scheduled Apex). <strong>LWC quality</strong> is now shown in this tab.",
    ]);

    const errors = allIssues.filter((i) => i.severity === "error");
    const warnings = allIssues.filter((i) => i.severity === "warning");
    const infos = allIssues.filter((i) => i.severity === "info");

    // Anti-pattern detection
    const antiPatterns = {
      noSharing: codeIssues.filter((i) =>
        /sharing|with.sharing|without.sharing/i.test(
          i.ruleId || i.message || "",
        ),
      ).length,
      longMethods: codeIssues.filter((i) =>
        /method.length|too.long|lines/i.test(i.ruleId || i.message || ""),
      ).length,
      hardcodedIds: codeIssues.filter((i) =>
        /hardcoded|hard.coded/i.test(i.ruleId || i.message || ""),
      ).length,
      soqlInLoop: codeIssues.filter((i) =>
        /soql.in.loop|soql_in_loop/i.test(i.ruleId || i.message || ""),
      ).length,
      dmlInLoop: codeIssues.filter((i) =>
        /dml.in.loop|dml_in_loop/i.test(i.ruleId || i.message || ""),
      ).length,
    };

    const apTotal = Object.values(antiPatterns).reduce((a, b) => a + b, 0);
    const sprints = debt ? debt.sprintCycles : 0;
    const quickWins = debt ? (debt.quickWins || []).length : infos.length;
    const large = debt ? (debt.largeItems || []).length : errors.length;
    const medium = debt ? (debt.mediumItems || []).length : warnings.length;

    // Top 10 most problematic classes
    const classMap = {};
    allIssues.forEach((iss) => {
      const cls = iss.file ? shortPath(iss.file) : iss.object || "Unknown";
      if (!classMap[cls]) classMap[cls] = { errors: 0, warnings: 0, total: 0 };
      classMap[cls].total++;
      if (iss.severity === "error") classMap[cls].errors++;
      else if (iss.severity === "warning") classMap[cls].warnings++;
    });
    const topClasses = Object.entries(classMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    // Canonical inventory + coverage (from the analysis pipeline)
    const meta = results.metadata || {};
    const ci = results.codeInventory || {};
    const cov = results.testCoverageSummary;
    const lwcSum = results.lwcSummary;
    const lwcCount = (lwcSum && lwcSum.totalComponents) || meta.analyzedLwcComponents || 0;
    const covPct =
      cov && typeof cov.averageCoverage === "number" ? cov.averageCoverage : s.testing || 0;
    const covCls = covPct >= 85 ? "c-excellent" : covPct >= 75 ? "c-fair" : "c-critical";
    const cqCard = (num, label, cls) =>
      `<div class="lwc-summary-card"><div class="lwc-summary-num ${cls || ""}">${num}</div><div class="lwc-summary-label">${label}</div></div>`;
    // Test-coverage offenders surfaced as issues (category 'testing')
    const coverageIssues = results.issues.filter((i) => i.category === "testing");
    const coverageRows = coverageIssues
      .slice(0, 200)
      .map((iss) => [
        `<span style="font-weight:600">${escHtml(iss.object || (iss.file ? shortPath(iss.file) : "—"))}</span>`,
        `<span class="${iss.severity === "error" ? "c-critical" : "c-fair"}">${escHtml(iss.message)}</span>`,
      ]);

    return `
      ${tabInfo}
      <!-- Code Inventory by component type -->
      <div class="mb-24">
        <div class="section-title">💻 Code Inventory & Quality</div>
        <div class="lwc-summary-cards">
          ${cqCard(s.codeQuality || 0, "Quality Score", scoreColorClass(s.codeQuality || 0))}
          ${cqCard(covPct + "%", "Test Coverage", covCls)}
          ${cqCard(ci.apexClasses != null ? ci.apexClasses : meta.analyzedClasses || 0, "Apex Classes")}
          ${cqCard(ci.apexTriggers != null ? ci.apexTriggers : meta.analyzedTriggers || 0, "Triggers")}
          ${cqCard(lwcCount, "LWC")}
          ${cqCard(meta.analyzedFlows || 0, "Flows")}
          ${cqCard(ci.batchClasses || 0, "Batch")}
          ${cqCard(ci.queueableClasses || 0, "Queueable")}
          ${cqCard(ci.schedulableClasses || 0, "Schedulable")}
          ${cqCard(ci.scheduledJobs || 0, "Scheduled Jobs")}
        </div>
      </div>

      <!-- Issue severity / anti-pattern roll-up -->
      <div class="mb-24">
        <div class="section-title">🚦 Apex Issue Breakdown</div>
        <div class="lwc-summary-cards">
          ${cqCard(errors.length, "Critical", "c-critical")}
          ${cqCard(warnings.length, "Warnings", "c-fair")}
          ${cqCard(infos.length, "Info", "c-good")}
          ${cqCard(apTotal, "Anti-Patterns", apTotal > 10 ? "c-critical" : apTotal > 5 ? "c-fair" : "c-excellent")}
          ${cqCard(sprints || allIssues.length, sprints ? "Sprint Cycles" : "Total Items", sprints > 10 ? "c-critical" : "")}
        </div>
      </div>

      <!-- Anti-Pattern Breakdown -->
      ${
        apTotal > 0
          ? `
      <div class="mb-24">
        <div class="section-title">🚨 Anti-Pattern Detection</div>
        <div class="perf-summary-grid">
          ${antiPatterns.noSharing ? `<div class="perf-summary-card sev-border-error"><div class="perf-summary-top"><span class="perf-summary-icon">🔓</span><span class="perf-summary-count c-critical">${antiPatterns.noSharing}</span></div><div class="perf-summary-label">Missing Sharing Declaration</div><div class="perf-summary-tip">Classes without 'with sharing' bypass record-level security — a Security Review blocker.</div></div>` : ""}
          ${antiPatterns.longMethods ? `<div class="perf-summary-card sev-border-warning"><div class="perf-summary-top"><span class="perf-summary-icon">📏</span><span class="perf-summary-count c-fair">${antiPatterns.longMethods}</span></div><div class="perf-summary-label">Long Methods</div><div class="perf-summary-tip">Methods exceeding 50 lines are hard to test and review. Extract helper methods or delegate to separate classes.</div></div>` : ""}
          ${antiPatterns.hardcodedIds ? `<div class="perf-summary-card sev-border-warning"><div class="perf-summary-top"><span class="perf-summary-icon">🔗</span><span class="perf-summary-count c-fair">${antiPatterns.hardcodedIds}</span></div><div class="perf-summary-label">Hardcoded IDs</div><div class="perf-summary-tip">Hardcoded record IDs break when deploying between sandboxes and production. Use Custom Metadata or Custom Settings.</div></div>` : ""}
          ${antiPatterns.soqlInLoop ? `<div class="perf-summary-card sev-border-error"><div class="perf-summary-top"><span class="perf-summary-icon">🔁</span><span class="perf-summary-count c-critical">${antiPatterns.soqlInLoop}</span></div><div class="perf-summary-label">SOQL in Loops</div><div class="perf-summary-tip">Each loop iteration fires a separate query, rapidly consuming the 100-query governor limit.</div></div>` : ""}
          ${antiPatterns.dmlInLoop ? `<div class="perf-summary-card sev-border-error"><div class="perf-summary-top"><span class="perf-summary-icon">💾</span><span class="perf-summary-count c-critical">${antiPatterns.dmlInLoop}</span></div><div class="perf-summary-label">DML in Loops</div><div class="perf-summary-tip">DML inside a loop will hit the 150-DML governor limit and cause rollbacks on bulk operations.</div></div>` : ""}
        </div>
      </div>`
          : ""
      }

      <!-- Debt Priority Breakdown -->
      <div class="mb-24">
        <div class="section-title">💰 Debt Priority Breakdown</div>
        <div class="debt-header-cards" style="margin-bottom:12px">
          <div class="debt-kpi-card"><div class="debt-kpi-value c-critical">${large}</div><div class="debt-kpi-label">Large / Critical</div></div>
          <div class="debt-kpi-card"><div class="debt-kpi-value c-fair">${medium}</div><div class="debt-kpi-label">Medium</div></div>
          <div class="debt-kpi-card"><div class="debt-kpi-value c-excellent">${quickWins}</div><div class="debt-kpi-label">Quick Wins</div></div>
        </div>
      </div>

      <!-- Top 10 Most Problematic Classes -->
      ${
        topClasses.length
          ? `
      <div class="mb-24">
        <div class="section-title">🏆 Top 10 Classes with Most Issues</div>
        ${renderPaginatedDataTable(
          "code-top-classes",
          ["Class / File", "Errors", "Warnings", "Total Issues"],
          topClasses.map(([cls, d]) => [
            '<span style="font-weight:600">' + escHtml(cls) + "</span>",
            '<span class="' +
              (d.errors > 0 ? "c-critical" : "") +
              '">' +
              d.errors +
              "</span>",
            '<span class="' +
              (d.warnings > 0 ? "c-fair" : "") +
              '">' +
              d.warnings +
              "</span>",
            '<span style="font-weight:700">' + d.total + "</span>",
          ]),
        )}
      </div>`
          : ""
      }

      <!-- Test Coverage detail -->
      ${
        cov
          ? `
      <div class="mb-24">
        <div class="section-title">🧪 Test Coverage (${covPct}% org-wide)</div>
        <div class="lwc-summary-cards" style="margin-bottom:12px">
          ${cqCard(covPct + "%", "Avg Coverage", covCls)}
          ${cqCard(cov.totalClasses || 0, "Classes Measured")}
          ${cqCard(cov.classesBelow75 || 0, "Below 75%", (cov.classesBelow75 || 0) > 0 ? "c-fair" : "c-excellent")}
          ${cqCard(cov.zeroCoverageCount || 0, "Zero Coverage", (cov.zeroCoverageCount || 0) > 0 ? "c-critical" : "c-excellent")}
        </div>
        ${
          coverageRows.length
            ? renderPaginatedDataTable("code-coverage", ["Class", "Coverage Finding"], coverageRows, { emptyMsg: "" })
            : `<div style="font-size:12px;color:var(--sf-text-muted)">All measured classes meet the 75% threshold. ✓</div>`
        }
      </div>`
          : ""
      }

      <!-- Lightning Web Components (merged from the former LWC tab) -->
      <div class="mb-24">
        <div class="section-title">🧩 Lightning Web Components</div>
        ${renderLwc()}
      </div>
      `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATION TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderAutomation() {
    const auto = results.automationSummary || {};
    const objectMap = auto.objectMap || {};
    const flowInv = auto.flowInventory || [];
    const wfInv = auto.workflowInventory || [];

    const tabInfo = renderTabInfo("automation", [
      "<strong>Data source</strong>: Active Apex Triggers (<code>ApexTrigger</code>), Flows (<code>Flow</code>/<code>FlowDefinition</code>), Validation Rules (<code>ValidationRule</code>), and classic Workflow Rules (<code>WorkflowRule</code>) — all non-managed-package.",
      "<strong>Flows by type</strong>: Screen, Record-Triggered, Scheduled, Platform-Event, and Auto-Launched (via <em>ProcessType</em>/<em>TriggerType</em>). <strong>Process Builders</strong> are <code>ProcessType=Workflow</code> flows and are counted separately (deprecated).",
      "<strong>Automation by Object</strong> shows real per-object counts of triggers, flows, and validation rules (not just issues). Cells: green=1, amber=2-3, orange=4-5, red >5.",
      "<strong>Architecture signals</strong> flag deprecated Process Builders/Workflow Rules, objects with multiple triggers (undefined execution order), and over-automated objects (>8 combined).",
    ]);

    // Flow-type breakdown (derived from the canonical flow inventory)
    const realFlows = flowInv.filter((f) => f.processType !== "Workflow");
    const recordFlows = flowInv.filter((f) => f.processType === "RecordTriggeredFlow").length;
    const autoLaunched = flowInv.filter((f) => f.processType === "AutoLaunchedFlow").length;
    const screenFlows = auto.totalScreenFlows != null ? auto.totalScreenFlows : flowInv.filter((f) => f.processType === "Flow").length;
    const scheduledFlows = auto.totalScheduledFlows || 0;
    const eventFlows = auto.totalEventFlows || 0;
    const processBuilders = auto.totalProcessBuilders || 0;
    const workflowRules = auto.totalWorkflowRules != null ? auto.totalWorkflowRules : wfInv.length;
    const triggers = auto.totalTriggers || 0;
    const vrules = auto.totalValidationRules || 0;

    const card = (num, label, cls) =>
      `<div class="lwc-summary-card"><div class="lwc-summary-num ${cls || ""}">${num}</div><div class="lwc-summary-label">${label}</div></div>`;
    const prettyType = (t) =>
      ({ Flow: "Screen Flow", AutoLaunchedFlow: "Auto-Launched", RecordTriggeredFlow: "Record-Triggered", Workflow: "Process Builder" })[t] || t || "—";

    // Architecture signals
    const multiTriggerObjects = Object.entries(objectMap).filter(([, d]) => (d.triggers || 0) > 1);
    const overAutomated = Object.entries(objectMap).filter(([, d]) => (d.total || 0) > 8);

    // Per-object inventory (real counts from automationSummary.objectMap)
    const objects = Object.entries(objectMap).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));

    const hasSignals = processBuilders > 0 || workflowRules > 0 || multiTriggerObjects.length > 0 || overAutomated.length > 0;

    return `
      ${tabInfo}

      <!-- Automation inventory KPIs -->
      <div class="mb-24">
        <div class="section-title">⚡ Automation Inventory</div>
        <div class="lwc-summary-cards">
          ${card(triggers, "Apex Triggers")}
          ${card(realFlows.length, "Flows (total)")}
          ${card(recordFlows, "Record-Triggered")}
          ${card(screenFlows, "Screen Flows")}
          ${card(scheduledFlows, "Scheduled")}
          ${card(eventFlows, "Platform-Event")}
          ${card(autoLaunched, "Auto-Launched")}
          ${card(processBuilders, "Process Builders", processBuilders > 0 ? "c-fair" : "c-excellent")}
          ${card(workflowRules, "Workflow Rules", workflowRules > 0 ? "c-fair" : "")}
          ${card(vrules, "Validation Rules")}
        </div>
      </div>

      ${
        hasSignals
          ? `
      <div class="mb-24">
        <div class="section-title">🧠 Architecture Signals</div>
        <div class="perf-summary-grid">
          ${processBuilders > 0 ? `<div class="perf-summary-card sev-border-warning"><div class="perf-summary-top"><span class="perf-summary-icon">🛠️</span><span class="perf-summary-count c-fair">${processBuilders}</span></div><div class="perf-summary-label">Process Builders</div><div class="perf-summary-tip">Deprecated — Salesforce is retiring Process Builder. Migrate to Record-Triggered Flows.</div></div>` : ""}
          ${workflowRules > 0 ? `<div class="perf-summary-card sev-border-warning"><div class="perf-summary-top"><span class="perf-summary-icon">📜</span><span class="perf-summary-count c-fair">${workflowRules}</span></div><div class="perf-summary-label">Workflow Rules</div><div class="perf-summary-tip">Classic Workflow Rules are legacy — consolidate into Flows for a single automation model.</div></div>` : ""}
          ${multiTriggerObjects.length ? `<div class="perf-summary-card sev-border-error"><div class="perf-summary-top"><span class="perf-summary-icon">⚠️</span><span class="perf-summary-count c-critical">${multiTriggerObjects.length}</span></div><div class="perf-summary-label">Objects with Multiple Triggers</div><div class="perf-summary-tip">Multiple triggers per object give undefined execution order. Use one trigger + handler per object.</div></div>` : ""}
          ${overAutomated.length ? `<div class="perf-summary-card sev-border-warning"><div class="perf-summary-top"><span class="perf-summary-icon">🔥</span><span class="perf-summary-count c-fair">${overAutomated.length}</span></div><div class="perf-summary-label">Over-Automated Objects</div><div class="perf-summary-tip">More than 8 combined automations on one object — high recursion and maintenance risk.</div></div>` : ""}
        </div>
      </div>`
          : ""
      }

      <!-- Automation by object (real counts) -->
      <div class="mb-24">
        <div class="section-title">📊 Automation by Object (${objects.length})</div>
        <div class="heatmap-wrap">
          <table class="sf-table sf-table--heatmap">
            <thead>
              <tr><th>Object</th><th>Triggers</th><th>Flows</th><th>Validations</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${
                objects.length === 0
                  ? `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--sf-text-muted)">No automation detected ✅</td></tr>`
                  : objects
                      .map(
                        ([obj, d]) => `
                  <tr>
                    <td>${escHtml(obj)}</td>
                    <td><span class="heatmap-cell ${hmClass(d.triggers)}">${d.triggers || "—"}</span></td>
                    <td><span class="heatmap-cell ${hmClass(d.flows)}">${d.flows || "—"}</span></td>
                    <td><span class="heatmap-cell ${hmClass(d.validations)}">${d.validations || "—"}</span></td>
                    <td><span class="heatmap-cell ${hmClass(d.total)}" style="font-size:14px">${d.total}</span></td>
                  </tr>`,
                      )
                      .join("")
              }
            </tbody>
            <tfoot>
              <tr><td colspan="5">Cells coloured by count: green=1, amber=2-3, orange=4-5, red>5</td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      ${
        realFlows.length
          ? `
      <div class="mb-24">
        <div class="section-title">🔄 Flow Inventory (${realFlows.length})</div>
        ${renderPaginatedDataTable(
          "auto-flows",
          ["Flow Name", "Type", "Object", "Status"],
          realFlows.map((f) => [
            `<span style="font-weight:600">${escHtml(f.name)}</span>`,
            escHtml(prettyType(f.processType)),
            escHtml(f.objectApiName || "—"),
            `<span class="${f.isActive ? "pill-ok" : "pill-warn"}">${f.isActive ? "Active" : "Inactive"}</span>`,
          ]),
        )}
      </div>`
          : ""
      }

      ${
        wfInv.length
          ? `
      <div class="mb-24">
        <div class="section-title">📜 Workflow Rules (${wfInv.length})</div>
        ${renderPaginatedDataTable(
          "auto-wf",
          ["Workflow Rule", "Object"],
          wfInv.map((w) => [
            `<span style="font-weight:600">${escHtml(w.name)}</span>`,
            escHtml(w.objectApiName || "—"),
          ]),
        )}
      </div>`
          : ""
      }`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA MODEL TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDataModel() {
    const dmIssues = results.issues.filter((i) => i.category === "data-model");
    const stats = results.dataModelStats || [];
    const autoSum = results.automationSummary || {};
    const autoMap = autoSum.objectMap || {};

    const tabInfo = renderTabInfo("datamodel", [
      "<strong>Objects fetched via</strong> <code>EntityDefinition</code> (Tooling API) — all <em>IsCustomizable=true</em> objects including standard and custom.",
      "<strong>Standard objects</strong> (e.g. Account, Contact) are shown only when they have custom fields, flows, triggers, or validation rules. All <code>__c</code> custom objects are always included.",
      "<strong>Custom field counts</strong> use <code>CustomField WHERE NamespacePrefix = null</code> to exclude managed-package fields.",
      "<strong>Unused fields</strong> are custom fields with <em>no references</em> in the Salesforce <strong>Dependency API</strong> (<code>MetadataComponentDependency</code>) — matched by component Id, name, or local workspace usage. This is <em>reference-based, not last-used-date</em>; it reflects metadata references (Apex, flows, layouts, reports) but not hard-coded external integrations. Falls back to a workspace-only estimate if the Dependency API is unavailable.",
      "<strong>Triggers, Flows, Validation Rules</strong> are aggregate counts from <code>ApexTrigger</code>, <code>Flow</code>, and <code>ValidationRule</code> Tooling API objects grouped by <code>EntityDefinitionId</code>.",
      "<strong>Field Limit %</strong> = Custom Fields ÷ 800 × 100. Objects above 25% are flagged in the Governor Limit Risk table above the main matrix.",
      "<strong>Managed-package objects</strong> are filtered out in JavaScript: custom objects with a namespace prefix pattern (<code>ns__Name__c</code>) are excluded from the results.",
    ]);

    // ── Summary KPIs ──────────────────────────────────────────────────────
    const totalCustFields = stats.reduce(
      (s, o) => s + (o.customFields || o.totalFields || 0),
      0,
    );
    const totalFields = stats.reduce((s, o) => s + (o.totalFields || 0), 0);
    const unusedFields = stats.reduce((s, o) => s + (o.unusedFields || 0), 0);
    const unusedPct = totalCustFields
      ? Math.round((unusedFields / totalCustFields) * 100)
      : 0;
    const totalTriggers = autoSum.totalTriggers || 0;
    const totalFlows = autoSum.totalFlows || 0;
    const totalVRules = autoSum.totalValidationRules || 0;
    const inv = results.orgInventory || {};
    const recordTypeCount = inv.recordTypeCount || 0;
    const pageLayoutCount = inv.pageLayoutCount || 0;
    const flexiPageCount = inv.flexiPageCount || 0;

    // Objects approaching the 800-custom-field governor limit
    const limitRiskObjects = stats
      .filter((s) => (s.fieldLimitPct || 0) > 25)
      .sort((a, b) => (b.fieldLimitPct || 0) - (a.fieldLimitPct || 0));

    // Merge all objects from stats + automation for the master table
    const allObjects = new Set([
      ...stats.map((s) => s.objectName),
      ...Object.keys(autoMap),
    ]);

    // Build merged rows
    const mergedRows = Array.from(allObjects)
      .map((obj) => {
        const fs = stats.find((s) => s.objectName === obj) || {};
        const am = autoMap[obj] || {};
        return {
          obj,
          objLabel: fs.objectLabel || obj,
          stdFields: fs.standardFields != null ? fs.standardFields : null,
          custFields:
            fs.customFields != null ? fs.customFields : fs.totalFields || 0,
          totalFields: fs.totalFields || 0,
          unusedFields: fs.unusedFields || 0,
          fieldLimitPct: fs.fieldLimitPct || 0,
          triggers: am.triggers || 0,
          flows: am.flows || 0,
          validations: am.validations || 0,
        };
      })
      .filter((r) => {
        // Keep ALL custom objects; standard objects only if they have custom fields, flows, triggers, or validation rules
        if (r.obj.endsWith("__c")) return true;
        return (
          r.custFields > 0 || r.triggers > 0 || r.flows > 0 || r.validations > 0
        );
      })
      .sort((a, b) => {
        // Custom objects first, then by custom field count desc
        const ac = a.obj.endsWith("__c") ? 1 : 0;
        const bc = b.obj.endsWith("__c") ? 1 : 0;
        if (ac !== bc) {
          return bc - ac;
        }
        return b.custFields - a.custFields;
      });

    const hasData = mergedRows.length > 0;

    // ── Flow inventory table ──────────────────────────────────────────────
    const flowList = (autoSum.flowInventory || []).slice(0, 50);

    // ── Field Limit Risk mini-table ───────────────────────────────────────
    const limitRiskHtml = limitRiskObjects.length
      ? `
      <div class="mb-24">
        <div class="section-title">⚠️ Objects Approaching Field Governor Limit (>25% of 800)</div>
        ${renderPaginatedDataTable(
          "dm-limit-risk",
          [
            "Object",
            "Custom Fields",
            "Total",
            "Limit %",
            "Status",
          ],
          limitRiskObjects.map((o) => {
            const pct = o.fieldLimitPct || 0;
            const statusCls =
              pct >= 75
                ? "pill-critical"
                : pct >= 50
                  ? "pill-warn"
                  : "pill-caution";
            const statusLabel =
              pct >= 75
                ? "🔴 Critical"
                : pct >= 50
                  ? "🟠 At Risk"
                  : "🟡 Caution";
            return [
              `<span style="font-weight:600">${escHtml(o.objectLabel || o.objectName)}</span><br><span style="font-size:11px;color:var(--sf-text-muted)">${escHtml(o.objectName)}</span>`,
              String(o.customFields != null ? o.customFields : "—"),
              String(o.totalFields || "—"),
              `<span class="${pct >= 50 ? "c-critical" : "c-fair"}">${pct}%</span>`,
              `<span class="${statusCls}">${statusLabel}</span>`,
            ];
          }),
          { emptyMsg: "" },
        )}
      </div>`
      : "";

    return `
      <div class="mb-24">
        <div class="lwc-summary-cards">
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${mergedRows.length}</div>
            <div class="lwc-summary-label">Objects</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${totalCustFields}</div>
            <div class="lwc-summary-label">Custom Fields</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${unusedPct > 30 ? "c-critical" : unusedPct > 15 ? "c-fair" : "c-excellent"}">${unusedFields}</div>
            <div class="lwc-summary-label">Potentially Unused</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${totalTriggers}</div>
            <div class="lwc-summary-label">Triggers</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${totalFlows}</div>
            <div class="lwc-summary-label">Flows</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${totalVRules}</div>
            <div class="lwc-summary-label">Validation Rules</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${recordTypeCount}</div>
            <div class="lwc-summary-label">Record Types</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${pageLayoutCount}</div>
            <div class="lwc-summary-label">Page Layouts</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${flexiPageCount}</div>
            <div class="lwc-summary-label">Lightning Pages</div>
          </div>
        </div>
      </div>

      ${limitRiskHtml}

      <div class="mb-24">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="section-title" style="margin-bottom:0">🗄️ Object Health Matrix (${mergedRows.length} objects)</div>
          ${hasData ? '<button class="btn btn-ghost" data-action="export-dm-csv" style="font-size:11px;padding:5px 12px">📥 Export CSV</button>' : ""}
        </div>
        <div style="font-size:11px;color:var(--sf-text-muted);margin:-4px 0 10px">
          ♻ <strong>Unused</strong> = custom fields with no references in the Salesforce Dependency API
          (<code>MetadataComponentDependency</code>) — reference-based, not last-used date.
        </div>
        ${
          hasData
            ? renderPaginatedDataTable(
                "dm-objects",
                [
                  "Object",
                  "Custom Fields",
                  "Unused ♻",
                  "Triggers",
                  "Flows",
                  "Validations",
                  "Status",
                ],
                mergedRows.map((r) => {
                  const unusedRatio = r.custFields
                    ? r.unusedFields / r.custFields
                    : 0;
                  const hasMultiTrigger = r.triggers > 1;
                  const hasIssues =
                    unusedRatio > 0.3 ||
                    hasMultiTrigger ||
                    r.flows + r.triggers + r.validations > 8 ||
                    r.fieldLimitPct > 50;
                  const statusCls = hasIssues ? "pill-warn" : "pill-ok";
                  const statusLabel = hasIssues ? "△ Review" : "✓ OK";
                  const labelHtml =
                    r.objLabel !== r.obj
                      ? `<span style="font-weight:600">${escHtml(r.objLabel)}</span><br><span style="font-size:11px;color:var(--sf-text-muted)">${escHtml(r.obj)}</span>`
                      : `<span style="font-weight:600">${escHtml(r.obj)}</span>`;
                  return [
                    labelHtml,
                    `<span class="${r.fieldLimitPct > 50 ? "c-critical" : r.fieldLimitPct > 25 ? "c-fair" : ""}" title="${r.fieldLimitPct}% of 800-field limit">${r.custFields != null ? r.custFields : 0}</span>`,
                    `<span class="${r.unusedFields > 0 && unusedRatio > 0.3 ? "c-fair" : ""}">${r.unusedFields || 0}</span>`,
                    `<span class="${hasMultiTrigger ? "c-critical" : ""}">${r.triggers || 0}</span>`,
                    `<span class="${r.flows > 3 ? "c-fair" : ""}">${r.flows || 0}</span>`,
                    `<span class="${r.validations > 8 ? "c-fair" : ""}">${r.validations || 0}</span>`,
                    `<span class="${statusCls}">${statusLabel}</span>`,
                  ];
                }),
                {
                  emptyMsg:
                    "No data model analysis results — run a full org analysis to populate this table.",
                },
              )
            : `<div style="text-align:center;padding:20px;color:var(--sf-text-muted)">No data model analysis results — run a full org analysis to populate this table.</div>`
        }
      </div>

      ${
        flowList.length
          ? `
      <div class="mb-24">
        <div class="section-title">🔄 Flow Inventory (${(autoSum.flowInventory || []).length} flows)</div>
        ${renderPaginatedDataTable(
          "dm-flows",
          ["Flow Name", "Type", "Object", "Status"],
          flowList.map((f) => [
            `<span style="font-weight:600">${escHtml(f.name)}</span>`,
            escHtml(f.processType || "—"),
            escHtml(f.objectApiName || "—"),
            `<span class="${f.isActive ? "pill-ok" : "pill-warn"}">${f.isActive ? "Active" : "Inactive"}</span>`,
          ]),
        )}
      </div>`
          : ""
      }`;
  }

  /** Export the Object Health Matrix table data as CSV.
   * URL.createObjectURL is blocked in VS Code webviews — we send the CSV
   * content to the extension host which writes it via the VS Code file API.
   */
  function exportDataModelCsv() {
    if (!results) return;
    const stats = results.dataModelStats || [];
    const autoSum = results.automationSummary || {};
    const autoMap = autoSum.objectMap || {};
    const allObjects = new Set([
      ...stats.map((s) => s.objectName),
      ...Object.keys(autoMap),
    ]);
    const rows = Array.from(allObjects)
      .map((obj) => {
        const fs = stats.find((s) => s.objectName === obj) || {};
        const am = autoMap[obj] || {};
        return {
          obj,
          objLabel: fs.objectLabel || obj,
          custFields:
            fs.customFields != null ? fs.customFields : fs.totalFields || 0,
          unusedFields: fs.unusedFields || 0,
          triggers: am.triggers || 0,
          flows: am.flows || 0,
          validations: am.validations || 0,
          fieldLimitPct: fs.fieldLimitPct || 0,
        };
      })
      .filter((r) => {
        if (r.obj.endsWith("__c")) return true;
        return (
          r.custFields > 0 || r.triggers > 0 || r.flows > 0 || r.validations > 0
        );
      })
      .sort((a, b) => {
        const ac = a.obj.endsWith("__c") ? 1 : 0;
        const bc = b.obj.endsWith("__c") ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return b.custFields - a.custFields;
      });
    const csvHeaders =
      "Object API Name,Object Label,Custom Fields,Unused Fields,Triggers,Flows,Validation Rules,Field Limit %";
    const csvRows = rows.map(
      (r) =>
        `"${r.obj}","${r.objLabel}",${r.custFields},${r.unusedFields},${r.triggers},${r.flows},${r.validations},${r.fieldLimitPct}`,
    );
    const csv = [csvHeaders, ...csvRows].join("\n");
    // Send to extension host — VS Code webviews block URL.createObjectURL
    vscode.postMessage({
      command: "exportDataModelCsv",
      data: { csv, fileName: "data-model-health.csv" },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE & LIMITS TAB (merged: Performance + Governor Limits + Simulator)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderPerformanceLimits() {
    const perfIssues = results.issues.filter(
      (i) => i.category === "performance",
    );
    const limIssues = results.issues.filter(
      (i) => i.category === "governor-limits",
    );
    const risks = results.governorRisks || [];
    const simData = (results && results.limitsSimulatorData) || [];
    const entryPoints = (results && results.entryPoints) || [];
    const recordCounts = (results && results.objectRecordCounts) || {};

    const tabInfo = renderTabInfo("performance", [
      "<strong>Data source</strong>: Apex class bodies are scanned locally for patterns like SOQL in loops, DML in loops, missing LIMIT clauses, and non-selective queries.",
      "<strong>SOQL in Loops</strong>: Detected when a SOQL statement (<code>[SELECT ...]</code>) appears inside a <code>for</code>, <code>while</code>, or <code>do-while</code> block. Each loop iteration consumes one of your 100 SOQL query governor limit slots.",
      "<strong>Non-selective Queries</strong>: SOQL queries without a WHERE clause on an indexed field or with a leading wildcard (<code>LIKE '%term'</code>) are flagged. These cause full table scans on large data volumes (LDV).",
      "<strong>Governor Limits Simulator</strong>: Uses static analysis of SOQL/DML call counts per Apex entry point and projects usage at configurable record volumes (200, 1k, 5k, 50k).",
      "<strong>Record counts</strong> are fetched via <code>COUNT()</code> SOQL on key objects to provide LDV context for each object in the simulator.",
      "<strong>Query Plan</strong>: The EXPLAIN query plan feature calls the Tooling API <code>QueryPlan</code> resource to reveal cardinality and index usage for specific SOQL queries.",
      "<strong>Scoring</strong>: Performance score deducts points for SOQL-in-loop (−10 each), DML-in-loop (−8 each), non-selective queries (−5 each), and queries without LIMIT (−3 each).",
    ]);

    // Initialize simulator data
    SIM_DATA = simData;

    // ── Performance Summary Pointers ────────────────────────────────────
    const soqlInLoop = perfIssues.filter((i) =>
      /soql.in.loop|soql_in_loop/i.test(i.ruleId || ""),
    ).length;
    const dmlInLoop = perfIssues.filter((i) =>
      /dml.in.loop|dml_in_loop/i.test(i.ruleId || ""),
    ).length;
    const nonSelect = perfIssues.filter((i) =>
      /non.selective|non_selective/i.test(i.ruleId || ""),
    ).length;
    const withoutLim = perfIssues.filter((i) =>
      /without.limit|no.limit/i.test(i.ruleId || ""),
    ).length;

    const summaryItems = [
      soqlInLoop > 0 && {
        icon: "🔁",
        label: "SOQL in Loops",
        value: soqlInLoop,
        sev: "error",
        tip: "Each loop iteration fires a separate SOQL query, rapidly consuming the 100-query governor limit.",
      },
      dmlInLoop > 0 && {
        icon: "💾",
        label: "DML in Loops",
        value: dmlInLoop,
        sev: "error",
        tip: "DML inside a loop will hit the 150-DML governor limit and cause rollbacks on bulk operations.",
      },
      nonSelect > 0 && {
        icon: "🔍",
        label: "Non-selective Queries",
        value: nonSelect,
        sev: "warning",
        tip: "Queries without selective filters force full-table scans, causing timeouts on large orgs (> 100k records).",
      },
      withoutLim > 0 && {
        icon: "∞",
        label: "Queries Without LIMIT",
        value: withoutLim,
        sev: "warning",
        tip: "Unbounded queries can return up to 50,000 rows, which exhausts heap and can trigger CPU-time limits.",
      },
      risks.length > 0 && {
        icon: "⚡",
        label: "Classes at Risk (est.)",
        value: risks.length,
        sev: "info",
        tip: "Apex classes with predicted governor-limit utilisation above 40% under bulk load.",
      },
    ].filter(Boolean);

    // ── Governor Gauge Data ──────────────────────────────────────────────
    function predVal(r, dim) {
      const p = r.prediction;
      if (!p) return 0;
      const v = p[dim];
      if (v === null || v === undefined) return 0;
      if (typeof v === "object") return Number(v.estimated) || 0;
      return Number(v) || 0;
    }

    const gaugeData = [
      {
        label: "SOQL Queries",
        value: risks.reduce(
          (m, r) => Math.max(m, predVal(r, "soqlQueries")),
          0,
        ),
        limit: 100,
      },
      {
        label: "DML Statements",
        value: risks.reduce(
          (m, r) => Math.max(m, predVal(r, "dmlStatements")),
          0,
        ),
        limit: 150,
      },
      {
        label: "CPU Time (ms)",
        value: risks.reduce((m, r) => Math.max(m, predVal(r, "cpuTime")), 0),
        limit: 10000,
      },
      {
        label: "Heap (KB)",
        value: Math.round(
          risks.reduce((m, r) => Math.max(m, predVal(r, "heapSize")), 0) / 1024,
        ),
        limit: 6000,
      },
    ];

    // ── LDV Objects ──────────────────────────────────────────────────────
    const ldvObjects = Object.entries(recordCounts)
      .filter(([, cnt]) => cnt >= 500000)
      .sort((a, b) => b[1] - a[1]);

    return `
      ${tabInfo}
      <!-- Live Governor Limits (REST /limits) -->
      ${renderLiveLimitsSection()}
      <!-- Performance Summary -->
      ${
        summaryItems.length
          ? `
      <div class="mb-24">
        <div class="section-title">🚀 Performance Summary</div>
        <div class="perf-summary-grid">
          ${summaryItems
            .map(
              (s) => `
            <div class="perf-summary-card sev-border-${s.sev}" title="${escHtml(s.tip)}">
              <div class="perf-summary-top">
                <span class="perf-summary-icon">${s.icon}</span>
                <span class="perf-summary-count ${s.sev === "error" ? "c-critical" : s.sev === "warning" ? "c-fair" : ""}">${s.value}</span>
              </div>
              <div class="perf-summary-label">${s.label}</div>
              <div class="perf-summary-tip">${escHtml(s.tip)}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>`
          : ""
      }

      <!-- Governor Limit Gauges -->
      <div class="mb-24">
        <div class="section-title">⚡ Predicted Governor Limit Usage (Worst-Case Class)</div>
        <div class="how-to-note">📖 <strong>How to read this:</strong> each gauge shows the single <em>highest</em> projected value found across all analysed Apex classes for that limit (SOQL, DML, CPU, Heap) — i.e. your worst offender, not an org-wide total. Values are static estimates from code patterns (queries/DML in loops, etc.). A gauge near its cap means at least one class is at risk of hitting that governor limit under load.</div>
        <div class="gov-gauge-grid">
          ${gaugeData
            .map((g) => {
              const pct = Math.min((g.value || 0) / Math.max(g.limit, 1), 1);
              const riskLevel =
                pct >= 0.9
                  ? "critical"
                  : pct >= 0.7
                    ? "high"
                    : pct >= 0.4
                      ? "medium"
                      : "low";
              return `
              <div class="gov-gauge-card">
                ${renderGovernorGauge(g.label, g.value, g.limit, riskLevel)}
                <div class="gov-gauge-title">${g.label}</div>
                <span class="gov-risk-badge ${riskLevel}">${riskLevel.toUpperCase()}</span>
              </div>`;
            })
            .join("")}
        </div>
      </div>

      <!-- Apex Classes at Risk (top 10) -->
      ${
        risks.length
          ? `
      <div class="mb-24">
        <div class="section-title">🏷️ Apex Classes at Risk (Top ${Math.min(risks.length, 10)})</div>
        <div class="how-to-note">📖 <strong>How to read this:</strong> classes ranked by predicted governor-limit consumption from static pattern analysis (SOQL/DML inside loops, large heap usage, high CPU patterns). Each cell is the projected per-transaction usage vs the governor cap shown in the header — <span class="c-critical">red</span> = approaching/over the limit, <span class="c-fair">amber</span> = watch. Start remediation with the red cells (bulkify queries/DML, move work to async). "Patterns" lists the risky constructs detected.</div>
        ${renderPaginatedDataTable(
          "pl-risk-classes",
          [
            "Class",
            "SOQL / 100",
            "DML / 150",
            "CPU ms / 10k",
            "Heap KB / 6M",
            "Patterns",
          ],
          risks.slice(0, 10).map((r) => {
            const soql = predVal(r, "soqlQueries");
            const dml = predVal(r, "dmlStatements");
            const cpu = predVal(r, "cpuTime");
            const heap = Math.round(predVal(r, "heapSize") / 1024);
            return [
              '<span style="font-weight:600">' +
                escHtml(r.className) +
                "</span>",
              '<span class="' +
                (soql > 80 ? "c-critical" : soql > 50 ? "c-fair" : "") +
                '">' +
                soql +
                "</span>",
              '<span class="' +
                (dml > 120 ? "c-critical" : dml > 80 ? "c-fair" : "") +
                '">' +
                dml +
                "</span>",
              '<span class="' +
                (cpu > 7000 ? "c-critical" : cpu > 4000 ? "c-fair" : "") +
                '">' +
                cpu +
                "</span>",
              '<span class="' +
                (heap > 4000 ? "c-critical" : heap > 2000 ? "c-fair" : "") +
                '">' +
                heap +
                "</span>",
              '<span style="font-size:11px;color:var(--sf-text-muted)">' +
                escHtml((r.patterns || []).join(", ")) +
                "</span>",
            ];
          }),
        )}
      </div>`
          : ""
      }

      <!-- Limits Simulator -->
      ${
        simData.length
          ? `
      <div class="mb-24">
        <div class="info-card">
          <div style="font-size:16px;font-weight:700;margin-bottom:6px">🔬 Governor Limits Simulator</div>
          <div class="how-to-note" style="margin-bottom:14px">📖 <strong>How this works:</strong> pick a record volume below — the table projects how much of each governor limit every <em>at-risk</em> class/trigger would consume in a single Apex transaction at that volume. Only classes flagged with loop-based SOQL/DML or high-risk patterns are simulated (so an org with ${simData.length} risky class${simData.length === 1 ? "" : "es"} shows ${simData.length} row${simData.length === 1 ? "" : "s"} — clean classes are intentionally excluded). Watch for rows turning red as you raise the volume: that's where a class would breach a limit at scale.</div>
          <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:220px">
              <label style="font-size:13px;font-weight:600;white-space:nowrap">Records in batch:</label>
              <input id="sim-volume-input" type="range" min="1" max="50000" value="200" step="100"
                style="flex:1;accent-color:var(--sf-blue,#0176d3)">
              <span id="sim-volume-display" style="font-size:16px;font-weight:800;min-width:70px;text-align:right">200</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${[200, 1000, 5000, 10000, 50000]
                .map(
                  (v) => `
              <button data-action="sim-set-volume" data-vol="${v}"
                style="padding:4px 12px;border-radius:20px;border:1px solid var(--vscode-widget-border);background:var(--vscode-sideBar-background);cursor:pointer;font-size:12px;font-weight:600">
                ${v.toLocaleString()}
              </button>`,
                )
                .join("")}
            </div>
          </div>
          <div style="margin-top:10px;font-size:11px;opacity:.5">
            💡 Governor limit = one Apex transaction. Simulate: 200 = trigger from flow, 5k = batch chunk, 50k = full export
          </div>
          <div style="overflow-x:auto;margin-top:16px">
            <table style="width:100%;border-collapse:collapse;font-size:13px" id="sim-results-table">
              <thead>
                <tr style="border-bottom:2px solid var(--vscode-widget-border)">
                  <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Class / Trigger</th>
                  <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">SOQL<br><span style="font-weight:400">/ 100</span></th>
                  <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">DML<br><span style="font-weight:400">/ 150</span></th>
                  <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">CPU (ms)<br><span style="font-weight:400">/ 10000</span></th>
                  <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Heap (KB)<br><span style="font-weight:400">/ 6000</span></th>
                  <th style="text-align:center;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Risk</th>
                </tr>
              </thead>
              <tbody id="sim-results-tbody">
                <tr><td colspan="6" style="padding:20px;text-align:center;opacity:.5">Adjust the volume slider above…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`
          : `
      <div class="mb-24">
        <div class="info-card">
          <div style="font-size:16px;font-weight:700;margin-bottom:6px">🔬 Governor Limits Simulator</div>
          <div style="padding:16px;border-radius:8px;background:var(--vscode-editor-background);font-size:13px;line-height:1.6;color:var(--sf-text-muted)">
            ✓ <strong>Nothing to simulate.</strong> The simulator only includes classes/triggers that show governor-limit risk (SOQL or DML inside loops, or high/medium-risk patterns). None of your analysed Apex matched those patterns, so there are no rows to project. This is a good sign — your code currently has no obvious bulk-scaling hotspots. If you add loop-based queries/DML later, they'll appear here automatically.
          </div>
        </div>
      </div>`
      }

      <!-- LDV Objects -->
      ${
        ldvObjects.length > 0
          ? `
      <div class="mb-24 info-card info-card--error">
        <div class="section-header-row">
          <div class="section-header-icon" style="background:rgba(239,68,68,.15)">📦</div>
          <span style="font-size:15px;font-weight:700;color:var(--score-critical)">Large Data Volume Objects (live counts)</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          ${ldvObjects
            .map(([obj, cnt]) => {
              const color =
                cnt >= 2000000
                  ? "#ef4444"
                  : cnt >= 1000000
                    ? "#f59e0b"
                    : "#f59e0b";
              const icon = cnt >= 2000000 ? "🔴" : cnt >= 1000000 ? "🟠" : "🟡";
              return `<div style="padding:12px 16px;border-radius:10px;border:1px solid ${color}40;background:${color}08">
              <div style="font-size:14px;font-weight:700">${escHtml(obj)} ${icon}</div>
              <div style="font-size:20px;font-weight:800;color:${color};margin-top:4px">${cnt.toLocaleString()}</div>
              <div style="font-size:11px;opacity:.6;margin-top:2px">records</div>
            </div>`;
            })
            .join("")}
        </div>
        <div style="margin-top:12px;font-size:12px;opacity:.6">🔴 >2M = Critical LDV · 🟠 >1M = High Risk · 🟡 >500k = Monitor</div>
      </div>`
          : ""
      }

      <!-- Entry Points -->
      ${
        entryPoints.length > 0
          ? `
      <div class="mb-24 info-card info-card--warn">
        <div class="section-header-row">
          <div class="section-header-icon icon-amber">🌐</div>
          <span style="font-size:15px;font-weight:700">Public API Entry Points (${entryPoints.length})</span>
          <span style="font-size:12px;opacity:.6;margin-left:4px">Internet-exposed Apex endpoints — attack surface</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
          ${entryPoints
            .map((ep) => {
              const isRest = ep.type === "RestResource";
              const color = isRest ? "#f59e0b" : "#8b5cf6";
              const bg = isRest
                ? "rgba(245,158,11,.08)"
                : "rgba(139,92,246,.08)";
              const border = isRest
                ? "rgba(245,158,11,.25)"
                : "rgba(139,92,246,.25)";
              const icon = isRest ? "🔌" : "📧";
              return `<div style="padding:12px 16px;border-radius:10px;border:1px solid ${border};background:${bg}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-size:14px">${icon}</span>
                <span style="font-size:13px;font-weight:700">${escHtml(ep.name)}</span>
                <span style="margin-left:auto;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:${color}20;color:${color}">${escHtml(ep.type)}</span>
              </div>
              <div style="font-size:11px;opacity:.6;font-family:monospace">${escHtml(ep.annotation)}</div>
            </div>`;
            })
            .join("")}
        </div>
      </div>`
          : ""
      }`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY & ACCESS TAB (merged: Security + Users + Profiles)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderSecurityAccess() {
    const secIssues = results.issues.filter((i) => i.category === "security");
    const userIssues = results.issues.filter(
      (i) => i.category === "user-governance",
    );
    const profIssues = results.issues.filter(
      (i) => i.category === "profile-security",
    );
    const allIssues = [...secIssues, ...userIssues, ...profIssues];
    const userSum = results.userSummary;
    const profSum = results.profileSummary;
    const s = results.scores || {};

    const tabInfo = renderTabInfo("security", [
      "<strong>Data source</strong>: Active User records (<code>User WHERE IsActive=true</code>), Profiles with user counts, and PermissionSet assignments — via standard SOQL (not Tooling API). Security mode must be <em>Standard</em> or <em>Advanced</em> to fetch profile/permission data.",
      "<strong>Dormant Users</strong>: Users whose <code>LastLoginDate</code> is more than 90 days ago (or null). These are active licensed seats consuming cost with no recent activity.",
      "<strong>Dangerous Permissions</strong>: Profiles/PermSets granting <em>ModifyAllData</em>, <em>ViewAllData</em>, <em>ManageUsers</em>, or <em>AuthorApex</em> are flagged — these bypass record-level sharing entirely.",
      "<strong>Profile vs. Permission Set</strong>: The analyser checks how many users are on each profile and flags profiles with zero users (cleanup candidates) or profiles with excessive admin permissions.",
      "<strong>Safe Mode</strong>: In Safe Mode, user and profile data is not fetched. Switch to Standard mode to enable Security analysis. Data is processed in-memory and never stored outside the VS Code session.",
      "<strong>Guest User risks</strong>: If Guest User profiles exist with broad object/field access, they are flagged as critical — Guest Users bypass standard sharing rules.",
      "<strong>Scoring</strong>: Security score deducts points for ModifyAllData grants (−15), dormant-user ratio (up to −20), missing MFA indicators (−10), and broad profile permissions.",
    ]);

    const dormantPct =
      userSum && userSum.totalActiveUsers
        ? Math.round((userSum.dormantUsers / userSum.totalActiveUsers) * 100)
        : 0;

    const DANGER_PERMS = [
      {
        key: "PermissionsModifyAllData",
        label: "Modify All Data",
        color: "var(--score-critical)",
      },
      {
        key: "PermissionsViewAllData",
        label: "View All Data",
        color: "var(--score-poor)",
      },
      {
        key: "PermissionsAuthorApex",
        label: "Author Apex",
        color: "var(--score-fair)",
      },
      {
        key: "PermissionsManageUsers",
        label: "Manage Users",
        color: "var(--chart-4)",
      },
      {
        key: "PermissionsCustomizeApplication",
        label: "Customize App",
        color: "var(--chart-5)",
      },
    ];

    return `
      ${tabInfo}
      <!-- Summary KPIs -->
      <div class="mb-24">
        <div class="section-title">🛡️ Security &amp; Access Overview</div>
        <div class="lwc-summary-cards">
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${s.security || 0}</div>
            <div class="lwc-summary-label">Security Score</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num c-critical">${allIssues.filter((i) => i.severity === "error").length}</div>
            <div class="lwc-summary-label">Critical Issues</div>
          </div>
          ${
            userSum
              ? `
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${userSum.totalActiveUsers}</div>
            <div class="lwc-summary-label">Active Users</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${userSum.neverLoggedIn > 0 ? "c-fair" : "c-excellent"}">${userSum.neverLoggedIn}</div>
            <div class="lwc-summary-label">Never Logged In</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${dormantPct > 20 ? "c-critical" : dormantPct > 10 ? "c-fair" : "c-excellent"}">${userSum.dormantUsers}</div>
            <div class="lwc-summary-label">Dormant (90d+)</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${userSum.superAdmins > 3 ? "c-critical" : userSum.superAdmins > 1 ? "c-fair" : "c-excellent"}">${userSum.superAdmins}</div>
            <div class="lwc-summary-label">System Admins</div>
          </div>`
              : ""
          }
          ${
            profSum
              ? `
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${profSum.totalProfiles}</div>
            <div class="lwc-summary-label">Profiles</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${profSum.profilesWithModifyAll > 1 ? "c-critical" : "c-good"}">${profSum.profilesWithModifyAll}</div>
            <div class="lwc-summary-label">With Modify All</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${profSum.overprivilegedCount > 0 ? "c-critical" : "c-excellent"}">${profSum.overprivilegedCount}</div>
            <div class="lwc-summary-label">Overprivileged (3+)</div>
          </div>`
              : ""
          }
        </div>
      </div>

      <!-- Profile Security Matrix -->
      ${
        profSum && profSum.profileList && profSum.profileList.length
          ? `
      <div class="mb-24">
        <div class="section-title">🔐 Profile Security Matrix</div>
        ${renderPaginatedDataTable(
          "sec-profiles",
          [
            "Profile Name",
            "Users",
            ...DANGER_PERMS.map((p) => p.label),
            "Risk",
          ],
          profSum.profileList.map((p) => {
            const dangerCount = DANGER_PERMS.filter((dp) => p[dp.key]).length;
            const riskCls =
              dangerCount >= 3
                ? "c-critical"
                : dangerCount >= 2
                  ? "c-fair"
                  : dangerCount >= 1
                    ? ""
                    : "c-excellent";
            const riskLabel =
              dangerCount >= 3
                ? "⚠ High"
                : dangerCount >= 2
                  ? "△ Medium"
                  : dangerCount >= 1
                    ? "Low"
                    : "✓ Clean";
            return [
              '<span style="font-weight:600">' + escHtml(p.Name) + "</span>",
              String(p._userCount != null ? p._userCount : "—"),
              ...DANGER_PERMS.map((dp) =>
                p[dp.key]
                  ? '<span style="color:var(--score-critical);font-weight:700">✓</span>'
                  : '<span style="color:var(--sf-text-muted)">—</span>',
              ),
              '<span class="' +
                riskCls +
                '" style="font-weight:600">' +
                riskLabel +
                "</span>",
            ];
          }),
        )}
      </div>`
          : ""
      }

      <!-- Permission Sets -->
      ${
        profSum && profSum.permissionSetList && profSum.permissionSetList.length
          ? `
      <div class="mb-24">
        <div class="section-title">🎛️ Permission Sets (${profSum.permissionSetList.length})</div>
        <div style="font-size:11.5px;color:var(--sf-text-muted);margin:-4px 0 10px">Custom permission sets and the active users assigned to each. Permission sets grant access additively on top of a user's profile.</div>
        ${renderPaginatedDataTable(
          "sec-permsets",
          ["Permission Set", "Users", "Modify All", "View All", "Risk"],
          profSum.permissionSetList
            .slice()
            .sort((a, b) => (b._userCount || 0) - (a._userCount || 0))
            .map((ps) => {
              const danger = (ps.PermissionsModifyAllData ? 1 : 0) + (ps.PermissionsViewAllData ? 1 : 0);
              const riskCls = danger >= 2 ? "c-critical" : danger >= 1 ? "c-fair" : "c-excellent";
              const riskLabel = danger >= 2 ? "⚠ High" : danger >= 1 ? "△ Medium" : "✓ Clean";
              const yes = '<span style="color:var(--score-critical);font-weight:700">✓</span>';
              const no = '<span style="color:var(--sf-text-muted)">—</span>';
              return [
                '<span style="font-weight:600">' + escHtml(ps.Label || ps.Name) + "</span>",
                String(ps._userCount != null ? ps._userCount : "—"),
                ps.PermissionsModifyAllData ? yes : no,
                ps.PermissionsViewAllData ? yes : no,
                '<span class="' + riskCls + '" style="font-weight:600">' + riskLabel + "</span>",
              ];
            }),
        )}
      </div>`
          : ""
      }

      <!-- Permission Set Groups -->
      ${
        profSum && profSum.permissionSetGroupList && profSum.permissionSetGroupList.length
          ? `
      <div class="mb-24">
        <div class="section-title">🧩 Permission Set Groups (${profSum.permissionSetGroupList.length})</div>
        <div style="font-size:11.5px;color:var(--sf-text-muted);margin:-4px 0 10px">Modern permission model — groups bundle permission sets. <strong>Outdated</strong> status means the aggregate permissions need recalculation and should be reviewed.</div>
        ${renderPaginatedDataTable(
          "sec-psg",
          ["Group", "Status", "Users"],
          profSum.permissionSetGroupList
            .slice()
            .sort((a, b) => (b._userCount || 0) - (a._userCount || 0))
            .map((g) => {
              const outdated = (g.Status || "").toLowerCase() === "outdated";
              const statusHtml = outdated
                ? '<span class="c-critical" style="font-weight:600">⚠ Outdated</span>'
                : '<span class="c-excellent" style="font-weight:600">✓ ' + escHtml(g.Status || "Updated") + "</span>";
              return [
                '<span style="font-weight:600">' + escHtml(g.MasterLabel || g.DeveloperName) + "</span>",
                statusHtml,
                String(g._userCount != null ? g._userCount : "—"),
              ];
            }),
        )}
      </div>`
          : ""
      }

      <!-- Users by Profile (all) -->
      ${
        userSum &&
        userSum.profileDistribution &&
        userSum.profileDistribution.length
          ? `
      <div class="mb-24">
        <div class="section-title">👥 Users by Profile (${userSum.profileDistribution.length})</div>
        ${renderPaginatedDataTable(
          "sec-user-dist",
          ["Profile", "User Count", "% of Active"],
          userSum.profileDistribution
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((p) => {
              const pct = userSum.totalActiveUsers
                ? Math.round((p.count / userSum.totalActiveUsers) * 100)
                : 0;
              return [
                '<span style="font-weight:600">' +
                  escHtml(p.profileName) +
                  "</span>",
                String(p.count),
                '<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;background:var(--sf-border);border-radius:3px;height:8px"><div style="width:' +
                  pct +
                  '%;background:var(--chart-1);height:8px;border-radius:3px"></div></div><span style="font-size:11px">' +
                  pct +
                  "%</span></div>",
              ];
            }),
        )}
      </div>`
          : ""
      }

      <!-- Security Vulnerabilities -->
      ${renderSecurityVulnerabilities(allIssues)}`;
  }

  // Grouped, human-readable list of all security findings (#5).
  function renderSecurityVulnerabilities(allIssues) {
    if (!allIssues || !allIssues.length) {
      return `
      <div class="mb-24">
        <div class="section-title">🚨 Security Vulnerabilities</div>
        <div style="padding:14px 16px;border-radius:8px;background:var(--vscode-editor-background);font-size:12.5px;color:var(--sf-text-muted)">✓ No security, profile, or user-governance findings were raised for this org.</div>
      </div>`;
    }
    const order = { error: 0, warning: 1, info: 2 };
    const sevMeta = {
      error: { label: "Critical", cls: "c-critical", icon: "⛔" },
      warning: { label: "Warning", cls: "c-fair", icon: "⚠️" },
      info: { label: "Informational", cls: "", icon: "ℹ️" },
    };
    const sorted = allIssues
      .slice()
      .sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
    const groups = { error: [], warning: [], info: [] };
    sorted.forEach((i) => {
      (groups[i.severity] || groups.info).push(i);
    });
    const blocks = ["error", "warning", "info"]
      .filter((sev) => groups[sev].length)
      .map((sev) => {
        const m = sevMeta[sev];
        const rows = groups[sev]
          .map((i) => {
            const why = i.description ? escHtml(i.description) : "";
            const fix = i.suggestion
              ? `<div style="font-size:11.5px;color:var(--sf-text-muted);margin-top:4px">💡 ${escHtml(i.suggestion)}</div>`
              : "";
            return `
              <div style="padding:10px 12px;border-left:3px solid var(--sf-border);background:var(--vscode-editor-background);border-radius:0 6px 6px 0;margin-bottom:8px">
                <div style="font-size:12.5px;font-weight:600">${escHtml(i.message || i.ruleId || "Finding")}</div>
                ${why ? `<div style="font-size:11.5px;color:var(--sf-text-muted);margin-top:3px;line-height:1.5">${why}</div>` : ""}
                ${fix}
              </div>`;
          })
          .join("");
        return `
          <div style="margin-bottom:14px">
            <div class="${m.cls}" style="font-size:12px;font-weight:700;margin-bottom:8px">${m.icon} ${m.label} (${groups[sev].length})</div>
            ${rows}
          </div>`;
      })
      .join("");
    return `
      <div class="mb-24">
        <div class="section-title">🚨 Security Vulnerabilities (${allIssues.length})</div>
        <div style="font-size:11.5px;color:var(--sf-text-muted);margin:-4px 0 12px">All security, profile-security, and user-governance findings, grouped by severity. Each shows why it matters and how to remediate.</div>
        ${blocks}
      </div>`;
  }

  // ── Sortable, paginated issue table ──────────────────────────────────────
  function renderIssueList(issues, panelId) {
    return renderIssueTable(issues, panelId || "_global");
  }

  function renderIssueTable(issues, panelId) {
    if (!issues || issues.length === 0) {
      return `<div class="no-issues-state"><div class="ni-icon">✅</div><span>No issues in this category</span></div>`;
    }

    if (!issueTableState[panelId]) {
      issueTableState[panelId] = { sortCol: "sev", sortDir: "asc", page: 0 };
    }
    const state = issueTableState[panelId];
    const SEV_ORDER = { error: 0, warning: 1, info: 2 };

    // Sort
    let sorted = [...issues];
    if (state.sortCol === "sev") {
      sorted.sort((a, b) => {
        const d = (SEV_ORDER[a.severity] || 2) - (SEV_ORDER[b.severity] || 2);
        return state.sortDir === "asc" ? d : -d;
      });
    } else if (state.sortCol === "msg") {
      sorted.sort((a, b) => {
        const d = (a.message || "").localeCompare(b.message || "");
        return state.sortDir === "asc" ? d : -d;
      });
    } else if (state.sortCol === "cat") {
      sorted.sort((a, b) => {
        const d = (a.category || "").localeCompare(b.category || "");
        return state.sortDir === "asc" ? d : -d;
      });
    } else if (state.sortCol === "loc") {
      sorted.sort((a, b) => {
        const la = a.file || a.object || "";
        const lb = b.file || b.object || "";
        const d = la.localeCompare(lb);
        return state.sortDir === "asc" ? d : -d;
      });
    }

    const totalPages = Math.ceil(sorted.length / ISSUE_PAGE_SIZE);
    if (state.page >= totalPages) state.page = Math.max(0, totalPages - 1);
    const paginated = sorted.slice(
      state.page * ISSUE_PAGE_SIZE,
      (state.page + 1) * ISSUE_PAGE_SIZE,
    );

    function sortArrow(col) {
      if (state.sortCol !== col) return `<span style="opacity:.3">⇅</span>`;
      return state.sortDir === "asc"
        ? `<span style="color:var(--sf-blue,#0176d3)">↑</span>`
        : `<span style="color:var(--sf-blue,#0176d3)">↓</span>`;
    }

    const rows = paginated
      .map((iss) => {
        const idx = registerIssue(iss);
        const loc = iss.file
          ? shortPath(iss.file) + (iss.line ? ":" + iss.line : "")
          : escHtml(iss.object || "");
        const sevCls =
          iss.severity === "error"
            ? "it-sev-error"
            : iss.severity === "warning"
              ? "it-sev-warn"
              : "it-sev-info";
        const sevLbl =
          iss.severity === "error"
            ? "E"
            : iss.severity === "warning"
              ? "W"
              : "I";
        const suggSnippet = iss.suggestion
          ? `<div style="font-size:11px;color:var(--sf-text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px">💡 ${escHtml(iss.suggestion.slice(0, 90))}${iss.suggestion.length > 90 ? "…" : ""}</div>`
          : "";
        return `<tr class="it-row ${sevCls}" data-action="open-drill" data-idx="${idx}" style="cursor:pointer">
        <td class="it-sev"><span class="sev-pill ${iss.severity}" title="${iss.severity}">${sevLbl}</span></td>
        <td class="it-msg"><div>${escHtml(iss.message)}</div>${suggSnippet}</td>
        <td class="it-cat">${formatCatLabel(iss.category)}</td>
        <td class="it-loc">${loc}</td>
        <td class="it-chv">›</td>
      </tr>`;
      })
      .join("");

    // Pagination controls
    const showingFrom = state.page * ISSUE_PAGE_SIZE + 1;
    const showingTo = Math.min(
      (state.page + 1) * ISSUE_PAGE_SIZE,
      sorted.length,
    );
    const paginationHtml =
      totalPages > 1
        ? `
      <div class="pagination-bar">
        <span style="opacity:.6">${showingFrom}–${showingTo} of ${sorted.length}</span>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" data-action="issue-page-prev" data-panel="${panelId}" ${state.page === 0 ? "disabled" : ""}>‹ Prev</button>
        ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const pg =
            totalPages <= 7 ? i : state.page < 4 ? i : state.page - 3 + i;
          if (pg >= totalPages) return "";
          return `<button class="btn ${pg === state.page ? "btn-primary" : "btn-ghost"}" data-action="issue-page-go" data-panel="${panelId}" data-pg="${pg}">${pg + 1}</button>`;
        }).join("")}
        <button class="btn btn-ghost" data-action="issue-page-next" data-panel="${panelId}" ${state.page >= totalPages - 1 ? "disabled" : ""}>Next ›</button>
      </div>`
        : "";

    return `<div class="issue-table-wrap" id="issue-table-${panelId}">
      <table class="sf-table sf-table--issue"><thead><tr>
        <th class="it-sev" data-action="issue-sort" data-panel="${panelId}" data-col="sev" style="cursor:pointer;user-select:none">Sev ${sortArrow("sev")}</th>
        <th class="it-msg" data-action="issue-sort" data-panel="${panelId}" data-col="msg" style="cursor:pointer;user-select:none">Finding ${sortArrow("msg")}</th>
        <th class="it-cat" data-action="issue-sort" data-panel="${panelId}" data-col="cat" style="cursor:pointer;user-select:none">Category ${sortArrow("cat")}</th>
        <th class="it-loc" data-action="issue-sort" data-panel="${panelId}" data-col="loc" style="cursor:pointer;user-select:none">Location ${sortArrow("loc")}</th>
        <th class="it-chv"></th>
      </tr></thead><tbody>${rows}</tbody></table>
      ${paginationHtml}
    </div>`;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // DRILL-DOWN PANEL
  // ═══════════════════════════════════════════════════════════════════════════
  function openDrill(indexOrIssue) {
    // Accept integer index (from onclick="openDrill(N)") or an object directly
    const iss =
      typeof indexOrIssue === "number"
        ? issueRegistry[indexOrIssue]
        : typeof indexOrIssue === "string"
          ? JSON.parse(indexOrIssue)
          : indexOrIssue;
    if (!iss) {
      return;
    }
    selectedIssue = iss;

    document.getElementById("ddp-title").textContent =
      iss.ruleId || "Issue Detail";
    document.getElementById("ddp-body").innerHTML = `
      <div class="ddp-section">
        <div class="ddp-section-label">Message</div>
        <div class="ddp-section-content" style="font-weight:600;font-size:14px">${escHtml(iss.message)}</div>
      </div>

      ${
        iss.description
          ? `
      <div class="ddp-section">
        <div class="ddp-section-label">Description</div>
        <div class="ddp-section-content">${escHtml(iss.description)}</div>
      </div>`
          : ""
      }

      <div class="ddp-section">
        <div class="ddp-section-label">Details</div>
        <div class="ddp-meta-grid">
          <div class="ddp-meta-item"><div class="ddp-meta-label">Severity</div><div class="ddp-meta-value"><span class="sev-pill ${iss.severity}">${iss.severity}</span></div></div>
          <div class="ddp-meta-item"><div class="ddp-meta-label">Category</div><div class="ddp-meta-value">${formatCatLabel(iss.category)}</div></div>
          ${iss.ruleId ? `<div class="ddp-meta-item"><div class="ddp-meta-label">Rule</div><div class="ddp-meta-value" style="font-family:monospace">${escHtml(iss.ruleId)}</div></div>` : ""}
          ${iss.object ? `<div class="ddp-meta-item"><div class="ddp-meta-label">Object</div><div class="ddp-meta-value">${escHtml(iss.object)}</div></div>` : ""}
        </div>
      </div>

      ${
        iss.file
          ? `
      <div class="ddp-section">
        <div class="ddp-section-label">Location</div>
        <div class="ddp-code">${escHtml(iss.file)}${iss.line ? ":" + iss.line : ""}</div>
      </div>`
          : ""
      }

      ${
        iss.suggestion
          ? `
      <div class="ddp-section">
        <div class="ddp-section-label">💡 How to fix</div>
        <div class="ddp-suggestion">${escHtml(iss.suggestion)}</div>
      </div>`
          : ""
      }`;

    const footer = document.getElementById("ddp-footer");
    footer.innerHTML = `
      ${iss.file && !iss.file.startsWith("org://") ? `<button class="btn btn-primary" data-action="open-file" data-file="${escHtml(iss.file)}" data-line="${iss.line || 0}">📂 Open File</button>` : ""}
      <button class="btn btn-secondary" data-action="explain-issue">✨ Explain with AI</button>
      <button class="btn btn-ghost" data-action="close-drill">Close</button>`;

    overlayEl.classList.add("open");
    drillPanel.classList.add("open");
  }

  function closeDrill() {
    overlayEl.classList.remove("open");
    drillPanel.classList.remove("open");
    selectedIssue = null;
  }

  function explainIssue() {
    if (!selectedIssue) return;
    if (securityMode === "safe") {
      // Show inline message instead of calling AI
      const body = document.getElementById("ddp-body");
      if (!body) return;
      let aiSection = body.querySelector(".ai-explanation-section");
      if (!aiSection) {
        aiSection = document.createElement("div");
        aiSection.className = "ai-explanation-section";
        body.appendChild(aiSection);
      }
      aiSection.innerHTML = `
        <div class="ddp-section">
          <h4 class="ddp-section-title">🟢 Safe Mode Active</h4>
          <p style="opacity:.7;font-size:13px">AI explanations are disabled in Safe Mode. Switch to Standard or Advanced mode to enable AI-powered insights.</p>
        </div>`;
      return;
    }
    vscode.postMessage({ command: "explainIssue", data: selectedIssue });
  }

  // ── AI Explanation renderers ─────────────────────────────────────────────

  function renderAiExplanationLoading() {
    const body = document.getElementById("ddp-body");
    if (!body) return;
    let aiSection = body.querySelector(".ai-explanation-section");
    if (!aiSection) {
      aiSection = document.createElement("div");
      aiSection.className = "ai-explanation-section";
      body.appendChild(aiSection);
    }
    aiSection.innerHTML = `
      <div class="ddp-section">
        <h4 class="ddp-section-title">✨ AI Explanation</h4>
        <div style="display:flex;align-items:center;gap:8px;color:var(--text-muted)">
          <span class="spinner" style="width:16px;height:16px;border-width:2px"></span>
          Generating explanation with GitHub Copilot…
        </div>
      </div>`;
  }

  function renderAiExplanation(exp) {
    const body = document.getElementById("ddp-body");
    if (!body) return;
    let aiSection = body.querySelector(".ai-explanation-section");
    if (!aiSection) {
      aiSection = document.createElement("div");
      aiSection.className = "ai-explanation-section";
      body.appendChild(aiSection);
    }
    const codeBlock = exp.codeExample
      ? `<div class="ddp-section">
           <h5 class="ddp-section-title" style="font-size:0.8rem">Example</h5>
           <pre class="ddp-code">${escHtml(exp.codeExample)}</pre>
         </div>`
      : "";
    aiSection.innerHTML = `
      <div class="ddp-section">
        <h4 class="ddp-section-title">✨ AI Explanation <span style="font-size:0.75rem;opacity:0.6">(${escHtml(exp.provider || "Copilot")})</span></h4>
        <p style="margin:0 0 10px">${escHtml(exp.summary)}</p>
      </div>
      <div class="ddp-section">
        <h5 class="ddp-section-title" style="font-size:0.8rem">Impact</h5>
        <p style="margin:0">${escHtml(exp.impact)}</p>
      </div>
      <div class="ddp-section">
        <h5 class="ddp-section-title" style="font-size:0.8rem">How to Fix</h5>
        <p style="margin:0">${escHtml(exp.howToFix)}</p>
      </div>
      ${codeBlock}`;
    aiSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderAiExplanationError(errorMsg) {
    const body = document.getElementById("ddp-body");
    if (!body) return;
    let aiSection = body.querySelector(".ai-explanation-section");
    if (!aiSection) {
      aiSection = document.createElement("div");
      aiSection.className = "ai-explanation-section";
      body.appendChild(aiSection);
    }
    aiSection.innerHTML = `
      <div class="ddp-section">
        <h4 class="ddp-section-title">✨ AI Explanation</h4>
        <div style="color:var(--score-poor);display:flex;align-items:center;gap:6px">
          <span>⚠️</span> ${escHtml(errorMsg)}
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  function activateTab(tabId, persist = true) {
    activeTab = tabId;
    if (persist) {
      vscode.setState({ activeTab, filters });
    }

    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.id === `tab-btn-${tabId}`);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.toggle("active", p.id === `panel-${tabId}`);
    });
  }

  // Active sub-tab within the Org Info panel (survives full-panel re-renders).
  let orgInfoSubtab = "overview";
  function activateOrgInfoSubtab(sub) {
    if (!sub) { return; }
    orgInfoSubtab = sub;
    document.querySelectorAll(".orginfo-subtab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.sub === sub);
    });
    document.querySelectorAll(".orginfo-subpanel").forEach((p) => {
      p.classList.toggle("active", p.id === `oisub-${sub}`);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILTERING
  // ═══════════════════════════════════════════════════════════════════════════
  function filterPanel(panelId, categoriesStr, severity, category, search) {
    const cats = categoriesStr.split(",");
    let issues = results.issues.filter((i) => cats.includes(i.category));

    // pick up existing select values if not provided
    const toolbar = document.getElementById(`toolbar-${panelId}`);
    if (toolbar) {
      const sevEl = toolbar.querySelector("select");
      const srchEl = toolbar.querySelector("input");
      if (severity === null && sevEl) severity = sevEl.value;
      if (search === null && srchEl) search = srchEl.value;
    }

    if (severity && severity !== "all") {
      issues = issues.filter((i) => i.severity === severity);
    }
    if (search && search.trim()) {
      const q = search.toLowerCase();
      issues = issues.filter(
        (i) =>
          (i.message || "").toLowerCase().includes(q) ||
          (i.file || "").toLowerCase().includes(q) ||
          (i.ruleId || "").toLowerCase().includes(q) ||
          (i.object || "").toLowerCase().includes(q),
      );
    }

    if (issueTableState[panelId]) issueTableState[panelId].page = 0;
    const listEl = document.getElementById(`list-${panelId}`);
    const cntEl = document.getElementById(`count-${panelId}`);
    if (listEl) listEl.innerHTML = renderIssueList(issues, panelId);
    if (cntEl) cntEl.textContent = `${issues.length} issues`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VS CODE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  function runAnalysis() {
    if (!securityMode) {
      showSecurityModeModal(true); // true = force refresh after selection
      return;
    }
    showLoading(0);
    vscode.postMessage({
      command: "runAnalysis",
      data: { force: true, securityMode },
    });
  }

  /** Initial run — tries cached data first, fetches from org only if no cache exists */
  function runAnalysisInitial() {
    if (!securityMode) {
      showSecurityModeModal(false);
      return;
    }
    showLoading(0);
    vscode.postMessage({
      command: "runAnalysis",
      data: { force: false, securityMode },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY MODE SELECTION MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  let _secModalForceRefresh = false;

  function showSecurityModeModal(forceRefresh) {
    _secModalForceRefresh = !!forceRefresh;
    // Remove any existing modal
    const existing = document.getElementById("sec-mode-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "sec-mode-overlay";
    overlay.className = "consent-overlay";
    overlay.innerHTML = `
      <div class="sec-mode-dialog">
        <div class="sec-mode-header">
          <span class="sec-mode-icon">🔍</span>
          <h2>OrgPulse Scan Mode</h2>
          <p class="sec-mode-subtitle">Choose how you want to run analysis. Your selection controls AI usage and data handling.</p>
        </div>

        <div class="sec-mode-cards">
          <div class="sec-mode-card selected" data-action="select-security-mode" data-mode="safe">
            <div class="sec-mode-badge safe">🟢 SAFE MODE</div>
            <div class="sec-mode-rec">Recommended for Enterprises</div>
            <ul class="sec-mode-features">
              <li>✔ No AI usage</li>
              <li>✔ 100% local analysis</li>
              <li>✔ No external data sharing</li>
              <li>✔ Maximum security</li>
            </ul>
          </div>

          <div class="sec-mode-card" data-action="select-security-mode" data-mode="standard">
            <div class="sec-mode-badge standard">🟡 STANDARD MODE</div>
            <div class="sec-mode-rec">Safe for most organisations</div>
            <ul class="sec-mode-features">
              <li>✔ AI summarises aggregated insights</li>
              <li>✔ No sensitive or raw metadata shared</li>
              <li>✔ Anonymised data only</li>
              <li>✔ CTA Review enabled</li>
            </ul>
          </div>

          <div class="sec-mode-card" data-action="select-security-mode" data-mode="advanced">
            <div class="sec-mode-badge advanced">🔴 ADVANCED MODE</div>
            <div class="sec-mode-rec">Deeper AI insights — still no PII</div>
            <ul class="sec-mode-features">
              <li>✔ Enriched metadata patterns for AI</li>
              <li>✔ Still NO raw code or PII</li>
              <li>✔ CTA Review with richer context</li>
              <li>⚠ User must accept risk</li>
            </ul>
          </div>
        </div>

        <label class="sec-consent-label" id="sec-consent-label">
          <input type="checkbox" id="sec-consent-cb" />
          <span>I understand and consent to the selected mode's data handling policy</span>
        </label>

        <div class="sec-mode-actions">
          <button class="btn btn-ghost" data-action="sec-modal-cancel">Cancel</button>
          <button class="btn btn-primary" data-action="sec-start-analysis" id="sec-start-btn" disabled>
            🔍 Start Analysis
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Wire consent checkbox
    const cb = document.getElementById("sec-consent-cb");
    const btn = document.getElementById("sec-start-btn");
    if (cb && btn) {
      cb.addEventListener("change", () => {
        const selected = document.querySelector(".sec-mode-card.selected");
        btn.disabled = !(cb.checked && selected);
      });
    }
  }

  function dismissSecurityModeModal() {
    const el = document.getElementById("sec-mode-overlay");
    if (el) el.remove();
  }

  function getSecurityModeLabel() {
    if (securityMode === "safe") return "🟢 Safe Mode";
    if (securityMode === "standard") return "🟡 Standard Mode";
    if (securityMode === "advanced") return "🔴 Advanced Mode";
    return "Not selected";
  }

  function getSecurityModeDescription() {
    if (securityMode === "safe")
      return "100% local analysis. No AI, no external data sharing.";
    if (securityMode === "standard")
      return "AI used for aggregated insights only. No sensitive data shared.";
    if (securityMode === "advanced")
      return "Enriched AI insights. No raw code or PII shared.";
    return "";
  }

  /** Render the transparency panel for the overview tab */
  function renderTransparencyPanel() {
    const aiUsed = securityMode !== "safe";
    const aiLabel = aiUsed
      ? "Anonymised insights only"
      : "Disabled (Safe Mode)";
    return `
      <div class="section-card transparency-panel mb-24">
        <div class="section-title">🔒 Data Usage &amp; Security</div>
        <div class="transparency-grid">
          <div class="transparency-item">
            <span class="transparency-check">✔</span>
            <span>No record data accessed</span>
          </div>
          <div class="transparency-item">
            <span class="transparency-check">✔</span>
            <span>No PII processed (emails, names, IPs)</span>
          </div>
          <div class="transparency-item">
            <span class="transparency-check">✔</span>
            <span>No data stored externally</span>
          </div>
          <div class="transparency-item">
            <span class="transparency-check">✔</span>
            <span>AI: ${escHtml(aiLabel)}</span>
          </div>
          <div class="transparency-item">
            <span class="transparency-check">✔</span>
            <span>Mode: ${getSecurityModeLabel()}</span>
          </div>
          <div class="transparency-item">
            <span class="transparency-check">✔</span>
            <span>Full control via user-selected scan mode</span>
          </div>
        </div>
        <div class="transparency-footer">
          <span class="transparency-mode-badge ${escHtml(securityMode || "safe")}">${getSecurityModeLabel()}</span>
          <span class="transparency-desc">${escHtml(getSecurityModeDescription())}</span>
        </div>
      </div>`;
  }

  function doOpenFile(file, line) {
    vscode.postMessage({ command: "openFile", data: { file, line } });
  }

  function showExportModal() {
    if (!results) return;
    var meta = results.metadata || {};
    var org = (meta.orgAlias || meta.orgUsername || "org").replace(
      /[^a-zA-Z0-9]/g,
      "_",
    );
    var date = new Date().toISOString().slice(0, 10);
    var defaultName = "OrgPulse_" + org + "_" + date;
    var existing = document.getElementById("export-modal-overlay");
    if (existing) existing.remove();
    var div = document.createElement("div");
    div.id = "export-modal-overlay";
    div.className = "consent-overlay";
    div.innerHTML = [
      "<div class='consent-dialog' style='max-width:520px'>",
      "<h2 style='margin-bottom:4px'>⬇️ Export Report</h2>",
      "<p style='font-size:12px;color:var(--sf-text-muted);margin-bottom:20px'>Choose a format and customise the file name before downloading.</p>",
      "<div style='margin-bottom:18px'>",
      "<label style='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--sf-text-muted);display:block;margin-bottom:10px'>Format</label>",
      "<div style='display:flex;flex-direction:column;gap:8px'>",
      "<label class='export-fmt-option' style='display:flex;align-items:flex-start;gap:12px;background:var(--sf-card-bg);border:1.5px solid var(--sf-border);border-radius:10px;padding:12px 14px;cursor:pointer'>",
      "<input type='radio' name='export-fmt' value='html' checked style='margin-top:2px;accent-color:var(--sf-blue)'>",
      "<div><div style='font-size:13px;font-weight:600'>🌐 Interactive HTML</div>",
      "<div style='font-size:11px;color:var(--sf-text-muted);margin-top:2px'>Self-contained HTML file openable in any browser. Includes all findings, scores, and syntax-highlighted snippets. Best for sharing with your team.</div></div></label>",
      "<label class='export-fmt-option' style='display:flex;align-items:flex-start;gap:12px;background:var(--sf-card-bg);border:1.5px solid var(--sf-border);border-radius:10px;padding:12px 14px;cursor:pointer'>",
      "<input type='radio' name='export-fmt' value='json' style='margin-top:2px;accent-color:var(--sf-blue)'>",
      "<div><div style='font-size:13px;font-weight:600'>📋 JSON Data</div>",
      "<div style='font-size:11px;color:var(--sf-text-muted);margin-top:2px'>Raw structured data export. Ideal for CI/CD pipelines, dashboards, or custom tooling. Contains every issue, score, and metadata field.</div></div></label>",
      "<label class='export-fmt-option' style='display:flex;align-items:flex-start;gap:12px;background:var(--sf-card-bg);border:1.5px solid var(--sf-border);border-radius:10px;padding:12px 14px;cursor:pointer'>",
      "<input type='radio' name='export-fmt' value='architect' style='margin-top:2px;accent-color:var(--sf-blue)'>",
      "<div><div style='font-size:13px;font-weight:600'>🏛️ Architect Summary</div>",
      "<div style='font-size:11px;color:var(--sf-text-muted);margin-top:2px'>Condensed plain-text report grouped by domain with prioritised recommendations. Ideal for design reviews, ADR documentation, and CTA-level analysis.</div></div></label>",
      "<label class='export-fmt-option' style='display:flex;align-items:flex-start;gap:12px;background:var(--sf-card-bg);border:1.5px solid var(--sf-border);border-radius:10px;padding:12px 14px;cursor:pointer'>",
      "<input type='radio' name='export-fmt' value='sarif' style='margin-top:2px;accent-color:var(--sf-blue)'>",
      "<div><div style='font-size:13px;font-weight:600'>🔍 SARIF</div>",
      "<div style='font-size:11px;color:var(--sf-text-muted);margin-top:2px'>Static Analysis Results Interchange Format. Import into VS Code's SARIF Viewer, GitHub code scanning, or any compliant SAST tool.</div></div></label>",
      "</div></div>",
      "<div style='margin-bottom:20px'>",
      "<label style='font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--sf-text-muted);display:block;margin-bottom:6px'>File Name</label>",
      "<input id='export-filename' type='text' value='" +
        defaultName +
        "' style='width:100%;box-sizing:border-box;padding:9px 12px;border-radius:8px;border:1.5px solid var(--sf-border);background:var(--sf-card-bg);color:var(--sf-text);font-size:13px;outline:none' placeholder='Report file name (no extension)'>",
      "<div style='font-size:10px;color:var(--sf-text-muted);margin-top:4px'>Extension (.html / .json / .txt / .sarif) is added automatically.</div>",
      "</div>",
      "<div class='consent-actions'>",
      "<button class='btn btn-ghost' data-action='export-modal-cancel'>Cancel</button>",
      "<button class='btn btn-primary' data-action='export-modal-confirm'>⬇️ Download</button>",
      "</div></div>",
    ].join("");
    document.body.appendChild(div);
    div.querySelectorAll("input[name='export-fmt']").forEach(function (r) {
      r.addEventListener("change", function () {
        div.querySelectorAll(".export-fmt-option").forEach(function (l) {
          l.style.borderColor = "var(--sf-border)";
        });
        r.closest(".export-fmt-option").style.borderColor = "var(--sf-blue)";
      });
    });
    var checked = div.querySelector("input[name='export-fmt']:checked");
    if (checked)
      checked.closest(".export-fmt-option").style.borderColor =
        "var(--sf-blue)";
    setTimeout(function () {
      var inp = div.querySelector("#export-filename");
      if (inp) {
        inp.focus();
        inp.select();
      }
    }, 50);
  }

  function dismissExportModal() {
    var el = document.getElementById("export-modal-overlay");
    if (el) el.remove();
  }

  /** Fetch the OrgPulse icon as a base64 data URI (for embedding in printed PDF) */
  function fetchIconDataUri(callback) {
    const uri = window.ORGPULSE_ICON_URI;
    if (!uri) {
      callback(null);
      return;
    }
    try {
      fetch(uri)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => callback(reader.result);
          reader.onerror = () => callback(null);
          reader.readAsDataURL(blob);
        })
        .catch(() => callback(null));
    } catch (e) {
      callback(null);
    }
  }

  function exportReport(fmt, customName) {
    if (fmt === "pdf") {
      // PDF: open print-ready HTML and let browser print-to-PDF
      fetchIconDataUri((iconDataUri) => printReportDirectly(null, iconDataUri));
      return;
    }
    vscode.postMessage({
      command: "exportReport",
      data: { format: fmt, fileName: customName || undefined },
    });
  }

  // ── PDF Report ────────────────────────────────────────────────────────────
  function showPdfConsentModal() {
    if (!results) return;
    // Safe mode — skip consent, generate without AI directly
    if (securityMode === "safe") {
      generatePdfReport(false);
      return;
    }
    const existing = document.getElementById("pdf-consent-overlay");
    if (existing) existing.remove();
    const div = document.createElement("div");
    div.id = "pdf-consent-overlay";
    div.className = "consent-overlay";
    div.innerHTML = `
      <div class="consent-dialog">
        <h2>📊 Generate Leadership PDF Report</h2>
        <p>
          OrgPulse can optionally use <strong>GitHub Copilot AI</strong> to generate a concise executive
          summary and key recommendations section for the report.
          <br><br>
          Your analysis data (issue counts, scores, metadata) will be shared with the AI to compose
          the summary. No Apex source code is sent.
          <br><br>
          Do you consent to using AI for the report narrative?
        </p>
        <div style="margin:12px 0 0;padding:8px 12px;border-radius:6px;background:rgba(1,118,211,.08);font-size:11px;opacity:.8">
          🔒 Mode: ${getSecurityModeLabel()} — ${escHtml(getSecurityModeDescription())}
        </div>
        <div class="consent-actions">
          <button class="btn btn-ghost" data-action="pdf-consent-cancel">Cancel</button>
          <button class="btn btn-secondary" data-action="pdf-consent-decline">Generate without AI</button>
          <button class="btn btn-primary" data-action="pdf-consent-accept">✨ Generate with AI</button>
        </div>
      </div>`;
    document.body.appendChild(div);
  }

  function dismissConsentModal() {
    const el = document.getElementById("pdf-consent-overlay");
    if (el) el.remove();
  }

  function generatePdfReport(useAi) {
    if (!results) return;
    if (useAi && securityMode !== "safe") {
      // Ask extension to call Copilot for an executive summary, then generate the PDF
      vscode.postMessage({
        command: "generateAiPdfReport",
        data: { results: sanitiseResultsForReport() },
      });
    } else {
      fetchIconDataUri((iconDataUri) => printReportDirectly(null, iconDataUri));
    }
  }

  /** Strip large arrays to keep message size reasonable */
  function sanitiseResultsForReport() {
    if (!results) return null;

    // Issues sliced per category (top 8 errors per domain for AI context)
    const allIssues = results.issues || [];
    function topByCategory(cat, n) {
      return allIssues
        .filter((i) => i.category === cat && i.severity === "error")
        .slice(0, n)
        .map((i) => ({
          message: i.message,
          ruleId: i.ruleId,
          object: i.object || "",
        }));
    }

    return {
      scores: results.scores,
      summary: results.summary,
      metadata: results.metadata,
      issuesByCategory: {
        "code-quality": topByCategory("code-quality", 8),
        "automation-design": topByCategory("automation-design", 8),
        "data-model": topByCategory("data-model", 8),
        performance: topByCategory("performance", 8),
        security: topByCategory("security", 8),
        testing: topByCategory("testing", 8),
        "governor-limits": topByCategory("governor-limits", 6),
      },
      topIssues: allIssues
        .filter((i) => i.severity === "error")
        .slice(0, 20)
        .map((i) => ({
          message: i.message,
          category: i.category,
          ruleId: i.ruleId,
          object: i.object,
        })),
      orgInventory: results.orgInventory
        ? {
            apexClassCount: results.orgInventory.apexClassCount,
            apexTriggerCount: results.orgInventory.apexTriggerCount,
            flowCount: results.orgInventory.flowCount,
            customObjectCount: results.orgInventory.customObjectCount,
            customFieldCount: results.orgInventory.customFieldCount,
            permissionSetCount: results.orgInventory.permissionSetCount,
            validationRuleCount: results.orgInventory.validationRuleCount,
            totalComponents: results.orgInventory.totalComponents,
            installedPackages: (results.orgInventory.installedPackages || [])
              .length,
            visualforcePages: (results.orgInventory.visualforcePages || [])
              .length,
          }
        : null,
      dataModelStats: (results.dataModelStats || [])
        .sort((a, b) => (b.fieldLimitPct || 0) - (a.fieldLimitPct || 0))
        .slice(0, 10)
        .map((o) => ({
          objectName: o.objectName,
          objectLabel: o.objectLabel || o.objectName,
          totalFields: o.totalFields,
          standardFields: o.standardFields,
          customFields: o.customFields || o.totalFields,
          unusedFields: o.unusedFields,
          fieldsWithoutDescription: o.fieldsWithoutDescription,
          fieldLimitPct: o.fieldLimitPct || 0,
        })),
      automationSummary: results.automationSummary
        ? {
            totalFlows: results.automationSummary.totalFlows,
            totalTriggers: results.automationSummary.totalTriggers,
            totalValidationRules:
              results.automationSummary.totalValidationRules,
            flowInventory: (
              results.automationSummary.flowInventory || []
            ).slice(0, 10),
            topObjects: Object.entries(
              results.automationSummary.objectMap || {},
            )
              .sort((a, b) => b[1].total - a[1].total)
              .slice(0, 8)
              .map(([obj, c]) => ({ obj, ...c })),
          }
        : null,
      governorRisks: (results.governorRisks || [])
        .sort((a, b) => {
          const riskRank = (r) => {
            const p = r.prediction || {};
            return [
              "soqlQueries",
              "dmlStatements",
              "cpuTime",
              "heapSize",
            ].filter((k) => (p[k] && p[k].risk) === "high").length;
          };
          return riskRank(b) - riskRank(a);
        })
        .slice(0, 5)
        .map((r) => ({
          className: r.className,
          soqlRisk: r.prediction?.soqlQueries?.risk || "low",
          dmlRisk: r.prediction?.dmlStatements?.risk || "low",
          cpuRisk: r.prediction?.cpuTime?.risk || "low",
        })),
      userSummary: results.userSummary || null,
      profileSummary: results.profileSummary || null,
    };
  }

  /**
   * Build the data-driven CTA Architecture Review page HTML.
   * Used by both the full health-report PDF and the standalone CTA PDF export.
   * Returns an empty string when no ctaReview is available.
   */
  function buildCtaPageHtml(iconDataUri, org, now, isStandalone) {
    function esc(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const ctaReview = results.ctaReview;
    if (!ctaReview || !ctaReview.verdict) { return ""; }

    const cvc = ctaReview.verdict === "Go" ? "#1a7f45" : ctaReview.verdict === "No-Go" ? "#c0392b" : "#b45309";
    const cvBg = ctaReview.verdict === "Go" ? "#d1fae5" : ctaReview.verdict === "No-Go" ? "#fee2e2" : "#fef3c7";
    const cvIcon = ctaReview.verdict === "Go" ? "✅" : ctaReview.verdict === "No-Go" ? "🚫" : "⚠️";
    const cvLabel = ctaReview.verdict === "Go" ? "Architecture Approved" : ctaReview.verdict === "No-Go" ? "Significant Issues Found" : "Conditional Approval";

    const pdfH = (icon, title, badge) =>
      `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1.5px solid #e5e7eb">
        <span style="font-size:20px">${icon}</span>
        <span style="font-size:14px;font-weight:800;color:#1a1a2e;flex:1">${title}</span>
        <span style="font-size:9px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:10px">${badge}</span>
      </div>`;
    const pdfCard = (content) =>
      `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:14px">${content}</div>`;
    const effortColor = (e) => e === "Low" ? "#1a7f45" : e === "High" ? "#c0392b" : "#b45309";
    const effortBg    = (e) => e === "Low" ? "#d1fae5" : e === "High" ? "#fee2e2" : "#fef3c7";
    const statusColor = (s) => s === "Pass" ? "#1a7f45" : s === "Fail" ? "#c0392b" : "#b45309";
    const statusBg    = (s) => s === "Pass" ? "#d1fae5" : s === "Fail" ? "#fee2e2" : "#fef3c7";

    // §1 Verdict
    const matLvl = ctaReview.architectureMaturity;
    const maturityBadgePdf = matLvl
      ? `<div style="margin-top:8px;font-size:11px;color:#6b7280">Architecture Maturity: <strong style="color:${cvc}">Level ${matLvl.level} — ${esc(matLvl.label)}</strong></div>`
      : "";
    const verdictBlock = `<div style="background:${cvBg};border:2px solid ${cvc}40;border-radius:10px;padding:16px 20px;margin-bottom:14px;display:flex;align-items:center;gap:14px">
        <span style="font-size:28px">${cvIcon}</span>
        <div>
          <div style="font-size:17px;font-weight:800;color:${cvc}">${esc(ctaReview.verdict)} — ${cvLabel}</div>
          <div style="font-size:10px;color:#6b7280;margin-top:3px">✨ ${esc(ctaReview.modelUsed || "AI")} · ${ctaReview.generatedAt ? new Date(ctaReview.generatedAt).toLocaleString() : "Generated"}</div>
          ${maturityBadgePdf}
        </div>
      </div>`;

    // §2 Executive Summary
    const execBlock = pdfCard(
      `<div style="font-size:9px;color:#0176d3;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">§1 Executive Summary</div>` +
      `<p style="font-size:12px;color:#1f2937;line-height:1.7;margin:0">${esc(ctaReview.executiveSummary || "")}</p>`
    );

    // §3 Architecture Maturity
    const maturityBlock = matLvl
      ? pdfCard(
          pdfH("🏅", "Architecture Maturity", "§2") +
          `<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px">` +
          ["Ad Hoc","Repeatable","Defined","Managed","Optimised"].map((lbl, i) => {
            const active = i + 1 === matLvl.level;
            const colors = ["#c0392b","#f97316","#b45309","#1a7f45","#0176d3"];
            return `<div style="flex:1;text-align:center;padding:4px 2px;border-radius:4px;font-size:9px;font-weight:${active ? 800 : 400};background:${active ? colors[i] : "#f3f4f6"};color:${active ? "#fff" : "#6b7280"}">${i + 1}<br>${lbl}</div>`;
          }).join('<div style="width:4px;height:4px;background:#d1d5db;border-radius:50%;margin-top:10px"></div>') +
          `</div><p style="font-size:11px;color:#374151;line-height:1.6;margin:0">${esc(matLvl.summary)}</p>`
        )
      : "";

    // §4 Business Impact
    const bi = ctaReview.businessImpactSummary;
    const biBlock = bi
      ? pdfCard(
          pdfH("💼", "Business Impact Summary", "§3") +
          `<div style="display:flex;gap:10px;margin-bottom:8px">
            <div style="flex:1;padding:10px;background:#fff5f5;border-radius:6px;border-top:3px solid #c0392b"><div style="font-size:9px;font-weight:700;color:#c0392b;margin-bottom:4px">💰 Revenue Risk</div><div style="font-size:11px;color:#374151">${esc(bi.revenueRisk)}</div></div>
            <div style="flex:1;padding:10px;background:#fffbeb;border-radius:6px;border-top:3px solid #b45309"><div style="font-size:9px;font-weight:700;color:#b45309;margin-bottom:4px">⚙️ Operational Risk</div><div style="font-size:11px;color:#374151">${esc(bi.operationalRisk)}</div></div>
            <div style="flex:1;padding:10px;background:#faf5ff;border-radius:6px;border-top:3px solid #7c3aed"><div style="font-size:9px;font-weight:700;color:#7c3aed;margin-bottom:4px">🔏 Compliance Risk</div><div style="font-size:11px;color:#374151">${esc(bi.complianceRisk)}</div></div>
          </div>`
        )
      : "";

    // §5 Org Profile
    const op = ctaReview.orgProfile;
    const opBlock = op
      ? pdfCard(
          pdfH("🏢", "Org Profile", "§4") +
          `<div style="display:flex;flex-wrap:wrap;gap:8px">
            <div style="flex:1;min-width:120px"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Complexity</span><br><span style="font-size:12px;font-weight:700">${esc(op.complexity)}</span></div>
            <div style="flex:1;min-width:120px"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">User Scale</span><br><span style="font-size:12px">${esc(op.userScale)}</span></div>
            <div style="flex:1;min-width:120px"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Integrations</span><br><span style="font-size:12px">${esc(op.integrationFootprint)}</span></div>
            <div style="flex:1;min-width:120px"><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Customisation</span><br><span style="font-size:12px">${esc(op.customizationLevel)}</span></div>
          </div>`
        )
      : "";

    // §6 Health Score Breakdown
    const hsbBlock = (ctaReview.healthScoreBreakdown || []).length
      ? pdfCard(
          pdfH("📊", "Health Score Breakdown", "§5") +
          (ctaReview.healthScoreBreakdown || []).map((s) => {
            const pct = Math.min(100, Math.round((s.score / (s.maxScore || 100)) * 100));
            const barC = pct >= 75 ? "#1a7f45" : pct >= 50 ? "#b45309" : "#c0392b";
            const tIcon = { improving: "↑", stable: "→", declining: "↓" }[s.trend] || "→";
            return `<div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span style="font-size:11px;font-weight:600">${esc(s.area)}</span>
                <span style="font-size:11px;font-weight:700;color:${barC}">${s.score}/100 ${tIcon}</span>
              </div>
              <div style="height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden">
                <div style="height:6px;background:${barC};width:${pct}%;border-radius:3px"></div>
              </div>
              <div style="font-size:10px;color:#6b7280;margin-top:2px">${esc(s.keyFinding)}</div>
            </div>`;
          }).join("")
        )
      : "";

    // §7 Top Critical Issues
    const critIssBlock = (ctaReview.topCriticalIssues || []).length
      ? pdfCard(
          pdfH("🚨", "Top Critical Issues", "§6") +
          `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:1.5px solid #e5e7eb">
              <th style="text-align:center;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280;width:30px">#</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Issue</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280;width:70px">Severity</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Impact</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Effort</th>
            </tr></thead>
            <tbody>${(ctaReview.topCriticalIssues || []).map((iss, i) => {
              const sC = iss.severity === "Critical" ? "#c0392b" : "#b45309";
              const sBg = iss.severity === "Critical" ? "#fee2e2" : "#fef3c7";
              return `<tr style="background:${i % 2 ? "#f9fafb" : "#fff"}">
                <td style="padding:6px 8px;text-align:center;font-weight:700;font-size:11px;border-bottom:1px solid #e5e7eb">${iss.rank}</td>
                <td style="padding:6px 8px;font-weight:600;font-size:11px;border-bottom:1px solid #e5e7eb">${esc(iss.title)}<br><span style="font-size:9px;color:#6b7280;font-weight:400">${esc(iss.domain)}</span></td>
                <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb"><span style="font-size:9px;font-weight:700;color:${sC};background:${sBg};padding:2px 6px;border-radius:10px">${esc(iss.severity)}</span></td>
                <td style="padding:6px 8px;font-size:10px;border-bottom:1px solid #e5e7eb">${esc(iss.impact)}</td>
                <td style="padding:6px 8px;font-size:10px;border-bottom:1px solid #e5e7eb">${esc(iss.effortEstimate)}</td>
              </tr>`;
            }).join("")}</tbody>
          </table>`
        )
      : "";

    // §8 Risk Analysis
    const ra = ctaReview.riskAnalysis;
    const riskBlock = ra
      ? pdfCard(
          pdfH("🔥", "Risk Analysis", "§7") +
          `<div style="display:flex;gap:16px">
            <div style="flex:1">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Probability of Incident</div>
              <div style="font-size:11px;color:#374151;margin-bottom:8px">${esc(ra.probabilityOfIncident)}</div>
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Time to Risk</div>
              <div style="font-size:12px;font-weight:700;color:#c0392b">${esc(ra.timeToRisk)}</div>
            </div>
            <div style="flex:1">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Risk Heatmap</div>
              ${(ra.riskHeatmap || []).map((cell) => {
                const l = { Low: 1, Medium: 2, High: 3 }[cell.likelihood] || 1;
                const im = { Low: 1, Medium: 2, High: 3 }[cell.impact] || 1;
                const r = l * im;
                const rc = r >= 6 ? "#c0392b" : r >= 3 ? "#b45309" : "#1a7f45";
                const rb = r >= 6 ? "#fee2e2" : r >= 3 ? "#fef3c7" : "#d1fae5";
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;padding:3px 6px;background:${rb};border-radius:4px;border-left:3px solid ${rc}">
                  <span style="font-size:10px;flex:1">${esc(cell.domain)}</span>
                  <span style="font-size:9px;font-weight:700;color:${rc}">L:${esc(cell.likelihood)} I:${esc(cell.impact)}</span>
                </div>`;
              }).join("")}
            </div>
          </div>`
        )
      : "";

    // §9 Benchmark Comparison
    const bmBlock = (ctaReview.benchmarkComparison || []).length
      ? pdfCard(
          pdfH("📈", "Benchmark Comparison", "§8") +
          `<table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:1.5px solid #e5e7eb">
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Metric</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Your Org</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Avg</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Top 25%</th>
              <th style="text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;color:#6b7280">Status</th>
            </tr></thead>
            <tbody>${(ctaReview.benchmarkComparison || []).map((b, i) => {
              const stC = b.status === "Above" ? "#1a7f45" : b.status === "At" ? "#b45309" : "#c0392b";
              const stBgc = b.status === "Above" ? "#d1fae5" : b.status === "At" ? "#fef3c7" : "#fee2e2";
              return `<tr style="background:${i % 2 ? "#f9fafb" : "#fff"}">
                <td style="padding:5px 8px;font-weight:600;font-size:11px;border-bottom:1px solid #e5e7eb">${esc(b.metric)}</td>
                <td style="padding:5px 8px;font-size:11px;font-weight:700;border-bottom:1px solid #e5e7eb">${esc(String(b.orgValue))}</td>
                <td style="padding:5px 8px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">${esc(String(b.industryAvg))}</td>
                <td style="padding:5px 8px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">${esc(String(b.topQuartile))}</td>
                <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb"><span style="font-size:9px;font-weight:700;color:${stC};background:${stBgc};padding:2px 6px;border-radius:10px">${esc(b.status)}</span></td>
              </tr>`;
            }).join("")}</tbody>
          </table>`
        )
      : "";

    // §10 Domain Findings
    const domainBlock = pdfCard(
      pdfH("🏗️", "Domain Findings", "§9") +
      `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1.5px solid #e5e7eb">
          <th style="text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;color:#6b7280;width:20%">Domain</th>
          <th style="text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;color:#6b7280;width:10%">Status</th>
          <th style="text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;color:#6b7280">Analysis</th>
        </tr></thead>
        <tbody>${(ctaReview.domainFindings || []).map((d) => {
          const stC = statusColor(d.status);
          const stBgc = statusBg(d.status);
          return `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 10px;font-weight:600;font-size:11px">${esc(d.domain)}</td>
            <td style="padding:8px 10px"><span style="font-size:9px;font-weight:700;color:${stC};background:${stBgc};padding:2px 6px;border-radius:10px">${esc(d.status)}</span></td>
            <td style="padding:8px 10px;font-size:11px;line-height:1.5">${esc(d.analysis || "")}</td>
          </tr>`;
        }).join("")}</tbody>
      </table>`
    );

    // §11 AI Insights
    const ai = ctaReview.aiInsights;
    const aiBlock = ai
      ? pdfCard(
          pdfH("✨", "AI Insights", "§10") +
          `<div style="display:flex;gap:12px">
            ${(ai.hiddenRisks || []).length ? `<div style="flex:1"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#c0392b;margin-bottom:6px">🔍 Hidden Risks</div>${ai.hiddenRisks.map((it) => `<div style="font-size:11px;color:#374151;margin-bottom:4px;padding-left:8px;border-left:2px solid #c0392b">${esc(it)}</div>`).join("")}</div>` : ""}
            ${(ai.predictions || []).length ? `<div style="flex:1"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#7c3aed;margin-bottom:6px">🔮 Predictions</div>${ai.predictions.map((it) => `<div style="font-size:11px;color:#374151;margin-bottom:4px;padding-left:8px;border-left:2px solid #7c3aed">${esc(it)}</div>`).join("")}</div>` : ""}
            ${(ai.unusualPatterns || []).length ? `<div style="flex:1"><div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#b45309;margin-bottom:6px">⚡ Unusual Patterns</div>${ai.unusualPatterns.map((it) => `<div style="font-size:11px;color:#374151;margin-bottom:4px;padding-left:8px;border-left:2px solid #b45309">${esc(it)}</div>`).join("")}</div>` : ""}
          </div>`
        )
      : "";

    // §12 Architecture Observations (SWOT)
    const obsBlock = (ctaReview.architectureObservations || []).length
      ? pdfCard(
          pdfH("🔭", "Architecture Observations", "§11") +
          (() => {
            const grouped = { Strength: [], Weakness: [], Opportunity: [], Threat: [] };
            (ctaReview.architectureObservations || []).forEach((o) => {
              if (grouped[o.classification]) grouped[o.classification].push(o.observation);
            });
            const clr = { Strength: "#1a7f45", Weakness: "#c0392b", Opportunity: "#0176d3", Threat: "#b45309" };
            const clrBg = { Strength: "#d1fae5", Weakness: "#fee2e2", Opportunity: "#dbeafe", Threat: "#fef3c7" };
            const icons = { Strength: "💪", Weakness: "⚠️", Opportunity: "🚀", Threat: "🔴" };
            const clsLabel = { Strength: "Strengths", Weakness: "Weaknesses", Opportunity: "Opportunities", Threat: "Threats" };
            return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">` +
              ["Strength","Weakness","Opportunity","Threat"].map((cls) =>
                `<div style="padding:10px;border-radius:6px;background:${clrBg[cls]};border-left:3px solid ${clr[cls]}">
                  <div style="font-size:9px;font-weight:700;color:${clr[cls]};margin-bottom:6px">${icons[cls]} ${clsLabel[cls]}</div>
                  ${grouped[cls].map((obs) => `<div style="font-size:10px;color:#374151;margin-bottom:3px">· ${esc(obs)}</div>`).join("") || '<div style="font-size:10px;color:#9ca3af">None identified</div>'}
                </div>`
              ).join("") + `</div>`;
          })()
        )
      : "";

    // §13 Recommendations
    const rec = ctaReview.recommendations;
    const recBlock = rec
      ? pdfCard(
          pdfH("⚡", "Recommendations", "§12") +
          ((rec.quickWins || []).length
            ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:6px">Quick Wins (1-2 sprints)</div>` +
              (rec.quickWins || []).map((w, i) =>
                `<div style="display:flex;gap:8px;margin-bottom:6px;padding:6px 10px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0">
                  <span style="min-width:18px;height:18px;background:#1a7f45;color:#fff;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span>
                  <div><div style="font-size:11px">${esc(w.action)}</div><span style="font-size:9px;font-weight:700;color:${effortColor(w.effort)};background:${effortBg(w.effort)};padding:1px 5px;border-radius:8px">${esc(w.effort)}</span> <span style="font-size:10px;color:#6b7280">${esc(w.impact)}</span></div>
                </div>`
              ).join("")
            : "") +
          ((rec.strategic || []).length
            ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:10px 0 6px">Strategic Initiatives</div>` +
              (rec.strategic || []).map((s, i) =>
                `<div style="display:flex;gap:8px;margin-bottom:6px;padding:6px 10px;background:#eff6ff;border-radius:6px;border:1px solid #bfdbfe">
                  <span style="min-width:18px;height:18px;background:#0176d3;color:#fff;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span>
                  <div><div style="font-size:11px;font-weight:600">${esc(s.action)}</div><div style="display:flex;gap:6px;margin-top:2px"><span style="font-size:10px;color:#6b7280">📅 ${esc(s.timeline)}</span> <span style="font-size:9px;font-weight:700;color:${effortColor(s.effort)};background:${effortBg(s.effort)};padding:1px 5px;border-radius:8px">${esc(s.effort)}</span> <span style="font-size:10px;color:#6b7280">${esc(s.impact)}</span></div></div>
                </div>`
              ).join("")
            : "")
        )
      : "";

    // §14 Cost of Inaction
    const coi = ctaReview.costOfInaction;
    const coiBlock = coi
      ? pdfCard(
          pdfH("⏳", "Cost of Inaction", "§13") +
          `<div style="display:flex;gap:12px;margin-bottom:10px">
            <div style="flex:1;padding:10px;background:#fff5f5;border-radius:6px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#c0392b;margin-bottom:4px">Financial Impact</div>
              <div style="font-size:11px;color:#374151">${esc(coi.financialImpact)}</div>
            </div>
            <div style="flex:1;padding:10px;background:#fffbeb;border-radius:6px">
              <div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#b45309;margin-bottom:4px">Technical Debt Growth</div>
              <div style="font-size:11px;color:#374151">${esc(coi.technicalDebtGrowth)}</div>
            </div>
          </div>` +
          ((coi.risks || []).length
            ? `<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Compounding Risks</div>` +
              coi.risks.map((r) => `<div style="font-size:11px;color:#374151;margin-bottom:3px;display:flex;gap:6px"><span style="color:#c0392b">●</span>${esc(r)}</div>`).join("")
            : "")
        )
      : "";

    // §15 Final Recommendation
    const fr = ctaReview.finalRecommendation;
    const finalBlock = fr
      ? `<div style="background:${cvBg};border:2px solid ${cvc}30;border-radius:10px;padding:16px 20px;margin-bottom:14px">
          ${pdfH(cvIcon, "Final CTA Recommendation", "§14")}
          <p style="font-size:12px;font-weight:500;color:#1f2937;line-height:1.7;margin-bottom:12px">${esc(fr.summary)}</p>
          ${(fr.nextSteps || []).length
            ? `<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Immediate Next Steps</div>` +
              fr.nextSteps.map((step, i) =>
                `<div style="display:flex;gap:8px;margin-bottom:4px"><span style="min-width:16px;height:16px;background:${cvc};color:#fff;border-radius:50%;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span><span style="font-size:11px">${esc(step)}</span></div>`
              ).join("")
            : ""}
          ${fr.proposedTimeline ? `<div style="margin-top:8px;padding:4px 8px;background:rgba(0,0,0,.04);border-radius:6px;font-size:8.5px;color:#374151;line-height:1.5"><strong>📅 </strong>${esc(fr.proposedTimeline)}</div>` : ""}
        </div>`
      : "";

    const logoBar = iconDataUri
      ? `<span><img src="${iconDataUri}" style="width:18px;height:18px;object-fit:contain;border-radius:3px;vertical-align:middle;margin-right:4px;opacity:.7" alt="" />OrgPulse · CTA Architecture Review</span>`
      : "<span>OrgPulse · CTA Architecture Review</span>";

    return '<div class="page" style="position:relative">' +
      (iconDataUri ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04"><img src="${iconDataUri}" style="width:260px;height:260px;object-fit:contain" alt="" /></div>` : "") +
      (isStandalone ? "" : `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#9ca3af;position:relative;z-index:1">${logoBar}<span>${esc(org)} · ${now}</span></div>`) +
      `<div style="font-size:19px;font-weight:800;color:#1a1a2e;margin-bottom:4px;position:relative;z-index:1">🧠 CTA Architecture Review</div>` +
      `<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;position:relative;z-index:1">Executive Architecture Assessment · Prepared by OrgPulse</div>` +
      verdictBlock + execBlock +
      '<div style="page-break-before:always;padding-top:2px">' +
        maturityBlock + biBlock + opBlock + hsbBlock +
      '</div>' +
      '<div style="page-break-before:always;padding-top:2px">' +
        critIssBlock + riskBlock + bmBlock +
      '</div>' +
      '<div style="page-break-before:always;padding-top:2px">' +
        domainBlock + aiBlock + obsBlock +
      '</div>' +
      '<div style="page-break-before:always;padding-top:2px">' +
        recBlock + coiBlock + finalBlock +
      '</div>' +
      '</div>';
  }

  function printReportDirectly(aiSummary, iconDataUri) {
    const s = results.scores || {};
    const sum = results.summary || {};
    const meta = results.metadata || {};
    const inv = results.orgInventory;
    const dm = results.dataModelStats || [];
    const auto = results.automationSummary;
    const govRisks = results.governorRisks || [];
    const allIssues = results.issues || [];

    const now = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const org = meta.orgAlias || meta.orgUsername || "Salesforce Org";

    // ── helpers ────────────────────────────────────────────────────────────
    function esc(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function scoreColor(v) {
      const n = Math.round(v || 0);
      return n >= 80 ? "#1a7f45" : n >= 60 ? "#b45309" : "#c0392b";
    }

    function scoreBg(v) {
      const n = Math.round(v || 0);
      return n >= 80 ? "#d1fae5" : n >= 60 ? "#fef3c7" : "#fee2e2";
    }

    function scoreLabel(v) {
      const n = Math.round(v || 0);
      return n >= 80 ? "HEALTHY" : n >= 60 ? "NEEDS ATTENTION" : "AT RISK";
    }

    function riskBadge(risk) {
      const cfg = {
        high: ["#c0392b", "#fee2e2"],
        medium: ["#b45309", "#fef3c7"],
        low: ["#1a7f45", "#d1fae5"],
      };
      const [col, bg] = cfg[risk] || cfg["low"];
      return `<span style="background:${bg};color:${col};border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${esc(risk)}</span>`;
    }

    function scoreBadgeHtml(val, label) {
      const n = Math.round(val || 0);
      return `
        <div style="display:inline-flex;align-items:center;gap:12px;background:${scoreBg(n)};border:1.5px solid ${scoreColor(n)};border-radius:10px;padding:10px 18px;margin-bottom:16px">
          <div style="font-size:36px;font-weight:900;color:${scoreColor(n)};line-height:1">${n}</div>
          <div>
            <div style="font-size:10px;color:${scoreColor(n)};font-weight:700;text-transform:uppercase;letter-spacing:.1em">${scoreLabel(n)}</div>
            <div style="font-size:11px;color:#555;margin-top:2px">${esc(label)} · Score out of 100</div>
          </div>
        </div>`;
    }

    function scoreBar(val) {
      const pct = Math.min(Math.max(val || 0, 0), 100);
      return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
        <div style="flex:1;background:#e5e7eb;border-radius:4px;height:7px">
          <div style="width:${pct}%;background:${scoreColor(pct)};height:7px;border-radius:4px"></div>
        </div>
        <span style="font-size:12px;font-weight:700;color:${scoreColor(pct)};min-width:28px;text-align:right">${Math.round(pct)}</span>
      </div>`;
    }

    function issuesByCategory(cat) {
      return allIssues
        .filter((i) => i.category === cat && i.severity === "error")
        .slice(0, 6);
    }

    function issuesByCategoryWarn(cat) {
      return allIssues
        .filter(
          (i) =>
            i.category === cat &&
            (i.severity === "error" || i.severity === "warning"),
        )
        .slice(0, 6);
    }

    function miniIssueTable(issues, emptyMsg) {
      if (!issues.length)
        return `<p style="color:#888;font-size:12px;font-style:italic;margin:8px 0">${emptyMsg || "No critical issues found."}</p>`;
      return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:8px">
        <thead><tr style="background:#f3f4f6">
          <th style="text-align:left;padding:5px 8px;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb">Finding</th>
          <th style="text-align:left;padding:5px 8px;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb;width:120px">Component</th>
          <th style="text-align:left;padding:5px 8px;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb;width:80px">Severity</th>
        </tr></thead>
        <tbody>${issues
          .map(
            (i, idx) => `
          <tr style="background:${idx % 2 === 0 ? "#fff" : "#f9fafb"}">
            <td style="padding:5px 8px;color:#1f2937;border-bottom:1px solid #f3f4f6">${esc(i.message)}</td>
            <td style="padding:5px 8px;color:#6b7280;border-bottom:1px solid #f3f4f6;font-size:10px">${esc(i.object || i.file || "")}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">${riskBadge(i.severity === "error" ? "high" : i.severity === "warning" ? "medium" : "low")}</td>
          </tr>`,
          )
          .join("")}
        </tbody>
      </table>`;
    }

    function kpiStrip(items) {
      return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0 16px">
        ${items
          .map(
            ([v, lbl, color]) => `
          <div style="flex:1;min-width:90px;max-width:140px;background:#f9fafb;border-radius:8px;padding:10px 12px;border:1px solid #e5e7eb;border-top:3px solid ${color || "#0176d3"}">
            <div style="font-size:24px;font-weight:900;color:${color || "#0176d3"};line-height:1">${v}</div>
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-top:3px">${esc(lbl)}</div>
          </div>`,
          )
          .join("")}
      </div>`;
    }

    function actionsBlock(items) {
      return `<div style="background:#f0f7ff;border-left:4px solid #0176d3;border-radius:0 8px 8px 0;padding:14px 18px;margin-top:14px">
        <div style="font-size:11px;font-weight:700;color:#0176d3;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">▶ Recommended Actions</div>
        <ol style="margin:0;padding-left:18px;line-height:1.9">
          ${items.map((a) => `<li style="font-size:12px;color:#1f2937">${a}</li>`).join("")}
        </ol>
      </div>`;
    }

    function findingsBullets(items) {
      if (!items.length)
        return `<p style="color:#888;font-size:12px;font-style:italic">No findings to report for this category.</p>`;
      return `<ul style="margin:0 0 12px;padding-left:18px;line-height:1.9">
        ${items.map((b) => `<li style="font-size:12px;color:#1f2937">${b}</li>`).join("")}
      </ul>`;
    }

    function pageHeader(icon, title, scoreKey) {
      const scoreVal = s[scoreKey];
      const logoHtml = iconDataUri
        ? `<img src="${iconDataUri}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;display:block" alt="OrgPulse" />`
        : "";
      const watermark = iconDataUri
        ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04">
             <img src="${iconDataUri}" style="width:260px;height:260px;object-fit:contain" alt="" />
           </div>`
        : "";
      return `
        ${watermark}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#9ca3af;gap:10px">
          <span style="display:inline-flex;align-items:center;gap:6px;line-height:1.2">${logoHtml}<span>OrgPulse · Salesforce Architecture Health Report</span></span>
          <span>${esc(org)} · ${now}</span>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;position:relative;z-index:1">
          <div>
            <div style="font-size:19px;font-weight:800;color:#1a1a2e">${icon} ${esc(title)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:.06em">Domain Assessment</div>
          </div>
          ${scoreVal !== undefined ? scoreBadgeHtml(scoreVal, title) : ""}
        </div>`;
    }

    // ── Page 1: Cover ──────────────────────────────────────────────────────
    const overallColor = scoreColor(s.overall || 0);
    const overallBg = scoreBg(s.overall || 0);

    const coverPage = `
      <div class="page cover-page" style="position:relative">
        ${iconDataUri ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04"><img src="${iconDataUri}" style="width:320px;height:320px;object-fit:contain" alt="" /></div>` : ""}
        <div style="border-bottom:4px solid #0176d3;padding-bottom:32px;margin-bottom:32px;position:relative;z-index:1">
          <div style="display:flex;align-items:center;gap:10px;font-size:11px;color:#0176d3;font-weight:700;letter-spacing:.15em;text-transform:uppercase;margin-bottom:20px">
            ${iconDataUri ? `<img src="${iconDataUri}" style="width:32px;height:32px;object-fit:contain;border-radius:6px" alt="OrgPulse" />` : ""}
            OrgPulse · Salesforce Architecture Health Report
          </div>
          <div style="font-size:38px;font-weight:900;color:#1a1a2e;line-height:1.15;margin-bottom:8px">
            Salesforce Org<br>Health Assessment
          </div>
          <div style="font-size:15px;color:#6b7280;margin-bottom:28px">${esc(org)}</div>
          <div style="display:inline-flex;align-items:center;gap:18px;background:${overallBg};border:2px solid ${overallColor};border-radius:14px;padding:14px 24px">
            <div style="font-size:56px;font-weight:900;color:${overallColor};line-height:1">${Math.round(s.overall || 0)}</div>
            <div>
              <div style="font-size:22px;font-weight:800;color:${overallColor}">${scoreLabel(s.overall || 0)}</div>
              <div style="font-size:12px;color:#555;margin-top:2px">Overall Health Score / 100</div>
            </div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:32px">
          <tbody>
            ${[
              ["Code Quality", s.codeQuality],
              ["Automation Design", s.automationDesign],
              ["Data Model", s.dataModel],
              ["Performance", s.performance],
              ["Security", s.security],
              ["Test Coverage", s.testing],
              ["Integration", s.integration],
            ]
              .filter(([, v]) => v !== undefined)
              .map(
                ([lbl, v]) => `
              <tr>
                <td style="padding:7px 12px 7px 0;font-weight:600;font-size:12px;width:160px;color:#374151">${esc(lbl)}</td>
                <td style="padding:7px 0">${scoreBar(v)}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:32px">
          <div style="flex:1;min-width:110px;background:#fff3f3;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#c0392b">${sum.errorCount || 0}</div>
            <div style="font-size:10px;color:#9b1c1c;text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Critical Issues</div>
          </div>
          <div style="flex:1;min-width:110px;background:#fff8e1;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#b45309">${sum.warningCount || 0}</div>
            <div style="font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Warnings</div>
          </div>
          <div style="flex:1;min-width:110px;background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:12px 16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#0176d3">${sum.totalIssues || 0}</div>
            <div style="font-size:10px;color:#1e40af;text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Total Findings</div>
          </div>
          ${
            inv
              ? `
          <div style="flex:1;min-width:110px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#1a7f45">${inv.totalComponents || 0}</div>
            <div style="font-size:10px;color:#14532d;text-transform:uppercase;letter-spacing:.07em;margin-top:2px">Components Analyzed</div>
          </div>`
              : ""
          }
        </div>
        <div style="border-top:1px solid #e5e7eb;padding-top:20px;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af">
          <span>Confidential — For Leadership Review Only</span>
          <span>${now}</span>
        </div>
        ${meta.orgUsername ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">Org: ${esc(meta.orgUsername)}${meta.apiVersion ? " · API v" + esc(String(meta.apiVersion)) : ""}</div>` : ""}
      </div>`;

    // ── Page 2: Executive Summary ──────────────────────────────────────────
    const atRiskDomains = [
      ["Code Quality", s.codeQuality],
      ["Automation Design", s.automationDesign],
      ["Data Model", s.dataModel],
      ["Performance", s.performance],
      ["Security", s.security],
      ["Test Coverage", s.testing],
    ]
      .filter(([, v]) => v !== undefined && v < 70)
      .map(([l]) => l);

    const execSummaryPage = `
      <div class="page" style="position:relative">
        ${iconDataUri ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04"><img src="${iconDataUri}" style="width:260px;height:260px;object-fit:contain" alt="" /></div>` : ""}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#9ca3af;position:relative;z-index:1">
          <span>${iconDataUri ? `<img src="${iconDataUri}" style="width:18px;height:18px;object-fit:contain;border-radius:3px;vertical-align:middle;margin-right:4px;opacity:.7" alt="" />` : ""}OrgPulse · Salesforce Architecture Health Report</span>
          <span>${esc(org)} · ${now}</span>
        </div>
        <div style="font-size:19px;font-weight:800;color:#1a1a2e;margin-bottom:4px;position:relative;z-index:1">✨ Executive Summary</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;position:relative;z-index:1">
          Leadership Overview
        </div>

        ${
          aiSummary
            ? `
        <div style="background:#f0f7ff;border-left:4px solid #0176d3;border-radius:0 10px 10px 0;padding:18px 22px;margin-bottom:20px;font-size:13px;line-height:1.8;color:#1f2937">
          <div style="font-size:10px;color:#0176d3;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">AI-Generated Executive Summary · GitHub Copilot</div>
          ${esc(aiSummary).replace(/\n/g, "<br>")}
        </div>`
            : `
        <div style="background:#f9fafb;border-left:4px solid #9ca3af;border-radius:0 10px 10px 0;padding:18px 22px;margin-bottom:20px">
          <div style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Summary</div>
          <p style="font-size:13px;color:#374151;line-height:1.8;margin:0">
            This report presents a comprehensive health assessment of <strong>${esc(org)}</strong> conducted on ${now}.
            The org achieved an overall health score of <strong style="color:${overallColor}">${Math.round(s.overall || 0)}/100</strong>,
            with <strong>${sum.errorCount || 0} critical issues</strong> and <strong>${sum.warningCount || 0} warnings</strong> identified across
            ${inv ? inv.totalComponents || 0 : "multiple"} analyzed components.
            ${atRiskDomains.length ? `<br><br>Domains requiring immediate attention: <strong>${atRiskDomains.join(", ")}</strong>.` : ""}
          </p>
        </div>`
        }

        <div style="font-size:13px;font-weight:700;color:#1a1a2e;margin:18px 0 10px">Score Summary by Domain</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f3f4f6">
            <th style="text-align:left;padding:7px 10px;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb">Domain</th>
            <th style="text-align:left;padding:7px 10px;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb;width:220px">Score</th>
            <th style="text-align:left;padding:7px 10px;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb;width:120px">Status</th>
            <th style="text-align:right;padding:7px 10px;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb;width:80px">Issues</th>
          </tr></thead>
          <tbody>
            ${[
              ["Code Quality", "code-quality", s.codeQuality],
              ["Automation Design", "automation-design", s.automationDesign],
              ["Data Model", "data-model", s.dataModel],
              ["Performance", "performance", s.performance],
              ["Security", "security", s.security],
              ["Test Coverage", "testing", s.testing],
              ["Integration", "integration", s.integration],
            ]
              .filter(([, , v]) => v !== undefined)
              .map(([lbl, cat, v], idx) => {
                const catCount = allIssues.filter(
                  (i) => i.category === cat && i.severity === "error",
                ).length;
                return `<tr style="background:${idx % 2 === 0 ? "#fff" : "#f9fafb"}">
                <td style="padding:7px 10px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6">${esc(lbl)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6">${scoreBar(v)}</td>
                <td style="padding:7px 10px;border-bottom:1px solid #f3f4f6">
                  <span style="background:${scoreBg(v)};color:${scoreColor(v)};border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700">${scoreLabel(v)}</span>
                </td>
                <td style="padding:7px 10px;text-align:right;font-weight:700;color:${catCount > 0 ? "#c0392b" : "#1a7f45"};border-bottom:1px solid #f3f4f6">${catCount}</td>
              </tr>`;
              })
              .join("")}
          </tbody>
        </table>

        ${
          inv
            ? `
        <div style="font-size:13px;font-weight:700;color:#1a1a2e;margin:22px 0 10px">Org Inventory at a Glance</div>
        ${kpiStrip([
          [inv.apexClassCount || 0, "Apex Classes", "#6366f1"],
          [inv.apexTriggerCount || 0, "Triggers", "#f59e0b"],
          [inv.flowCount || 0, "Flows", "#06b6d4"],
          [inv.customObjectCount || 0, "Custom Objects", "#8b5cf6"],
          [inv.customFieldCount || 0, "Custom Fields", "#0176d3"],
          [inv.validationRuleCount || 0, "Validation Rules", "#10b981"],
          [
            inv.installedPackages ? inv.installedPackages.length : 0,
            "Packages",
            "#ec4899",
          ],
        ])}`
            : ""
        }
      </div>`;

    // ── Page 3: Code Quality ───────────────────────────────────────────────
    const cqIssues = issuesByCategory("code-quality");
    const cqCount = allIssues.filter(
      (i) => i.category === "code-quality",
    ).length;
    const noSharing = allIssues.filter(
      (i) =>
        i.ruleId === "missing-with-sharing" ||
        (i.message || "").toLowerCase().includes("with sharing"),
    ).length;
    const soqlLoop = allIssues.filter(
      (i) =>
        i.ruleId === "soql-in-loop" ||
        (i.message || "").toLowerCase().includes("soql in loop"),
    ).length;
    const hardcode = allIssues.filter(
      (i) =>
        i.ruleId === "hardcoded-id" ||
        (i.message || "").toLowerCase().includes("hardcoded"),
    ).length;

    const cqFindings = [
      inv && inv.apexClassCount
        ? `<strong>${inv.apexClassCount} Apex classes</strong> analyzed, <strong>${cqCount} issues</strong> identified`
        : null,
      noSharing > 0
        ? `<strong>${noSharing} class(es)</strong> are missing <code>with sharing</code> keyword — potential data exposure risk`
        : null,
      soqlLoop > 0
        ? `<strong>${soqlLoop} instance(s)</strong> of SOQL queries inside loops detected — governor-limit risk under bulk load`
        : null,
      hardcode > 0
        ? `<strong>${hardcode} hardcoded ID(s)</strong> or org-specific values found — breaks sandbox refresh cycles`
        : null,
      (s.codeQuality || 0) >= 80
        ? `Code quality is <strong>healthy</strong> — maintain discipline with Apex best practices`
        : null,
    ].filter(Boolean);

    const cqPage = `
      <div class="page">
        ${pageHeader("⚙️", "Code Quality", "codeQuality")}
        ${kpiStrip([
          [inv ? inv.apexClassCount || 0 : "—", "Apex Classes", "#6366f1"],
          [inv ? inv.apexTriggerCount || 0 : "—", "Triggers", "#f59e0b"],
          [cqCount, "Total Issues", "#c0392b"],
          [noSharing, "Missing Sharing", "#e11d48"],
          [soqlLoop, "SOQL in Loops", "#b45309"],
          [hardcode, "Hardcoded IDs", "#7c3aed"],
        ])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Key Findings</div>
        ${findingsBullets(cqFindings.length ? cqFindings : [`${cqCount} code quality issues identified across Apex classes`])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Critical Issues Requiring Remediation</div>
        ${miniIssueTable(cqIssues, "No critical code quality issues — well done!")}
        ${actionsBlock([
          `Apply <code>with sharing</code> or <code>inherited sharing</code> to all Apex classes that access user data to enforce record-level security.`,
          `Refactor all SOQL/DML statements inside for-loops using collection-based patterns (bulk queries before loops, DML after accumulation).`,
          `Replace hardcoded IDs with <code>Custom Metadata Types</code> or <code>Custom Labels</code> so configurations survive sandbox refreshes.`,
          `Establish an Apex code review checklist enforcing naming conventions, bulk safety, and null-check patterns before every deployment.`,
        ])}
      </div>`;

    // ── Page 4: Automation Design ──────────────────────────────────────────
    const autoIssues = issuesByCategory("automation-design");
    const autoCount = allIssues.filter(
      (i) => i.category === "automation-design",
    ).length;
    const multiTrigger = allIssues.filter((i) =>
      (i.message || "").toLowerCase().includes("multiple trigger"),
    ).length;
    const pbCount = auto
      ? (auto.flowInventory || []).filter(
          (f) =>
            f.processType === "Workflow" || f.processType === "CustomObject",
        ).length
      : 0;
    const topAutoObjs = auto
      ? Object.entries(auto.objectMap || {})
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 5)
      : [];

    const autoFindings = [
      auto
        ? `<strong>${auto.totalFlows} flows</strong>, <strong>${auto.totalTriggers} triggers</strong>, and <strong>${auto.totalValidationRules} validation rules</strong> active across the org`
        : null,
      multiTrigger > 0
        ? `<strong>${multiTrigger} object(s)</strong> have multiple triggers — unpredictable execution order risk`
        : null,
      pbCount > 0
        ? `<strong>${pbCount} Process Builder / Workflow</strong> automation(s) found — these are retired by Salesforce and must be migrated to Flows`
        : null,
      topAutoObjs.length
        ? `Most automated object: <strong>${esc(topAutoObjs[0][0])}</strong> with ${topAutoObjs[0][1].total} automation(s)`
        : null,
      autoCount === 0
        ? `Automation design is <strong>healthy</strong> — good trigger architecture observed`
        : null,
    ].filter(Boolean);

    const autoPage = `
      <div class="page">
        ${pageHeader("⚡", "Automation Design", "automationDesign")}
        ${kpiStrip([
          [auto ? auto.totalTriggers || 0 : "—", "Triggers", "#f59e0b"],
          [auto ? auto.totalFlows || 0 : "—", "Flows", "#06b6d4"],
          [
            auto ? auto.totalValidationRules || 0 : "—",
            "Validation Rules",
            "#10b981",
          ],
          [pbCount, "Legacy PB/WF", "#c0392b"],
          [autoCount, "Issues Found", "#e11d48"],
          [multiTrigger, "Multi-Trigger Obj", "#b45309"],
        ])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Key Findings</div>
        ${findingsBullets(autoFindings.length ? autoFindings : ["Automation layer reviewed — see issues below"])}
        ${
          topAutoObjs.length
            ? `
        <div style="font-size:12px;font-weight:700;color:#374151;margin:12px 0 6px">Top Objects by Automation Complexity</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px">
          <thead><tr style="background:#f3f4f6">
            <th style="text-align:left;padding:5px 8px;border-bottom:2px solid #e5e7eb">Object</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:70px">Triggers</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:70px">Flows</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:80px">Validations</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:70px">Total</th>
          </tr></thead>
          <tbody>${topAutoObjs
            .map(
              ([obj, c], idx) => `
            <tr style="background:${idx % 2 === 0 ? "#fff" : "#f9fafb"}">
              <td style="padding:5px 8px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6">${esc(obj)}</td>
              <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f3f4f6">${c.triggers}</td>
              <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f3f4f6">${c.flows}</td>
              <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f3f4f6">${c.validations}</td>
              <td style="padding:5px 8px;text-align:right;font-weight:700;border-bottom:1px solid #f3f4f6">${c.total}</td>
            </tr>`,
            )
            .join("")}
          </tbody>
        </table>`
            : ""
        }
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Critical Automation Issues</div>
        ${miniIssueTable(autoIssues, "No critical automation issues — good design observed!")}
        ${actionsBlock([
          `Implement a <strong>Trigger Dispatcher pattern</strong> (one trigger per object, handler class) to ensure deterministic execution order.`,
          `Migrate all Process Builder and Workflow Rule automations to <strong>Record-Triggered Flows</strong> before Salesforce's retirement deadline.`,
          `Conduct an automation inventory review for objects with 5+ automations — consolidate or sequence to prevent recursion and conflicts.`,
          `Enable <strong>Before Save Flows</strong> for field updates to reduce DML operations and improve performance.`,
        ])}
      </div>`;

    // ── Page 5: Data Model ─────────────────────────────────────────────────
    const dmIssues = issuesByCategoryWarn("data-model");
    const dmCount = allIssues.filter((i) => i.category === "data-model").length;
    const totalFields = dm.reduce((a, o) => a + o.totalFields, 0);
    const unusedFields = dm.reduce((a, o) => a + o.unusedFields, 0);
    const noDescFields = dm.reduce((a, o) => a + o.fieldsWithoutDescription, 0);
    const topDmObjs = dm.slice(0, 5);

    const dmFindings = [
      dm.length
        ? `<strong>${inv ? inv.customObjectCount || dm.length : dm.length} custom objects</strong> analyzed with <strong>${totalFields} total custom fields</strong>`
        : null,
      unusedFields > 0
        ? `<strong>${unusedFields} custom field(s)</strong> appear unused — reducing technical debt and UI clutter`
        : null,
      noDescFields > 0
        ? `<strong>${noDescFields} field(s)</strong> lack descriptions — reduces discoverability and data dictionary quality`
        : null,
      topDmObjs.length && topDmObjs[0]
        ? `Most complex object: <strong>${esc(topDmObjs[0].objectName)}</strong> with ${topDmObjs[0].totalFields} custom fields`
        : null,
      dmCount === 0
        ? `Data model is <strong>healthy</strong> — field governance practices are sound`
        : null,
    ].filter(Boolean);

    const dmPage = `
      <div class="page">
        ${pageHeader("🗄️", "Data Model Health", "dataModel")}
        ${kpiStrip([
          [
            inv ? inv.customObjectCount || 0 : dm.length,
            "Custom Objects",
            "#8b5cf6",
          ],
          [totalFields, "Custom Fields", "#0176d3"],
          [unusedFields, "Potentially Unused", "#b45309"],
          [noDescFields, "No Description", "#f59e0b"],
          [
            inv ? inv.validationRuleCount || 0 : "—",
            "Validation Rules",
            "#10b981",
          ],
          [dmCount, "Issues Found", "#c0392b"],
        ])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Key Findings</div>
        ${findingsBullets(dmFindings.length ? dmFindings : ["Data model reviewed — see issues below"])}
        ${
          topDmObjs.length
            ? `
        <div style="font-size:12px;font-weight:700;color:#374151;margin:12px 0 6px">Objects by Field Complexity</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px">
          <thead><tr style="background:#f3f4f6">
            <th style="text-align:left;padding:5px 8px;border-bottom:2px solid #e5e7eb">Object</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:80px">Fields</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:80px">Unused</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:90px">No Desc</th>
            <th style="text-align:right;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:70px">Risk</th>
          </tr></thead>
          <tbody>${topDmObjs
            .map((o, idx) => {
              const risk =
                o.unusedFields > 10 || o.fieldsWithoutDescription > 20
                  ? "high"
                  : o.unusedFields > 5 || o.fieldsWithoutDescription > 10
                    ? "medium"
                    : "low";
              return `<tr style="background:${idx % 2 === 0 ? "#fff" : "#f9fafb"}">
              <td style="padding:5px 8px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6">${esc(o.objectName)}</td>
              <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f3f4f6">${o.totalFields}</td>
              <td style="padding:5px 8px;text-align:right;font-weight:600;color:${o.unusedFields > 5 ? "#b45309" : "#374151"};border-bottom:1px solid #f3f4f6">${o.unusedFields}</td>
              <td style="padding:5px 8px;text-align:right;font-weight:600;color:${o.fieldsWithoutDescription > 10 ? "#b45309" : "#374151"};border-bottom:1px solid #f3f4f6">${o.fieldsWithoutDescription}</td>
              <td style="padding:5px 8px;text-align:right;border-bottom:1px solid #f3f4f6">${riskBadge(risk)}</td>
            </tr>`;
            })
            .join("")}
          </tbody>
        </table>`
            : ""
        }
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Data Model Issues</div>
        ${miniIssueTable(dmIssues, "No critical data model issues — good schema design!")}
        ${actionsBlock([
          `Schedule a <strong>field audit sprint</strong> to review and retire unused custom fields — reduces object complexity and page-load time.`,
          `Add help text and descriptions to all custom fields to build a living data dictionary for onboarding and compliance.`,
          `Enforce a <strong>field naming and type convention</strong> standard for all new custom fields (e.g. unit suffix, picklist over text).`,
          `Review objects with deep relationship chains — consider flattening where reports and cross-object formulas cause query timeouts.`,
        ])}
      </div>`;

    // ── Page 6: Performance ────────────────────────────────────────────────
    const perfIssues = issuesByCategory("performance");
    const perfCount = allIssues.filter(
      (i) => i.category === "performance",
    ).length;
    const soqlInLoop = allIssues.filter(
      (i) =>
        i.ruleId === "soql-in-loop" ||
        (i.message || "").toLowerCase().includes("soql in loop"),
    ).length;
    const dmlInLoop = allIssues.filter(
      (i) =>
        i.ruleId === "dml-in-loop" ||
        (i.message || "").toLowerCase().includes("dml in loop"),
    ).length;
    const nonSelective = allIssues.filter(
      (i) =>
        (i.message || "").toLowerCase().includes("non-selective") ||
        (i.message || "").toLowerCase().includes("selective"),
    ).length;
    const highRiskGov = govRisks.filter(
      (r) =>
        r.prediction &&
        (r.prediction.soqlQueries?.risk === "high" ||
          r.prediction.dmlStatements?.risk === "high"),
    ).length;

    const perfFindings = [
      soqlInLoop > 0
        ? `<strong>${soqlInLoop} SOQL-in-loop</strong> violation(s) — will hit 100 SOQL governor limit under bulk data operations`
        : null,
      dmlInLoop > 0
        ? `<strong>${dmlInLoop} DML-in-loop</strong> violation(s) — will hit 150 DML statement limit in bulk context`
        : null,
      nonSelective > 0
        ? `<strong>${nonSelective} non-selective query</strong> pattern(s) — full table scans risk timeout on large data volumes`
        : null,
      highRiskGov > 0
        ? `<strong>${highRiskGov} Apex class(es)</strong> predicted to hit governor limits under production load`
        : null,
      perfCount === 0
        ? `Performance profile is <strong>healthy</strong> — bulk-safe patterns observed throughout`
        : null,
    ].filter(Boolean);

    const perfPage = `
      <div class="page">
        ${pageHeader("🚀", "Performance & Governor Limits", "performance")}
        ${kpiStrip([
          [soqlInLoop, "SOQL in Loops", "#c0392b"],
          [dmlInLoop, "DML in Loops", "#e11d48"],
          [nonSelective, "Non-Selective SOQL", "#b45309"],
          [highRiskGov, "Gov-Limit Classes", "#7c3aed"],
          [perfCount, "Total Issues", "#6b7280"],
        ])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Key Findings</div>
        ${findingsBullets(perfFindings.length ? perfFindings : ["Performance analysis complete — see issues below"])}
        ${
          govRisks.length
            ? `
        <div style="font-size:12px;font-weight:700;color:#374151;margin:12px 0 6px">Governor Limit Risk — Apex Classes</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px">
          <thead><tr style="background:#f3f4f6">
            <th style="text-align:left;padding:5px 8px;border-bottom:2px solid #e5e7eb">Class</th>
            <th style="text-align:center;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:80px">SOQL Risk</th>
            <th style="text-align:center;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:80px">DML Risk</th>
            <th style="text-align:center;padding:5px 8px;border-bottom:2px solid #e5e7eb;width:80px">CPU Risk</th>
          </tr></thead>
          <tbody>${govRisks
            .slice(0, 6)
            .map((r, idx) => {
              const p = r.prediction || {};
              const soqlR = p.soqlQueries?.risk || "low";
              const dmlR = p.dmlStatements?.risk || "low";
              const cpuR = p.cpuTime?.risk || "low";
              return `<tr style="background:${idx % 2 === 0 ? "#fff" : "#f9fafb"}">
              <td style="padding:5px 8px;font-weight:600;color:#1f2937;border-bottom:1px solid #f3f4f6">${esc(r.className)}</td>
              <td style="padding:5px 8px;text-align:center;border-bottom:1px solid #f3f4f6">${riskBadge(soqlR)}</td>
              <td style="padding:5px 8px;text-align:center;border-bottom:1px solid #f3f4f6">${riskBadge(dmlR)}</td>
              <td style="padding:5px 8px;text-align:center;border-bottom:1px solid #f3f4f6">${riskBadge(cpuR)}</td>
            </tr>`;
            })
            .join("")}
          </tbody>
        </table>`
            : ""
        }
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Performance Issues</div>
        ${miniIssueTable(perfIssues, "No critical performance issues — bulk-safe patterns in use!")}
        ${actionsBlock([
          `Eliminate all SOQL and DML statements inside for-loops — collect IDs, bulk-query outside, then process collections.`,
          `Add <strong>selective filter fields</strong> (indexed, low-cardinality) to all SOQL queries returning large datasets — avoid full scans.`,
          `Implement <code>Limits.getQueries()</code> guard checks in critical service classes and write bulk test scenarios with 200+ records.`,
          `Profile high-risk classes identified above using <strong>Apex Debug Log</strong> or <strong>Scale Center</strong> before next major release.`,
        ])}
      </div>`;

    // ── Page 7: Security & Governance ─────────────────────────────────────
    const secIssues = issuesByCategory("security");
    const secCount = allIssues.filter((i) => i.category === "security").length;
    const userGovIss = allIssues.filter(
      (i) => i.category === "user-governance",
    ).length;
    const profSecIss = allIssues.filter(
      (i) => i.category === "profile-security",
    ).length;
    const modAllData = results.profileSummary?.profilesWithModifyAllData || 0;
    const inactiveUsers = results.userSummary?.inactiveUsers || 0;
    const totalUsers = results.userSummary?.totalUsers || 0;

    const secFindings = [
      secCount > 0
        ? `<strong>${secCount} security violation(s)</strong> detected across Apex and configuration layers`
        : null,
      modAllData > 0
        ? `<strong>${modAllData} profile(s)</strong> have <em>Modify All Data</em> — violates principle of least privilege`
        : null,
      inactiveUsers > 0
        ? `<strong>${inactiveUsers} of ${totalUsers} users</strong> are inactive — consuming licenses and permission set assignments`
        : null,
      userGovIss > 0
        ? `<strong>${userGovIss} user governance issue(s)</strong> identified`
        : null,
      profSecIss > 0
        ? `<strong>${profSecIss} profile/permission-set</strong> misconfiguration(s) found`
        : null,
      secCount === 0
        ? `Security posture is <strong>healthy</strong> — sharing model and access controls are properly configured`
        : null,
    ].filter(Boolean);

    const secPage = `
      <div class="page">
        ${pageHeader("🔐", "Security & Governance", "security")}
        ${kpiStrip([
          [secCount, "Security Issues", "#c0392b"],
          [modAllData, "Modify All Data", "#e11d48"],
          [totalUsers, "Active Users", "#0176d3"],
          [inactiveUsers, "Inactive Users", "#b45309"],
          [
            inv ? inv.permissionSetCount || 0 : "—",
            "Permission Sets",
            "#8b5cf6",
          ],
          [userGovIss + profSecIss, "Governance Issues", "#6b7280"],
        ])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Key Findings</div>
        ${findingsBullets(secFindings.length ? secFindings : ["Security reviewed — see issues below"])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Critical Security Issues</div>
        ${miniIssueTable(secIssues, "No critical security issues — access model is well configured!")}
        ${actionsBlock([
          `Revoke <em>Modify All Data</em> and <em>View All Data</em> from all non-admin profiles — migrate to Object-Level Security with Permission Sets.`,
          `Deactivate or reassign inactive users immediately — prevent unauthorised login risk and reclaim licenses.`,
          `Adopt a <strong>Permission Set Group</strong> model aligned to job functions to reduce profile sprawl and simplify access management.`,
          `Enforce <strong>Multi-Factor Authentication</strong> for all internal users and enable Login IP Ranges for critical integration profiles.`,
        ])}
      </div>`;

    // ── Page 8: Test Coverage & Technical Debt ─────────────────────────────
    const testIssues = issuesByCategory("testing");
    const testCount = allIssues.filter((i) => i.category === "testing").length;
    const debtIssues = allIssues.filter(
      (i) => i.category === "technical-debt",
    ).length;
    const staleIssues = allIssues.filter(
      (i) => i.category === "stale-metadata",
    ).length;
    const debt = results.debtSummary;

    const testFindings = [
      (s.testing || 0) < 75
        ? `Test coverage score of <strong>${Math.round(s.testing || 0)}/100</strong> is below the recommended 75% threshold for production readiness`
        : null,
      testCount > 0
        ? `<strong>${testCount} test quality issue(s)</strong> found — tests may lack meaningful assertions or bulk coverage`
        : null,
      debtIssues > 0
        ? `<strong>${debtIssues} technical debt</strong> item(s) flagged for refactoring`
        : null,
      staleIssues > 0
        ? `<strong>${staleIssues} stale metadata</strong> item(s) identified (unused components increasing org complexity)`
        : null,
      (s.testing || 0) >= 80
        ? `Test coverage is <strong>healthy</strong> at ${Math.round(s.testing || 0)}/100 — maintain with continuous integration gates`
        : null,
    ].filter(Boolean);

    const testPage = `
      <div class="page">
        ${pageHeader("🧪", "Test Coverage & Technical Debt", "testing")}
        ${kpiStrip([
          [testCount, "Test Issues", "#c0392b"],
          [debtIssues, "Technical Debt", "#b45309"],
          [staleIssues, "Stale Metadata", "#f59e0b"],
          [
            Math.round(s.testing || 0),
            "Test Score /100",
            (s.testing || 0) >= 75 ? "#1a7f45" : "#c0392b",
          ],
          [
            Math.round(s.technicalDebt || s.integration || 0),
            "Debt Score /100",
            (s.technicalDebt || 50) >= 65 ? "#1a7f45" : "#b45309",
          ],
        ])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Key Findings</div>
        ${findingsBullets(testFindings.length ? testFindings : ["Test and debt analysis complete — see issues below"])}
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px">Test & Debt Issues</div>
        ${miniIssueTable(testIssues, "No critical test coverage issues — coverage targets are met!")}
        ${actionsBlock([
          `Establish a <strong>minimum 85% coverage gate</strong> in the CI/CD pipeline — reject deployments below this threshold.`,
          `Refactor test classes to include <strong>bulk tests (200 records)</strong>, negative-path tests, and <code>System.assert()</code> statements (not just coverage).`,
          `Schedule a <strong>technical debt sprint</strong> each quarter — retire dead code, unused custom fields, stale reports, and dormant scheduled jobs.`,
          `Adopt a <strong>clean code policy</strong>: no new code merged with PMD/ESLint violations; technical debt ratio tracked on team dashboards.`,
        ])}
      </div>`;

    // ── Page 9: Roadmap & Next Steps ──────────────────────────────────────
    const priorityItems = [];
    if ((s.security || 0) < 70)
      priorityItems.push({
        icon: "🔴",
        domain: "Security",
        action:
          "Revoke Modify All Data, implement Permission Set Groups, enforce MFA.",
        priority: "Immediate (Sprint 1)",
      });
    if ((s.automationDesign || 0) < 70)
      priorityItems.push({
        icon: "🔴",
        domain: "Automation",
        action:
          "Migrate Process Builders to Flows, implement Trigger Dispatcher pattern.",
        priority: "Immediate (Sprint 1)",
      });
    if ((s.codeQuality || 0) < 70)
      priorityItems.push({
        icon: "🔴",
        domain: "Code Quality",
        action:
          "Eliminate SOQL/DML loops, add with sharing, remove hardcoded IDs.",
        priority: "Immediate (Sprint 1)",
      });
    if ((s.performance || 0) < 70)
      priorityItems.push({
        icon: "🟡",
        domain: "Performance",
        action:
          "Bulk-safe Apex refactoring, selective SOQL, governor limit monitoring.",
        priority: "Short-term (Sprint 2–3)",
      });
    if ((s.dataModel || 0) < 70)
      priorityItems.push({
        icon: "🟡",
        domain: "Data Model",
        action:
          "Field audit & retirement sprint, add descriptions, enforce naming conventions.",
        priority: "Short-term (Sprint 2–3)",
      });
    if ((s.testing || 0) < 75)
      priorityItems.push({
        icon: "🟡",
        domain: "Test Coverage",
        action:
          "Raise coverage to ≥85%, add bulk/negative-path tests, CI gate.",
        priority: "Short-term (Sprint 2–3)",
      });
    priorityItems.push({
      icon: "🟢",
      domain: "Continuous Hygiene",
      action:
        "Quarterly metadata audit, license review, package upgrade cycle, code review gates.",
      priority: "Ongoing",
    });

    const nextStepsPage = `
      <div class="page" style="position:relative">
        ${iconDataUri ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04"><img src="${iconDataUri}" style="width:260px;height:260px;object-fit:contain" alt="" /></div>` : ""}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#9ca3af;position:relative;z-index:1">
          <span>${iconDataUri ? `<img src="${iconDataUri}" style="width:18px;height:18px;object-fit:contain;border-radius:3px;vertical-align:middle;margin-right:4px;opacity:.7" alt="" />` : ""}OrgPulse · Salesforce Architecture Health Report</span>
          <span>${esc(org)} · ${now}</span>
        </div>
        <div style="font-size:19px;font-weight:800;color:#1a1a2e;margin-bottom:4px;position:relative;z-index:1">📋 Recommended Roadmap</div>
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;position:relative;z-index:1">
          Next Steps for Leadership Action
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px">
          <thead><tr style="background:#1a1a2e">
            <th style="text-align:left;padding:9px 12px;font-weight:700;color:#fff;border-bottom:2px solid #0176d3;width:30px"></th>
            <th style="text-align:left;padding:9px 12px;font-weight:700;color:#fff;border-bottom:2px solid #0176d3;width:140px">Domain</th>
            <th style="text-align:left;padding:9px 12px;font-weight:700;color:#fff;border-bottom:2px solid #0176d3">Recommended Action</th>
            <th style="text-align:left;padding:9px 12px;font-weight:700;color:#fff;border-bottom:2px solid #0176d3;width:160px">Priority / Timeline</th>
          </tr></thead>
          <tbody>${priorityItems
            .map(
              (item, idx) => `
            <tr style="background:${idx % 2 === 0 ? "#fff" : "#f9fafb"}">
              <td style="padding:8px 12px;text-align:center;border-bottom:1px solid #f3f4f6;font-size:16px">${item.icon}</td>
              <td style="padding:8px 12px;font-weight:700;color:#1f2937;border-bottom:1px solid #f3f4f6">${esc(item.domain)}</td>
              <td style="padding:8px 12px;color:#374151;border-bottom:1px solid #f3f4f6;line-height:1.5">${item.action}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6">
                <span style="font-size:10px;font-weight:700;color:${item.icon === "🔴" ? "#c0392b" : item.icon === "🟡" ? "#b45309" : "#1a7f45"}">${esc(item.priority)}</span>
              </td>
            </tr>`,
            )
            .join("")}
          </tbody>
        </table>

        <div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff;margin-top:8px">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#93c5fd">💡 Investment Justification for Leadership</div>
          <ul style="margin:0;padding-left:18px;line-height:2;font-size:12px;color:#d1d5db">
            <li>Resolving critical security findings reduces compliance and data breach exposure risk.</li>
            <li>Fixing SOQL/DML-in-loop patterns prevents production incidents during high-volume data operations.</li>
            <li>Migrating Process Builders before Salesforce's retirement deadline avoids forced emergency migration costs.</li>
            <li>Improving test coverage reduces post-deployment defect rates and regression risk.</li>
            <li>A metadata hygiene sprint reduces org complexity, improving developer velocity and reducing support overhead.</li>
          </ul>
        </div>

        <div style="margin-top:28px;border-top:2px solid #0176d3;padding-top:18px;display:flex;justify-content:space-between;align-items:flex-end">
          <div>
            <div style="font-size:13px;font-weight:800;color:#1a1a2e">OrgPulse · Salesforce Architecture Health Report</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Generated: ${now} · Org: ${esc(org)}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:2px">Confidential — For Leadership Review Only · OrgPulse v1.3.0</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:36px;font-weight:900;color:${overallColor};line-height:1">${Math.round(s.overall || 0)}</div>
            <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Overall Health Score</div>
          </div>
        </div>
      </div>`;

    // ── CTA Architecture Review Page — delegated to shared builder ──────────
    const ctaPage = buildCtaPageHtml(iconDataUri, org, now);

    // ── Assemble full HTML ─────────────────────────────────────────────────
    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OrgPulse Health Report — ${esc(org)} — ${now}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { padding: 28px 32px 28px; page-break-after: always; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .cover-page { justify-content: flex-start; }
  @media print {
    .page { padding: 0; page-break-after: always; min-height: unset; }
    body { font-size: 11px; }
  }
  code { background: #f3f4f6; border-radius: 3px; padding: 1px 4px; font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
</style>
</head>
<body>
${coverPage}
${execSummaryPage}
${cqPage}
${autoPage}
${dmPage}
${perfPage}
${secPage}
${testPage}
${nextStepsPage}
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

    // Open the report in a new browser tab which auto-triggers print → Save as PDF
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      // Fallback: download if popup was blocked
      const a = document.createElement("a");
      a.href = url;
      a.download = `OrgPulse_HealthReport_${org.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ── Export CTA Review as standalone PDF ───────────────────────────────────
  // Clones the actual rendered .cta-dash-wrap DOM so the PDF is pixel-identical
  // to the CTA Review tab — same CSS classes, same layout, same colors.
  function exportCtaPdf(iconDataUri) {
    if (!results || !results.ctaReview || !results.ctaReview.verdict) {
      alert("No CTA Review available to export. Please run a CTA Review first.");
      return;
    }

    const dash = document.querySelector("#panel-cta .cta-dash-wrap");
    if (!dash) {
      alert("CTA Review content not found. Please run a CTA Review first.");
      return;
    }

    const meta = results.metadata || {};
    const org = (meta.orgAlias || meta.orgUsername) || "Org";
    const nowTime = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

    // Clone the rendered CTA dashboard DOM (same HTML/CSS as the tab)
    const clone = dash.cloneNode(true);

    // Replace vscode-resource: logo URIs with the base64 data URI so it renders in standalone HTML
    if (iconDataUri) {
      clone.querySelectorAll(".cta-dash-logo-img").forEach(function(img) { img.src = iconDataUri; });
    }

    // Show ALL sub-panels (tab system keeps non-active ones display:none via .hidden)
    clone.querySelectorAll(".cta-dash-panel").forEach(function(p) {
      p.classList.remove("hidden");
    });

    // Remove interactive-only elements that must not appear in PDF
    clone.querySelectorAll(".cta-dash-scan-btn, .cta-regen-bar, .ctad-risk-filter-btn").forEach(function(el) { el.remove(); });

    // Capture live VS Code CSS variable values so they resolve in standalone HTML
    const cs = getComputedStyle(document.documentElement);
    function cv(v, fb) { const val = cs.getPropertyValue(v).trim(); return val || fb; }
    const varsCss = ":root{" +
      "--vscode-editor-background:" + cv("--vscode-editor-background", "#ffffff") + ";" +
      "--vscode-editor-foreground:" + cv("--vscode-editor-foreground", "#1f2937") + ";" +
      "--vscode-sideBar-background:" + cv("--vscode-sideBar-background", "#f3f4f6") + ";" +
      "--vscode-editorGroupHeader-tabsBackground:" + cv("--vscode-editorGroupHeader-tabsBackground", "#f3f4f6") + ";" +
      "--vscode-list-hoverBackground:" + cv("--vscode-list-hoverBackground", "rgba(0,0,0,.04)") + ";" +
      "--vscode-list-activeSelectionBackground:" + cv("--vscode-list-activeSelectionBackground", "rgba(0,0,0,.07)") + ";" +
      "--vscode-descriptionForeground:" + cv("--vscode-descriptionForeground", "#6b7280") + ";" +
      "--vscode-disabledForeground:" + cv("--vscode-disabledForeground", "#9ca3af") + ";" +
      "--vscode-textLink-foreground:" + cv("--vscode-textLink-foreground", "#0176d3") + ";" +
      "--vscode-panel-border:" + cv("--vscode-panel-border", "#e5e7eb") + ";" +
      "--vscode-input-border:" + cv("--vscode-input-border", "#d1d5db") + ";" +
      "--vscode-input-background:" + cv("--vscode-input-background", "#f9fafb") + ";" +
      "--vscode-input-foreground:" + cv("--vscode-input-foreground", "#374151") + ";" +
      "--vscode-button-background:" + cv("--vscode-button-background", "#0176d3") + ";" +
      "--vscode-button-foreground:" + cv("--vscode-button-foreground", "#ffffff") + ";" +
      "--vscode-button-secondaryBackground:" + cv("--vscode-button-secondaryBackground", "#f3f4f6") + ";" +
      "--vscode-button-secondaryForeground:" + cv("--vscode-button-secondaryForeground", "#1f2937") + ";" +
      "--vscode-badge-background:" + cv("--vscode-badge-background", "#0176d3") + ";" +
      "--vscode-badge-foreground:" + cv("--vscode-badge-foreground", "#ffffff") + ";" +
      "--vscode-errorForeground:" + cv("--vscode-errorForeground", "#ef4444") + ";" +
      "--vscode-editorWarning-foreground:" + cv("--vscode-editorWarning-foreground", "#f59e0b") + ";" +
      "}";

    const pageCss = "@page{size:A4;margin:16mm 14mm 14mm;}" +
      "body{margin:0;padding:0;background:#fff;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;" +
      "-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
      // Footer on every page
      ".pdf-foot{position:fixed;bottom:-10mm;left:0;right:0;height:8mm;" +
      "display:flex;align-items:center;justify-content:space-between;" +
      "padding-top:3px;border-top:1px solid #e5e7eb;font-size:8px;color:#c0c0c0;}";

    const safeOrg = org.replace(/[^a-zA-Z0-9]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    const contentHtml = clone.outerHTML;

    // dashboard.css is embedded by the extension at webview load time as window.DASHBOARD_CSS
    // (avoids any fetch/CSP issues — the CSS string is always available synchronously)
    const dashCss = (typeof window.DASHBOARD_CSS === "string") ? window.DASHBOARD_CSS : "";

    const ctaHtml = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
      "<title>OrgPulse CTA Architecture Review — " + esc(org) + " — " + dateStr + "</title>" +
      "<style>" + varsCss + dashCss + pageCss + "</style></head><body>" +
      contentHtml +
      "<div class=\"pdf-foot\">" +
      "<span>Confidential — For Leadership Review Only</span>" +
      "<span>Generated by OrgPulse · " + esc(nowTime) + "</span>" +
      "</div>" +
      "<script>window.onload=function(){window.print();};<\/script>" +
      "</body></html>";

    vscode.postMessage({
      command: "exportCtaHtml",
      data: { html: ctaHtml, fileName: "OrgPulse_CTA_Review_" + safeOrg + "_" + dateStr + ".html" },
    });
  }

  // Expose to global so extension can call back with AI summary
  window.receiveAiPdfSummary = function (aiSummary) {
    fetchIconDataUri((iconDataUri) =>
      printReportDirectly(aiSummary || null, iconDataUri),
    );
  };

  // Expose to inline onclick handlers
  window.runAnalysis = runAnalysis;
  window.doOpenFile = doOpenFile;
  window.exportReport = exportReport;
  window.activateTab = activateTab;
  window.openDrill = openDrill;
  window.closeDrill = closeDrill;
  window.explainIssue = explainIssue;
  window.filterPanel = filterPanel;

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  function escHtml(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  function shortPath(path) {
    if (!path) return "";
    const parts = path.replace(/\\/g, "/").split("/");
    return escHtml(parts.slice(-2).join("/"));
  }

  function scoreColor(score) {
    if (score >= 90) return "var(--score-excellent)";
    if (score >= 80) return "var(--score-good)";
    if (score >= 70) return "var(--score-fair)";
    if (score >= 60) return "var(--score-poor)";
    return "var(--score-critical)";
  }

  function scoreColorClass(score) {
    if (score >= 90) return "c-excellent";
    if (score >= 80) return "c-good";
    if (score >= 70) return "c-fair";
    if (score >= 60) return "c-poor";
    return "c-critical";
  }

  function getGrade(score) {
    if (score >= 90) return { grade: "A", description: "Excellent" };
    if (score >= 80) return { grade: "B", description: "Good" };
    if (score >= 70) return { grade: "C", description: "Fair" };
    if (score >= 60) return { grade: "D", description: "Needs Improvement" };
    return { grade: "F", description: "Critical" };
  }

  function sevIcon(sev) {
    return sev === "error" ? "❌" : sev === "warning" ? "⚠️" : "ℹ️";
  }

  function hmClass(n) {
    if (!n || n === 0) return "hm-0";
    if (n === 1) return "hm-low";
    if (n <= 3) return "hm-med";
    if (n <= 5) return "hm-hi";
    return "hm-crit";
  }

  function formatCatLabel(cat) {
    const map = {
      "code-quality": "Code Quality",
      "automation-design": "Automation",
      "data-model": "Data Model",
      performance: "Performance",
      security: "Security",
      testing: "Testing",
      integration: "Integration",
      "lwc-quality": "LWC Quality",
      "governor-limits": "Governor Limits",
      "technical-debt": "Technical Debt",
      dependencies: "Dependencies",
      "user-governance": "User Governance",
      "profile-security": "Profile Security",
      "stale-metadata": "Stale Metadata",
      "org-inventory": "Org Inventory",
      "aura-quality": "Aura Quality",
    };
    return map[cat] || cat;
  }

  function formatTs(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "";
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SVG CHART LIBRARY — pure inline SVG, no CDN required (respects CSP nonce)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Horizontal bar chart. items = [{label, value, max?, color?}], opts = {width, height, showValues} */
  function renderBarChart(items, opts) {
    if (!items || !items.length) {
      return "";
    }
    const W = (opts && opts.width) || 400;
    const H = (opts && opts.height) || items.length * 32 + 16;
    const BAR_H = 20;
    const ROW_H = 32;
    const LABEL_W = 130;
    const BAR_W = W - LABEL_W - 60;
    const maxVal =
      opts && opts.max
        ? opts.max
        : Math.max(...items.map((i) => i.value || 0), 1);
    const CHART_COLORS = [
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
      "var(--chart-6)",
      "var(--chart-7)",
    ];

    const bars = items
      .map((item, idx) => {
        const val = item.value || 0;
        const pct = Math.min(val / maxVal, 1);
        const bw = Math.max(pct * BAR_W, 2);
        const y = idx * ROW_H + 8;
        const col = item.color || CHART_COLORS[idx % CHART_COLORS.length];
        return `
        <text x="${LABEL_W - 6}" y="${y + BAR_H - 4}" text-anchor="end" font-size="11" fill="var(--sf-text-secondary)">${escHtml(String(item.label).slice(0, 18))}</text>
        <rect x="${LABEL_W}" y="${y}" width="${bw}" height="${BAR_H}" rx="3" fill="${col}" class="chart-bar" style="animation-delay:${idx * 0.04}s"/>
        <text x="${LABEL_W + bw + 5}" y="${y + BAR_H - 4}" font-size="11" fill="var(--sf-text-secondary)">${val}</text>`;
      })
      .join("");

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">${bars}</svg>`;
  }

  /** 7-axis radar chart for HealthScores. scores = {codeQuality, automationDesign, …} (0-100 each) */
  function renderRadarChart(scores) {
    const axes = [
      { key: "codeQuality", label: "Code" },
      { key: "automationDesign", label: "Auto" },
      { key: "dataModel", label: "Data" },
      { key: "performance", label: "Perf" },
      { key: "security", label: "Sec" },
      { key: "testing", label: "Test" },
      { key: "integration", label: "Int" },
    ];
    const N = axes.length;
    const CX = 150;
    const CY = 150;
    const R = 110;
    const levels = [20, 40, 60, 80, 100];

    function pt(axIdx, val) {
      const angle = (axIdx / N) * 2 * Math.PI - Math.PI / 2;
      const r = (val / 100) * R;
      return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
    }

    // Background level rings
    const rings = levels
      .map((lv) => {
        const pts = axes.map((_, i) => pt(i, lv).join(",")).join(" ");
        return `<polygon points="${pts}" fill="none" stroke="var(--sf-border)" stroke-width="1" opacity="0.5"/>`;
      })
      .join("");

    // Axis lines
    const axLines = axes
      .map((_, i) => {
        const [x, y] = pt(i, 100);
        return `<line x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" stroke="var(--sf-border)" stroke-width="1" opacity="0.5"/>`;
      })
      .join("");

    // Data polygon
    const dataPoints = axes.map((ax, i) => pt(i, scores[ax.key] || 0));
    const polyPts = dataPoints.map((p) => p.join(",")).join(" ");
    const dataPoly = `<polygon points="${polyPts}" fill="var(--chart-1)" fill-opacity="0.2" stroke="var(--chart-1)" stroke-width="2" class="chart-radar-area"/>`;

    // Dots at each axis
    const dots = dataPoints
      .map(
        ([x, y], i) =>
          `<circle cx="${x}" cy="${y}" r="4" fill="var(--chart-1)" stroke="var(--sf-bg-primary)" stroke-width="2"/>`,
      )
      .join("");

    // Axis labels
    const labels = axes
      .map((ax, i) => {
        const [x, y] = pt(i, 120);
        return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="var(--sf-text-secondary)">${ax.label}</text>`;
      })
      .join("");

    return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">${rings}${axLines}${dataPoly}${dots}${labels}</svg>`;
  }

  /** Tiny sparkline. points = number[] (0-100 values) */
  function renderSparkline(points) {
    if (!points || points.length < 2) {
      return "";
    }
    const W = 120;
    const H = 32;
    const max = Math.max(...points, 1);
    const min = Math.min(...points, 0);
    const range = max - min || 1;
    const xs = points.map((_, i) => (i / (points.length - 1)) * W);
    const ys = points.map((v) => H - ((v - min) / range) * (H - 4) - 2);
    const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x},${ys[i]}`).join(" ");
    const trend = points[points.length - 1] >= points[0];
    const col = trend ? "var(--score-excellent)" : "var(--score-critical)";
    return `<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px"><path d="${d}" class="sparkline-line" stroke="${col}"/></svg>`;
  }

  /** Radial gauge for a single metric: value / limit, with label */
  function renderGovernorGauge(label, value, limit, risk) {
    const R = 44;
    const CX = 60;
    const CY = 60;
    const circ = Math.PI * R; // half-circle
    const pct = Math.min((value || 0) / Math.max(limit || 1, 1), 1);
    const dash = pct * circ;
    const col =
      pct >= 0.9
        ? "var(--score-critical)"
        : pct >= 0.7
          ? "var(--score-poor)"
          : pct >= 0.5
            ? "var(--score-fair)"
            : "var(--score-excellent)";
    // arc goes from left (180°) to right (0°) over the top
    return `
      <svg viewBox="0 0 120 72" xmlns="http://www.w3.org/2000/svg" style="width:120px;height:72px">
        <path d="M ${CX - R},${CY} A ${R},${R} 0 0,1 ${CX + R},${CY}"
              fill="none" stroke="var(--sf-border)" stroke-width="8" stroke-linecap="round"/>
        <path d="M ${CX - R},${CY} A ${R},${R} 0 0,1 ${CX + R},${CY}"
              fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${dash} ${circ}" class="chart-gauge-arc"/>
        <text x="${CX}" y="${CY - 8}" text-anchor="middle" font-size="14" font-weight="700" fill="${col}">${value}</text>
        <text x="${CX}" y="${CY + 8}" text-anchor="middle" font-size="9" fill="var(--sf-text-muted)">/ ${limit}</text>
      </svg>`;
  }

  /**
   * Hub-focused dependency graph. Instead of dumping 40 overlapping nodes on one
   * ring (unreadable), show only the top ~12 most-connected hubs, lay them out
   * with generous spacing, draw only the edges between them, and give every node
   * a legible label on a pill background. The full picture lives in the
   * "Most Connected Components" table above — this is a supporting visual. (#10)
   */
  function renderDependencyGraph(graph) {
    if (!graph || !graph.nodes || !graph.nodes.length) {
      return `<div style="text-align:center;padding:40px;color:var(--sf-text-muted)">No dependency data available</div>`;
    }
    const connectivity = (n) => (n.fanIn || 0) + (n.fanOut || 0);
    const TOP = 12;
    const nodes = [...graph.nodes]
      .sort((a, b) => connectivity(b) - connectivity(a))
      .slice(0, TOP);
    const idSet = new Set(nodes.map((n) => n.id));
    const edges = (graph.edges || [])
      .filter((e) => idSet.has(e.from) && idSet.has(e.to))
      .slice(0, 60);

    const W = 760;
    const H = 460;
    const CX = W / 2;
    const CY = H / 2;
    const ringR = Math.min(W, H) * 0.34;

    // Most-connected node sits at the centre; the rest ring around it.
    const positions = {};
    const ringNodes = nodes.slice(1);
    if (nodes.length) { positions[nodes[0].id] = [CX, CY]; }
    ringNodes.forEach((node, idx) => {
      const angle = (idx / Math.max(ringNodes.length, 1)) * 2 * Math.PI - Math.PI / 2;
      positions[node.id] = [
        CX + ringR * Math.cos(angle),
        CY + ringR * Math.sin(angle),
      ];
    });

    const TYPE_COLORS = {
      "apex-class": "var(--chart-1)",
      "apex-trigger": "var(--chart-7)",
      flow: "var(--chart-4)",
      lwc: "var(--chart-2)",
      aura: "var(--chart-5)",
      object: "var(--chart-3)",
      "validation-rule": "var(--chart-6)",
    };

    const edgeSvg = edges
      .map((e) => {
        const [x1, y1] = positions[e.from] || [CX, CY];
        const [x2, y2] = positions[e.to] || [CX, CY];
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dep-edge" stroke-opacity="0.35"/>`;
      })
      .join("");

    const nodeSvg = nodes
      .map((node, idx) => {
        const [x, y] = positions[node.id] || [CX, CY];
        const col = TYPE_COLORS[node.type] || "var(--chart-1)";
        const r = 9 + Math.min(connectivity(node), 22);
        const full = node.label || node.id;
        const label = full.length > 20 ? full.slice(0, 19) + "…" : full;
        const isCenter = idx === 0;
        // Labels: centre node sits above its circle; ring labels alternate
        // above/below so neighbours don't collide.
        const below = !isCenter && y >= CY;
        const labelY = below ? y + r + 16 : y - r - 9;
        const charW = 6.4;
        const padX = 6;
        const boxW = label.length * charW + padX * 2;
        const boxH = 16;
        const boxX = x - boxW / 2;
        const boxY = labelY - 12;
        return `
        <g class="dep-node">
          <title>${escHtml(full)} — fan-in ${node.fanIn || 0}, fan-out ${node.fanOut || 0}</title>
          <circle cx="${x}" cy="${y}" r="${r}" fill="${col}" fill-opacity="0.9" stroke="var(--sf-bg-primary)" stroke-width="2"/>
          <rect x="${boxX.toFixed(1)}" y="${boxY.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH}" rx="4" fill="var(--sf-bg-primary)" fill-opacity="0.82"/>
          <text x="${x}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="11" font-weight="${isCenter ? 700 : 600}" fill="var(--sf-text-secondary)">${escHtml(label)}</text>
        </g>`;
      })
      .join("");

    const more = graph.nodes.length > nodes.length
      ? `<div style="font-size:11px;color:var(--sf-text-muted);text-align:center;margin-top:6px">Showing the ${nodes.length} most-connected components of ${graph.nodes.length}. See the table above for the full ranking. Hover a node for fan-in / fan-out.</div>`
      : `<div style="font-size:11px;color:var(--sf-text-muted);text-align:center;margin-top:6px">Hover a node for fan-in / fan-out.</div>`;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">${edgeSvg}${nodeSvg}</svg>${more}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LWC QUALITY TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderLwc() {
    const lwcIssues = results.issues.filter(
      (i) => i.category === "lwc-quality",
    );
    const lwcSum = results.lwcSummary;

    if (!lwcSum && !lwcIssues.length) {
      return `<div class="scale-unavailable">
        <div class="unavail-icon">🧩</div>
        <h3>No LWC Data</h3>
        <p>Open a Salesforce DX project with LWC components in your workspace, then re-run the analysis to see quality insights.</p>
      </div>`;
    }

    const total = lwcSum ? lwcSum.totalComponents : 0;
    const withTests = lwcSum ? lwcSum.componentsWithTests : 0;
    const a11y = lwcSum ? lwcSum.componentsWithA11yIssues : 0;
    const testPct = total ? Math.round((withTests / total) * 100) : 0;
    const components = lwcSum ? lwcSum.componentList || [] : [];

    const errors = lwcIssues.filter((i) => i.severity === "error").length;
    const warnings = lwcIssues.filter((i) => i.severity === "warning").length;

    return `
      <div class="mb-24">
        <div class="lwc-summary-cards">
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${total}</div>
            <div class="lwc-summary-label">Components</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${testPct >= 80 ? "c-excellent" : testPct >= 50 ? "c-fair" : "c-critical"}">${testPct}%</div>
            <div class="lwc-summary-label">Have Tests</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${a11y === 0 ? "c-excellent" : "c-fair"}">${a11y}</div>
            <div class="lwc-summary-label">A11y Issues</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${errors > 0 ? "c-critical" : "c-excellent"}">${errors}</div>
            <div class="lwc-summary-label">Errors</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${warnings > 0 ? "c-fair" : "c-excellent"}">${warnings}</div>
            <div class="lwc-summary-label">Warnings</div>
          </div>
        </div>
      </div>

      ${
        components.length
          ? `
      <div class="mb-24">
        <div class="section-title">🧩 Component Inventory (${components.length})</div>
        ${renderPaginatedDataTable(
          "lwc-components",
          [
            "Component",
            "JS Lines",
            "HTML Lines",
            "@wire",
            "@api",
            "Tests",
            "Issues",
          ],
          components.map((c) => [
            '<span style="font-weight:600">' + escHtml(c.name) + "</span>",
            String(c.controllerLines || 0),
            String(c.templateLines || 0),
            String(c.wireCount || 0),
            c.hasPublicApi
              ? '<span class="badge-yes">✓</span>'
              : '<span class="badge-no">—</span>',
            c.hasTests
              ? '<span class="badge-yes">✓</span>'
              : '<span class="badge-warn">✗</span>',
            '<span class="' +
              ((c.issues || []).length > 0 ? "c-fair" : "") +
              '">' +
              (c.issues || []).length +
              "</span>",
          ]),
        )}
      </div>`
          : ""
      }`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPENDENCIES TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDependencies() {
    const depIssues = results.issues.filter(
      (i) => i.category === "dependencies",
    );
    const graph = results.dependencyGraph;

    if (!graph || !graph.nodes || !graph.nodes.length) {
      return `<div class="scale-unavailable">
        <div class="unavail-icon">🕸️</div>
        <h3>No Dependency Data</h3>
        <p>The dependency graph could not be built. Ensure your org is connected and the Tooling API is accessible, then re-run analysis.</p>
      </div>`;
    }

    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const cycles = graph.circularDependencies || [];

    // Top 10 by centrality
    const topNodes = [...nodes]
      .sort(
        (a, b) =>
          (b.fanIn || 0) + (b.fanOut || 0) - ((a.fanIn || 0) + (a.fanOut || 0)),
      )
      .slice(0, 10);

    const maxFanIn = Math.max(...nodes.map((n) => n.fanIn || 0), 1);

    const TYPE_LABELS = {
      "apex-class": "Apex Class",
      "apex-trigger": "Trigger",
      flow: "Flow",
      lwc: "LWC",
      aura: "Aura",
      object: "Object",
      "validation-rule": "Validation",
    };
    const TYPE_COLORS = {
      "apex-class": "var(--chart-1)",
      "apex-trigger": "var(--chart-7)",
      flow: "var(--chart-4)",
      lwc: "var(--chart-2)",
      aura: "var(--chart-5)",
      object: "var(--chart-3)",
      "validation-rule": "var(--chart-6)",
    };

    // Type breakdown
    const typeBreakdown = {};
    nodes.forEach((n) => {
      typeBreakdown[n.type] = (typeBreakdown[n.type] || 0) + 1;
    });

    return `
      <!-- Explanation Header -->
      <div class="mb-24 info-card">
        <div class="section-header-row">
          <div class="section-header-icon icon-purple">🕸️</div>
          <div>
            <div style="font-size:16px;font-weight:700">Dependency Analysis</div>
            <div style="font-size:13px;opacity:.65">Understanding how your org's components are connected</div>
          </div>
        </div>
        <div style="font-size:13px;line-height:1.6;opacity:.8">
          This tab maps the relationships between <strong>Apex classes, triggers, flows, LWC components, and custom objects</strong> in your org.
          High <strong>fan-in</strong> (many components depend on it) means a change to that component has wide blast radius.
          <strong>Circular dependencies</strong> prevent clean deployment ordering and indicate tight coupling.
          The <strong>centrality score</strong> identifies components that are critical integration points — breaking these affects the most downstream consumers.
        </div>
      </div>

      <!-- Stats -->
      <div class="stat-cards mb-24">
        <div class="stat-card"><span class="stat-icon">📦</span><div><div class="stat-value">${nodes.length}</div><div class="stat-label">Components</div></div></div>
        <div class="stat-card"><span class="stat-icon">🔗</span><div><div class="stat-value">${edges.length}</div><div class="stat-label">Dependencies</div></div></div>
        <div class="stat-card"><span class="stat-icon">🔄</span><div><div class="stat-value ${cycles.length > 0 ? "c-critical" : "c-excellent"}">${cycles.length}</div><div class="stat-label">Circular Deps</div></div></div>
        <div class="stat-card"><span class="stat-icon">📏</span><div><div class="stat-value">${graph.maxDepth || 0}</div><div class="stat-label">Max Depth</div></div></div>
      </div>

      <!-- Type Breakdown -->
      <div class="mb-24">
        <div class="section-title">📊 Component Type Breakdown</div>
        <div class="lwc-summary-cards">
          ${Object.entries(typeBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([type, count]) => `
            <div class="lwc-summary-card">
              <div class="lwc-summary-num" style="color:${TYPE_COLORS[type] || "var(--chart-1)"}">${count}</div>
              <div class="lwc-summary-label">${TYPE_LABELS[type] || type}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>

      ${
        cycles.length
          ? `
      <div class="mb-24">
        <div class="section-title">🔄 Circular Dependencies (${cycles.length})</div>
        <p style="font-size:12px;opacity:.65;margin:0 0 12px">Circular dependencies prevent clean deployment ordering and indicate tight coupling between components. Break cycles by introducing interfaces or event-driven communication.</p>
        ${cycles
          .map(
            (cycle) => `
          <div class="risk-item error" style="margin-bottom:6px">
            <span class="risk-sev-icon">🔄</span>
            <div class="risk-body">
              <div class="risk-message">${escHtml(Array.isArray(cycle) ? cycle.join(" → ") : String(cycle))}</div>
              <div class="risk-meta">Circular dependency — breaks deployment ordering</div>
            </div>
          </div>`,
          )
          .join("")}
      </div>`
          : ""
      }

      <div class="mb-24">
        <div class="section-title">🏆 Most Connected Components (Top 10)</div>
        <p style="font-size:12px;opacity:.65;margin:0 0 12px">Components with highest fan-in + fan-out are critical integration points. Changes to these have the widest blast radius.</p>
        ${renderPaginatedDataTable(
          "dep-top-nodes",
          ["Component", "Type", "Fan-In", "Fan-Out", "Centrality"],
          topNodes.map((n) => {
            const col = TYPE_COLORS[n.type] || "var(--chart-1)";
            return [
              '<span style="font-weight:600">' +
                escHtml(n.label || n.id) +
                "</span>",
              '<span style="color:' +
                col +
                ';font-weight:600">' +
                (TYPE_LABELS[n.type] || n.type) +
                "</span>",
              '<span class="' +
                ((n.fanIn || 0) > 15 ? "c-critical" : "") +
                '">' +
                (n.fanIn || 0) +
                "</span>",
              String(n.fanOut || 0),
              ((n.centrality || 0) * 100).toFixed(1) + "%",
            ];
          }),
        )}
      </div>

      <div class="mb-24">
        <div class="dep-legend">
          ${Object.entries(TYPE_COLORS)
            .map(
              ([k, col]) =>
                `<div class="dep-legend-item"><div class="dep-legend-dot" style="background:${col}"></div>${TYPE_LABELS[k]}</div>`,
            )
            .join("")}
        </div>
        <div class="dep-graph-container">
          ${renderDependencyGraph(graph)}
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STALE METADATA TAB (merged: Stale Metadata + Org Inventory)
  // ═══════════════════════════════════════════════════════════════════════════
  function renderStaleMetadata() {
    const staleIssues = results.issues.filter(
      (i) => i.category === "stale-metadata",
    );
    const invIssues = results.issues.filter(
      (i) => i.category === "org-inventory",
    );
    const stale = results.staleMetadata;
    const inv = results.orgInventory;

    if (!stale && !inv && !staleIssues.length && !invIssues.length) {
      return `<div class="scale-unavailable">
        <div class="unavail-icon">🧹</div>
        <h3>No Stale Metadata Data</h3>
        <p>Stale metadata analysis requires Read access to Reports and Dashboards. Re-run analysis after connecting to an org.</p>
      </div>`;
    }

    const totalStale = stale ? stale.totalStaleItems : 0;
    const reports = stale ? stale.staleReports || [] : [];
    const dashboards = stale ? stale.staleDashboards || [] : [];
    const packages = inv ? inv.installedPackages || [] : [];
    const vfPages = inv ? inv.visualforcePages || [] : [];
    const labels = inv ? inv.customLabels || [] : [];

    return `
      <!-- Description -->
      <div class="mb-24 info-card">
        <div class="section-header-row">
          <div class="section-header-icon icon-amber">🧹</div>
          <div>
            <div style="font-size:16px;font-weight:700">Stale Metadata &amp; Org Inventory</div>
            <div style="font-size:13px;opacity:.65">Identify unused reports, dashboards, and metadata for cleanup</div>
          </div>
        </div>
        <div style="font-size:13px;line-height:1.6;opacity:.8">
          This tab identifies <strong>reports and dashboards untouched for 180+ days</strong>, obsolete Visualforce pages, and
          installed packages. Stale metadata clutters the org for end users, inflates backup sizes, and can cause confusion
          during audits. Regular hygiene sprints reduce maintenance burden and improve org performance.
        </div>
      </div>

      <!-- KPIs -->
      <div class="mb-24">
        <div class="stat-cards">
          <div class="stat-card"><span class="stat-icon">📊</span><div><div class="stat-value ${reports.length > 50 ? "c-fair" : ""}">${reports.length}</div><div class="stat-label">Stale Reports (180d+)</div></div></div>
          <div class="stat-card"><span class="stat-icon">📈</span><div><div class="stat-value ${dashboards.length > 20 ? "c-fair" : ""}">${dashboards.length}</div><div class="stat-label">Stale Dashboards (180d+)</div></div></div>
          <div class="stat-card"><span class="stat-icon">🧹</span><div><div class="stat-value">${totalStale}</div><div class="stat-label">Total Stale Items</div></div></div>
          <div class="stat-card"><span class="stat-icon">⏱️</span><div><div class="stat-value">${stale ? stale.estimatedCleanupHours : 0}h</div><div class="stat-label">Est. Cleanup Hours</div></div></div>
          ${
            inv
              ? `
          <div class="stat-card"><span class="stat-icon">📦</span><div><div class="stat-value">${packages.length}</div><div class="stat-label">Installed Packages</div></div></div>
          <div class="stat-card"><span class="stat-icon">📄</span><div><div class="stat-value">${vfPages.length}</div><div class="stat-label">VF Pages</div></div></div>
          <div class="stat-card"><span class="stat-icon">🏷️</span><div><div class="stat-value">${labels.length}</div><div class="stat-label">Custom Labels</div></div></div>`
              : ""
          }
        </div>
      </div>

      <!-- Stale Reports -->
      ${
        reports.length
          ? `
      <div class="mb-24">
        <div class="section-title">📊 Stale Reports (${reports.length})</div>
        ${renderPaginatedDataTable(
          "stale-reports",
          ["Report Name", "Age", "Last Modified", "Created"],
          reports.map((item) => {
            const ageDays = item.ageInDays || 0;
            const ageCls =
              ageDays > 365 ? "c-critical" : ageDays > 270 ? "c-fair" : "";
            return [
              '<span style="font-weight:600">' + escHtml(item.name) + "</span>",
              '<span class="' + ageCls + '">' + ageDays + "d</span>",
              '<span style="font-size:11px;color:var(--sf-text-muted)">' +
                (item.lastModifiedDate
                  ? item.lastModifiedDate.split("T")[0]
                  : "—") +
                "</span>",
              '<span style="font-size:11px;color:var(--sf-text-muted)">' +
                (item.createdDate ? item.createdDate.split("T")[0] : "—") +
                "</span>",
            ];
          }),
        )}
      </div>`
          : ""
      }

      <!-- Stale Dashboards -->
      ${
        dashboards.length
          ? `
      <div class="mb-24">
        <div class="section-title">📈 Stale Dashboards (${dashboards.length})</div>
        ${renderPaginatedDataTable(
          "stale-dashboards",
          ["Dashboard Name", "Age", "Last Modified", "Created"],
          dashboards.map((item) => {
            const ageDays = item.ageInDays || 0;
            const ageCls =
              ageDays > 365 ? "c-critical" : ageDays > 270 ? "c-fair" : "";
            return [
              '<span style="font-weight:600">' + escHtml(item.name) + "</span>",
              '<span class="' + ageCls + '">' + ageDays + "d</span>",
              '<span style="font-size:11px;color:var(--sf-text-muted)">' +
                (item.lastModifiedDate
                  ? item.lastModifiedDate.split("T")[0]
                  : "—") +
                "</span>",
              '<span style="font-size:11px;color:var(--sf-text-muted)">' +
                (item.createdDate ? item.createdDate.split("T")[0] : "—") +
                "</span>",
            ];
          }),
        )}
      </div>`
          : ""
      }

      <!-- Installed Packages (from Org Inventory) -->
      ${
        packages.length
          ? `
      <div class="mb-24">
        <div class="section-title">📦 Installed Packages (${packages.length})</div>
        ${renderPaginatedDataTable(
          "stale-packages",
          ["Package Name", "Namespace", "Version"],
          packages.map((p) => {
            const name = p.SubscriberPackage?.Name || "Unknown";
            const ns = p.SubscriberPackage?.NamespacePrefix || "—";
            const ver = p.SubscriberPackageVersion
              ? p.SubscriberPackageVersion.MajorVersion +
                "." +
                p.SubscriberPackageVersion.MinorVersion +
                "." +
                p.SubscriberPackageVersion.PatchVersion +
                " — " +
                p.SubscriberPackageVersion.Name
              : "—";
            return [
              '<span style="font-weight:600">' + escHtml(name) + "</span>",
              '<span style="font-family:monospace">' + escHtml(ns) + "</span>",
              '<span style="font-size:12px">' + escHtml(ver) + "</span>",
            ];
          }),
        )}
      </div>`
          : ""
      }

      <!-- VF Pages -->
      ${
        vfPages.length
          ? `
      <div class="mb-24">
        <div class="section-title">📄 Visualforce Pages (${vfPages.length})</div>
        ${renderPaginatedDataTable(
          "stale-vfpages",
          ["Page Name", "API Version", "Controller Type", "Mobile Ready"],
          vfPages.map((vf) => {
            const oldApi = vf.ApiVersion < 45;
            return [
              '<span style="font-weight:600">' + escHtml(vf.Name) + "</span>",
              '<span class="' +
                (oldApi ? "c-fair" : "") +
                '">' +
                vf.ApiVersion +
                (oldApi ? " ⚠" : "") +
                "</span>",
              escHtml(vf.ControllerType || "—"),
              vf.IsAvailableInTouch
                ? '<span class="badge-yes">✓</span>'
                : '<span class="badge-no">—</span>',
            ];
          }),
        )}
      </div>`
          : ""
      }

      <!-- Custom Labels -->
      ${
        labels.length
          ? `
      <div class="mb-24">
        <div class="section-title">🏷️ Custom Labels (${labels.length})</div>
        ${renderPaginatedDataTable(
          "stale-labels",
          ["Name", "Category", "Language"],
          labels.map((l) => [
            '<span style="font-weight:600">' + escHtml(l.Name) + "</span>",
            escHtml(l.Category || "—"),
            escHtml(l.Language || "—"),
          ]),
        )}
      </div>`
          : ""
      }`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  showEmpty();
  // Ask the extension which AI models are available (dynamic discovery).
  vscode.postMessage({ command: "getModels" });
})();
