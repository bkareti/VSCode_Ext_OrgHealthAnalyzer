import type { ReactNode } from 'react';
import { Badge } from '@/components/common';
import KpiRow from './KpiRow';
import {
  AutomationsByTypeCard,
  FlowsByCategoryCard,
  AutomationsByStatusCard,
  TopObjectsCard,
  ComplexityCard,
  SizeCard,
} from './Level1Cards';
import Level1StatsRow from './Level1StatsRow';
import Level2Metrics from './Level2Metrics';
import Level3Runtime from './Level3Runtime';
import AutomationRecommendations from './AutomationRecommendations';

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

export default function AutomationSummary() {
  return (
    <div className="space-y-4">
      <KpiRow />

      {/* LEVEL 1 · Automation Overview & Distribution */}
      <LevelSectionHeader
        level={1}
        title="Automation Overview & Distribution (Metadata Based)"
        availability="Always available – No additional licenses required"
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AutomationsByTypeCard />
        <FlowsByCategoryCard />
        <AutomationsByStatusCard />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TopObjectsCard />
        <ComplexityCard />
        <SizeCard />
      </div>
      <Level1StatsRow />

      {/* LEVEL 2 · Operational & Usage Metrics */}
      <LevelSectionHeader
        level={2}
        title="Operational & Usage Metrics (From Logs / Debug Logs / Apex Logs)"
        availability="Available when Debug Logs or External Logs are analyzed"
      />
      <Level2Metrics />

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
      <Level3Runtime />

      <AutomationRecommendations />
    </div>
  );
}
