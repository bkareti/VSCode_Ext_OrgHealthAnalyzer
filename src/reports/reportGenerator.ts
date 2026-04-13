/**
 * Report Generator - Creates various report formats
 */

import { AnalysisResult, Issue, HealthScores, IssueCategory, Severity } from '../types';
import { healthScoreCalculator } from './healthScore';

// ============================================================================
// Report Generator
// ============================================================================

export class ReportGenerator {
  /**
   * Generate a plain text report
   */
  generateTextReport(result: AnalysisResult): string {
    const lines: string[] = [];

    // Header
    lines.push('═'.repeat(60));
    lines.push('SALESFORCE ORG HEALTH ANALYSIS REPORT');
    lines.push('═'.repeat(60));
    lines.push('');
    lines.push(`Generated: ${result.timestamp.toLocaleString()}`);
    lines.push(`Duration: ${result.duration}ms`);
    
    if (result.metadata.orgAlias) {
      lines.push(`Org: ${result.metadata.orgAlias}`);
    }
    
    lines.push(`Files Analyzed: ${result.metadata.analyzedFiles}`);
    lines.push('');

    // Health Scores
    lines.push(healthScoreCalculator.formatScores(result.scores));
    lines.push('');

    // Summary
    lines.push('─'.repeat(60));
    lines.push('ISSUE SUMMARY');
    lines.push('─'.repeat(60));
    lines.push(`Total Issues: ${result.summary.totalIssues}`);
    lines.push(`  Errors: ${result.summary.errorCount}`);
    lines.push(`  Warnings: ${result.summary.warningCount}`);
    lines.push(`  Info: ${result.summary.infoCount}`);
    lines.push('');

    // Issues by Category
    lines.push('By Category:');
    for (const [category, count] of Object.entries(result.summary.byCategory)) {
      if (count > 0) {
        lines.push(`  ${this.formatCategory(category as IssueCategory)}: ${count}`);
      }
    }
    lines.push('');

    // Detailed Issues
    if (result.issues.length > 0) {
      lines.push('─'.repeat(60));
      lines.push('DETAILED ISSUES');
      lines.push('─'.repeat(60));

      // Group by category
      const byCategory = this.groupIssuesByCategory(result.issues);
      
      for (const [category, issues] of byCategory) {
        lines.push('');
        lines.push(`▶ ${this.formatCategory(category)} (${issues.length})`);
        lines.push('');

        for (const issue of issues) {
          lines.push(this.formatIssue(issue));
        }
      }
    }

    // Recommendations
    const recommendations = healthScoreCalculator.generateRecommendations(
      result.scores,
      result.issues
    );

    if (recommendations.length > 0) {
      lines.push('');
      lines.push('─'.repeat(60));
      lines.push('RECOMMENDATIONS');
      lines.push('─'.repeat(60));
      
      for (const rec of recommendations) {
        lines.push(`• ${rec}`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  /**
   * Generate an HTML report
   */
  generateHtmlReport(result: AnalysisResult): string {
    const grade = healthScoreCalculator.getGrade(result.scores.overall);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce Org Health Report</title>
  <style>
    :root {
      --bg-primary: #1e1e1e;
      --bg-secondary: #252526;
      --text-primary: #cccccc;
      --text-secondary: #858585;
      --accent: #007acc;
      --error: #f14c4c;
      --warning: #cca700;
      --info: #3794ff;
      --success: #89d185;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      color: white;
      margin-bottom: 1rem;
    }
    
    h2 {
      color: var(--accent);
      margin: 2rem 0 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--bg-secondary);
    }
    
    .meta {
      color: var(--text-secondary);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    
    .scores-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .score-card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
    }
    
    .score-card.overall {
      grid-column: span 2;
      background: linear-gradient(135deg, var(--bg-secondary), #2d2d30);
    }
    
    .score-value {
      font-size: 2.5rem;
      font-weight: bold;
      color: ${grade.color};
    }
    
    .score-label {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }
    
    .score-grade {
      font-size: 1.2rem;
      margin-top: 0.5rem;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .summary-card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    
    .summary-card.error { border-left: 4px solid var(--error); }
    .summary-card.warning { border-left: 4px solid var(--warning); }
    .summary-card.info { border-left: 4px solid var(--info); }
    
    .summary-value {
      font-size: 2rem;
      font-weight: bold;
    }
    
    .issues-list {
      list-style: none;
    }
    
    .issue-item {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 0.5rem;
      border-left: 4px solid;
    }
    
    .issue-item.error { border-color: var(--error); }
    .issue-item.warning { border-color: var(--warning); }
    .issue-item.info { border-color: var(--info); }
    
    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    
    .issue-severity {
      text-transform: uppercase;
      font-size: 0.75rem;
      font-weight: bold;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
    
    .issue-severity.error { background: var(--error); color: white; }
    .issue-severity.warning { background: var(--warning); color: black; }
    .issue-severity.info { background: var(--info); color: white; }
    
    .issue-location {
      color: var(--text-secondary);
      font-size: 0.85rem;
    }
    
    .issue-message {
      font-weight: 500;
      margin-bottom: 0.5rem;
    }
    
    .issue-description {
      color: var(--text-secondary);
      font-size: 0.9rem;
    }
    
    .issue-suggestion {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: rgba(55, 148, 255, 0.1);
      border-radius: 4px;
      font-size: 0.85rem;
    }
    
    .recommendations {
      list-style: none;
    }
    
    .recommendations li {
      padding: 0.75rem 1rem;
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 0.5rem;
      border-left: 4px solid var(--accent);
    }
    
    .category-section {
      margin-bottom: 2rem;
    }
    
    .category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .category-count {
      background: var(--bg-secondary);
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Salesforce Org Health Report</h1>
    
    <div class="meta">
      <p>Generated: ${result.timestamp.toLocaleString()}</p>
      ${result.metadata.orgAlias ? `<p>Org: ${result.metadata.orgAlias}</p>` : ''}
      <p>Files Analyzed: ${result.metadata.analyzedFiles}</p>
    </div>
    
    <h2>Health Scores</h2>
    <div class="scores-grid">
      <div class="score-card overall">
        <div class="score-value">${result.scores.overall}</div>
        <div class="score-label">Overall Score</div>
        <div class="score-grade">${grade.grade} - ${grade.description}</div>
      </div>
      <div class="score-card">
        <div class="score-value" style="color: ${healthScoreCalculator.getGrade(result.scores.codeQuality).color}">${result.scores.codeQuality}</div>
        <div class="score-label">Code Quality</div>
      </div>
      <div class="score-card">
        <div class="score-value" style="color: ${healthScoreCalculator.getGrade(result.scores.automationDesign).color}">${result.scores.automationDesign}</div>
        <div class="score-label">Automation Design</div>
      </div>
      <div class="score-card">
        <div class="score-value" style="color: ${healthScoreCalculator.getGrade(result.scores.dataModel).color}">${result.scores.dataModel}</div>
        <div class="score-label">Data Model</div>
      </div>
      <div class="score-card">
        <div class="score-value" style="color: ${healthScoreCalculator.getGrade(result.scores.performance).color}">${result.scores.performance}</div>
        <div class="score-label">Performance</div>
      </div>
    </div>
    
    <h2>Issue Summary</h2>
    <div class="summary-grid">
      <div class="summary-card error">
        <div class="summary-value">${result.summary.errorCount}</div>
        <div class="score-label">Errors</div>
      </div>
      <div class="summary-card warning">
        <div class="summary-value">${result.summary.warningCount}</div>
        <div class="score-label">Warnings</div>
      </div>
      <div class="summary-card info">
        <div class="summary-value">${result.summary.infoCount}</div>
        <div class="score-label">Info</div>
      </div>
    </div>
    
    ${result.issues.length > 0 ? this.generateIssuesHtml(result.issues) : '<p>No issues found!</p>'}
    
    ${this.generateRecommendationsHtml(result.scores, result.issues)}
  </div>
</body>
</html>`;
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(result: AnalysisResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generate issues HTML section
   */
  private generateIssuesHtml(issues: Issue[]): string {
    const byCategory = this.groupIssuesByCategory(issues);
    let html = '<h2>Issues</h2>';

    for (const [category, categoryIssues] of byCategory) {
      html += `
        <div class="category-section">
          <div class="category-header">
            <h3>${this.formatCategory(category)}</h3>
            <span class="category-count">${categoryIssues.length}</span>
          </div>
          <ul class="issues-list">
            ${categoryIssues.map(issue => this.generateIssueHtml(issue)).join('')}
          </ul>
        </div>
      `;
    }

    return html;
  }

  /**
   * Generate single issue HTML
   */
  private generateIssueHtml(issue: Issue): string {
    return `
      <li class="issue-item ${issue.severity}">
        <div class="issue-header">
          <span class="issue-severity ${issue.severity}">${issue.severity}</span>
          ${issue.file ? `<span class="issue-location">${this.formatFilePath(issue.file)}${issue.line ? `:${issue.line}` : ''}</span>` : ''}
        </div>
        <div class="issue-message">${this.escapeHtml(issue.message)}</div>
        ${issue.description ? `<div class="issue-description">${this.escapeHtml(issue.description)}</div>` : ''}
        ${issue.suggestion ? `<div class="issue-suggestion">💡 ${this.escapeHtml(issue.suggestion)}</div>` : ''}
      </li>
    `;
  }

  /**
   * Generate recommendations HTML
   */
  private generateRecommendationsHtml(scores: HealthScores, issues: Issue[]): string {
    const recommendations = healthScoreCalculator.generateRecommendations(scores, issues);
    
    if (recommendations.length === 0) {
      return '';
    }

    return `
      <h2>Recommendations</h2>
      <ul class="recommendations">
        ${recommendations.map(rec => `<li>💡 ${this.escapeHtml(rec)}</li>`).join('')}
      </ul>
    `;
  }

  /**
   * Group issues by category
   */
  private groupIssuesByCategory(issues: Issue[]): Map<IssueCategory, Issue[]> {
    const grouped = new Map<IssueCategory, Issue[]>();
    
    for (const issue of issues) {
      if (!grouped.has(issue.category)) {
        grouped.set(issue.category, []);
      }
      grouped.get(issue.category)!.push(issue);
    }
    
    return grouped;
  }

  /**
   * Format category name
   */
  private formatCategory(category: IssueCategory): string {
    const names: Record<IssueCategory, string> = {
      'code-quality': 'Code Quality',
      'automation-design': 'Automation Design',
      'data-model': 'Data Model',
      'performance': 'Performance',
      'security': 'Security',
      'testing': 'Testing',
      'integration': 'Integration',
      'lwc-quality': 'LWC Quality',
      'governor-limits': 'Governor Limits',
      'technical-debt': 'Technical Debt',
      'dependencies': 'Dependencies',
      'user-governance': 'User Governance',
      'profile-security': 'Profile Security',
      'stale-metadata': 'Stale Metadata',
      'org-inventory': 'Org Inventory',
      'aura-quality': 'Aura Quality',
      'cta-review': 'CTA Review',
    };
    return names[category] || category;
  }

  /**
   * Format issue for text output
   */
  private formatIssue(issue: Issue): string {
    const lines: string[] = [];
    
    const severityIcon = { error: '❌', warning: '⚠️', info: 'ℹ️' };
    lines.push(`  ${severityIcon[issue.severity]} [${issue.severity.toUpperCase()}] ${issue.message}`);
    
    if (issue.file) {
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      lines.push(`     📁 ${location}`);
    }
    
    if (issue.description) {
      lines.push(`     ${issue.description}`);
    }
    
    if (issue.suggestion) {
      lines.push(`     💡 ${issue.suggestion}`);
    }
    
    lines.push('');
    
    return lines.join('\n');
  }

  // ── SARIF 2.1.0 Export ──────────────────────────────────────────────────────

  /**
   * Generate a SARIF 2.1.0 report compatible with GitHub Code Scanning.
   * https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
   */
  generateSarifReport(result: AnalysisResult): string {
    // Build a de-duplicated rule registry
    const ruleMap = new Map<string, {
      id: string; name: string; shortDescription: string;
      helpText: string; level: string;
    }>();

    for (const issue of result.issues) {
      if (!ruleMap.has(issue.ruleId)) {
        ruleMap.set(issue.ruleId, {
          id:               issue.ruleId,
          name:             this.ruleIdToName(issue.ruleId),
          shortDescription: issue.message,
          helpText:         issue.description || issue.message,
          level:            this.toSarifLevel(issue.severity),
        });
      }
    }

    const rules = Array.from(ruleMap.values()).map(r => ({
      id:   r.id,
      name: r.name,
      shortDescription: { text: r.shortDescription },
      helpUri: 'https://github.com/bkareti/VSCode_Ext_OrgHealthAnalyzer',
      properties: { tags: ['salesforce'] },
    }));

    const results = result.issues.map((issue, idx) => {
      const sarifResult: Record<string, unknown> = {
        ruleId:  issue.ruleId,
        level:   this.toSarifLevel(issue.severity),
        message: { text: issue.message },
        properties: {
          category:   issue.category,
          suggestion: issue.suggestion || '',
        },
      };

      // Physical location (file-based issues)
      const filePath = issue.file && !issue.file.startsWith('org://')
        ? issue.file
        : null;

      if (filePath) {
        sarifResult['locations'] = [{
          physicalLocation: {
            artifactLocation: {
              uri:       filePath.replace(/\\/g, '/'),
              uriBaseId: '%SRCROOT%',
            },
            region: {
              startLine:   issue.line   || 1,
              startColumn: issue.column || 1,
              endLine:     issue.endLine   || issue.line   || 1,
              endColumn:   issue.endColumn || issue.column || 80,
            },
          },
        }];
      } else if (issue.object) {
        // Logical location for org-metadata issues
        sarifResult['locations'] = [{
          logicalLocations: [{
            name:              issue.object,
            kind:              'module',
            fullyQualifiedName: issue.object,
          }],
        }];
      }

      // Attach fix suggestion if present
      if (issue.suggestion) {
        sarifResult['fixes'] = [{
          description: { text: issue.suggestion },
        }];
      }

      void idx; // suppress unused var
      return sarifResult;
    });

    const sarif = {
      $schema:  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      version:  '2.1.0',
      runs: [{
        tool: {
          driver: {
            name:           'Salesforce Architecture Intelligence Platform',
            version:        '1.3.0',
            informationUri: 'https://github.com/bkareti/VSCode_Ext_OrgHealthAnalyzer',
            rules,
          },
        },
        invocations: [{
          executionSuccessful: true,
          endTimeUtc: new Date(result.timestamp).toISOString(),
        }],
        results,
        properties: {
          orgUsername:      result.metadata.orgUsername,
          orgAlias:         result.metadata.orgAlias,
          overallScore:     result.scores.overall,
          analyzedClasses:  result.metadata.analyzedClasses,
          analyzedTriggers: result.metadata.analyzedTriggers,
        },
      }],
    };

    return JSON.stringify(sarif, null, 2);
  }

  private ruleIdToName(ruleId: string): string {
    return ruleId
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  private toSarifLevel(severity: string): string {
    switch (severity) {
      case 'error':   return 'error';
      case 'warning': return 'warning';
      default:        return 'note';
    }
  }

  /**
   * Format file path for display
   */
  private formatFilePath(filePath: string): string {
    // Remove workspace prefix and show relative path
    const parts = filePath.split('/');
    const relevantParts = parts.slice(-3); // Last 3 parts
    return relevantParts.join('/');
  }

  /**
   * Generate Architect Report — executive HTML with radar chart, sprint plan, and dependency hotspots
   */
  generateArchitectReport(result: AnalysisResult): string {
    const s = result.scores;
    const meta = result.metadata;
    const grade = healthScoreCalculator.getGrade(s.overall);
    const ts = result.timestamp.toLocaleString();

    /* Inline SVG radar chart — 7 axes */
    const axes = [
      { key: 'codeQuality',      label: 'Code',  angle: 0 },
      { key: 'automationDesign', label: 'Auto',  angle: 1 },
      { key: 'dataModel',        label: 'Data',  angle: 2 },
      { key: 'performance',      label: 'Perf',  angle: 3 },
      { key: 'security',         label: 'Sec',   angle: 4 },
      { key: 'testing',          label: 'Test',  angle: 5 },
      { key: 'integration',      label: 'Int',   angle: 6 },
    ];
    const N = axes.length;
    const CX = 160; const CY = 160; const R = 120;

    const ptFn = (axIdx: number, val: number): [number, number] => {
      const angle = (axIdx / N) * 2 * Math.PI - Math.PI / 2;
      const r = (val / 100) * R;
      return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
    };

    const rings = [20, 40, 60, 80, 100].map(lv => {
      const pts = axes.map((_, i) => ptFn(i, lv).join(',')).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
    }).join('');

    const axLines = axes.map((ax, i) => {
      const [x, y] = ptFn(i, 100);
      return `<line x1="${CX}" y1="${CY}" x2="${x}" y2="${y}" stroke="#cbd5e1" stroke-width="1"/>`;
    }).join('');

    const scoreMap = s as unknown as Record<string, number>;
    const dataPoints = axes.map((ax, i) => ptFn(i, scoreMap[ax.key] || 0));
    const polyPts = dataPoints.map(p => p.join(',')).join(' ');
    const axLabels = axes.map((ax, i) => {
      const [x, y] = ptFn(i, 135);
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#475569">${ax.label}</text>`;
    }).join('');

    const radarSvg = `<svg viewBox="0 0 320 320" style="width:260px;height:260px">
      ${rings}${axLines}
      <polygon points="${polyPts}" fill="rgba(59,130,246,0.18)" stroke="#3b82f6" stroke-width="2"/>
      ${dataPoints.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#3b82f6"/>`).join('')}
      ${axLabels}
      <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="middle" font-size="20" font-weight="700" fill="#1e3a5f">${s.overall}</text>
    </svg>`;

    /* Score colour helper */
    const col = (v: number) => v >= 90 ? '#16a34a' : v >= 80 ? '#65a30d' : v >= 70 ? '#ca8a04' : v >= 60 ? '#ea580c' : '#dc2626';

    /* Category table rows */
    const catRows = [
      { label: 'Code Quality',     key: 'codeQuality',      weight: 25 },
      { label: 'Automation',       key: 'automationDesign', weight: 20 },
      { label: 'Data Model',       key: 'dataModel',        weight: 15 },
      { label: 'Performance',      key: 'performance',      weight: 20 },
      { label: 'Security',         key: 'security',         weight: 10 },
      { label: 'Testing',          key: 'testing',          weight: 5  },
      { label: 'Integration',      key: 'integration',      weight: 5  },
      { label: 'Gov Limits',       key: 'governorLimits',   weight: 0  },
      { label: 'LWC Quality',      key: 'lwcQuality',       weight: 0  },
      { label: 'Technical Debt',   key: 'technicalDebt',    weight: 0  },
    ].filter(c => scoreMap[c.key] !== undefined);

    const catHtml = catRows.map(c => {
      const v = scoreMap[c.key] || 0;
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${this.escapeHtml(c.label)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:${col(v)};font-weight:700;font-size:16px">${v}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">
          <div style="width:100px;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden">
            <div style="width:${v}%;height:100%;background:${col(v)};border-radius:4px"></div>
          </div>
        </td>
        ${c.weight ? `<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#94a3b8;font-size:11px">${c.weight}%</td>` : '<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#94a3b8;font-size:11px">—</td>'}
      </tr>`;
    }).join('');

    /* Top critical issues */
    const topErrors = result.issues.filter(i => i.severity === 'error').slice(0, 10);
    const errorRows = topErrors.map(i =>
      `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">${this.escapeHtml(this.formatCategory(i.category))}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:12px">${this.escapeHtml(i.message)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b">${this.escapeHtml(i.file ? i.file.split('/').slice(-1)[0] : i.object || '—')}</td>
      </tr>`
    ).join('');

    /* Debt sprint table */
    let sprintHtml = '';
    if (result.debtSummary) {
      const d = result.debtSummary;
      sprintHtml = `
        <h2 style="margin:32px 0 12px;font-size:16px;color:#1e3a5f">🗓️ Technical Debt Sprint Plan</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Metric</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">Total Estimated Hours</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">${d.totalHours}h</td></tr>
            <tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">Sprint Cycles Required</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:700">${d.sprintCycles}</td></tr>
            <tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">Quick Wins (&lt;1h each)</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0">${(d.quickWins || []).length}</td></tr>
            <tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">Medium Items (1–4h)</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0">${(d.mediumItems || []).length}</td></tr>
            <tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">Large Items (&gt;4h)</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0">${(d.largeItems || []).length}</td></tr>
          </tbody>
        </table>`;
    }

    /* Dependency hotspots */
    let depHtml = '';
    if (result.dependencyGraph && result.dependencyGraph.nodes.length) {
      const topNodes = [...result.dependencyGraph.nodes]
        .sort((a, b) => ((b.fanIn || 0) + (b.fanOut || 0)) - ((a.fanIn || 0) + (a.fanOut || 0)))
        .slice(0, 5);
      depHtml = `
        <h2 style="margin:32px 0 12px;font-size:16px;color:#1e3a5f">🕸️ Dependency Hotspots</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Component</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Type</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0">Fan-In</th>
              <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e2e8f0">Fan-Out</th>
            </tr>
          </thead>
          <tbody>
            ${topNodes.map(n => `<tr>
              <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${this.escapeHtml(n.label || n.id)}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">${this.escapeHtml(n.type)}</td>
              <td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0">${n.fanIn || 0}</td>
              <td style="padding:6px 12px;text-align:right;border-bottom:1px solid #e2e8f0">${n.fanOut || 0}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OrgPulse — Architect Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; max-width: 900px; margin: 0 auto; padding: 40px 24px; background: #f8fafc; }
    h1   { font-size: 24px; color: #1e3a5f; margin: 0 0 4px; }
    h2   { font-size: 16px; color: #1e3a5f; margin: 32px 0 12px; }
    table { border-collapse: collapse; width: 100%; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .score-badge { display: inline-block; font-size: 48px; font-weight: 800; color: ${col(s.overall)}; }
    .grade-badge { display: inline-block; font-size: 20px; font-weight: 700; margin-left: 12px; color: ${col(s.overall)}; vertical-align: bottom; margin-bottom: 8px; }
    .meta { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    @media print { body { background: white; } .card { box-shadow: none; } }
  </style>
</head>
<body>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
    <span style="font-size:28px">💓</span>
    <div>
      <h1>OrgPulse — Architect Report</h1>
      <div class="meta">Generated: ${this.escapeHtml(ts)} · Org: ${this.escapeHtml(meta.orgUsername || meta.orgAlias || 'Unknown')} · ${result.summary.totalIssues} issues</div>
    </div>
  </div>

  <!-- Executive Summary -->
  <div class="card" style="display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap">
    <div>
      <div class="score-badge">${s.overall}</div>
      <div class="grade-badge">${grade.grade} — ${grade.description}</div>
      <div class="meta">${result.summary.errorCount} errors · ${result.summary.warningCount} warnings · ${result.summary.infoCount} info</div>
      <div class="meta" style="margin-top:8px">
        ${meta.analyzedClasses || 0} Apex Classes ·
        ${meta.analyzedTriggers || 0} Triggers ·
        ${meta.analyzedFlows || 0} Flows ·
        ${meta.analyzedObjects || 0} Objects
        ${meta.analyzedLwcComponents ? ` · ${meta.analyzedLwcComponents} LWC` : ''}
      </div>
    </div>
    <div>${radarSvg}</div>
  </div>

  <!-- Health Scores Table -->
  <div class="card">
    <h2 style="margin-top:0">📊 Health Scores</h2>
    <table>
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Category</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Score</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Bar</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Weight</th>
        </tr>
      </thead>
      <tbody>${catHtml}</tbody>
    </table>
  </div>

  <!-- Top Critical Issues -->
  ${topErrors.length ? `
  <div class="card">
    <h2 style="margin-top:0">🚨 Top Critical Issues</h2>
    <table>
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Category</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Issue</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Location</th>
        </tr>
      </thead>
      <tbody>${errorRows}</tbody>
    </table>
  </div>` : ''}

  ${sprintHtml ? `<div class="card">${sprintHtml}</div>` : ''}
  ${depHtml    ? `<div class="card">${depHtml}</div>`    : ''}

  <div style="text-align:center;color:#94a3b8;font-size:11px;margin-top:32px">
    Generated by OrgPulse v1.3.0 · ${this.escapeHtml(ts)}
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Export singleton
export const reportGenerator = new ReportGenerator();
