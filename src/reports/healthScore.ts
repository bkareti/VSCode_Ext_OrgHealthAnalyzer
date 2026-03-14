/**
 * Health Score Calculator - Calculates overall org health score
 */

import { 
  Issue, 
  HealthScores, 
  AnalysisSummary, 
  IssueCategory,
  Severity,
  AnalysisResult,
  AnalysisMetadata,
} from '../types';
import { getScoringWeights } from '../utils/config';
import { logInfo, logSection } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

interface CategoryScore {
  category: IssueCategory;
  score: number;
  maxScore: number;
  issues: Issue[];
  deductions: Array<{ reason: string; points: number }>;
}

// ============================================================================
// Health Score Calculator
// ============================================================================

export class HealthScoreCalculator {
  private weights = getScoringWeights();

  // Deduction points per issue severity
  private readonly SEVERITY_DEDUCTIONS: Record<Severity, number> = {
    error: 10,
    warning: 5,
    info: 2,
  };

  // Maximum deductions per category (prevents score going negative)
  private readonly MAX_DEDUCTION_PERCENT = 80;

  /**
   * Calculate health scores from issues
   */
  calculate(issues: Issue[]): HealthScores {
    logSection('Health Score Calculation');

    // Group issues by category
    const issuesByCategory = this.groupByCategory(issues);

    // Calculate category scores
    const codeQualityScore = this.calculateCategoryScore(
      'code-quality',
      issuesByCategory.get('code-quality') || []
    );
    
    const automationScore = this.calculateCategoryScore(
      'automation-design',
      issuesByCategory.get('automation-design') || []
    );
    
    const dataModelScore = this.calculateCategoryScore(
      'data-model',
      issuesByCategory.get('data-model') || []
    );
    
    const performanceScore = this.calculateCategoryScore(
      'performance',
      issuesByCategory.get('performance') || []
    );

    // Calculate overall weighted score
    const overall = this.calculateOverallScore({
      codeQuality: codeQualityScore.score,
      automationDesign: automationScore.score,
      dataModel: dataModelScore.score,
      performance: performanceScore.score,
    });

    const scores: HealthScores = {
      codeQuality: codeQualityScore.score,
      automationDesign: automationScore.score,
      dataModel: dataModelScore.score,
      performance: performanceScore.score,
      overall,
    };

    logInfo(`Health Scores: Code=${scores.codeQuality}, Automation=${scores.automationDesign}, Data=${scores.dataModel}, Performance=${scores.performance}, Overall=${scores.overall}`);

    return scores;
  }

