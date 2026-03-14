/**
 * Results Tree Provider - Displays analysis results in the tree view
 */

import * as vscode from 'vscode';
import { AnalysisResult, Issue, IssueCategory, Severity } from '../types';
import { healthScoreCalculator } from '../reports/healthScore';

// ============================================================================
// Tree Item Classes
// ============================================================================

export class HealthResultItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly issue?: Issue,
    public readonly category?: IssueCategory,
    public readonly type?: 'category' | 'score' | 'issue'
  ) {
    super(label, collapsibleState);
    
    this.contextValue = type || 'item';
    
    if (issue) {
      this.setupIssueItem(issue);
    }
  }

  private setupIssueItem(issue: Issue): void {
    this.description = issue.file 
      ? `${this.formatPath(issue.file)}${issue.line ? ':' + issue.line : ''}`
      : undefined;
    
    this.tooltip = new vscode.MarkdownString();
    this.tooltip.appendMarkdown(`**${issue.message}**\n\n`);
    if (issue.description) {
      this.tooltip.appendMarkdown(`${issue.description}\n\n`);
    }
    if (issue.suggestion) {
      this.tooltip.appendMarkdown(`💡 *${issue.suggestion}*`);
    }

    // Set icon based on severity
    this.iconPath = this.getSeverityIcon(issue.severity);

    // Make clickable if has file location
    if (issue.file && !issue.file.startsWith('org://')) {
      this.command = {
        command: 'sfHealthAnalyzer.openIssueLocation',
        title: 'Open Issue Location',
        arguments: [issue],
      };
    }
  }

  private getSeverityIcon(severity: Severity): vscode.ThemeIcon {
    switch (severity) {
      case 'error':
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      case 'warning':
        return new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      case 'info':
        return new vscode.ThemeIcon('info', new vscode.ThemeColor('editorInfo.foreground'));
    }
  }

  private formatPath(path: string): string {
    const parts = path.split('/');
    return parts.slice(-2).join('/');
  }
}

// ============================================================================
// Tree Data Provider
// ============================================================================

export class HealthResultsProvider implements vscode.TreeDataProvider<HealthResultItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HealthResultItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private result: AnalysisResult | null = null;
  private groupBy: 'category' | 'severity' | 'file' = 'category';

  /**
   * Set the analysis results
   */
  setResults(result: AnalysisResult): void {
    this.result = result;
    this._onDidChangeTreeData.fire(null);
  }

  /**
   * Clear the results
   */
  clear(): void {
    this.result = null;
    this._onDidChangeTreeData.fire(null);
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  /**
   * Set grouping mode
   */
  setGroupBy(mode: 'category' | 'severity' | 'file'): void {
    this.groupBy = mode;
    this.refresh();
  }

  /**
   * Get tree item for display
   */
  getTreeItem(element: HealthResultItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of a tree item
   */
  getChildren(element?: HealthResultItem): HealthResultItem[] {
    if (!this.result) {
      return [];
    }

    if (!element) {
      return this.getRootItems();
    }

    if (element.type === 'category' && element.category) {
      return this.getIssuesForCategory(element.category);
    }

    return [];
  }

  /**
   * Get root level items
   */
  private getRootItems(): HealthResultItem[] {
    if (!this.result) {
      return [];
    }

    const items: HealthResultItem[] = [];

    // Add score summary
    const grade = healthScoreCalculator.getGrade(this.result.scores.overall);
    const scoreItem = new HealthResultItem(
      `Overall Score: ${this.result.scores.overall}/100 (${grade.grade})`,
      vscode.TreeItemCollapsibleState.None,
      undefined,
      undefined,
      'score'
    );
    scoreItem.iconPath = new vscode.ThemeIcon(
      this.result.scores.overall >= 70 ? 'pass' : 'warning'
    );
    items.push(scoreItem);

    // Group by category
    const categories: IssueCategory[] = [
      'code-quality',
      'automation-design',
      'data-model',
      'performance',
    ];

    for (const category of categories) {
      const categoryIssues = this.result.issues.filter(i => i.category === category);
      
      if (categoryIssues.length > 0) {
        const categoryLabel = this.formatCategoryName(category);
        const item = new HealthResultItem(
          `${categoryLabel} (${categoryIssues.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          category,
          'category'
        );
        item.iconPath = this.getCategoryIcon(category);
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Get issues for a category
   */
  private getIssuesForCategory(category: IssueCategory): HealthResultItem[] {
    if (!this.result) {
      return [];
    }

    return this.result.issues
      .filter(i => i.category === category)
      .map(issue => new HealthResultItem(
        issue.message,
        vscode.TreeItemCollapsibleState.None,
        issue,
        category,
        'issue'
      ));
  }

  /**
   * Format category name
   */
  private formatCategoryName(category: IssueCategory): string {
    const names: Record<IssueCategory, string> = {
      'code-quality': 'Code Quality',
      'automation-design': 'Automation Design',
      'data-model': 'Data Model',
      'performance': 'Performance',
    };
    return names[category];
  }

  /**
   * Get icon for category
   */
  private getCategoryIcon(category: IssueCategory): vscode.ThemeIcon {
    const icons: Record<IssueCategory, string> = {
      'code-quality': 'code',
      'automation-design': 'git-merge',
      'data-model': 'database',
      'performance': 'dashboard',
    };
    return new vscode.ThemeIcon(icons[category]);
  }
}

// Create singleton instance
export const healthResultsProvider = new HealthResultsProvider();
