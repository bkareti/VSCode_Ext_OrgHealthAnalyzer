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
