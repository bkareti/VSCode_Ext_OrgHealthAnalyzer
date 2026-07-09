import { useState } from 'react';
import GlassCard from '@/components/common/GlassCard';
import Badge from '@/components/common/Badge';
import Tooltip from '@/components/common/Tooltip';
import type { ReadinessPackAssessment } from '@/types';
import { STATUS_LABEL, impactFor, IMPACT_TEXT_CLASS } from '../../derivations';
import { checklistData, checklistTriState } from '../derivations';

interface Props {
  pack: ReadinessPackAssessment;
}

const VISIBLE_COUNT = 8;

function Flag({ on }: { on: boolean }) {
  return <span className={on ? 'text-score-good' : 'text-sf-muted/50'}>{on ? '✓' : '—'}</span>;
}

export default function ChecklistTable({ pack }: Props) {
  const [showAll, setShowAll] = useState(false);
  const rows = checklistData(pack);
  const visible = showAll ? rows : rows.slice(0, VISIBLE_COUNT);

  return (
    <GlassCard title="Agentforce Readiness Checklist">
      <div className="overflow-x-auto">
        <table className="w-full text-left" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              {['Requirement', 'Available', 'Configured', 'In Use', 'Status', 'Impact', 'Recommendation'].map((h) => (
                <th key={h} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-sf-muted border-b border-sf-border/60 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              if (!row.signal) {
                return (
                  <tr key={row.requirement} className={i % 2 ? 'bg-sf-glass-stripe' : ''}>
                    <td className="px-2 py-2 text-xs text-sf-text align-top whitespace-nowrap">{row.requirement}</td>
                    <td colSpan={6} className="px-2 py-2 text-[11px] text-sf-muted align-top">—</td>
                  </tr>
                );
              }
              const signal = row.signal;
              const tri = checklistTriState(signal);
              const status = STATUS_LABEL[signal.status];
              const impact = impactFor(signal);
              return (
                <tr key={row.requirement} className={i % 2 ? 'bg-sf-glass-stripe' : ''}>
                  <td className="px-2 py-2 text-xs text-sf-text align-top whitespace-nowrap">{row.requirement}</td>
                  <td className="px-2 py-2 align-top text-center"><Flag on={tri.available} /></td>
                  <td className="px-2 py-2 align-top text-center"><Flag on={tri.configured} /></td>
                  <td className="px-2 py-2 align-top text-center"><Flag on={tri.inUse} /></td>
                  <td className="px-2 py-2 align-top"><Badge variant={status.variant}>{status.label}</Badge></td>
                  <td className={`px-2 py-2 text-[11px] font-medium align-top whitespace-nowrap ${IMPACT_TEXT_CLASS[impact]}`}>{impact}</td>
                  <td className="px-2 py-2 text-[11px] text-sf-muted align-top" style={{ maxWidth: 260 }}>
                    {signal.recommendation ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2">
        {rows.length > VISIBLE_COUNT ? (
          <button className="text-xs text-sf-accent hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? '▴ Show fewer' : `View full checklist (${rows.length}) →`}
          </button>
        ) : <span />}
        <Tooltip content="Available/Configured/In Use are derived from each check's pass/warning/fail status, not independently tracked flags.">
          <span className="text-[10px] text-sf-muted cursor-help">ⓘ How these are derived</span>
        </Tooltip>
      </div>
    </GlassCard>
  );
}
