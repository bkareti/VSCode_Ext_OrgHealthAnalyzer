import { useState, type ReactNode } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { EmptyState, Tooltip } from '@/components/common';
import IssueFilters from '@/components/issues/IssueFilters';
import { AutomationSummary } from './automationSummary';

// Anchored dropdown for the header's Scan History / Filters actions — mirrors
// the same local helper in PerfLimits.tsx/GovernorLimits.tsx/SecurityAccess.tsx
// (no shared popover component exists yet).
function HeaderPopoverButton({ label, icon, children }: { label: string; icon: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 text-xs font-medium rounded border border-sf-border bg-sf-bg-2 text-sf-text hover:bg-sf-bg-3 transition-colors flex items-center gap-1.5"
      >
        <span>{icon}</span>
        {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 z-20 rounded-lg border border-sf-border bg-sf-bg-2 shadow-glass p-3">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

export default function Automation() {
  const results    = useOrgStore((s) => s.results);
  const orgHistory = useOrgStore((s) => s.orgHistory);

  if (!results) {
    return (
      <EmptyState
        icon="⚡"
        title="No automation data yet"
        description="Run a full analysis to see flows, triggers, workflow rules, and process builders."
        className="m-6"
      />
    );
  }

  const orgId = results.orgDetails?.orgId ?? results.metadata?.orgId ?? null;
  const history = orgId ? (orgHistory[orgId] ?? []) : [];
  const historyNewestFirst = [...history].reverse();

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-sf-text mb-1 flex items-center gap-1.5">
            Automations
            <Tooltip content="Comprehensive view of all automations in your org, their complexity, usage, and best practices.">
              <span className="text-[11px] text-sf-muted cursor-help">ⓘ</span>
            </Tooltip>
          </h1>
          <p className="text-xs text-sf-muted">
            Comprehensive view of all automations in your org, their complexity, usage, and best practices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HeaderPopoverButton label="Scan History" icon="🕐">
            {historyNewestFirst.length > 0 ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {historyNewestFirst.map((h, i) => {
                  const prev = historyNewestFirst[i + 1];
                  const delta = prev ? Math.round((h.scores.automationDesign ?? 0) - (prev.scores.automationDesign ?? 0)) : undefined;
                  return (
                    <div key={h.timestamp} className="flex items-center justify-between text-[11px] py-1 border-b border-sf-border/40 last:border-0">
                      <span className="text-sf-muted">{new Date(h.timestamp).toLocaleString()}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-sf-text tabular-nums">{Math.round(h.scores.automationDesign ?? 0)}</span>
                        {delta !== undefined && (
                          <span className={delta >= 0 ? 'text-score-good' : 'text-sev-error'}>
                            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-sf-muted">No scan history yet — run at least 2 scans to see trends.</p>
            )}
          </HeaderPopoverButton>

          <HeaderPopoverButton label="Filters" icon="🔍">
            <IssueFilters />
          </HeaderPopoverButton>
        </div>
      </div>

      <AutomationSummary />
    </div>
  );
}
