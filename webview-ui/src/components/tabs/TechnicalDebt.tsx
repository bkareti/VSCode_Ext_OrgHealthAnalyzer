import { useState, type ReactNode } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import { EmptyState, Tooltip } from '@/components/common';
import IssueFilters from '@/components/issues/IssueFilters';
import { TechnicalDebtSummary } from './technicalDebtSummary';

type SubTab = 'overview' | 'register' | 'trend' | 'roadmap';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'register', label: 'Debt Register' },
  { id: 'trend',    label: 'Debt Trend' },
  { id: 'roadmap',  label: 'Roadmap' },
];

// Anchored dropdown for the header's Filters action — mirrors the same local
// helper in GovernorLimits.tsx / SecurityAccess.tsx (no shared popover component exists yet).
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

function ComingSoonTab({ icon, title }: { icon: string; title: string }) {
  return (
    <EmptyState
      icon={icon}
      title={`${title} — coming soon`}
      description="This view is still being designed. Check back in a future release."
      className="m-6"
    />
  );
}

export default function TechnicalDebt() {
  const results = useDashboardStore((s) => s.results);
  const [subTab, setSubTab] = useState<SubTab>('overview');

  if (!results) {
    return (
      <EmptyState
        icon="🧹"
        title="No technical debt data yet"
        description="Run a full analysis to quantify debt hours, stale metadata, and architecture risk."
        className="m-6"
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-base font-semibold text-sf-text">Technical Debt</h1>
            <Tooltip content="Comprehensive view of technical debt across your Salesforce org, aggregated by domain, severity, and modernization risk.">
              <span className="text-[11px] text-sf-muted cursor-help">ⓘ</span>
            </Tooltip>
          </div>
          <p className="text-xs text-sf-muted mt-0.5">
            Comprehensive view of technical debt across your Salesforce org. Prioritize what matters most.
          </p>
        </div>
        <HeaderPopoverButton label="Filters" icon="🔍">
          <IssueFilters />
        </HeaderPopoverButton>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-sf-border overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              subTab === t.id
                ? 'border-b-2 border-sf-accent text-sf-text'
                : 'text-sf-muted hover:text-sf-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && <TechnicalDebtSummary />}
      {subTab === 'register' && <ComingSoonTab icon="📋" title="Debt Register" />}
      {subTab === 'trend'    && <ComingSoonTab icon="📈" title="Debt Trend" />}
      {subTab === 'roadmap'  && <ComingSoonTab icon="🗺️" title="Roadmap" />}
    </div>
  );
}
