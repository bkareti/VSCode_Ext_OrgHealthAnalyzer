import { useState } from 'react';
import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import Tooltip from '@/components/common/Tooltip';
import SegmentedTabs from '@/components/common/SegmentedTabs';
import type { ReadinessPackAssessment, ReadinessStatus } from '@/types';
import { STATUS_LABEL, IMPACT_TEXT_CLASS, impactFor, effortLabelFor } from './derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

type FilterId = 'all' | ReadinessStatus;

const VISIBLE_COUNT = 8;

export default function ChecksTable({ pack }: Props) {
  const [filter, setFilter] = useState<FilterId>('all');
  const [showAll, setShowAll] = useState(false);
  const signals = pack.signals ?? [];

  const counts: Record<FilterId, number> = {
    all: signals.length,
    ready: signals.filter((s) => s.status === 'ready').length,
    blocked: signals.filter((s) => s.status === 'blocked').length,
    partial: signals.filter((s) => s.status === 'partial').length,
    na: signals.filter((s) => s.status === 'na').length,
  };

  const filterItems: { id: FilterId; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'blocked', label: 'Failed', count: counts.blocked },
    { id: 'partial', label: 'Warning', count: counts.partial },
    { id: 'ready', label: 'Passed', count: counts.ready },
    { id: 'na', label: 'Manual', count: counts.na },
  ];

  const filtered = filter === 'all' ? signals : signals.filter((s) => s.status === filter);
  const visible = showAll ? filtered : filtered.slice(0, VISIBLE_COUNT);

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-xs font-semibold text-sf-text">Detailed Readiness Checks</h3>
        <SegmentedTabs
          items={filterItems}
          active={filter}
          onChange={(id) => { setFilter(id); setShowAll(false); }}
          variant="pill"
          size="sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-sf-muted py-4 text-center">No checks match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                {['Check', 'Pillar', 'Status', 'Impact', 'Why It Matters', 'Effort', ''].map((h) => (
                  <th
                    key={h}
                    className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sf-muted border-b border-sf-border/60 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((signal, i) => {
                const status = STATUS_LABEL[signal.status];
                const impact = impactFor(signal);
                const detail = signal.recommendation ?? signal.evidence[0] ?? signal.whyItMatters ?? 'No additional detail available.';
                return (
                  <tr key={signal.id} className={i % 2 ? 'bg-sf-glass-stripe' : ''}>
                    <td className="px-2 py-2 text-xs text-sf-text align-top">{signal.label ?? signal.id}</td>
                    <td className="px-2 py-2 text-[11px] text-sf-muted align-top whitespace-nowrap">{signal.dimension}</td>
                    <td className="px-2 py-2 align-top">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    <td className={`px-2 py-2 align-top text-[11px] font-semibold ${IMPACT_TEXT_CLASS[impact]}`}>
                      {impact}
                    </td>
                    <td className="px-2 py-2 text-[11px] text-sf-muted align-top" style={{ maxWidth: 260 }}>
                      {signal.whyItMatters}
                    </td>
                    <td className="px-2 py-2 text-[11px] text-sf-muted align-top whitespace-nowrap">
                      {effortLabelFor(signal)}
                    </td>
                    <td className="px-2 py-2 align-top whitespace-nowrap">
                      <Tooltip content={detail} position="left">
                        <span className="text-[11px] text-sf-accent cursor-help">Details</span>
                      </Tooltip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > VISIBLE_COUNT && (
        <button className="mt-2 text-xs text-sf-accent hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? '▴ Show fewer' : `View all ${filtered.length} checks →`}
        </button>
      )}
    </GlassCard>
  );
}
