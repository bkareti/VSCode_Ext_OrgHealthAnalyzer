import { GlassCard, SampleMark, ProgressBar } from '@/components/common';
import { usageBand } from '@/constants/scoring';
import { FORECAST_ROWS } from './sampleData';

const SAMPLE_NOTE = 'Forecasts and days-remaining projections are illustrative — OrgPulse does not yet compute usage trajectories from historical data.';

export default function LimitForecastCard() {
  return (
    <GlassCard>
      <div className="flex items-center gap-1.5 mb-3">
        <h3 className="text-xs font-semibold text-sf-text">Limit Forecast (Capacity Planning)</h3>
        <SampleMark note={SAMPLE_NOTE} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-sf-border">
              <th className="text-left py-2 pr-3 text-sf-muted font-medium">Limit</th>
              <th className="text-right py-2 px-2 text-sf-muted font-medium">Current Usage</th>
              <th className="text-left py-2 px-2 text-sf-muted font-medium w-32">Forecast</th>
              <th className="text-right py-2 pl-2 text-sf-muted font-medium">Days Remaining</th>
            </tr>
          </thead>
          <tbody>
            {FORECAST_ROWS.map((row) => {
              const band = usageBand(row.forecastPct);
              return (
                <tr key={row.label} className="border-b border-sf-border/40 hover:bg-sf-bg-2/50 transition-colors">
                  <td className="py-1.5 pr-3 text-sf-text font-medium">{row.label}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-sf-text">{row.currentPct}%</td>
                  <td className="py-1.5 px-2">
                    <ProgressBar pct={row.forecastPct} color={band.hex} />
                  </td>
                  <td className={`py-1.5 pl-2 text-right font-semibold tabular-nums ${row.daysRemaining === null ? 'text-score-good' : band.text}`}>
                    {row.daysRemaining === null ? 'No risk' : `${row.daysRemaining} days`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="text-[10px] text-sf-accent/70 mt-2 block cursor-default">View full forecast report →</span>
    </GlassCard>
  );
}
