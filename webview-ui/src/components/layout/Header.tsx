import { useState } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { useUIStore } from '@/store/slices/uiStore';
import { Button } from '@/components/common';
import ThemeToggle from '@/components/common/ThemeToggle';
import ExportModal from '@/components/modals/ExportModal';

export default function Header() {
  const [showExport, setShowExport] = useState(false);
  const results               = useOrgStore((s) => s.results);
  const setShowAnalysisDialog = useUIStore((s) => s.setShowAnalysisDialog);

  const orgName  = results?.metadata?.orgAlias ?? results?.metadata?.orgId ?? 'No org connected';
  const lastScan = results?.timestamp ? new Date(results.timestamp).toLocaleString() : null;

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 border-b border-sf-border bg-sf-bg-2 shrink-0 z-10">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold text-sf-text">OrgPulse</span>
            <span className="text-[10px] text-sf-muted font-mono hidden sm:block">Health Analyzer</span>
          </div>

          {/* Org chip */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sf-bg-3 border border-sf-border text-xs text-sf-text-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-score-good shrink-0" />
            <span className="truncate max-w-40">{orgName}</span>
          </div>

          {lastScan && (
            <span className="text-[10px] text-sf-muted hidden md:block whitespace-nowrap">
              Last scan: {lastScan}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => setShowExport(true)}>
            Export
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAnalysisDialog(true)}
          >
            Re-Analyse
          </Button>
        </div>
      </header>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </>
  );
}
