import type { ReactNode } from 'react';
import { Badge } from '@/components/common';
import ArchitectureOverview from './ArchitectureOverview';
import {
  CodePerformanceCard,
  AutomationFlowsCard,
  LargeDataVolumeCard,
  AsyncArchitectureCard,
  QueryIndexHealthCard,
  StorageFilesCard,
} from './ArchitectureDetailCards';
import OperationalMetrics from './OperationalMetrics';
import RuntimeMetrics from './RuntimeMetrics';
import PerfLimitsRecommendations from './PerfLimitsRecommendations';

function LevelSectionHeader({ level, title, availability, right }: { level: number; title: string; availability: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-sm font-semibold text-sf-text">
          <span className="text-sf-accent">LEVEL {level}</span> <span className="text-sf-muted">•</span> {title}
        </h2>
        <p className="text-[11px] text-sf-muted mt-0.5">{availability}</p>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

function ViewLink({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold text-sf-accent whitespace-nowrap cursor-default">{children}</span>;
}

export default function PerfLimitsSummary() {
  return (
    <div className="space-y-4">
      {/* LEVEL 1 · Architecture Performance */}
      <LevelSectionHeader
        level={1}
        title="Architecture Performance (Derivable from Metadata, Code & Queries)"
        availability="Always available – No additional licenses required"
        right={<ViewLink>View full score details →</ViewLink>}
      />
      <ArchitectureOverview />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CodePerformanceCard />
        <AutomationFlowsCard />
        <LargeDataVolumeCard />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AsyncArchitectureCard />
        <QueryIndexHealthCard />
        <StorageFilesCard />
      </div>

      {/* LEVEL 2 · Operational Metrics from Logs */}
      <LevelSectionHeader
        level={2}
        title="Operational Metrics from Logs (Derivable from Debug Logs / Apex Logs)"
        availability="Available when Debug Logs or External Logs are analyzed"
      />
      <OperationalMetrics />

      {/* LEVEL 3 · Runtime Performance */}
      <LevelSectionHeader
        level={3}
        title="Runtime Performance (Requires Salesforce Shield Event Monitoring)"
        availability="Real user and system runtime metrics from Event Monitoring"
        right={
          <>
            <span className="text-[11px] text-sf-muted">Shield Event Monitoring</span>
            <Badge variant="success">Enabled</Badge>
            <ViewLink>View details →</ViewLink>
          </>
        }
      />
      <RuntimeMetrics />

      <PerfLimitsRecommendations />
    </div>
  );
}
