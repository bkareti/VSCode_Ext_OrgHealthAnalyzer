import { useState } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import ThemeToggle from '@/components/common/ThemeToggle';
import ExportModal from '@/components/modals/ExportModal';

export default function Header() {
  const [showExport, setShowExport] = useState(false);
  const results = useOrgStore((s) => s.results);

  const orgName = results?.metadata?.orgAlias ?? results?.metadata?.orgId ?? 'No org connected';
  const lastScan = results?.timestamp ? new Date(results.timestamp).toLocaleString() : null;

  return (
    <>
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-sf-border bg-sf-bg-2 px-4 py-2">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-semibold text-sf-text">OrgPulse</span>
            <span className="hidden font-mono text-[10px] text-sf-muted sm:block">
              Health Analyzer
            </span>
          </div>

          {/* Org chip */}
          <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-sf-border bg-sf-bg-3 px-2 py-0.5 text-xs text-sf-text-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-score-good" />
            <span className="max-w-40 truncate">{orgName}</span>
          </div>

          {lastScan && (
            <span className="hidden text-[10px] whitespace-nowrap text-sf-muted md:block">
              Last scan: {lastScan}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {/* <Button variant="ghost" size="sm" onClick={() => setShowExport(true)}>
            Export
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAnalysisDialog(true)}
          >
            Re-Analyse
          </Button> */}
        </div>
      </header>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </>
  );
}