  /**
   * Group issues by category
   */
  private groupByCategory(issues: Issue[]): Map<IssueCategory, Issue[]> {
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
   * Calculate score for a category
   */
  private calculateCategoryScore(category: IssueCategory, issues: Issue[]): CategoryScore {
    const maxScore = 100;
    const deductions: Array<{ reason: string; points: number }> = [];
    
    let totalDeduction = 0;
    
    // Count issues by severity
    const severityCounts = { error: 0, warning: 0, info: 0 };
    
    for (const issue of issues) {
      severityCounts[issue.severity]++;
      const deduction = this.SEVERITY_DEDUCTIONS[issue.severity];
      totalDeduction += deduction;
      
      deductions.push({
        reason: `${issue.severity.toUpperCase()}: ${issue.message.substring(0, 50)}`,
        points: deduction,
      });
    }
    
    // Cap deductions
    const maxDeduction = (maxScore * this.MAX_DEDUCTION_PERCENT) / 100;
    totalDeduction = Math.min(totalDeduction, maxDeduction);
    
    const score = Math.max(0, Math.round(maxScore - totalDeduction));
    
    return {
      category,
      score,
      maxScore,
      issues,
      deductions,
    };
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(scores: Omit<HealthScores, 'overall'>): number {
    const weighted = 
      (scores.codeQuality * this.weights.codeQuality) +
      (scores.automationDesign * this.weights.automationDesign) +
      (scores.dataModel * this.weights.dataModel) +
      (scores.performance * this.weights.performance);
    
    const totalWeight = 
      this.weights.codeQuality +
      this.weights.automationDesign +
      this.weights.dataModel +
      this.weights.performance;
    
    return Math.round(weighted / totalWeight);
  }

  /**
   * Get score grade
   */
  getGrade(score: number): { grade: string; color: string; description: string } {
    if (score >= 90) {
      return { grade: 'A', color: '#22c55e', description: 'Excellent' };
    } else if (score >= 80) {
      return { grade: 'B', color: '#84cc16', description: 'Good' };
    } else if (score >= 70) {
      return { grade: 'C', color: '#eab308', description: 'Fair' };
    } else if (score >= 60) {
      return { grade: 'D', color: '#f97316', description: 'Needs Improvement' };
    } else {
      return { grade: 'F', color: '#ef4444', description: 'Critical' };
    }
  }

  /**
   * Create analysis summary
   */
  createSummary(issues: Issue[]): AnalysisSummary {
    const byCategory: Record<IssueCategory, number> = {
      'code-quality': 0,
      'automation-design': 0,
      'data-model': 0,
      'performance': 0,
    };

    const byObject: Record<string, number> = {};

    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    for (const issue of issues) {
      // Count by severity
      switch (issue.severity) {
        case 'error':
          errorCount++;
          break;
        case 'warning':
          warningCount++;
          break;
        case 'info':
          infoCount++;
          break;
      }

      // Count by category
      byCategory[issue.category]++;

      // Count by object
      if (issue.object) {
        byObject[issue.object] = (byObject[issue.object] || 0) + 1;
      }
    }

    return {
      totalIssues: issues.length,
      errorCount,
      warningCount,
      infoCount,
      byCategory,
      byObject,
    };
  }

  /**
   * Create full analysis result
   */
  createAnalysisResult(
    issues: Issue[],
    metadata: Partial<AnalysisMetadata>,
    startTime: Date
  ): AnalysisResult {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      timestamp: endTime,
      duration,
      issues,
      summary: this.createSummary(issues),
      scores: this.calculate(issues),
      metadata: {
        workspacePath: metadata.workspacePath,
        orgId: metadata.orgId,
        orgAlias: metadata.orgAlias,
        apiVersion: metadata.apiVersion || '60.0',
        analyzedFiles: metadata.analyzedFiles || 0,
        analyzedObjects: metadata.analyzedObjects || 0,
      },
    };
  }

  /**
   * Format scores for display
   */
  formatScores(scores: HealthScores): string {
    const lines = [
      '╔════════════════════════════════════════╗',
      '║      Org Architecture Health Score     ║',
      '╠════════════════════════════════════════╣',
      `║  Code Quality:      ${this.formatScore(scores.codeQuality)}  ║`,
      `║  Automation Design: ${this.formatScore(scores.automationDesign)}  ║`,
      `║  Data Model:        ${this.formatScore(scores.dataModel)}  ║`,
      `║  Performance:       ${this.formatScore(scores.performance)}  ║`,
      '╠════════════════════════════════════════╣',
      `║  Overall Score:     ${this.formatScore(scores.overall)}  ║`,
      '╚════════════════════════════════════════╝',
    ];

    return lines.join('\n');
  }

  /**
   * Format a single score
   */
  private formatScore(score: number): string {
    const grade = this.getGrade(score);
    const scoreStr = `${score}/100`.padStart(7);
    return `${scoreStr} (${grade.grade})`;
  }

  /**
   * Generate recommendations based on scores
   */
  generateRecommendations(scores: HealthScores, issues: Issue[]): string[] {
    const recommendations: string[] = [];

    // Code quality recommendations
    if (scores.codeQuality < 70) {
      const codeIssues = issues.filter(i => i.category === 'code-quality');
      const soqlInLoop = codeIssues.filter(i => i.ruleId === 'soql-in-loop').length;
      const dmlInLoop = codeIssues.filter(i => i.ruleId === 'dml-in-loop').length;

      if (soqlInLoop > 0) {
        recommendations.push(`Fix ${soqlInLoop} SOQL-in-loop issues to avoid governor limits`);
      }
      if (dmlInLoop > 0) {
        recommendations.push(`Fix ${dmlInLoop} DML-in-loop issues to improve bulkification`);
      }
    }

    // Automation recommendations
    if (scores.automationDesign < 70) {
      recommendations.push('Review automation complexity and consider consolidation');
      recommendations.push('Migrate Process Builders to Flows');
    }

    // Data model recommendations
    if (scores.dataModel < 70) {
      recommendations.push('Review and clean up unused custom fields');
      recommendations.push('Document custom field purposes');
    }

    // Performance recommendations
    if (scores.performance < 70) {
      recommendations.push('Optimize non-selective SOQL queries');
      recommendations.push('Add indexed fields to query filters');
    }

    // General recommendations based on overall score
    if (scores.overall < 60) {
      recommendations.push('Schedule a technical debt review session');
      recommendations.push('Consider implementing a code review process');
    }

    return recommendations;
  }
}

// Export singleton
export const healthScoreCalculator = new HealthScoreCalculator();
