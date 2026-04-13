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
  // Per-data-table page state: tableId → { page }
  const dataTablePageState = {};
  const DATA_TABLE_PAGE_SIZE = 10;

  function registerIssue(iss) {
    issueRegistry.push(iss);
    return issueRegistry.length - 1;
  }

  // Restore persisted state
  const saved = vscode.getState();
  if (saved) {
    activeTab = saved.activeTab || "overview";
    filters = saved.filters || filters;
    securityMode = saved.securityMode || null;
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
   * @param {object} [opts]    { pageSize, emptyMsg }
   * @returns {string} HTML
   */
  function renderPaginatedDataTable(tableId, headers, rows, opts) {
    opts = opts || {};
    const PAGE = opts.pageSize || DATA_TABLE_PAGE_SIZE;
    const emptyMsg = opts.emptyMsg || "No data available";

    if (!dataTablePageState[tableId]) dataTablePageState[tableId] = { page: 0 };
    const st = dataTablePageState[tableId];
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (st.page >= totalPages) st.page = totalPages - 1;

    const start = st.page * PAGE;
    const pageRows = rows.slice(start, start + PAGE);

    const headHtml = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
    const bodyHtml = pageRows.length
      ? pageRows
          .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("")
      : `<tr><td colspan="${headers.length}" style="text-align:center;padding:20px;color:var(--sf-text-muted)">${emptyMsg}</td></tr>`;

    const showingFrom = rows.length ? start + 1 : 0;
    const showingTo = Math.min(start + PAGE, rows.length);

    const pagHtml =
      totalPages > 1
        ? `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid var(--vscode-widget-border);font-size:12px">
        <span style="opacity:.6">${showingFrom}–${showingTo} of ${rows.length}</span>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" data-action="dt-page-prev" data-table="${tableId}" ${st.page === 0 ? 'disabled style="opacity:.4;padding:3px 10px;font-size:11px"' : ""}>‹ Prev</button>
        ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const pg =
            totalPages <= 7
              ? i
              : st.page < 4
                ? i
                : Math.min(st.page - 3 + i, totalPages - 1);
          if (pg >= totalPages || pg < 0) return "";
          return `<button class="btn ${pg === st.page ? "btn-primary" : "btn-ghost"}" style="padding:3px 8px;font-size:11px;min-width:28px" data-action="dt-page-go" data-table="${tableId}" data-pg="${pg}">${pg + 1}</button>`;
        }).join("")}
        <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" data-action="dt-page-next" data-table="${tableId}" ${st.page >= totalPages - 1 ? 'disabled style="opacity:.4;padding:3px 10px;font-size:11px"' : ""}>Next ›</button>
      </div>`
        : "";

    // Store config for refresh
    dataTableRegistry[tableId] = { headers, rows, opts };

    return `<div class="data-table-wrap" id="dt-wrap-${tableId}">
      <table class="data-table" style="font-size:12px"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>
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
          ctaPanel.innerHTML = renderCtaReviewContent(msg.data);
        }
        activateTab("cta");
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
    updateTabBadges();
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
      { id: "code", icon: "💻", label: "Code Quality" },
      { id: "automation", icon: "⚡", label: "Automation" },
      { id: "datamodel", icon: "🗄️", label: "Data Model" },
      { id: "perflimits", icon: "🚀", label: "Performance & Limits" },
      { id: "secaccess", icon: "🛡️", label: "Security & Access" },
      { id: "lwc", icon: "🧩", label: "LWC Quality" },
      { id: "dependencies", icon: "🕸️", label: "Dependencies" },
      { id: "stalemetadata", icon: "🧹", label: "Stale Metadata" },
      { id: "orginfo", icon: "🏢", label: "Org Info" },
      { id: "cta", icon: "🧠", label: "CTA Review" },
    ];

    appEl.innerHTML = `
      <div class="dashboard-header">
        <div class="header-brand">
          <span class="logo"><img class="logo-icon-img" src="${window.ORGPULSE_ICON_URI || ""}" alt="OrgPulse" /></span>
          <h1>OrgPulse</h1>
          <span class="org-badge">🔗 ${escHtml(orgLabel)}</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-ghost" data-action="export-report">⬇️ Export</button>
          <button class="btn btn-primary" data-action="run-analysis">🔍 Re-Analyse</button>
        </div>
      </div>

      <nav class="tab-nav" id="tab-nav">
        ${tabs
          .map(
            (t) => `
          <button class="tab-btn" id="tab-btn-${t.id}" data-action="activate-tab" data-tab="${t.id}">
            ${t.icon} ${t.label}
            <span class="tab-badge" id="badge-${t.id}" style="display:none">0</span>
          </button>`,
          )
          .join("")}
      </nav>

      <div class="tab-panels" id="tab-panels">
        <div class="tab-panel" id="panel-overview">${renderOverview()}</div>
        <div class="tab-panel" id="panel-code">${renderCodeQuality()}</div>
        <div class="tab-panel" id="panel-automation">${renderAutomation()}</div>
        <div class="tab-panel" id="panel-datamodel">${renderDataModel()}</div>
        <div class="tab-panel" id="panel-perflimits">${renderPerformanceLimits()}</div>
        <div class="tab-panel" id="panel-secaccess">${renderSecurityAccess()}</div>
        <div class="tab-panel" id="panel-lwc">${renderLwc()}</div>
        <div class="tab-panel" id="panel-dependencies">${renderDependencies()}</div>
        <div class="tab-panel" id="panel-stalemetadata">${renderStaleMetadata()}</div>
        <div class="tab-panel" id="panel-orginfo">${renderOrgInfo()}</div>
        <div class="tab-panel" id="panel-cta">${renderCtaReview()}</div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ORG INFO TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderOrgInfo() {
    const od = results && results.orgDetails;
    const inv = results && results.orgInventory;
    const licenses = (results && results.licenseSummary) || [];

    if (!od) {
      return `<div style="padding:48px 32px;text-align:center;opacity:.6">
        <div style="font-size:48px;margin-bottom:16px">🏢</div>
        <h3 style="margin:0 0 8px">No Org Details Available</h3>
        <p style="margin:0;font-size:13px">Re-run analysis to collect org details.</p>
      </div>`;
    }

    const TRUST_CFG = {
      OK: { color: "#22c55e", bg: "rgba(34,197,94,.1)", icon: "✅" },
      Informational: {
        color: "#3b82f6",
        bg: "rgba(59,130,246,.1)",
        icon: "ℹ️",
      },
      "Minor Incident": {
        color: "#f59e0b",
        bg: "rgba(245,158,11,.1)",
        icon: "⚠️",
      },
      "Major Incident": {
        color: "#ef4444",
        bg: "rgba(239,68,68,.1)",
        icon: "🚨",
      },
      Maintenance: { color: "#8b5cf6", bg: "rgba(139,92,246,.1)", icon: "🔧" },
      Unknown: { color: "#6b7280", bg: "rgba(107,114,128,.1)", icon: "❓" },
    };
    const tc = TRUST_CFG[od.trustStatus || "Unknown"] || TRUST_CFG["Unknown"];

    const activeIncidents = (od.trustIncidents || []).filter(
      (i) => i.status !== "Resolved",
    );
    const resolvedIncidents = (od.trustIncidents || []).filter(
      (i) => i.status === "Resolved",
    );

    const consoleApps = (od.apps || []).filter(
      (a) =>
        a.type === "ServiceDesk" ||
        a.type === "Console" ||
        (a.type || "").toLowerCase().includes("console"),
    );
    const standardApps = (od.apps || []).filter(
      (a) => !consoleApps.includes(a),
    );

    function kpiCard(icon, value, label, color) {
      return `<div class="stat-card"><span class="stat-icon">${icon}</span><div><div class="stat-value" style="color:${color || "inherit"}">${escHtml(String(value))}</div><div class="stat-label">${escHtml(label)}</div></div></div>`;
    }

    const featLicRows = (od.featureLicenses || [])
      .map((fl, i) => {
        const pct =
          fl.totalLicenses > 0
            ? Math.round((fl.usedLicenses / fl.totalLicenses) * 100)
            : 0;
        const barColor =
          pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
        return `<tr style="background:${i % 2 ? "var(--vscode-editor-background)" : "transparent"}">
        <td style="padding:8px 12px;font-size:13px;font-weight:600">${escHtml(fl.name)}</td>
        <td style="padding:8px 12px;font-size:12px;text-align:center">
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:${fl.status === "Active" ? "rgba(34,197,94,.15)" : "rgba(107,114,128,.15)"};color:${fl.status === "Active" ? "#22c55e" : "#6b7280"}">${escHtml(fl.status)}</span>
        </td>
        <td style="padding:8px 12px;font-size:13px;text-align:center">${fl.usedLicenses} / ${fl.totalLicenses}</td>
        <td style="padding:8px 12px;min-width:120px">
          <div style="height:6px;border-radius:3px;background:var(--vscode-widget-border);overflow:hidden">
            <div style="height:6px;border-radius:3px;background:${barColor};width:${pct}%"></div>
          </div>
          <div style="font-size:10px;opacity:.5;margin-top:2px;text-align:right">${pct}%</div>
        </td>
      </tr>`;
      })
      .join("");

    const userLicRows = licenses
      .map((l, i) => {
        const pct =
          l.totalLicenses > 0
            ? Math.round((l.usedLicenses / l.totalLicenses) * 100)
            : 0;
        const barColor =
          pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
        return `<tr style="background:${i % 2 ? "var(--vscode-editor-background)" : "transparent"}">
        <td style="padding:8px 12px;font-size:13px;font-weight:600">${escHtml(l.name)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center">${l.usedLicenses} / ${l.totalLicenses}</td>
        <td style="padding:8px 12px;min-width:120px">
          <div style="height:6px;border-radius:3px;background:var(--vscode-widget-border);overflow:hidden">
            <div style="height:6px;border-radius:3px;background:${barColor};width:${pct}%"></div>
          </div>
          <div style="font-size:10px;opacity:.5;margin-top:2px;text-align:right">${pct}%</div>
        </td>
      </tr>`;
      })
      .join("");

    const incidentRows = activeIncidents
      .map(
        (inc, i) =>
          `<div style="border-radius:10px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.06);padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span style="font-size:13px;font-weight:700;color:#ef4444">🚨 ${escHtml(inc.severity || "Incident")}</span>
          <span style="font-size:11px;opacity:.5">${inc.createdAt ? new Date(inc.createdAt).toLocaleString() : ""}</span>
        </div>
        <p style="margin:0 0 6px;font-size:13px;opacity:.9">${escHtml(inc.message || "")}</p>
        ${
          inc.affectedComponents && inc.affectedComponents.length
            ? `<div style="font-size:11px;opacity:.6">Affected: ${inc.affectedComponents
                .slice(0, 5)
                .map((c) => escHtml(c))
                .join(", ")}</div>`
            : ""
        }
      </div>`,
      )
      .join("");

    return `
      <div style="padding:28px 24px;max-width:1100px;margin:0 auto">

        <!-- Org Identity Card -->
        <div style="background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:14px;padding:24px 28px;margin-bottom:24px;display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap">
          <div style="width:56px;height:56px;border-radius:14px;background:rgba(1,118,211,.12);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">🏢</div>
          <div style="flex:1;min-width:220px">
            <div style="font-size:20px;font-weight:800;margin-bottom:4px">${escHtml(od.orgName || od.username)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              ${od.orgType ? `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(1,118,211,.15);color:var(--sf-blue,#0176d3)">${escHtml(od.orgType)}</span>` : ""}
              ${od.instanceName ? `<span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:rgba(99,102,241,.12);color:#6366f1">Instance: ${escHtml(od.instanceName)}</span>` : ""}
              <span style="font-size:11px;padding:3px 10px;border-radius:20px;background:rgba(107,114,128,.12);opacity:.8">API v${escHtml(od.apiVersion)}</span>
            </div>
            <div style="margin-top:8px;font-size:12px;opacity:.6">${escHtml(od.username)}${od.alias ? ` &nbsp;·&nbsp; <em>${escHtml(od.alias)}</em>` : ""}</div>
            <div style="margin-top:4px;font-size:12px;opacity:.55">🔗 <a href="${escHtml(od.instanceUrl)}" style="color:inherit;text-decoration:underline">${escHtml(od.instanceUrl)}</a></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
            <div style="padding:10px 16px;border-radius:10px;background:${tc.bg};border:1px solid ${tc.color}40;text-align:center">
              <div style="font-size:20px">${tc.icon}</div>
              <div style="font-size:12px;font-weight:700;color:${tc.color};margin-top:4px">${escHtml(od.trustStatus || "Unknown")}</div>
              <div style="font-size:10px;opacity:.6">Trust Status</div>
            </div>
            ${
              od.nextReleaseName
                ? `<div style="padding:8px 14px;border-radius:10px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);text-align:center;max-width:180px">
              <div style="font-size:11px;font-weight:700;color:#8b5cf6">📅 Next Release</div>
              <div style="font-size:12px;font-weight:600;margin-top:4px">${escHtml(od.nextReleaseName)}</div>
              ${od.nextReleaseDate ? `<div style="font-size:10px;opacity:.6;margin-top:2px">${new Date(od.nextReleaseDate).toLocaleDateString()}</div>` : ""}
            </div>`
                : ""
            }
          </div>
        </div>

        <!-- Org Stats Row -->
        <div class="stat-cards mb-24" style="flex-wrap:wrap">
          ${kpiCard("📦", inv ? inv.apexClassCount || 0 : 0, "Apex Classes", "")}
          ${kpiCard("🔄", inv ? inv.flowCount || 0 : 0, "Flows", "")}
          ${kpiCard("🗄️", inv ? inv.customObjectCount || 0 : 0, "Custom Objects", "")}
          ${kpiCard("📋", inv ? inv.customFieldCount || 0 : 0, "Custom Fields", "")}
          ${kpiCard("🖥️", od.consoleAppCount || 0, "Console Apps", od.consoleAppCount > 0 ? "var(--sf-blue,#0176d3)" : "")}
          ${kpiCard("📱", od.standardAppCount || 0, "Standard Apps", "")}
          ${kpiCard("🔐", inv ? inv.permissionSetCount || 0 : 0, "Permission Sets", "")}
          ${kpiCard("👥", licenses.length > 0 ? licenses.reduce((s, l) => s + l.usedLicenses, 0) : 0, "Active Users (lic)", "")}
        </div>

        <!-- Apps Breakdown -->
        ${
          od.apps && od.apps.length
            ? `
        <div style="background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <div style="width:32px;height:32px;background:rgba(99,102,241,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">📱</div>
            <span style="font-size:15px;font-weight:700">Apps (${od.apps.length} total · ${od.consoleAppCount} Console · ${od.standardAppCount} Standard)</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
            ${od.apps
              .slice(0, 40)
              .map((a) => {
                const isConsole =
                  a.type === "ServiceDesk" ||
                  a.type === "Console" ||
                  (a.type || "").toLowerCase().includes("console");
                return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:${isConsole ? "rgba(99,102,241,.08)" : "var(--vscode-sideBar-background,rgba(0,0,0,.04))"};border:1px solid ${isConsole ? "rgba(99,102,241,.2)" : "var(--vscode-widget-border)"}">
                <span style="font-size:14px">${isConsole ? "🖥️" : "📱"}</span>
                <span style="font-size:12px;font-weight:${isConsole ? "600" : "400"}">${escHtml(a.label)}</span>
              </div>`;
              })
              .join("")}
            ${od.apps.length > 40 ? `<div style="padding:8px 12px;font-size:12px;opacity:.5">…and ${od.apps.length - 40} more</div>` : ""}
          </div>
        </div>`
            : ""
        }

        <!-- Trust Center Incidents -->
        ${
          activeIncidents.length
            ? `
        <div style="background:var(--vscode-editor-background);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <div style="width:32px;height:32px;background:rgba(239,68,68,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">🚨</div>
            <span style="font-size:15px;font-weight:700;color:#ef4444">Active Trust Incidents (${activeIncidents.length})</span>
          </div>
          ${incidentRows}
        </div>`
            : `
        <div style="background:var(--vscode-editor-background);border:1px solid rgba(34,197,94,.25);border-radius:12px;padding:16px 24px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
          <span style="font-size:20px">✅</span>
          <span style="font-size:13px;font-weight:600;color:#22c55e">No active Trust Center incidents for instance ${escHtml(od.instanceName || "")}</span>
          <a href="https://status.salesforce.com" target="_blank" style="margin-left:auto;font-size:11px;opacity:.6;text-decoration:underline">status.salesforce.com</a>
        </div>`
        }

        <!-- User Licenses -->
        ${
          userLicRows
            ? `
        <div style="background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <div style="width:32px;height:32px;background:rgba(1,118,211,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">🪪</div>
            <span style="font-size:15px;font-weight:700">User Licenses</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:2px solid var(--vscode-widget-border)">
              <th style="text-align:left;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">License Type</th>
              <th style="text-align:center;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Used / Total</th>
              <th style="padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;min-width:140px">Utilisation</th>
            </tr></thead>
            <tbody>${userLicRows}</tbody>
          </table>
        </div>`
            : ""
        }

        <!-- Feature Licenses -->
        ${
          featLicRows
            ? `
        <div style="background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:12px;padding:20px 24px;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <div style="width:32px;height:32px;background:rgba(245,158,11,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">⭐</div>
            <span style="font-size:15px;font-weight:700">Feature Licenses</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="border-bottom:2px solid var(--vscode-widget-border)">
              <th style="text-align:left;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Feature</th>
              <th style="text-align:center;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Status</th>
              <th style="text-align:center;padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Used / Total</th>
              <th style="padding:6px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;min-width:140px">Utilisation</th>
            </tr></thead>
            <tbody>${featLicRows}</tbody>
          </table>
        </div>`
            : ""
        }

        <!-- Release Info -->
        ${
          od.nextReleaseName
            ? `
        <div style="background:var(--vscode-editor-background);border:1px solid rgba(139,92,246,.3);border-radius:12px;padding:20px 24px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div style="width:32px;height:32px;background:rgba(139,92,246,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">📅</div>
            <span style="font-size:15px;font-weight:700">Upcoming Maintenance / Release</span>
          </div>
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <div>
              <div style="font-size:13px;font-weight:600">${escHtml(od.nextReleaseName)}</div>
              ${od.nextReleaseDate ? `<div style="font-size:12px;opacity:.65;margin-top:3px">📆 ${new Date(od.nextReleaseDate).toLocaleString()}</div>` : ""}
            </div>
            <a href="https://status.salesforce.com" target="_blank" style="margin-left:auto;font-size:11px;opacity:.5;text-decoration:underline">More at status.salesforce.com</a>
          </div>
        </div>`
            : ""
        }

      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CTA REVIEW TAB
  // ═══════════════════════════════════════════════════════════════════════════
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
      return renderCtaReviewContent(results.ctaReview);
    }
    return `
      <div style="padding:32px;max-width:800px;margin:0 auto">
        <div style="text-align:center;padding:40px 0">
          <div style="font-size:64px;margin-bottom:16px">🧠</div>
          <h2 style="margin:0 0 8px">CTA Architecture Review</h2>
          <p style="opacity:.7;margin:0 0 24px">Get a board-room-quality architectural review powered by Claude / Copilot AI.
          The AI analyses your org health snapshot (scores, issues, inventory, licence data) and produces
          a structured Salesforce CTA-grade verdict with domain findings, critical risks, and quick wins.</p>
          <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:center;gap:10px">
            <label for="cta-model-select" style="font-size:13px;font-weight:600;opacity:.8">AI Model:</label>
            <select id="cta-model-select" style="padding:6px 12px;border-radius:6px;border:1px solid var(--vscode-input-border,#444);background:var(--vscode-input-background,#1e1e1e);color:var(--vscode-input-foreground,#ccc);font-size:13px;cursor:pointer">
              <option value="auto">Auto (Best Available)</option>
              <option value="claude-sonnet">Claude Sonnet</option>
              <option value="claude-opus">Claude Opus</option>
              <option value="gpt-4o">GPT-4o</option>
            </select>
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

  function renderCtaReviewContent(review) {
    if (!review) {
      return '<p style="padding:32px;opacity:.6">No CTA review data.</p>';
    }

    // ── Stale review banner (pre-v1.9.2 reviews lack architectureMaturity) ──
    const isLegacyReview = !review.architectureMaturity;
    const staleBanner = isLegacyReview
      ? `
      <div style="background:rgba(245,158,11,.12);border:1.5px solid rgba(245,158,11,.4);border-radius:10px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
        <span style="font-size:20px">⚠️</span>
        <div>
          <span style="font-weight:700;font-size:13px">This review was generated with an older version of OrgPulse.</span>
          <span style="font-size:12px;opacity:.8;margin-left:8px">Click <strong>Regenerate</strong> to get the full 12-section premium report.</span>
        </div>
      </div>`
      : "";

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

    const DOMAIN_ICONS = {
      "System Architecture": "🏗️",
      Security: "🔐",
      "Data Architecture": "🗄️",
      Integration: "🔌",
      "Solution Architecture": "🏇",
    };
    const STATUS_CFG = {
      Pass: { color: "#22c55e", bg: "rgba(34,197,94,.12)", icon: "✅" },
      Fail: { color: "#ef4444", bg: "rgba(239,68,68,.12)", icon: "❌" },
      Warning: { color: "#f59e0b", bg: "rgba(245,158,11,.12)", icon: "⚠️" },
    };
    const sc = (s) => STATUS_CFG[s] || STATUS_CFG["Warning"];
    const ec = (e) =>
      ({ Low: "#22c55e", Medium: "#f59e0b", High: "#ef4444" })[e] || "#f59e0b";
    const ecBg = (e) =>
      ({
        Low: "rgba(34,197,94,.12)",
        Medium: "rgba(245,158,11,.12)",
        High: "rgba(239,68,68,.12)",
      })[e] || "rgba(245,158,11,.12)";

    // ── §1 Verdict Banner ──────────────────────────────────────────────────
    const maturityBadge = review.architectureMaturity
      ? `<div style="display:flex;align-items:center;gap:8px;margin-top:10px">
          <span style="font-size:11px;opacity:.6;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Architecture Maturity</span>
          <span class="cta-maturity-badge level-${review.architectureMaturity.level}">Level ${review.architectureMaturity.level} — ${escHtml(review.architectureMaturity.label)}</span>
        </div>`
      : "";

    const verdictBanner = `
      <div style="border-radius:16px;padding:28px 32px;margin-bottom:24px;background:${vc.bg};border:1.5px solid ${vc.border};display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div style="width:64px;height:64px;border-radius:16px;background:${vc.color}22;border:2px solid ${vc.border};display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0">${vc.icon}</div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:${vc.color};margin-bottom:4px">CTA Architecture Verdict</div>
          <div style="font-size:26px;font-weight:800;color:${vc.color};line-height:1.1">${escHtml(review.verdict)} — ${vc.label}</div>
          <div style="font-size:12px;opacity:.6;margin-top:6px">✨ ${escHtml(review.modelUsed || "AI")} &nbsp;·&nbsp; ${review.generatedAt ? new Date(review.generatedAt).toLocaleString() : "Just now"}</div>
          ${maturityBadge}
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;align-items:center">
          <select id="cta-model-select" style="padding:5px 10px;border-radius:6px;border:1px solid var(--vscode-input-border,#444);background:var(--vscode-input-background,#1e1e1e);color:var(--vscode-input-foreground,#ccc);font-size:11px;cursor:pointer" title="Select AI model">
            <option value="auto">Auto</option>
            <option value="claude-sonnet">Claude Sonnet</option>
            <option value="claude-opus">Claude Opus</option>
            <option value="gpt-4o">GPT-4o</option>
          </select>
          <button class="btn btn-ghost" data-action="export-cta-pdf" style="font-size:12px;padding:8px 14px">📄 Export PDF</button>
          <button class="btn btn-secondary" data-action="run-cta-review" style="font-size:12px;padding:8px 18px">🔄 Regenerate</button>
        </div>
      </div>`;

    // ── §2 Executive Summary ───────────────────────────────────────────────
    const execSummary = `
      <div class="section-card" style="margin-bottom:20px">
        <div class="cta-section-header">
          <div class="cta-section-icon" style="background:rgba(1,118,211,.15)">📋</div>
          <span class="cta-section-title">Executive Summary</span>
          <span class="cta-section-badge">§1</span>
        </div>
        <p style="margin:0;line-height:1.75;font-size:13px;opacity:.9">${escHtml(review.executiveSummary || "")}</p>
      </div>`;

    // ── §3 Architecture Maturity ───────────────────────────────────────────
    const maturitySection = review.architectureMaturity
      ? (() => {
          const m = review.architectureMaturity;
          const maturityLabels = [
            "Ad Hoc",
            "Repeatable",
            "Defined",
            "Managed",
            "Optimised",
          ];
          const maturityColors = [
            "#ef4444",
            "#f97316",
            "#f59e0b",
            "#22c55e",
            "#0176d3",
          ];
          const steps = maturityLabels
            .map((lbl, i) => {
              const active = i + 1 === m.level;
              const past = i + 1 < m.level;
              return `<div class="cta-maturity-step ${active ? "active" : past ? "past" : ""}" style="${active ? `background:${maturityColors[i]};color:#fff;border-color:${maturityColors[i]}` : past ? `border-color:${maturityColors[i]};color:${maturityColors[i]}` : ""}">
          <div class="cta-maturity-num">${i + 1}</div>
          <div class="cta-maturity-lbl">${lbl}</div>
        </div>`;
            })
            .join('<div class="cta-maturity-connector"></div>');
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(139,92,246,.15)">🏅</div>
            <span class="cta-section-title">Architecture Maturity</span>
            <span class="cta-section-badge">§2</span>
          </div>
          <div class="cta-maturity-gauge">${steps}</div>
          <p style="margin:12px 0 0;font-size:13px;opacity:.85;line-height:1.6">${escHtml(m.summary)}</p>
        </div>`;
        })()
      : "";

    // ── §4 Business Impact Summary ─────────────────────────────────────────
    const impactSection = review.businessImpactSummary
      ? (() => {
          const b = review.businessImpactSummary;
          const sevColor =
            {
              Critical: "#ef4444",
              High: "#f59e0b",
              Medium: "#f59e0b",
              Low: "#22c55e",
            }[b.overallSeverity] || "#f59e0b";
          const sevBg =
            {
              Critical: "rgba(239,68,68,.12)",
              High: "rgba(245,158,11,.12)",
              Medium: "rgba(245,158,11,.12)",
              Low: "rgba(34,197,94,.12)",
            }[b.overallSeverity] || "rgba(245,158,11,.12)";
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(239,68,68,.12)">💼</div>
            <span class="cta-section-title">Business Impact Summary</span>
            <span class="cta-section-badge">§3</span>
            <span style="margin-left:auto;font-size:11px;font-weight:700;color:${sevColor};background:${sevBg};padding:3px 12px;border-radius:20px">${escHtml(b.overallSeverity)} Severity</span>
          </div>
          <div class="cta-impact-grid">
            <div class="cta-impact-card" style="border-top-color:#ef4444">
              <div class="cta-impact-label">💰 Revenue Risk</div>
              <div class="cta-impact-text">${escHtml(b.revenueRisk)}</div>
            </div>
            <div class="cta-impact-card" style="border-top-color:#f59e0b">
              <div class="cta-impact-label">⚙️ Operational Risk</div>
              <div class="cta-impact-text">${escHtml(b.operationalRisk)}</div>
            </div>
            <div class="cta-impact-card" style="border-top-color:#8b5cf6">
              <div class="cta-impact-label">🔏 Compliance Risk</div>
              <div class="cta-impact-text">${escHtml(b.complianceRisk)}</div>
            </div>
          </div>
        </div>`;
        })()
      : "";

    // ── §5 Org Profile ─────────────────────────────────────────────────────
    const profileSection = review.orgProfile
      ? (() => {
          const p = review.orgProfile;
          const cxColor =
            {
              Simple: "#22c55e",
              Moderate: "#f59e0b",
              Complex: "#f97316",
              Enterprise: "#ef4444",
            }[p.complexity] || "#f59e0b";
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(6,182,212,.12)">🏢</div>
            <span class="cta-section-title">Org Profile</span>
            <span class="cta-section-badge">§4</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:4px">
            <div class="cta-profile-item"><div class="cta-profile-label">Complexity</div><div class="cta-profile-value" style="color:${cxColor}">${escHtml(p.complexity)}</div></div>
            <div class="cta-profile-item"><div class="cta-profile-label">User Scale</div><div class="cta-profile-value">${escHtml(p.userScale)}</div></div>
            <div class="cta-profile-item"><div class="cta-profile-label">Integrations</div><div class="cta-profile-value">${escHtml(p.integrationFootprint)}</div></div>
            <div class="cta-profile-item"><div class="cta-profile-label">Customisation</div><div class="cta-profile-value">${escHtml(p.customizationLevel)}</div></div>
          </div>
        </div>`;
        })()
      : "";

    // ── §6 Health Score Breakdown ──────────────────────────────────────────
    const scoreSection = (review.healthScoreBreakdown || []).length
      ? (() => {
          const trendIcon = (t) =>
            ({ improving: "↑", stable: "→", declining: "↓" })[t] || "→";
          const trendColor = (t) =>
            ({ improving: "#22c55e", stable: "#6b7280", declining: "#ef4444" })[
              t
            ] || "#6b7280";
          const bars = (review.healthScoreBreakdown || [])
            .map((s) => {
              const pct = Math.min(
                100,
                Math.round((s.score / (s.maxScore || 100)) * 100),
              );
              const barColor =
                pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
              return `
          <div class="cta-score-row">
            <div class="cta-score-label">${escHtml(s.area)}</div>
            <div class="cta-score-bar-wrap">
              <div class="cta-score-bar" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <div class="cta-score-num" style="color:${barColor}">${s.score}</div>
            <div class="cta-score-trend" style="color:${trendColor(s.trend)}">${trendIcon(s.trend)}</div>
            <div class="cta-score-finding">${escHtml(s.keyFinding)}</div>
          </div>`;
            })
            .join("");
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(34,197,94,.12)">📊</div>
            <span class="cta-section-title">Health Score Breakdown</span>
            <span class="cta-section-badge">§5</span>
          </div>
          <div class="cta-score-list">${bars}</div>
        </div>`;
        })()
      : "";

    // ── §7 Top Critical Issues ─────────────────────────────────────────────
    const critIssuesSection = (review.topCriticalIssues || []).length
      ? (() => {
          const rows = (review.topCriticalIssues || [])
            .map((issue) => {
              const sevColor =
                issue.severity === "Critical" ? "#ef4444" : "#f59e0b";
              const sevBg =
                issue.severity === "Critical"
                  ? "rgba(239,68,68,.12)"
                  : "rgba(245,158,11,.12)";
              return `<tr>
          <td style="padding:10px 12px;font-weight:700;font-size:13px;width:30px;text-align:center;border-bottom:1px solid var(--vscode-widget-border)">${issue.rank}</td>
          <td style="padding:10px 12px;font-weight:600;font-size:13px;border-bottom:1px solid var(--vscode-widget-border)">
            ${escHtml(issue.title)}
            <div style="font-size:11px;opacity:.55;font-weight:400;margin-top:2px">${escHtml(issue.domain)}</div>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid var(--vscode-widget-border)">
            <span style="font-size:11px;font-weight:700;color:${sevColor};background:${sevBg};padding:2px 8px;border-radius:20px">${escHtml(issue.severity)}</span>
          </td>
          <td style="padding:10px 12px;font-size:12px;opacity:.85;border-bottom:1px solid var(--vscode-widget-border)">${escHtml(issue.impact)}</td>
          <td style="padding:10px 12px;font-size:12px;opacity:.8;border-bottom:1px solid var(--vscode-widget-border)">${escHtml(issue.remediation)}</td>
          <td style="padding:10px 12px;font-size:11px;opacity:.6;border-bottom:1px solid var(--vscode-widget-border);white-space:nowrap">${escHtml(issue.effortEstimate)}</td>
        </tr>`;
            })
            .join("");
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(239,68,68,.12)">🚨</div>
            <span class="cta-section-title">Top Critical Issues</span>
            <span class="cta-section-badge">§6</span>
          </div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;margin-top:4px">
              <thead><tr style="border-bottom:2px solid var(--vscode-widget-border)">
                <th style="text-align:center;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;width:40px">#</th>
                <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Issue</th>
                <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;width:90px">Severity</th>
                <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Impact</th>
                <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Remediation</th>
                <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Effort</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
        })()
      : "";

    // ── §8 Risk Analysis ───────────────────────────────────────────────────
    const riskSection = review.riskAnalysis
      ? (() => {
          const ra = review.riskAnalysis;
          const heatmapCells = (ra.riskHeatmap || [])
            .map((cell) => {
              const l = { Low: 1, Medium: 2, High: 3 }[cell.likelihood] || 1;
              const im = { Low: 1, Medium: 2, High: 3 }[cell.impact] || 1;
              const risk = l * im;
              const cellColor =
                risk >= 6 ? "#ef4444" : risk >= 3 ? "#f59e0b" : "#22c55e";
              const cellBg =
                risk >= 6
                  ? "rgba(239,68,68,.15)"
                  : risk >= 3
                    ? "rgba(245,158,11,.15)"
                    : "rgba(34,197,94,.1)";
              return `<div class="cta-heatmap-cell" style="border-color:${cellColor}40;background:${cellBg}">
          <div class="cta-heatmap-domain">${escHtml(cell.domain)}</div>
          <div class="cta-heatmap-vals" style="color:${cellColor}">L:${escHtml(cell.likelihood)} I:${escHtml(cell.impact)}</div>
        </div>`;
            })
            .join("");
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(239,68,68,.12)">🔥</div>
            <span class="cta-section-title">Risk Analysis</span>
            <span class="cta-section-badge">§7</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:4px;flex-wrap:wrap">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:6px">Probability of Incident</div>
              <div style="font-size:13px;line-height:1.6;opacity:.9">${escHtml(ra.probabilityOfIncident)}</div>
              <div style="margin-top:10px">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:6px">Time to Risk</div>
                <div style="font-size:13px;font-weight:700;color:#ef4444">${escHtml(ra.timeToRisk)}</div>
              </div>
            </div>
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:8px">Risk Heatmap (Likelihood × Impact)</div>
              <div class="cta-heatmap-grid">${heatmapCells}</div>
            </div>
          </div>
        </div>`;
        })()
      : "";

    // ── §9 Benchmark Comparison ────────────────────────────────────────────
    const benchmarkSection = (review.benchmarkComparison || []).length
      ? (() => {
          const rows = (review.benchmarkComparison || [])
            .map((b, i) => {
              const stColor =
                { Above: "#22c55e", At: "#f59e0b", Below: "#ef4444" }[
                  b.status
                ] || "#f59e0b";
              const stBg =
                {
                  Above: "rgba(34,197,94,.1)",
                  At: "rgba(245,158,11,.1)",
                  Below: "rgba(239,68,68,.1)",
                }[b.status] || "rgba(245,158,11,.1)";
              return `<tr style="background:${i % 2 ? "var(--vscode-editor-background)" : "transparent"}">
          <td style="padding:10px 12px;font-weight:600;font-size:13px;border-bottom:1px solid var(--vscode-widget-border)">${escHtml(b.metric)}</td>
          <td style="padding:10px 12px;font-size:13px;font-weight:700;border-bottom:1px solid var(--vscode-widget-border)">${escHtml(String(b.orgValue))}</td>
          <td style="padding:10px 12px;font-size:12px;opacity:.7;border-bottom:1px solid var(--vscode-widget-border)">${escHtml(String(b.industryAvg))}</td>
          <td style="padding:10px 12px;font-size:12px;opacity:.7;border-bottom:1px solid var(--vscode-widget-border)">${escHtml(String(b.topQuartile))}</td>
          <td style="padding:10px 12px;border-bottom:1px solid var(--vscode-widget-border)"><span style="font-size:11px;font-weight:700;color:${stColor};background:${stBg};padding:2px 8px;border-radius:20px">${escHtml(b.status)}</span></td>
        </tr>`;
            })
            .join("");
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(6,182,212,.12)">📈</div>
            <span class="cta-section-title">Benchmark Comparison</span>
            <span class="cta-section-badge">§8</span>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:4px">
            <thead><tr style="border-bottom:2px solid var(--vscode-widget-border)">
              <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Metric</th>
              <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Your Org</th>
              <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Industry Avg</th>
              <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Top Quartile</th>
              <th style="text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6">Status</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
        })()
      : "";

    // ── §10 Domain Findings ────────────────────────────────────────────────
    const domainCards = (review.domainFindings || [])
      .map((d) => {
        const cfg = sc(d.status);
        const domIcon = DOMAIN_ICONS[d.domain] || "📋";
        return `
        <div style="background:var(--vscode-editor-background);border:1px solid ${cfg.color}40;border-radius:12px;padding:20px;position:relative;overflow:hidden">
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${cfg.color}"></div>
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
            <div style="width:40px;height:40px;border-radius:10px;background:${cfg.bg};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${domIcon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:14px;font-weight:700">${escHtml(d.domain)}</span>
                <span style="font-size:11px;font-weight:700;color:${cfg.color};background:${cfg.bg};padding:2px 8px;border-radius:20px">${cfg.icon} ${escHtml(d.status)}</span>
              </div>
            </div>
          </div>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.6;opacity:.9">${escHtml(d.analysis)}</p>
          ${d.risks && d.risks.length ? `<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin-bottom:6px">Risks</div>${d.risks.map((r) => `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;font-size:12px"><span style="color:#ef4444;flex-shrink:0">●</span><span style="opacity:.85">${escHtml(r)}</span></div>`).join("")}</div>` : ""}
          ${d.recommendations && d.recommendations.length ? `<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin-bottom:6px">Recommendations</div>${d.recommendations.map((r) => `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;font-size:12px"><span style="color:#22c55e;flex-shrink:0">→</span><span style="opacity:.85">${escHtml(r)}</span></div>`).join("")}</div>` : ""}
        </div>`;
      })
      .join("");

    const domainSection = `
      <div style="margin-bottom:20px">
        <div class="cta-section-header" style="margin-bottom:16px">
          <div class="cta-section-icon" style="background:rgba(1,118,211,.12)">🏗️</div>
          <span class="cta-section-title">Domain Findings</span>
          <span class="cta-section-badge">§9</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">${domainCards}</div>
      </div>`;

    // ── §11 AI Insights ────────────────────────────────────────────────────
    const insightsSection = review.aiInsights
      ? (() => {
          const ai = review.aiInsights;
          const insightBlock = (icon, title, items, color) =>
            items && items.length
              ? `
        <div style="flex:1;min-width:200px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${color};margin-bottom:8px">${icon} ${title}</div>
          ${items.map((it) => `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;font-size:12px"><span style="color:${color};flex-shrink:0;margin-top:2px">▸</span><span style="opacity:.85;line-height:1.5">${escHtml(it)}</span></div>`).join("")}
        </div>`
              : "";
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(139,92,246,.12)">✨</div>
            <span class="cta-section-title">AI Insights</span>
            <span class="cta-section-badge">§10</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:4px">
            ${insightBlock("🔍", "Hidden Risks", ai.hiddenRisks, "#ef4444")}
            ${insightBlock("🔮", "Predictions", ai.predictions, "#8b5cf6")}
            ${insightBlock("⚡", "Unusual Patterns", ai.unusualPatterns, "#f59e0b")}
          </div>
        </div>`;
        })()
      : "";

    // ── §12 Architecture Observations (SWOT) ──────────────────────────────
    const swotSection = (review.architectureObservations || []).length
      ? (() => {
          const classMap = {
            Strength: "#22c55e",
            Weakness: "#ef4444",
            Opportunity: "#0176d3",
            Threat: "#f59e0b",
          };
          const classBg = {
            Strength: "rgba(34,197,94,.08)",
            Weakness: "rgba(239,68,68,.08)",
            Opportunity: "rgba(1,118,211,.08)",
            Threat: "rgba(245,158,11,.08)",
          };
          const classIcon = {
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
          const quadrant = (cls) => `
        <div style="padding:16px;border-radius:10px;background:${classBg[cls]};border:1px solid ${classMap[cls]}30">
          <div style="font-size:12px;font-weight:700;color:${classMap[cls]};margin-bottom:10px">${classIcon[cls]} ${cls}s</div>
          ${grouped[cls].map((obs) => `<div style="font-size:12px;opacity:.85;margin-bottom:6px;display:flex;gap:6px"><span style="color:${classMap[cls]};flex-shrink:0">·</span>${escHtml(obs)}</div>`).join("") || '<div style="font-size:12px;opacity:.4">None identified</div>'}
        </div>`;
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(1,118,211,.12)">🔭</div>
            <span class="cta-section-title">Architecture Observations</span>
            <span class="cta-section-badge">§11</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px">
            ${quadrant("Strength")}${quadrant("Weakness")}${quadrant("Opportunity")}${quadrant("Threat")}
          </div>
        </div>`;
        })()
      : "";

    // ── §13 Recommendations ────────────────────────────────────────────────
    const recsSection = review.recommendations
      ? (() => {
          const rec = review.recommendations;
          const qwRows = (rec.quickWins || [])
            .map(
              (w, i) => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;border-radius:8px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);margin-bottom:8px">
          <span style="width:22px;height:22px;border-radius:50%;background:#22c55e;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${i + 1}</span>
          <div style="flex:1"><div style="font-size:13px;opacity:.9;line-height:1.5">${escHtml(w.action)}</div>
          <div style="margin-top:4px;display:flex;gap:8px">
            <span style="font-size:10px;font-weight:700;color:${ec(w.effort)};background:${ecBg(w.effort)};padding:1px 6px;border-radius:10px">${escHtml(w.effort)} Effort</span>
            <span style="font-size:11px;opacity:.6">${escHtml(w.impact)}</span>
          </div></div>
        </div>`,
            )
            .join("");
          const stRows = (rec.strategic || [])
            .map(
              (s, i) => `
        <div style="display:flex;gap:16px;padding:12px 16px;border-radius:8px;background:rgba(1,118,211,.06);border:1px solid rgba(1,118,211,.15);margin-bottom:8px">
          <div style="width:36px;height:36px;border-radius:8px;background:rgba(1,118,211,.15);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;color:#0176d3">${i + 1}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;opacity:.95;margin-bottom:4px">${escHtml(s.action)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;opacity:.6">📅 ${escHtml(s.timeline)}</span>
              <span style="font-size:10px;font-weight:700;color:${ec(s.effort)};background:${ecBg(s.effort)};padding:1px 6px;border-radius:10px">${escHtml(s.effort)} Effort</span>
              <span style="font-size:11px;opacity:.6">${escHtml(s.impact)}</span>
            </div>
          </div>
        </div>`,
            )
            .join("");
          return `
        <div class="section-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(34,197,94,.12)">⚡</div>
            <span class="cta-section-title">Recommendations</span>
            <span class="cta-section-badge">§12</span>
          </div>
          ${qwRows ? `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:12px 0 8px">Quick Wins (1-2 sprints)</div>${qwRows}` : ""}
          ${stRows ? `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:16px 0 8px">Strategic Initiatives</div>${stRows}` : ""}
        </div>`;
        })()
      : "";

    // ── §14 Cost of Inaction ───────────────────────────────────────────────
    const inactionSection = review.costOfInaction
      ? (() => {
          const c = review.costOfInaction;
          return `
        <div class="cta-inaction-card" style="margin-bottom:20px">
          <div class="cta-section-header">
            <div class="cta-section-icon" style="background:rgba(239,68,68,.12)">⏳</div>
            <span class="cta-section-title">Cost of Inaction</span>
            <span class="cta-section-badge">§13</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px">
            <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#ef4444;margin-bottom:6px">Financial Impact</div><div style="font-size:13px;opacity:.9;line-height:1.5">${escHtml(c.financialImpact)}</div></div>
            <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#f59e0b;margin-bottom:6px">Technical Debt Growth</div><div style="font-size:13px;opacity:.9;line-height:1.5">${escHtml(c.technicalDebtGrowth)}</div></div>
          </div>
          ${c.risks && c.risks.length ? `<div style="margin-top:12px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:6px">Compounding Risks</div>${c.risks.map((r) => `<div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;font-size:12px"><span style="color:#ef4444;flex-shrink:0">●</span><span style="opacity:.85">${escHtml(r)}</span></div>`).join("")}</div>` : ""}
        </div>`;
        })()
      : "";

    // ── §15 Final CTA Recommendation ──────────────────────────────────────
    const finalSection = review.finalRecommendation
      ? (() => {
          const f = review.finalRecommendation;
          return `
        <div style="background:${vc.bg};border:1.5px solid ${vc.border};border-radius:14px;padding:28px;margin-bottom:20px">
          <div class="cta-section-header" style="margin-bottom:16px">
            <div class="cta-section-icon" style="background:${vc.color}22">${vc.icon}</div>
            <span class="cta-section-title">Final CTA Recommendation</span>
            <span class="cta-section-badge">§14</span>
          </div>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.75;opacity:.95;font-weight:500">${escHtml(f.summary)}</p>
          ${
            f.nextSteps && f.nextSteps.length
              ? `
            <div style="margin-bottom:14px">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin-bottom:8px">Immediate Next Steps</div>
              ${f.nextSteps
                .map(
                  (step, i) => `
                <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;font-size:13px">
                  <span style="width:20px;height:20px;border-radius:50%;background:${vc.color};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${i + 1}</span>
                  <span style="opacity:.9;line-height:1.5">${escHtml(step)}</span>
                </div>`,
                )
                .join("")}
            </div>`
              : ""
          }
          ${f.proposedTimeline ? `<div style="background:rgba(0,0,0,.06);border-radius:8px;padding:12px 16px;font-size:12px;opacity:.8;line-height:1.6"><span style="font-weight:700">📅 Proposed Timeline: </span>${escHtml(f.proposedTimeline)}</div>` : ""}
        </div>`;
        })()
      : "";

    return `
      <div style="padding:28px 24px;max-width:1100px;margin:0 auto">
        ${staleBanner}
        ${verdictBanner}
        ${execSummary}
        ${maturitySection}
        ${impactSection}
        ${profileSection}
        ${scoreSection}
        ${critIssuesSection}
        ${riskSection}
        ${benchmarkSection}
        ${domainSection}
        ${insightsSection}
        ${swotSection}
        ${recsSection}
        ${inactionSection}
        ${finalSection}
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OVERVIEW TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderOverview() {
    const s = results.scores;
    const sum = results.summary;
    const meta = results.metadata || {};

    const topRisks = [...results.issues]
      .filter((i) => i.severity === "error")
      .slice(0, 5);

    const catDefs = [
      {
        key: "codeQuality",
        label: "Code Quality",
        icon: "💻",
        weight: 25,
        tab: "code",
      },
      {
        key: "automationDesign",
        label: "Automation",
        icon: "⚡",
        weight: 20,
        tab: "automation",
      },
      {
        key: "dataModel",
        label: "Data Model",
        icon: "🗄️",
        weight: 15,
        tab: "datamodel",
      },
      {
        key: "performance",
        label: "Performance",
        icon: "🚀",
        weight: 20,
        tab: "perflimits",
      },
      {
        key: "security",
        label: "Security",
        icon: "🛡️",
        weight: 10,
        tab: "secaccess",
      },
      {
        key: "testing",
        label: "Testing",
        icon: "🧪",
        weight: 5,
        tab: "overview",
      },
      {
        key: "integration",
        label: "Integration",
        icon: "🔌",
        weight: 5,
        tab: "overview",
      },
    ];

    // Test coverage %
    const testCov = s.testing != null ? s.testing : meta.testCoverage || 0;
    const testCovPct = typeof testCov === "number" ? testCov : 0;
    const testCovCls =
      testCovPct >= 85
        ? "c-excellent"
        : testCovPct >= 75
          ? "c-fair"
          : "c-critical";

    return `
      <!-- Score Ring + Category Cards -->
      <div class="overview-top mb-24">
        <div class="score-ring-wrap">
          ${renderScoreRing(s.overall)}
          <div class="ring-grade ${scoreColorClass(s.overall)}">${getGrade(s.overall).grade} — ${getGrade(s.overall).description}</div>
          <div class="ring-desc" style="font-size:11px;color:var(--sf-text-muted);text-align:center">
            ${formatTs(results.timestamp)}
          </div>
        </div>
        <div class="category-scores">
          ${catDefs.map((c) => renderCatCard(c, s[c.key])).join("")}
        </div>
      </div>

      <!-- Stat Cards -->
      <div class="stat-cards mb-24">
        <div class="stat-card">
          <span class="stat-icon">❌</span>
          <div><div class="stat-value c-critical">${sum.errorCount}</div><div class="stat-label">Errors</div></div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">⚠️</span>
          <div><div class="stat-value c-fair">${sum.warningCount}</div><div class="stat-label">Warnings</div></div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">ℹ️</span>
          <div><div class="stat-value c-good">${sum.infoCount}</div><div class="stat-label">Info</div></div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">🧪</span>
          <div><div class="stat-value ${testCovCls}">${testCovPct}%</div><div class="stat-label">Test Coverage</div></div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">📦</span>
          <div><div class="stat-value">${meta.analyzedClasses || 0}</div><div class="stat-label">Apex Classes</div></div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">⚡</span>
          <div><div class="stat-value">${meta.analyzedTriggers || 0}</div><div class="stat-label">Triggers</div></div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">🔄</span>
          <div><div class="stat-value">${meta.analyzedFlows || 0}</div><div class="stat-label">Flows</div></div>
        </div>
        <div class="stat-card">
          <span class="stat-icon">🗄️</span>
          <div><div class="stat-value">${meta.analyzedObjects || 0}</div><div class="stat-label">Objects</div></div>
        </div>
      </div>

      <!-- Data Usage & Security Transparency -->
      ${renderTransparencyPanel()}

      <!-- Export All Issues -->
      <div class="mb-24">
        <div class="section-title">📥 Export All Issues (${(results.issues || []).length} total)</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <button class="btn btn-secondary" data-action="export-issues-csv" style="font-size:12px">📄 Export CSV</button>
          <button class="btn btn-secondary" data-action="export-issues-excel" style="font-size:12px">📊 Export Excel</button>
          <button class="btn btn-secondary" data-action="export-issues-pdf" style="font-size:12px">📕 Export PDF</button>
        </div>
      </div>

      <!-- Org Metadata -->
      <div class="mb-24">
        <div class="section-title">🔗 Connected Org</div>
        <div class="org-meta-card">
          <div class="org-meta-grid">
            <div class="org-meta-item"><div class="org-meta-label">Username</div><div class="org-meta-value">${escHtml(meta.orgUsername || "—")}</div></div>
            <div class="org-meta-item"><div class="org-meta-label">Alias</div><div class="org-meta-value">${escHtml(meta.orgAlias || "—")}</div></div>
            <div class="org-meta-item"><div class="org-meta-label">Org ID</div><div class="org-meta-value">${escHtml(meta.orgId || "—")}</div></div>
            <div class="org-meta-item"><div class="org-meta-label">API Version</div><div class="org-meta-value">${escHtml(meta.apiVersion || "—")}</div></div>
            <div class="org-meta-item"><div class="org-meta-label">Duration</div><div class="org-meta-value">${results.duration ? (results.duration / 1000).toFixed(1) + "s" : "—"}</div></div>
            <div class="org-meta-item"><div class="org-meta-label">Files Scanned</div><div class="org-meta-value">${meta.analyzedFiles || 0}</div></div>
          </div>
        </div>
      </div>

      <!-- Top Risks -->
      ${
        topRisks.length > 0
          ? `
      <div class="mb-24">
        <div class="section-title">🚨 Top Critical Issues</div>
        <div class="top-risks">
          ${topRisks
            .map((iss) => {
              const idx = registerIssue(iss);
              return `
            <div class="risk-item ${iss.severity}" data-action="open-drill" data-idx="${idx}" style="cursor:pointer">
              <span class="risk-sev-icon">${sevIcon(iss.severity)}</span>
              <div class="risk-body">
                <div class="risk-message">${escHtml(iss.message)}</div>
                <div class="risk-meta">${formatCatLabel(iss.category)} · ${iss.file ? shortPath(iss.file) : iss.object || ""}</div>
              </div>
            </div>`;
            })
            .join("")}
        </div>
      </div>`
          : ""
      }

      <!-- Recommendations -->
      <div>
        <div class="section-title">💡 Architectural Recommendations</div>
        ${renderRecommendations(s)}
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

  function renderRecommendations(scores) {
    const recs = buildRecs(scores);
    return `<div class="rec-grid">${recs
      .map(
        (r) => `
      <div class="rec-card">
        <div class="rec-card-header">
          <span class="rec-icon">${r.icon}</span>
          <span class="rec-title">${r.title}</span>
          <span class="rec-impact ${r.impact}">${r.impact.toUpperCase()}</span>
        </div>
        <div class="rec-body">${r.body}</div>
        <div class="rec-tags">${r.tags.map((t) => `<span class="rec-tag">${t}</span>`).join("")}</div>
      </div>`,
      )
      .join("")}</div>`;
  }

  function buildRecs(scores) {
    const recs = [];

    if (scores.codeQuality < 80) {
      recs.push({
        icon: "🏗️",
        title: "Adopt FFLIB / Apex Enterprise Patterns",
        impact: "high",
        body: "Classes without a sharing declaration or with large trigger bodies indicate missing separation of concerns. Implement Service, Domain, Selector, and UnitOfWork layers.",
        tags: ["FFLIB", "Trigger Framework", "DRY"],
      });
    }
    if (scores.automationDesign < 80) {
      recs.push({
        icon: "⚡",
        title: "Consolidate Automation per Object",
        impact: "high",
        body: "Multiple triggers and flows on the same object can cause ordering conflicts and recursion. Aim for one trigger + one orchestration flow per object.",
        tags: ["Trigger Framework", "Flow Governor", "One-Trigger Pattern"],
      });
    }
    if (scores.performance < 80) {
      recs.push({
        icon: "🚀",
        title: "Fix SOQL Anti-Patterns",
        impact: "high",
        body: "SOQL in loops, missing indexed filters, or SELECT * patterns cause governor limit exceptions at scale. Add LIMIT clauses and move queries outside loops.",
        tags: ["SOQL Best Practices", "Bulkification", "LDV"],
      });
    }
    if (scores.security < 80) {
      recs.push({
        icon: "🛡️",
        title: "Enforce Least-Privilege Access",
        impact: "high",
        body: "PermissionSets with Modify All Data or View All Data bypass all record-level security. Replace with fine-grained object and field permissions.",
        tags: ["Security Review", "ISV", "CRUD/FLS"],
      });
    }
    if (scores.testing < 75) {
      recs.push({
        icon: "🧪",
        title: "Increase Test Coverage to ≥ 85%",
        impact: "medium",
        body: "Low coverage blocks deployments and masks bugs. Write unit tests for every Apex class using @IsTest + Test.startTest/stopTest with positive, negative, and bulk scenarios.",
        tags: ["Test Coverage", "CI/CD", "Deployment"],
      });
    }
    if (scores.integration < 80) {
      recs.push({
        icon: "🔌",
        title: "Migrate to Named Credentials + OAuth",
        impact: "medium",
        body: "Hard-coded credentials or password-based Named Credentials create security exposure. Use OAuth 2.0 Named Credentials with JWT or Client Credentials flow.",
        tags: ["Named Credentials", "OAuth 2.0", "Zero-Trust"],
      });
    }
    if (scores.dataModel < 80) {
      recs.push({
        icon: "🗄️",
        title: "Reduce Custom Field Sprawl",
        impact: "medium",
        body: "Unused custom fields increase maintenance burden and degrade Salesforce search indexing. Audit fields older than 12 months with no references.",
        tags: ["Data Model", "Metadata Hygiene", "LDV"],
      });
    }

    // Always add at least one architectural best-practice card
    recs.push({
      icon: "🎯",
      title: "Adopt Event-Driven Architecture",
      impact: "low",
      body: "Platform Events and Change Data Capture decouple integrations from core business logic, improving resilience and enabling real-time processing at scale.",
      tags: ["Platform Events", "CDC", "Event-Driven"],
    });

    return recs;
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

    return `
      <!-- CTA-Style Summary -->
      <div class="mb-24">
        <div class="section-title">💻 Code Quality Summary</div>
        <div class="lwc-summary-cards">
          <div class="lwc-summary-card">
            <div class="lwc-summary-num">${s.codeQuality || 0}</div>
            <div class="lwc-summary-label">Quality Score</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num c-critical">${errors.length}</div>
            <div class="lwc-summary-label">Critical Issues</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num c-fair">${warnings.length}</div>
            <div class="lwc-summary-label">Warnings</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num c-good">${infos.length}</div>
            <div class="lwc-summary-label">Info</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${apTotal > 10 ? "c-critical" : apTotal > 5 ? "c-fair" : "c-excellent"}">${apTotal}</div>
            <div class="lwc-summary-label">Anti-Patterns</div>
          </div>
          <div class="lwc-summary-card">
            <div class="lwc-summary-num ${sprints > 10 ? "c-critical" : sprints > 5 ? "c-fair" : "c-excellent"}">${sprints || allIssues.length}</div>
            <div class="lwc-summary-label">${sprints ? "Sprint Cycles" : "Total Items"}</div>
          </div>
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

      <!-- CTA-Style Recommendations -->
      <div>
        <div class="section-title">💡 Code Quality Recommendations</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🏗️</span><span class="rec-title">Apply with sharing Everywhere</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">All non-utility Apex classes should declare <code>with sharing</code> unless there is an explicit reason to bypass record visibility rules. This is a Security Review blocker for ISVs.</div>
            <div class="rec-tags"><span class="rec-tag">Security</span><span class="rec-tag">ISV</span><span class="rec-tag">Best Practice</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🏗️</span><span class="rec-title">Adopt FFLIB / Apex Enterprise Patterns</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Implement Service, Domain, Selector, and UnitOfWork layers. This separates concerns, makes testing trivial, and eliminates trigger-body logic.</div>
            <div class="rec-tags"><span class="rec-tag">FFLIB</span><span class="rec-tag">Trigger Framework</span><span class="rec-tag">DRY</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">📏</span><span class="rec-title">Enforce Method Length Limits</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Methods exceeding 50 lines are hard to test and review. Extract helper methods or delegate to separate classes. Use PMD rules to enforce.</div>
            <div class="rec-tags"><span class="rec-tag">Readability</span><span class="rec-tag">Testability</span></div>
          </div>
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATION TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderAutomation() {
    const autoIssues = results.issues.filter(
      (i) => i.category === "automation-design",
    );

    // Build heatmap data from issues
    const objectMap = {};
    for (const iss of autoIssues) {
      const obj = iss.object || "Unknown";
      if (!objectMap[obj]) {
        objectMap[obj] = {
          triggers: 0,
          flows: 0,
          validations: 0,
          process: 0,
          total: 0,
        };
      }
      objectMap[obj].total++;
      if (/trigger/i.test(iss.ruleId)) objectMap[obj].triggers++;
      else if (/flow/i.test(iss.ruleId)) objectMap[obj].flows++;
      else if (/valid/i.test(iss.ruleId)) objectMap[obj].validations++;
      else objectMap[obj].process++;
    }

    const objects = Object.entries(objectMap).sort(
      (a, b) => b[1].total - a[1].total,
    );

    return `
      <div class="mb-24">
        <div class="section-title">⚡ Automation Complexity Heatmap</div>
        <div class="heatmap-wrap">
          <table class="heatmap-table">
            <thead>
              <tr>
                <th>Object</th>
                <th>Triggers</th>
                <th>Flows</th>
                <th>Validations</th>
                <th>Other</th>
                <th>Total Issues</th>
              </tr>
            </thead>
            <tbody>
              ${
                objects.length === 0
                  ? `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--sf-text-muted)">No automation issues detected ✅</td></tr>`
                  : objects
                      .map(
                        ([obj, d]) => `
                  <tr>
                    <td>${escHtml(obj)}</td>
                    <td><span class="heatmap-cell ${hmClass(d.triggers)}">${d.triggers || "—"}</span></td>
                    <td><span class="heatmap-cell ${hmClass(d.flows)}">${d.flows || "—"}</span></td>
                    <td><span class="heatmap-cell ${hmClass(d.validations)}">${d.validations || "—"}</span></td>
                    <td><span class="heatmap-cell ${hmClass(d.process)}">${d.process || "—"}</span></td>
                    <td><span class="heatmap-cell ${hmClass(d.total)}" style="font-size:14px">${d.total}</span></td>
                  </tr>`,
                      )
                      .join("")
              }
            </tbody>
            <tfoot>
              <tr><td colspan="6">Cells coloured by issue count: green=1, amber=2-3, orange=4-5, red>5</td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="mb-24" style="margin-top:24px">
        <div class="section-title">💡 Automation Recommendations</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🎯</span><span class="rec-title">One Trigger Per Object</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Use a Trigger Dispatcher pattern (FFLIB or custom) to route to Domain classes. Eliminates ordering bugs and makes unit testing trivial.</div>
            <div class="rec-tags"><span class="rec-tag">FFLIB</span><span class="rec-tag">Domain Layer</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🔄</span><span class="rec-title">Flows as Orchestrators Only</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Flows should orchestrate business processes, not contain complex logic. Move data manipulation to Apex invocable methods to maintain governor limit visibility.</div>
            <div class="rec-tags"><span class="rec-tag">Flow Best Practices</span><span class="rec-tag">Invocable Apex</span></div>
          </div>
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA MODEL TAB
  // ═══════════════════════════════════════════════════════════════════════════
  function renderDataModel() {
    const dmIssues = results.issues.filter((i) => i.category === "data-model");
    const stats = results.dataModelStats || [];
    const autoSum = results.automationSummary || {};
    const autoMap = autoSum.objectMap || {};

    // ── Summary KPIs ──────────────────────────────────────────────────────
    const totalStdFields = stats.reduce(
      (s, o) => s + (o.standardFields || 0),
      0,
    );
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
            "Std Fields",
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
              String(o.standardFields != null ? o.standardFields : "—"),
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
            <div class="lwc-summary-num">${totalStdFields || "—"}</div>
            <div class="lwc-summary-label">Std Fields</div>
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
        ${
          hasData
            ? renderPaginatedDataTable(
                "dm-objects",
                [
                  "Object",
                  "Std Fields",
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
                    r.stdFields != null ? String(r.stdFields) : "0",
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
      }

      <div style="margin-top:24px">
        <div class="section-title">💡 Data Model Recommendations</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🧹</span><span class="rec-title">Audit Unused Custom Fields</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Fields not referenced in code, reports, or page layouts add cognitive overhead and inflate SOQL SELECT * bandwidth. Use Field Usage in Setup to identify candidates for deprecation.</div>
            <div class="rec-tags"><span class="rec-tag">Metadata Hygiene</span><span class="rec-tag">Field Audit</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">⚡</span><span class="rec-title">One Trigger Per Object</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Multiple triggers per object create ordering ambiguity. Use a Trigger Dispatcher / Handler pattern to route all DML events through a single entry point.</div>
            <div class="rec-tags"><span class="rec-tag">Trigger Framework</span><span class="rec-tag">FFLIB</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">📐</span><span class="rec-title">Add Field Descriptions</span><span class="rec-impact low">LOW</span></div>
            <div class="rec-body">Every custom field should have a description and inline help text. This surfaces in Schema Builder, data dictionaries, and AI-assisted field selection tools.</div>
            <div class="rec-tags"><span class="rec-tag">Documentation</span><span class="rec-tag">Developer Experience</span></div>
          </div>
        </div>
      </div>`;
  }

  /** Export the Object Health Matrix table data as CSV */
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
          stdFields: fs.standardFields != null ? fs.standardFields : 0,
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
      "Object API Name,Object Label,Std Fields,Custom Fields,Unused Fields,Triggers,Flows,Validation Rules,Field Limit %";
    const csvRows = rows.map(
      (r) =>
        `"${r.obj}","${r.objLabel}",${r.stdFields},${r.custFields},${r.unusedFields},${r.triggers},${r.flows},${r.validations},${r.fieldLimitPct}`,
    );
    const csv = [csvHeaders, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-model-health.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        <div style="background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:12px;padding:20px 24px">
          <div style="font-size:16px;font-weight:700;margin-bottom:6px">🔬 Governor Limits Simulator</div>
          <p style="margin:0 0 16px;opacity:.65;font-size:13px">Input a data volume to project how much of your governor limits each class will consume.</p>
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
          : ""
      }

      <!-- LDV Objects -->
      ${
        ldvObjects.length > 0
          ? `
      <div class="mb-24" style="background:var(--vscode-editor-background);border:1px solid rgba(239,68,68,.3);border-radius:12px;padding:20px 24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:32px;height:32px;background:rgba(239,68,68,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">📦</div>
          <span style="font-size:15px;font-weight:700;color:#ef4444">Large Data Volume Objects (live counts)</span>
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
      <div class="mb-24" style="background:var(--vscode-editor-background);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:20px 24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:32px;height:32px;background:rgba(245,158,11,.15);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">🌐</div>
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
      }

      <!-- Recommendations -->
      <div>
        <div class="section-title">💡 Performance & Limits Recommendations</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">📊</span><span class="rec-title">Move SOQL Outside Loops</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Collect all IDs first, then execute a single bulk SOQL query. Use Maps to look up records by Id in O(1) time inside the loop.</div>
            <div class="rec-tags"><span class="rec-tag">Bulkification</span><span class="rec-tag">Governor Limits</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🎯</span><span class="rec-title">Add Selective Filters + LIMIT</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Always include a selective indexed field (e.g. Id, RecordTypeId, External ID) and a LIMIT clause. Enable query plan analysis in Workbench to verify index usage.</div>
            <div class="rec-tags"><span class="rec-tag">SOQL</span><span class="rec-tag">LDV</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🏗️</span><span class="rec-title">Use Collections for DML</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Accumulate SObject changes in Lists/Maps and perform a single insert/update/delete at the end of the transaction rather than per-record DML.</div>
            <div class="rec-tags"><span class="rec-tag">DML Bulkification</span><span class="rec-tag">Apex Patterns</span></div>
          </div>
        </div>
      </div>`;
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
      <!-- Summary KPIs -->
      <div class="mb-24">
        <div class="section-title">🛡️ Security & Access Overview</div>
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

      <!-- Users by Profile -->
      ${
        userSum &&
        userSum.profileDistribution &&
        userSum.profileDistribution.length
          ? `
      <div class="mb-24">
        <div class="section-title">👥 Users by Profile (Top 15)</div>
        ${renderPaginatedDataTable(
          "sec-user-dist",
          ["Profile", "User Count", "% of Active"],
          userSum.profileDistribution.slice(0, 15).map((p) => {
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

      <!-- Recommendations -->
      <div>
        <div class="section-title">💡 Security & Access Recommendations</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🔐</span><span class="rec-title">Apply Minimum Viable Permissions</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Permission Sets with Modify All Data bypass all record-level security. Prefer object-level CRUD + field-level security (FLS) grants.</div>
            <div class="rec-tags"><span class="rec-tag">Zero-Trust</span><span class="rec-tag">CRUD/FLS</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🎯</span><span class="rec-title">Adopt Permission Set Groups</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Replace monolithic profiles with slim base profiles + Permission Set Groups. This enables modular, auditable permission management.</div>
            <div class="rec-tags"><span class="rec-tag">PSG</span><span class="rec-tag">Least Privilege</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🔒</span><span class="rec-title">Minimise System Administrators</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Keep System Administrator count to ≤ 3 break-glass accounts. Use delegated admin profiles for day-to-day admin tasks.</div>
            <div class="rec-tags"><span class="rec-tag">Zero Trust</span><span class="rec-tag">Least Privilege</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🧹</span><span class="rec-title">Deactivate Dormant Users</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Run quarterly user access reviews. Deactivate users inactive for 90+ days to free up licenses and reduce attack surface.</div>
            <div class="rec-tags"><span class="rec-tag">User Lifecycle</span><span class="rec-tag">License Optimisation</span></div>
          </div>
        </div>
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
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-top:1px solid var(--vscode-widget-border);font-size:12px">
        <span style="opacity:.6">${showingFrom}–${showingTo} of ${sorted.length}</span>
        <span style="flex:1"></span>
        <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" data-action="issue-page-prev" data-panel="${panelId}" ${state.page === 0 ? 'disabled style="opacity:.4;padding:3px 10px;font-size:11px"' : ""}>‹ Prev</button>
        ${Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const pg =
            totalPages <= 7 ? i : state.page < 4 ? i : state.page - 3 + i;
          if (pg >= totalPages) return "";
          return `<button class="btn ${pg === state.page ? "btn-primary" : "btn-ghost"}" style="padding:3px 8px;font-size:11px;min-width:28px" data-action="issue-page-go" data-panel="${panelId}" data-pg="${pg}">${pg + 1}</button>`;
        }).join("")}
        <button class="btn btn-ghost" style="padding:3px 10px;font-size:11px" data-action="issue-page-next" data-panel="${panelId}" ${state.page >= totalPages - 1 ? 'disabled style="opacity:.4;padding:3px 10px;font-size:11px"' : ""}>Next ›</button>
      </div>`
        : "";

    return `<div class="issue-table-wrap" id="issue-table-${panelId}">
      <table class="issue-table"><thead><tr>
        <th class="it-sev" data-action="issue-sort" data-panel="${panelId}" data-col="sev" style="cursor:pointer;user-select:none">Sev ${sortArrow("sev")}</th>
        <th class="it-msg" data-action="issue-sort" data-panel="${panelId}" data-col="msg" style="cursor:pointer;user-select:none">Finding ${sortArrow("msg")}</th>
        <th class="it-cat" data-action="issue-sort" data-panel="${panelId}" data-col="cat" style="cursor:pointer;user-select:none">Category ${sortArrow("cat")}</th>
        <th class="it-loc" data-action="issue-sort" data-panel="${panelId}" data-col="loc" style="cursor:pointer;user-select:none">Location ${sortArrow("loc")}</th>
        <th class="it-chv"></th>
      </tr></thead><tbody>${rows}</tbody></table>
      ${paginationHtml}
    </div>`;
  }

  function renderTabRecs(panelId, scores) {
    const recMap = {
      "code-quality": [
        {
          icon: "🏗️",
          title: "Apply with sharing Everywhere",
          impact: "high",
          body: "All non-utility Apex classes should declare with sharing unless you have an explicit reason to bypass record visibility rules.",
          tags: ["Security", "ISV", "Best Practice"],
        },
        {
          icon: "📏",
          title: "Enforce Method Length Limits",
          impact: "medium",
          body: "Methods exceeding 50 lines are hard to test and review. Extract helper methods or delegate to separate classes.",
          tags: ["Readability", "Testability"],
        },
      ],
      performance: [
        {
          icon: "📊",
          title: "Add LIMIT to All SOQL Queries",
          impact: "high",
          body: "Unbounded queries on large objects will eventually breach the 50,000 row governor. Always add LIMIT and consider using OFFSET-based pagination.",
          tags: ["Governor Limits", "LDV", "SOQL"],
        },
      ],
      security: [
        {
          icon: "🔐",
          title: "Apply Minimum Viable Permissions",
          impact: "high",
          body: "Permission Sets with Modify All Data bypass all record-level security. Prefer object-level CRUD + field-level security (FLS) grants.",
          tags: ["Zero-Trust", "CRUD/FLS", "AppExchange Security Review"],
        },
      ],
      testing: [
        {
          icon: "🔁",
          title: "Achieve 85%+ Coverage",
          impact: "high",
          body: "While 75% is the Salesforce minimum, aim for 85%+ with meaningful assertions, not just coverage. Cover bulk scenarios, error paths, and governor limit edge cases.",
          tags: ["CI/CD", "Code Quality", "Deployment Safety"],
        },
      ],
    };

    const recs = recMap[panelId] || [];
    if (!recs.length) return "";
    return `
      <div>
        <div class="section-title">💡 Recommendations</div>
        <div class="rec-grid">${recs
          .map(
            (r) => `
          <div class="rec-card">
            <div class="rec-card-header">
              <span class="rec-icon">${r.icon}</span>
              <span class="rec-title">${r.title}</span>
              <span class="rec-impact ${r.impact}">${r.impact.toUpperCase()}</span>
            </div>
            <div class="rec-body">${r.body}</div>
            <div class="rec-tags">${r.tags.map((t) => `<span class="rec-tag">${t}</span>`).join("")}</div>
          </div>`,
          )
          .join("")}
        </div>
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

  function updateTabBadges() {
    const catMap = {
      code: ["code-quality", "technical-debt"],
      automation: ["automation-design"],
      datamodel: ["data-model"],
      perflimits: ["performance", "governor-limits"],
      secaccess: ["security", "user-governance", "profile-security"],
      lwc: ["lwc-quality"],
      dependencies: ["dependencies"],
      stalemetadata: ["stale-metadata", "org-inventory"],
    };

    for (const [tabId, cats] of Object.entries(catMap)) {
      const count = results.issues.filter(
        (i) => cats.includes(i.category) && i.severity === "error",
      ).length;
      const badge = document.getElementById(`badge-${tabId}`);
      if (!badge) {
        continue;
      }
      if (count > 0) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.style.display = "inline-flex";
        badge.classList.add("has-errors");
      } else {
        const total = results.issues.filter((i) =>
          cats.includes(i.category),
        ).length;
        if (total > 0) {
          badge.textContent = total > 99 ? "99+" : String(total);
          badge.style.display = "inline-flex";
          badge.classList.remove("has-errors");
        }
      }
    }
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
        ? `<img src="${iconDataUri}" style="width:22px;height:22px;object-fit:contain;border-radius:4px;vertical-align:middle;margin-right:6px;opacity:.7" alt="OrgPulse" />`
        : "";
      const watermark = iconDataUri
        ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04">
             <img src="${iconDataUri}" style="width:260px;height:260px;object-fit:contain" alt="" />
           </div>`
        : "";
      return `
        ${watermark}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#9ca3af">
          <span>${logoHtml}OrgPulse · Salesforce Architecture Health Report</span>
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

    // ── CTA Architecture Review Page (v1.9.2 — 12-section premium report) ──
    const ctaReview = results.ctaReview;
    let ctaPage = "";
    if (ctaReview && ctaReview.verdict) {
      const cvc =
        ctaReview.verdict === "Go"
          ? "#1a7f45"
          : ctaReview.verdict === "No-Go"
            ? "#c0392b"
            : "#b45309";
      const cvBg =
        ctaReview.verdict === "Go"
          ? "#d1fae5"
          : ctaReview.verdict === "No-Go"
            ? "#fee2e2"
            : "#fef3c7";
      const cvIcon =
        ctaReview.verdict === "Go"
          ? "✅"
          : ctaReview.verdict === "No-Go"
            ? "🚫"
            : "⚠️";
      const cvLabel =
        ctaReview.verdict === "Go"
          ? "Architecture Approved"
          : ctaReview.verdict === "No-Go"
            ? "Significant Issues Found"
            : "Conditional Approval";

      // ── Helpers ──
      const pdfH = (icon, title, badge) =>
        `<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1.5px solid #e5e7eb">
          <span style="font-size:20px">${icon}</span>
          <span style="font-size:14px;font-weight:800;color:#1a1a2e;flex:1">${title}</span>
          <span style="font-size:9px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:10px">${badge}</span>
        </div>`;

      const pdfCard = (content) =>
        `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:14px">${content}</div>`;

      const effortColor = (e) =>
        e === "Low" ? "#1a7f45" : e === "High" ? "#c0392b" : "#b45309";
      const effortBg = (e) =>
        e === "Low" ? "#d1fae5" : e === "High" ? "#fee2e2" : "#fef3c7";
      const statusColor = (s) =>
        s === "Pass" ? "#1a7f45" : s === "Fail" ? "#c0392b" : "#b45309";
      const statusBg = (s) =>
        s === "Pass" ? "#d1fae5" : s === "Fail" ? "#fee2e2" : "#fef3c7";

      // §1 Verdict + maturity
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
          `<p style="font-size:12px;color:#1f2937;line-height:1.7;margin:0">${esc(ctaReview.executiveSummary || "")}</p>`,
      );

      // §3 Architecture Maturity
      const maturityBlock = matLvl
        ? pdfCard(
            pdfH("🏅", "Architecture Maturity", "§2") +
              `<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px">` +
              ["Ad Hoc", "Repeatable", "Defined", "Managed", "Optimised"]
                .map((lbl, i) => {
                  const active = i + 1 === matLvl.level;
                  const colors = [
                    "#c0392b",
                    "#f97316",
                    "#b45309",
                    "#1a7f45",
                    "#0176d3",
                  ];
                  return `<div style="flex:1;text-align:center;padding:4px 2px;border-radius:4px;font-size:9px;font-weight:${active ? 800 : 400};background:${active ? colors[i] : "#f3f4f6"};color:${active ? "#fff" : "#6b7280"}">${i + 1}<br>${lbl}</div>`;
                })
                .join(
                  '<div style="width:4px;height:4px;background:#d1d5db;border-radius:50%;margin-top:10px"></div>',
                ) +
              `</div><p style="font-size:11px;color:#374151;line-height:1.6;margin:0">${esc(matLvl.summary)}</p>`,
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
        </div>`,
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
        </div>`,
          )
        : "";

      // §6 Health Score Breakdown
      const hsbBlock = (ctaReview.healthScoreBreakdown || []).length
        ? pdfCard(
            pdfH("📊", "Health Score Breakdown", "§5") +
              (ctaReview.healthScoreBreakdown || [])
                .map((s) => {
                  const pct = Math.min(
                    100,
                    Math.round((s.score / (s.maxScore || 100)) * 100),
                  );
                  const barC =
                    pct >= 75 ? "#1a7f45" : pct >= 50 ? "#b45309" : "#c0392b";
                  const tIcon =
                    { improving: "↑", stable: "→", declining: "↓" }[s.trend] ||
                    "→";
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
                })
                .join(""),
          )
        : "";

      // §7 Top Critical Issues (up to 10)
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
          <tbody>${(ctaReview.topCriticalIssues || [])
            .map((iss, i) => {
              const sC = iss.severity === "Critical" ? "#c0392b" : "#b45309";
              const sBg = iss.severity === "Critical" ? "#fee2e2" : "#fef3c7";
              return `<tr style="background:${i % 2 ? "#f9fafb" : "#fff"}">
              <td style="padding:6px 8px;text-align:center;font-weight:700;font-size:11px;border-bottom:1px solid #e5e7eb">${iss.rank}</td>
              <td style="padding:6px 8px;font-weight:600;font-size:11px;border-bottom:1px solid #e5e7eb">${esc(iss.title)}<br><span style="font-size:9px;color:#6b7280;font-weight:400">${esc(iss.domain)}</span></td>
              <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb"><span style="font-size:9px;font-weight:700;color:${sC};background:${sBg};padding:2px 6px;border-radius:10px">${esc(iss.severity)}</span></td>
              <td style="padding:6px 8px;font-size:10px;border-bottom:1px solid #e5e7eb">${esc(iss.impact)}</td>
              <td style="padding:6px 8px;font-size:10px;border-bottom:1px solid #e5e7eb">${esc(iss.effortEstimate)}</td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>`,
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
            ${(ra.riskHeatmap || [])
              .map((cell) => {
                const l = { Low: 1, Medium: 2, High: 3 }[cell.likelihood] || 1;
                const im = { Low: 1, Medium: 2, High: 3 }[cell.impact] || 1;
                const r = l * im;
                const rc = r >= 6 ? "#c0392b" : r >= 3 ? "#b45309" : "#1a7f45";
                const rb = r >= 6 ? "#fee2e2" : r >= 3 ? "#fef3c7" : "#d1fae5";
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;padding:3px 6px;background:${rb};border-radius:4px;border-left:3px solid ${rc}">
                <span style="font-size:10px;flex:1">${esc(cell.domain)}</span>
                <span style="font-size:9px;font-weight:700;color:${rc}">L:${esc(cell.likelihood)} I:${esc(cell.impact)}</span>
              </div>`;
              })
              .join("")}
          </div>
        </div>`,
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
          <tbody>${(ctaReview.benchmarkComparison || [])
            .map((b, i) => {
              const stC =
                b.status === "Above"
                  ? "#1a7f45"
                  : b.status === "At"
                    ? "#b45309"
                    : "#c0392b";
              const stBgc =
                b.status === "Above"
                  ? "#d1fae5"
                  : b.status === "At"
                    ? "#fef3c7"
                    : "#fee2e2";
              return `<tr style="background:${i % 2 ? "#f9fafb" : "#fff"}">
              <td style="padding:5px 8px;font-weight:600;font-size:11px;border-bottom:1px solid #e5e7eb">${esc(b.metric)}</td>
              <td style="padding:5px 8px;font-size:11px;font-weight:700;border-bottom:1px solid #e5e7eb">${esc(String(b.orgValue))}</td>
              <td style="padding:5px 8px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">${esc(String(b.industryAvg))}</td>
              <td style="padding:5px 8px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">${esc(String(b.topQuartile))}</td>
              <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb"><span style="font-size:9px;font-weight:700;color:${stC};background:${stBgc};padding:2px 6px;border-radius:10px">${esc(b.status)}</span></td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>`,
          )
        : "";

      // §10 Domain Findings
      const domainRows = (ctaReview.domainFindings || [])
        .map((d) => {
          const stC = statusColor(d.status);
          const stBgc = statusBg(d.status);
          return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:8px 10px;font-weight:600;font-size:11px">${esc(d.domain)}</td>
          <td style="padding:8px 10px"><span style="font-size:9px;font-weight:700;color:${stC};background:${stBgc};padding:2px 6px;border-radius:10px">${esc(d.status)}</span></td>
          <td style="padding:8px 10px;font-size:11px;line-height:1.5">${esc(d.analysis || "")}</td>
        </tr>`;
        })
        .join("");

      const domainBlock = pdfCard(
        pdfH("🏗️", "Domain Findings", "§9") +
          `<table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1.5px solid #e5e7eb">
            <th style="text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;color:#6b7280;width:20%">Domain</th>
            <th style="text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;color:#6b7280;width:10%">Status</th>
            <th style="text-align:left;padding:6px 10px;font-size:9px;text-transform:uppercase;color:#6b7280">Analysis</th>
          </tr></thead>
          <tbody>${domainRows}</tbody>
        </table>`,
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
        </div>`,
          )
        : "";

      // §12 Architecture Observations (SWOT)
      const obsBlock = (ctaReview.architectureObservations || []).length
        ? pdfCard(
            pdfH("🔭", "Architecture Observations", "§11") +
              (() => {
                const grouped = {
                  Strength: [],
                  Weakness: [],
                  Opportunity: [],
                  Threat: [],
                };
                (ctaReview.architectureObservations || []).forEach((o) => {
                  if (grouped[o.classification])
                    grouped[o.classification].push(o.observation);
                });
                const clr = {
                  Strength: "#1a7f45",
                  Weakness: "#c0392b",
                  Opportunity: "#0176d3",
                  Threat: "#b45309",
                };
                const clrBg = {
                  Strength: "#d1fae5",
                  Weakness: "#fee2e2",
                  Opportunity: "#dbeafe",
                  Threat: "#fef3c7",
                };
                const icons = {
                  Strength: "💪",
                  Weakness: "⚠️",
                  Opportunity: "🚀",
                  Threat: "🔴",
                };
                return (
                  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">` +
                  ["Strength", "Weakness", "Opportunity", "Threat"]
                    .map(
                      (cls) =>
                        `<div style="padding:10px;border-radius:6px;background:${clrBg[cls]};border-left:3px solid ${clr[cls]}">
                <div style="font-size:9px;font-weight:700;color:${clr[cls]};margin-bottom:6px">${icons[cls]} ${cls}s</div>
                ${grouped[cls].map((obs) => `<div style="font-size:10px;color:#374151;margin-bottom:3px">· ${esc(obs)}</div>`).join("") || '<div style="font-size:10px;color:#9ca3af">None identified</div>'}
              </div>`,
                    )
                    .join("") +
                  `</div>`
                );
              })(),
          )
        : "";

      // §13 Recommendations
      const rec = ctaReview.recommendations;
      const recBlock = rec
        ? pdfCard(
            pdfH("⚡", "Recommendations", "§12") +
              ((rec.quickWins || []).length
                ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:6px">Quick Wins (1-2 sprints)</div>` +
                  (rec.quickWins || [])
                    .map(
                      (w, i) =>
                        `<div style="display:flex;gap:8px;margin-bottom:6px;padding:6px 10px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0">
              <span style="min-width:18px;height:18px;background:#1a7f45;color:#fff;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span>
              <div><div style="font-size:11px">${esc(w.action)}</div><span style="font-size:9px;font-weight:700;color:${effortColor(w.effort)};background:${effortBg(w.effort)};padding:1px 5px;border-radius:8px">${esc(w.effort)}</span> <span style="font-size:10px;color:#6b7280">${esc(w.impact)}</span></div>
            </div>`,
                    )
                    .join("")
                : "") +
              ((rec.strategic || []).length
                ? `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:10px 0 6px">Strategic Initiatives</div>` +
                  (rec.strategic || [])
                    .map(
                      (s, i) =>
                        `<div style="display:flex;gap:8px;margin-bottom:6px;padding:6px 10px;background:#eff6ff;border-radius:6px;border:1px solid #bfdbfe">
              <span style="min-width:18px;height:18px;background:#0176d3;color:#fff;border-radius:50%;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span>
              <div><div style="font-size:11px;font-weight:600">${esc(s.action)}</div><div style="display:flex;gap:6px;margin-top:2px"><span style="font-size:10px;color:#6b7280">📅 ${esc(s.timeline)}</span> <span style="font-size:9px;font-weight:700;color:${effortColor(s.effort)};background:${effortBg(s.effort)};padding:1px 5px;border-radius:8px">${esc(s.effort)}</span> <span style="font-size:10px;color:#6b7280">${esc(s.impact)}</span></div></div>
            </div>`,
                    )
                    .join("")
                : ""),
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
                  coi.risks
                    .map(
                      (r) =>
                        `<div style="font-size:11px;color:#374151;margin-bottom:3px;display:flex;gap:6px"><span style="color:#c0392b">●</span>${esc(r)}</div>`,
                    )
                    .join("")
                : ""),
          )
        : "";

      // §15 Final Recommendation
      const fr = ctaReview.finalRecommendation;
      const finalBlock = fr
        ? `
        <div style="background:${cvBg};border:2px solid ${cvc}30;border-radius:10px;padding:16px 20px;margin-bottom:14px">
          ${pdfH(cvIcon, "Final CTA Recommendation", "§14")}
          <p style="font-size:12px;font-weight:500;color:#1f2937;line-height:1.7;margin-bottom:12px">${esc(fr.summary)}</p>
          ${
            (fr.nextSteps || []).length
              ? `<div style="font-size:9px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Immediate Next Steps</div>` +
                fr.nextSteps
                  .map(
                    (step, i) =>
                      `<div style="display:flex;gap:8px;margin-bottom:4px"><span style="min-width:16px;height:16px;background:${cvc};color:#fff;border-radius:50%;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span><span style="font-size:11px">${esc(step)}</span></div>`,
                  )
                  .join("")
              : ""
          }
          ${fr.proposedTimeline ? `<div style="margin-top:10px;padding:8px 12px;background:rgba(0,0,0,.04);border-radius:6px;font-size:10px;color:#374151"><strong>📅 </strong>${esc(fr.proposedTimeline)}</div>` : ""}
        </div>`
        : "";

      ctaPage =
        '<div class="page" style="position:relative">' +
        (iconDataUri
          ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04"><img src="${iconDataUri}" style="width:260px;height:260px;object-fit:contain" alt="" /></div>`
          : "") +
        `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#9ca3af;position:relative;z-index:1">${iconDataUri ? `<span><img src="${iconDataUri}" style="width:18px;height:18px;object-fit:contain;border-radius:3px;vertical-align:middle;margin-right:4px;opacity:.7" alt="" />OrgPulse · Salesforce Architecture Health Report</span>` : "<span>OrgPulse · Salesforce Architecture Health Report</span>"}<span>${esc(org)} · ${now}</span></div>` +
        '<div style="font-size:19px;font-weight:800;color:#1a1a2e;margin-bottom:4px;position:relative;z-index:1">🧠 CTA Architecture Review</div>' +
        '<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;position:relative;z-index:1">AI-Generated Executive Architecture Assessment — v1.9.2</div>' +
        verdictBlock +
        execBlock +
        '<div style="page-break-after:always"></div>' +
        maturityBlock +
        biBlock +
        opBlock +
        hsbBlock +
        '<div style="page-break-after:always"></div>' +
        critIssBlock +
        riskBlock +
        bmBlock +
        '<div style="page-break-after:always"></div>' +
        domainBlock +
        aiBlock +
        obsBlock +
        '<div style="page-break-after:always"></div>' +
        recBlock +
        coiBlock +
        finalBlock +
        "</div>";
    }

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
  function exportCtaPdf(iconDataUri) {
    if (!results || !results.ctaReview || !results.ctaReview.verdict) {
      alert(
        "No CTA Review available to export. Please run a CTA Review first.",
      );
      return;
    }
    const ctaReview = results.ctaReview;
    const org =
      results.summary && results.summary.orgAlias
        ? results.summary.orgAlias
        : "Org";
    const now = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const esc = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const cvc =
      ctaReview.verdict === "Go"
        ? "#16a34a"
        : ctaReview.verdict === "No-Go"
          ? "#dc2626"
          : "#d97706";
    const cvLabel =
      ctaReview.verdict === "Go"
        ? "Recommended to Proceed"
        : ctaReview.verdict === "No-Go"
          ? "Not Recommended"
          : "Conditional Approval";

    const wmHtml = iconDataUri
      ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:.04"><img src="${iconDataUri}" style="width:260px;height:260px;object-fit:contain" alt="" /></div>`
      : "";
    const headerHtml = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#9ca3af;position:relative;z-index:1">${iconDataUri ? `<span><img src="${iconDataUri}" style="width:18px;height:18px;object-fit:contain;border-radius:3px;vertical-align:middle;margin-right:4px;opacity:.7" alt="" />OrgPulse · CTA Architecture Review</span>` : "<span>OrgPulse · CTA Architecture Review</span>"}<span>${esc(org)} · ${now}</span></div>`;

    // ── Data Model Risk table for CTA PDF ──────────────────────────────────
    const dmStats = (results.dataModelStats || [])
      .filter(
        (o) =>
          (o.fieldLimitPct || 0) > 0 ||
          (o.customFields || o.totalFields || 0) > 0,
      )
      .sort((a, b) => (b.fieldLimitPct || 0) - (a.fieldLimitPct || 0))
      .slice(0, 5);

    const dmRowsHtml = dmStats.length
      ? dmStats
          .map((o) => {
            const pct = o.fieldLimitPct || 0;
            const custF =
              o.customFields != null ? o.customFields : o.totalFields || 0;
            const stdF = o.standardFields != null ? o.standardFields : "—";
            const totalF = o.totalFields || "—";
            const badge =
              pct >= 75
                ? `<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">🔴 Critical</span>`
                : pct >= 50
                  ? `<span style="background:#ffedd5;color:#c2410c;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">🟠 At Risk</span>`
                  : pct >= 25
                    ? `<span style="background:#fefce8;color:#a16207;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">🟡 Caution</span>`
                    : `<span style="background:#f0fdf4;color:#166534;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">✅ OK</span>`;
            return `<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6">
              <div style="font-weight:600;font-size:12px">${esc(o.objectLabel || o.objectName)}</div>
              ${o.objectLabel && o.objectLabel !== o.objectName ? `<div style="font-size:10px;color:#9ca3af">${esc(o.objectName)}</div>` : ""}
            </td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:12px">${stdF}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:12px;font-weight:600">${custF}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:12px">${totalF}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:12px;color:${pct >= 50 ? "#b91c1c" : pct >= 25 ? "#a16207" : "#166534"};font-weight:700">${pct}%</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center">${badge}</td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">No data model data — run a full org scan to populate.</td></tr>`;

    const dmSectionHtml = `
<div style="margin-top:20px;position:relative;z-index:1">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">🗄️ Data Model Risk — Objects Approaching Field Limit</div>
  <table style="width:100%;border-collapse:collapse;font-family:inherit;font-size:12px">
    <thead>
      <tr style="background:#f9fafb">
        <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:2px solid #e5e7eb">Object</th>
        <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:2px solid #e5e7eb">Std Fields</th>
        <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:2px solid #e5e7eb">Custom Fields</th>
        <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:2px solid #e5e7eb">Total</th>
        <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:2px solid #e5e7eb">Limit %</th>
        <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;border-bottom:2px solid #e5e7eb">Status</th>
      </tr>
    </thead>
    <tbody>${dmRowsHtml}</tbody>
  </table>
  <div style="font-size:10px;color:#9ca3af;margin-top:6px">Custom field governor limit: 800 fields per SObject. Objects >50% are deployment risks when adding new fields.</div>
</div>`;

    const ctaHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>OrgPulse CTA Review — ${esc(org)} — ${now}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; background: #fff; font-size: 13px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { padding: 28px 32px; page-break-after: always; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  @media print { .page { padding: 0; page-break-after: always; } body { font-size: 11px; } }
  code { background: #f3f4f6; border-radius: 3px; padding: 1px 4px; font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
</style>
</head>
<body>
<div class="page" style="position:relative">
${wmHtml}
${headerHtml}
<div style="font-size:22px;font-weight:800;color:#1a1a2e;margin-bottom:4px;position:relative;z-index:1">🧠 CTA Architecture Review</div>
<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #e5e7eb;position:relative;z-index:1">AI-Generated Executive Architecture Assessment</div>
<div style="display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:10px;background:${ctaReview.verdict === "Go" ? "rgba(22,163,74,.06)" : ctaReview.verdict === "No-Go" ? "rgba(220,38,38,.06)" : "rgba(217,119,6,.06)"};border:2px solid ${cvc};margin-bottom:18px;position:relative;z-index:1">
  <div style="font-size:48px;line-height:1">${ctaReview.verdict === "Go" ? "✅" : ctaReview.verdict === "No-Go" ? "🚫" : "⚠️"}</div>
  <div>
    <div style="font-size:17px;font-weight:800;color:${cvc}">${esc(ctaReview.verdict)} — ${cvLabel}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:3px">✨ ${esc(ctaReview.modelUsed || "AI")} · ${ctaReview.generatedAt ? new Date(ctaReview.generatedAt).toLocaleString() : "Generated"}</div>
  </div>
</div>
${ctaReview.executiveSummary ? `<div style="margin-bottom:14px;position:relative;z-index:1"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:6px">Executive Summary</div><p style="font-size:12px;color:#1f2937;line-height:1.7;margin:0">${esc(ctaReview.executiveSummary)}</p></div>` : ""}
${dmSectionHtml}
</div>
<script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

    const blob = new Blob([ctaHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `OrgPulse_CTA_Review_${org.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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

  /** Simplified dependency graph: nodes as circles, edges as lines */
  function renderDependencyGraph(graph) {
    if (!graph || !graph.nodes || !graph.nodes.length) {
      return `<div style="text-align:center;padding:40px;color:var(--sf-text-muted)">No dependency data available</div>`;
    }
    const W = 700;
    const H = 380;
    const nodes = graph.nodes.slice(0, 40); // cap for readability
    const edges = (graph.edges || [])
      .filter(
        (e) =>
          nodes.find((n) => n.id === e.from) &&
          nodes.find((n) => n.id === e.to),
      )
      .slice(0, 80);

    // Place nodes in a simple circular layout
    const positions = {};
    nodes.forEach((node, idx) => {
      const angle = (idx / nodes.length) * 2 * Math.PI;
      const r = Math.min(W, H) * 0.36;
      positions[node.id] = [
        W / 2 + r * Math.cos(angle),
        H / 2 + r * Math.sin(angle),
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
        const [x1, y1] = positions[e.from] || [W / 2, H / 2];
        const [x2, y2] = positions[e.to] || [W / 2, H / 2];
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dep-edge"/>`;
      })
      .join("");

    const nodeSvg = nodes
      .map((node) => {
        const [x, y] = positions[node.id] || [W / 2, H / 2];
        const col = TYPE_COLORS[node.type] || "var(--chart-1)";
        const r = 6 + Math.min((node.fanIn || 0) + (node.fanOut || 0), 20);
        const label = (node.label || node.id).slice(0, 14);
        return `
        <g class="dep-node" title="${escHtml(node.label || node.id)}">
          <circle cx="${x}" cy="${y}" r="${r}" fill="${col}" fill-opacity="0.85" stroke="var(--sf-bg-primary)" stroke-width="1.5"/>
          <text x="${x}" y="${y + r + 10}" text-anchor="middle" font-size="9" fill="var(--sf-text-secondary)">${escHtml(label)}</text>
        </g>`;
      })
      .join("");

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:${H}px">${edgeSvg}${nodeSvg}</svg>`;
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
      }

      <div>
        <div class="section-title">💡 LWC Quality Recommendations</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🧪</span><span class="rec-title">Add Jest Tests to All Components</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Every LWC should have a co-located *.test.js file with unit tests. This catches regressions early and enables CI/CD gates.</div>
            <div class="rec-tags"><span class="rec-tag">Jest</span><span class="rec-tag">CI/CD</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">♿</span><span class="rec-title">Fix Accessibility Issues</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Ensure all interactive elements have ARIA labels and keyboard navigation. Salesforce Lightning requires WCAG 2.1 AA compliance.</div>
            <div class="rec-tags"><span class="rec-tag">A11y</span><span class="rec-tag">WCAG 2.1</span></div>
          </div>
        </div>
      </div>`;
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
      <div class="mb-24" style="background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:12px;padding:20px 24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:36px;height:36px;background:rgba(99,102,241,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">🕸️</div>
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
      </div>

      <div>
        <div class="section-title">💡 Dependency Recommendations</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">🔄</span><span class="rec-title">Break Circular Dependencies</span><span class="rec-impact high">HIGH</span></div>
            <div class="rec-body">Use interfaces, Platform Events, or dependency injection to decouple tightly connected components. This enables independent deployment and testing.</div>
            <div class="rec-tags"><span class="rec-tag">Architecture</span><span class="rec-tag">Deployment</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">📦</span><span class="rec-title">Reduce High Fan-In Components</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Components with >15 dependents are change bottlenecks. Consider splitting into smaller, focused modules with stable interfaces.</div>
            <div class="rec-tags"><span class="rec-tag">Modularity</span><span class="rec-tag">Blast Radius</span></div>
          </div>
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
      <div class="mb-24" style="background:var(--vscode-editor-background);border:1px solid var(--vscode-widget-border);border-radius:12px;padding:20px 24px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:36px;height:36px;background:rgba(234,179,8,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">🧹</div>
          <div>
            <div style="font-size:16px;font-weight:700">Stale Metadata & Org Inventory</div>
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
      }

      <!-- Recommendations -->
      <div>
        <div class="section-title">💡 Metadata Hygiene Best Practices</div>
        <div class="rec-grid">
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">📅</span><span class="rec-title">Annual Metadata Hygiene Sprint</span><span class="rec-impact medium">MEDIUM</span></div>
            <div class="rec-body">Schedule a dedicated sprint once per year to archive or delete reports, dashboards, and fields unused for 12+ months. Keeps the org clean for end users.</div>
            <div class="rec-tags"><span class="rec-tag">Metadata Hygiene</span><span class="rec-tag">User Experience</span></div>
          </div>
          <div class="rec-card">
            <div class="rec-card-header"><span class="rec-icon">📁</span><span class="rec-title">Use Folder Governance</span><span class="rec-impact low">LOW</span></div>
            <div class="rec-body">Organise reports and dashboards into governed folders by team/function. Set folder ownership and review schedules to prevent stale content accumulation.</div>
            <div class="rec-tags"><span class="rec-tag">Governance</span><span class="rec-tag">Reporting</span></div>
          </div>
        </div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  showEmpty();
})();
