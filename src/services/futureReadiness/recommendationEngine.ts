import { QuickWin, QuickWinPriority } from '../../types/assessmentContext';
import { PackId, ReadinessSignal, ReadinessGap, StrategicInitiative } from '../../types/futureReadiness';
import { IRecommendationEngine } from './interfaces';

const PRIORITY_ORDER: Record<QuickWinPriority, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * Splits improvement opportunities into quick wins (low-effort nudges from
 * 'partial' signals) vs strategic initiatives (Critical/High gaps needing a project).
 */
export class RecommendationEngine implements IRecommendationEngine {
  quickWins(packId: PackId, signals: ReadinessSignal[]): QuickWin[] {
    const wins: QuickWin[] = signals
      .filter((s) => s.status === 'partial' && !!s.recommendation)
      .map((s) => {
        const priority: QuickWinPriority = s.score >= 65 ? 'Low' : s.score >= 50 ? 'Medium' : 'High';
        return {
          title: s.recommendation!,
          category: packId,
          reason: s.evidence.length > 0 ? s.evidence.join('; ') : `Improves ${s.dimension} readiness.`,
          priority,
          impact: `Raises ${s.dimension} readiness toward "ready".`,
          complexity: 'Low' as const,
          affectedCount: 0,
        };
      });

    return wins.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }

  strategicInitiatives(gaps: ReadinessGap[]): StrategicInitiative[] {
    return gaps
      .filter((g) => g.severity === 'Critical' || g.severity === 'High')
      .map((g) => ({
        title: g.title,
        area: g.area,
        impact: g.whyItMatters,
        effort: g.severity === 'Critical' ? 'High' : 'Medium',
        timeline: g.severity === 'Critical' ? 'Now (0–30 days)' : 'Next (1–3 months)',
      }));
  }
}
