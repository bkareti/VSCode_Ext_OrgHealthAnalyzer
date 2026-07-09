import { GlassCard, ProgressBar } from '@/components/common';
import DonutWithLegend from '@/components/charts/DonutWithLegend';
import {
  AUTOMATIONS_BY_TYPE,
  TOTAL_AUTOMATIONS_LABEL,
  FLOWS_BY_CATEGORY,
  TOTAL_FLOWS_LABEL,
  AUTOMATIONS_BY_STATUS,
  TOP_OBJECTS,
  AUTOMATION_COMPLEXITY,
  AUTOMATION_SIZE,
  formatPct,
  type RankedBarRow,
} from './sampleData';

function CardHeader({ title, link }: { title: string; link: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
      <span className="text-[11px] font-semibold text-sf-accent whitespace-nowrap">{link}</span>
    </div>
  );
}

function RankedRows({ rows }: { rows: RankedBarRow[] }) {
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-32 truncate text-sf-text">{row.label}</span>
          <div className="flex-1"><ProgressBar pct={row.pct} color={row.color} /></div>
          <span className="text-sf-muted tabular-nums w-24 text-right shrink-0">
            {row.value.toLocaleString()} ({formatPct(row.pct)})
          </span>
        </div>
      ))}
    </div>
  );
}

export function AutomationsByTypeCard() {
  return (
    <GlassCard>
      <CardHeader title="Automations by Type" link="View all automations →" />
      <DonutWithLegend
        data={AUTOMATIONS_BY_TYPE}
        layout="below"
        centerLabel={TOTAL_AUTOMATIONS_LABEL}
        centerSubLabel="Total"
        height={150}
      />
    </GlassCard>
  );
}

export function FlowsByCategoryCard() {
  return (
    <GlassCard>
      <CardHeader title="Flows by Category" link="View all flows →" />
      <DonutWithLegend
        data={FLOWS_BY_CATEGORY}
        layout="below"
        centerLabel={TOTAL_FLOWS_LABEL}
        centerSubLabel="Total"
        height={150}
      />
    </GlassCard>
  );
}

export function AutomationsByStatusCard() {
  return (
    <GlassCard>
      <CardHeader title="Automations by Status" link="View inactive automations →" />
      <RankedRows rows={AUTOMATIONS_BY_STATUS} />
    </GlassCard>
  );
}

export function TopObjectsCard() {
  return (
    <GlassCard>
      <CardHeader title="Top 5 Objects with Automations" link="View all objects →" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-sf-border">
              {['Object', 'Automations', 'Breakdown (Flows/Triggers/PB/WF)'].map((h) => (
                <th key={h} className="text-left py-2 pr-2 text-sf-muted font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TOP_OBJECTS.map((row) => (
              <tr key={row.object} className="border-b border-sf-border/40 last:border-0">
                <td className="py-1.5 pr-2 text-sf-text font-medium">{row.object}</td>
                <td className="py-1.5 pr-2 text-sf-text tabular-nums font-semibold">{row.automations}</td>
                <td className="py-1.5 text-sf-muted tabular-nums font-mono text-[10px] whitespace-nowrap">
                  {row.flows}/{row.triggers}/{row.processBuilders}/{row.workflows}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

export function ComplexityCard() {
  return (
    <GlassCard>
      <CardHeader title="Automation Complexity (By Complexity Score)" link="How complexity is calculated →" />
      <RankedRows rows={AUTOMATION_COMPLEXITY} />
    </GlassCard>
  );
}

export function SizeCard() {
  return (
    <GlassCard>
      <CardHeader title="Automation Size (Element Count)" link="View large automations →" />
      <RankedRows rows={AUTOMATION_SIZE} />
    </GlassCard>
  );
}
