import { GlassCard, ProgressBar } from '@/components/common';
import DonutWithLegend from '@/components/charts/DonutWithLegend';
import {
  CODE_PERFORMANCE_ROWS,
  AUTOMATION_FLOWS_DATA,
  TOTAL_AUTOMATIONS,
  LDV_OBJECTS_DATA,
  TOTAL_RECORDS_LABEL,
  TOTAL_OBJECTS,
  ASYNC_ARCHITECTURE_STATS,
  APEX_FLEX_QUEUE_USAGE_PCT,
  QUERY_INDEX_STATS,
  TOP_OBJECTS_NEEDING_INDEX,
  STORAGE_FILES,
} from './sampleData';

const SEVERITY_TEXT: Record<'high' | 'medium' | 'good', string> = {
  high: 'text-sev-error',
  medium: 'text-score-fair',
  good: 'text-score-good',
};
const SEVERITY_LABEL: Record<'high' | 'medium' | 'good', string> = {
  high: 'High',
  medium: 'Medium',
  good: '✓',
};

function CardHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
      <span className="text-[11px] font-semibold text-sf-accent whitespace-nowrap">View details →</span>
    </div>
  );
}

export function CodePerformanceCard() {
  return (
    <GlassCard>
      <CardHeader title="Code Performance" />
      <div>
        {CODE_PERFORMANCE_ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-xs py-1.5 border-b border-sf-border/40 last:border-0">
            <span className="text-sf-text">{row.label}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-sf-muted">{row.value}</span>
              <span className={`font-semibold ${SEVERITY_TEXT[row.severity]}`}>{SEVERITY_LABEL[row.severity]}</span>
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function AutomationFlowsCard() {
  return (
    <GlassCard>
      <CardHeader title="Automation & Flows" />
      <DonutWithLegend
        data={AUTOMATION_FLOWS_DATA}
        layout="side"
        centerLabel={TOTAL_AUTOMATIONS.toLocaleString()}
        centerSubLabel="Total Automations"
        height={140}
      />
    </GlassCard>
  );
}

export function LargeDataVolumeCard() {
  return (
    <GlassCard>
      <CardHeader title="Large Data Volume (LDV)" />
      <DonutWithLegend
        data={LDV_OBJECTS_DATA}
        layout="side"
        centerLabel={TOTAL_RECORDS_LABEL}
        centerSubLabel="Total Records"
        valueFormatter={(n) => `${n} Objects`}
        height={140}
      />
      <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-sf-border/40">
        <span className="text-sf-muted">Total Objects</span>
        <span className="text-sf-text font-semibold tabular-nums">{TOTAL_OBJECTS}</span>
      </div>
    </GlassCard>
  );
}

export function AsyncArchitectureCard() {
  return (
    <GlassCard>
      <CardHeader title="Async Architecture" />
      <div className="grid grid-cols-2 gap-3 mb-4">
        {ASYNC_ARCHITECTURE_STATS.map((s) => (
          <div key={s.label}>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-sf-text tabular-nums">{s.value}</span>
              <span className={`text-[10px] font-medium ${s.delta >= 0 ? 'text-score-good' : 'text-sev-error'}`}>
                {s.delta >= 0 ? '▲' : '▼'} {Math.abs(s.delta)}
              </span>
            </div>
            <span className="text-[11px] text-sf-muted">{s.label}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-sf-muted">Apex Flex Queue Usage</span>
          <span className="text-sf-text font-semibold tabular-nums">{APEX_FLEX_QUEUE_USAGE_PCT} / 100</span>
        </div>
        <ProgressBar pct={APEX_FLEX_QUEUE_USAGE_PCT} height="sm" />
      </div>
    </GlassCard>
  );
}

export function QueryIndexHealthCard() {
  const maxIndexValue = TOP_OBJECTS_NEEDING_INDEX[0]?.value ?? 1;
  return (
    <GlassCard>
      <CardHeader title="Query & Index Health" />
      <div className="mb-3">
        {QUERY_INDEX_STATS.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-xs py-1.5 border-b border-sf-border/40 last:border-0">
            <span className="text-sf-text">{row.label}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-sf-muted">{row.value}</span>
              <span className={`font-semibold ${row.severity === 'high' ? 'text-sev-error' : 'text-score-fair'}`}>
                {row.severity === 'high' ? 'High' : 'Medium'}
              </span>
            </span>
          </div>
        ))}
      </div>
      <h4 className="text-[11px] font-semibold text-sf-text mb-2">Top Objects Needing Index</h4>
      <div className="space-y-2">
        {TOP_OBJECTS_NEEDING_INDEX.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-[11px]">
            <span className="w-28 truncate text-sf-text font-mono text-[10px]">{row.label}</span>
            <div className="flex-1"><ProgressBar pct={(row.value / maxIndexValue) * 100} color="#ef4444" /></div>
            <span className="text-sf-muted tabular-nums w-4 text-right">{row.value}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function StorageFilesCard() {
  const rows = [
    { label: 'Data Storage Used', ...STORAGE_FILES.dataStorage },
    { label: 'File Storage Used', ...STORAGE_FILES.fileStorage },
    { label: 'Big Objects Storage', ...STORAGE_FILES.bigObjects },
  ];
  return (
    <GlassCard>
      <CardHeader title="Storage & Files" />
      <div className="space-y-3 mb-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-sf-muted">{row.label}</span>
              <span className="text-sf-text font-semibold">{row.usedLabel} / {row.totalLabel} · {row.pct}%</span>
            </div>
            <ProgressBar pct={row.pct} height="sm" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs pt-2 border-t border-sf-border/40">
        <span className="text-sf-muted">Total Files</span>
        <span className="text-sf-text font-semibold tabular-nums">{STORAGE_FILES.totalFiles}</span>
      </div>
      <div className="flex items-center justify-between text-xs pt-1.5">
        <span className="text-sf-muted">Largest File</span>
        <span className="text-sf-text font-semibold tabular-nums">{STORAGE_FILES.largestFile}</span>
      </div>
    </GlassCard>
  );
}
