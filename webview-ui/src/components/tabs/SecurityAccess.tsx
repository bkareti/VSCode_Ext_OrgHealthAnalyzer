import { useState, type ReactNode } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { EmptyState } from '@/components/common';
import IssueFilters from '@/components/issues/IssueFilters';
import {
  SUB_TABS,
  SecurityOverviewTab,
  IdentityAccessTab,
  AuthenticationTab,
  DataProtectionTab,
  EventMonitoringTab,
  SecurityRisksTab,
  ComplianceTab,
  ShieldEncryptionTab,
  type SecuritySubTab,
} from './security';

// Anchored dropdown for the header's Scan History / Filters actions. No
// shared popover component exists yet — Tooltip is hover-only and the
// existing modals are full-screen dialogs, not anchored menus.
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

export default function SecurityAccess() {
  const [subTab, setSubTab] = useState<SecuritySubTab>('overview');
  const results     = useOrgStore((s) => s.results);
  const orgHistory  = useOrgStore((s) => s.orgHistory);

  if (!results) {
    return (
      <EmptyState
        icon="🛡️"
        title="No security data yet"
        description="Run a full analysis to review permissions, profiles, and access posture."
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
          <h1 className="text-base font-semibold text-sf-text mb-1">Security Overview</h1>
          <p className="text-xs text-sf-muted">Comprehensive view of your Salesforce org security posture, access controls, and compliance status.</p>
        </div>
        <div className="flex items-center gap-2">
          <HeaderPopoverButton label="Scan History" icon="🕐">
            {historyNewestFirst.length > 0 ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {historyNewestFirst.map((h, i) => {
                  const prev = historyNewestFirst[i + 1];
                  const delta = prev ? Math.round((h.scores.security ?? 0) - (prev.scores.security ?? 0)) : undefined;
                  return (
                    <div key={h.timestamp} className="flex items-center justify-between text-[11px] py-1 border-b border-sf-border/40 last:border-0">
                      <span className="text-sf-muted">{new Date(h.timestamp).toLocaleString()}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-sf-text tabular-nums">{Math.round(h.scores.security ?? 0)}</span>
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

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-sf-border overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-t transition-colors ${
              subTab === t.id
                ? 'bg-sf-bg-2 text-sf-text border-b-2 border-sf-accent'
                : 'text-sf-muted hover:text-sf-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'overview'        && <SecurityOverviewTab results={results} history={history} onNavigate={setSubTab} />}
      {subTab === 'identity'        && <IdentityAccessTab results={results} />}
      {subTab === 'authentication'  && <AuthenticationTab results={results} />}
      {subTab === 'dataProtection'  && <DataProtectionTab results={results} />}
      {subTab === 'eventMonitoring' && <EventMonitoringTab />}
      {subTab === 'risks'           && <SecurityRisksTab results={results} />}
      {subTab === 'compliance'      && <ComplianceTab />}
      {subTab === 'shieldEncryption' && <ShieldEncryptionTab results={results} />}
    </div>
  );
}
