import { useIssueStore } from '@/store/slices/issueStore';
import { useAIStore } from '@/store/slices/aiStore';
import { useVSCode } from '@/hooks/useVSCode';
import { cn } from '@/lib/cn';
import { Button, SeverityPill } from '@/components/common';

export default function DrillDownPanel() {
  const selectedIssue        = useIssueStore((s) => s.selectedIssue);
  const closeDrill           = useIssueStore((s) => s.closeDrill);
  const aiExplanation        = useAIStore((s) => s.aiExplanation);
  const aiExplanationLoading = useAIStore((s) => s.aiExplanationLoading);
  const { postMessage }      = useVSCode();

  if (!selectedIssue) return null;

  const handleExplain = () => {
    postMessage({ command: 'explainIssue', issue: selectedIssue });
  };

  const handleOpenFile = () => {
    if (selectedIssue.file) {
      postMessage({ command: 'openFile', file: selectedIssue.file, line: selectedIssue.line });
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={closeDrill} />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 bottom-0 w-130 max-w-full bg-sf-bg-2 border-l border-sf-border z-50 flex flex-col"
        style={{ boxShadow: '-4px 0 32px rgba(0,0,0,0.4)', animation: 'slideFromRight 0.25s ease' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sf-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <SeverityPill severity={selectedIssue.severity} />
            <h2 className="text-xs font-semibold text-sf-text truncate">Issue Detail</h2>
          </div>
          <button
            type="button"
            onClick={closeDrill}
            className="text-sf-muted hover:text-sf-text text-xl leading-none ml-2 shrink-0"
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-sm text-sf-text leading-relaxed">{selectedIssue.message}</p>

          {selectedIssue.description && (
            <p className="text-xs text-sf-muted leading-relaxed">{selectedIssue.description}</p>
          )}

          {/* Meta grid */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-sf-muted mb-0.5">Severity</dt>
              <dd className="text-sf-text capitalize">{selectedIssue.severity}</dd>
            </div>
            <div>
              <dt className="text-sf-muted mb-0.5">Category</dt>
              <dd className="text-sf-text capitalize">{selectedIssue.category.replace(/-/g, ' ')}</dd>
            </div>
            {selectedIssue.ruleId && (
              <div className="col-span-2">
                <dt className="text-sf-muted mb-0.5">Rule</dt>
                <dd className="text-sf-text font-mono">{selectedIssue.ruleId}</dd>
              </div>
            )}
            {selectedIssue.object && (
              <div className="col-span-2">
                <dt className="text-sf-muted mb-0.5">Object</dt>
                <dd className="text-sf-text">{selectedIssue.object}</dd>
              </div>
            )}
          </dl>

          {/* Location */}
          {selectedIssue.file && (
            <div>
              <p className="text-[10px] text-sf-muted uppercase tracking-wider mb-1">Location</p>
              <code className="block text-xs bg-sf-bg-3 rounded px-3 py-2 text-sf-accent font-mono break-all">
                {selectedIssue.file}
                {selectedIssue.line ? `:${selectedIssue.line}` : ''}
              </code>
            </div>
          )}

          {/* Suggestion */}
          {selectedIssue.suggestion && (
            <div className="border-l-2 border-sf-accent pl-3 py-1">
              <p className="text-[10px] text-sf-accent uppercase tracking-wider mb-1">Suggestion</p>
              <p className="text-xs text-sf-text-2 leading-relaxed">{selectedIssue.suggestion}</p>
            </div>
          )}

          {/* AI Explanation */}
          {aiExplanationLoading && (
            <div className="flex items-center gap-2 text-xs text-sf-muted py-2">
              <span className="w-3 h-3 rounded-full border border-sf-accent border-t-transparent animate-spin" />
              Getting AI explanation…
            </div>
          )}

          {aiExplanation && !aiExplanationLoading && (
            <div className="rounded-lg border border-sf-accent/30 bg-sf-accent/5 p-3 space-y-2">
              <p className="text-[10px] text-sf-accent uppercase tracking-wider font-medium">AI Explanation</p>
              {aiExplanation.error ? (
                <p className="text-xs text-sev-error">{aiExplanation.error}</p>
              ) : (
                <>
                  {aiExplanation.summary    && <p className="text-xs text-sf-text leading-relaxed">{aiExplanation.summary}</p>}
                  {aiExplanation.rootCause  && (
                    <div>
                      <p className="text-[10px] text-sf-muted font-medium mb-0.5">Root Cause</p>
                      <p className="text-xs text-sf-text-2">{aiExplanation.rootCause}</p>
                    </div>
                  )}
                  {aiExplanation.suggestion && (
                    <div>
                      <p className="text-[10px] text-sf-muted font-medium mb-0.5">Fix</p>
                      <p className="text-xs text-sf-text-2">{aiExplanation.suggestion}</p>
                    </div>
                  )}
                  {aiExplanation.effort && (
                    <p className="text-[10px] text-sf-muted">Effort: {aiExplanation.effort}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sf-border flex gap-2 shrink-0">
          {selectedIssue.file && (
            <Button variant="ghost" size="sm" onClick={handleOpenFile}>
              Open File
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            loading={aiExplanationLoading}
            onClick={handleExplain}
            className={cn('border-sf-accent/40 text-sf-accent bg-sf-accent/10 hover:bg-sf-accent/20')}
          >
            Explain with AI
          </Button>
          <Button variant="ghost" size="sm" onClick={closeDrill} className="ml-auto">
            Close
          </Button>
        </div>
      </aside>
    </>
  );
}
