import { StatCard } from '@/components/common';
import { KPI, TREND_NOTE, sampleSparkline } from './sampleData';

export default function StatCardRow() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        icon="🧮" value={`${KPI.technicalDebtScore}/100`} label="Technical Debt Score" sub={KPI.technicalDebtScoreLabel}
        accent="text-sev-warning"
        delta={KPI.technicalDebtScoreDelta} deltaGoodDirection="down"
        sparkline={sampleSparkline(KPI.technicalDebtScore, 1)} sparklineColor="#f97316"
        sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="🧯" value={KPI.criticalDebtItems} label="Critical Debt Items"
        accent="text-sev-error"
        delta={KPI.criticalDebtItemsDelta} deltaGoodDirection="down"
        sparkline={sampleSparkline(KPI.criticalDebtItems, 2)} sparklineColor="#ef4444"
        sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="🗂️" value={`${KPI.domainsAffected}/${KPI.domainsTotal}`} label="Domains Affected"
        delta={KPI.domainsAffectedDelta} deltaGoodDirection="down"
        sparkline={sampleSparkline(KPI.domainsAffected, 3)} sparklineColor="#8b5cf6"
        sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="🏚️" value={KPI.modernizationDebt} label="Modernization Debt"
        accent="text-sf-accent"
        delta={KPI.modernizationDebtDelta} deltaGoodDirection="down"
        sparkline={sampleSparkline(KPI.modernizationDebt, 4)} sparklineColor="#3b82f6"
        sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="⚡" value={KPI.quickWinsAvailable} label="Quick Wins Available"
        accent="text-score-good"
        delta={KPI.quickWinsAvailableDelta} deltaGoodDirection="down"
        sparkline={sampleSparkline(KPI.quickWinsAvailable, 5)} sparklineColor="#22c55e"
        sample sampleNote={TREND_NOTE}
      />
      <StatCard
        icon="📉" value={KPI.debtTrendLabel} label="Debt Trend (30 Days)" sub={`${KPI.debtTrendPct}% over 30 days`}
        accent="text-score-good"
        sparkline={sampleSparkline(100 - KPI.debtTrendPct, 6)} sparklineColor="#22c55e"
        sample sampleNote={TREND_NOTE}
      />
    </div>
  );
}
