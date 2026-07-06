import { useState } from 'react';
import { useDashboardStore } from '@/store/dashboardStore';
import { useVSCode } from '@/hooks/useVSCode';

export default function AskArchitect() {
  const [question, setQuestion] = useState('');
  const { postMessage }         = useVSCode();

  const models                 = useDashboardStore((s) => s.availableModels);
  const selectedModelId        = useDashboardStore((s) => s.selectedModelId);
  const setSelectedModelId     = useDashboardStore((s) => s.setSelectedModelId);
  const architectAnswer        = useDashboardStore((s) => s.architectAnswer);
  const architectAnswerLoading = useDashboardStore((s) => s.architectAnswerLoading);

  const handleAsk = () => {
    if (!question.trim()) return;
    postMessage({ command: 'askArchitect', question: question.trim(), model: selectedModelId ?? undefined });
  };

  const SUGGESTIONS = [
    'What are the top risks in my automation layer?',
    'Which objects have the most technical debt?',
    'How many users have Modify All Data permission?',
    'What is the health of my integration patterns?',
    'Which Apex classes have no test coverage?',
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-base font-semibold text-sf-text mb-1">Ask the Architect</h1>
        <p className="text-xs text-sf-muted">
          Ask any question about your Salesforce org. The AI queries live org metadata to answer.
        </p>
      </div>

      {models.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-sf-muted shrink-0">Model:</label>
          <select
            value={selectedModelId ?? ''}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="px-2 py-1 text-xs rounded border border-sf-border bg-sf-bg-3 text-sf-text focus:border-sf-accent outline-none"
          >
            <option value="">Auto-select</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAsk(); }}
          placeholder="e.g. What are the top 3 risks in my automation layer?"
          rows={4}
          className="w-full px-3 py-2 text-xs rounded-lg border border-sf-border bg-sf-bg-3 text-sf-text placeholder:text-sf-muted focus:border-sf-accent outline-none resize-none leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-sf-muted">⌘↵ to submit</span>
          <button
            type="button"
            onClick={handleAsk}
            disabled={!question.trim() || architectAnswerLoading}
            className="px-4 py-1.5 text-xs rounded bg-sf-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {architectAnswerLoading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </div>

      {architectAnswerLoading && (
        <div className="flex items-center gap-2 text-xs text-sf-muted">
          <span className="w-3 h-3 rounded-full border border-sf-accent border-t-transparent animate-spin" />
          Querying your org…
        </div>
      )}

      {architectAnswer && !architectAnswerLoading && (
        <div className="rounded-lg border border-sf-border bg-sf-bg-2 p-4 space-y-2">
          <p className="text-[10px] text-sf-accent uppercase tracking-wider font-medium">Answer</p>
          <pre className="text-xs text-sf-text whitespace-pre-wrap leading-relaxed font-sans">{architectAnswer}</pre>
        </div>
      )}

      {!architectAnswer && !architectAnswerLoading && (
        <div className="space-y-2">
          <p className="text-[10px] text-sf-muted uppercase tracking-wider">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuestion(q)}
                className="px-2.5 py-1 text-[11px] rounded-full border border-sf-border text-sf-muted hover:text-sf-text hover:border-sf-accent transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
