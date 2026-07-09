import { useState } from 'react';
import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import type { ReadinessPackAssessment, GapSeverity } from '@/types';

interface Props {
  pack: ReadinessPackAssessment;
}

const VISIBLE_COUNT = 5;

const SEVERITY_VARIANT: Record<GapSeverity, 'error' | 'warning' | 'info'> = {
  Critical: 'error',
  High: 'error',
  Medium: 'warning',
  Low: 'info',
};

const SEVERITY_TAG: Record<GapSeverity, string> = {
  Critical: 'P1',
  High: 'P1',
  Medium: 'P2',
  Low: 'P3',
};

function ListCard({ title, count, children, emptyLabel }: { title: string; count: number; children: React.ReactNode; emptyLabel: string }) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-sf-text">{title}</h3>
        <span className="text-[10px] font-bold text-sf-muted bg-sf-bg-3 rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      {count === 0 ? <p className="text-[11px] text-sf-muted py-2">{emptyLabel}</p> : children}
    </GlassCard>
  );
}

export default function ReadyGapsOpportunitiesRow({ pack }: Props) {
  const [showAllReady, setShowAllReady] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [showAllOpps, setShowAllOpps] = useState(false);

  const ready = pack.strengths;
  const gaps = pack.blockingIssues;
  const opportunities = pack.quickWins;

  const visibleReady = showAllReady ? ready : ready.slice(0, VISIBLE_COUNT);
  const visibleGaps = showAllGaps ? gaps : gaps.slice(0, VISIBLE_COUNT);
  const visibleOpps = showAllOpps ? opportunities : opportunities.slice(0, VISIBLE_COUNT);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ListCard title="What's Ready" count={ready.length} emptyLabel="No confirmed strengths yet.">
        <ul className="space-y-1.5">
          {visibleReady.map((strength, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-sf-text-2 leading-snug">
              <span className="text-score-good shrink-0">✓</span>
              {strength}
            </li>
          ))}
        </ul>
        {ready.length > VISIBLE_COUNT && (
          <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAllReady((v) => !v)}>
            {showAllReady ? '▴ Show fewer' : 'View all ready items →'}
          </button>
        )}
      </ListCard>

      <ListCard title="Critical Gaps (Must Fix)" count={gaps.length} emptyLabel="No blocking gaps detected. 🎉">
        <ul className="space-y-1.5">
          {visibleGaps.map((gap, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <Badge variant={SEVERITY_VARIANT[gap.severity]} className="shrink-0">{SEVERITY_TAG[gap.severity]}</Badge>
              <span className="text-sf-text-2">{gap.title}</span>
            </li>
          ))}
        </ul>
        {gaps.length > VISIBLE_COUNT && (
          <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAllGaps((v) => !v)}>
            {showAllGaps ? '▴ Show fewer' : 'View all gaps →'}
          </button>
        )}
      </ListCard>

      <ListCard title="Opportunities" count={opportunities.length} emptyLabel="No quick wins identified yet.">
        <ul className="space-y-1.5">
          {visibleOpps.map((qw, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug">
              <Badge variant={qw.priority === 'High' ? 'error' : qw.priority === 'Medium' ? 'warning' : 'info'} className="shrink-0">
                {qw.priority}
              </Badge>
              <span className="text-sf-text-2">{qw.title}</span>
            </li>
          ))}
        </ul>
        {opportunities.length > VISIBLE_COUNT && (
          <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAllOpps((v) => !v)}>
            {showAllOpps ? '▴ Show fewer' : 'View all opportunities →'}
          </button>
        )}
      </ListCard>
    </div>
  );
}
