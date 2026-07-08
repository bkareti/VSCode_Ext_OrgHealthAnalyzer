import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAIStore } from '@/store/slices/aiStore';
import { useVSCode } from '@/hooks/useVSCode';

export default function AskArchitect() {
  const [question, setQuestion] = useState('');
  const { postMessage } = useVSCode();

  const architectAnswer = useAIStore((s) => s.architectAnswer);
  const architectAnswerLoading = useAIStore((s) => s.architectAnswerLoading);
  const architectAnswerProgress = useAIStore((s) => s.architectAnswerProgress);
  const copilotAvailable = useAIStore((s) => s.copilotAvailable);
  const claudeAuthorized = useAIStore((s) => s.claudeAuthorized);

  const anyProviderActive = copilotAvailable || claudeAuthorized;

  const handleAsk = () => {
    if (!question.trim()) return;
    postMessage({ command: 'askArchitect', data: { question: question.trim() } });
  };

  const SUGGESTIONS = [
    'What are the top risks in my automation layer?',
    'Which objects have the most technical debt?',
    'How many users have Modify All Data permission?',
    'What is the health of my integration patterns?',
    'Which Apex classes have no test coverage?',
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="mb-1 text-base font-semibold text-sf-text">Ask the Architect</h1>
        <p className="text-xs text-sf-muted">
          Ask any question about your Salesforce org. The AI queries live org metadata to answer.
        </p>
      </div>

      {/* No AI provider nudge */}
      {!anyProviderActive && (
        <div className="flex items-start gap-3 rounded-lg border border-sev-warning/40 bg-sev-warning/5 p-4">
          <span className="shrink-0 text-base text-sev-warning">⚠</span>
          <div>
            <p className="mb-0.5 text-xs font-semibold text-sf-text">No AI provider connected</p>
            <p className="text-xs leading-relaxed text-sf-muted">
              Ask Architect requires GitHub Copilot or Claude.{' '}
              <NavLink to="/settings" className="text-sf-accent hover:underline">
                Go to Settings
              </NavLink>{' '}
              to connect a provider.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAsk();
          }}
          placeholder="e.g. What are the top 3 risks in my automation layer?"
          rows={4}
          className="w-full resize-none rounded-lg border border-sf-border bg-sf-bg-3 px-3 py-2 text-xs leading-relaxed text-sf-text outline-none placeholder:text-sf-muted focus:border-sf-accent"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-sf-muted">⌘↵ to submit</span>
          <button
            type="button"
            onClick={handleAsk}
            disabled={!question.trim() || architectAnswerLoading}
            className="rounded bg-sf-accent px-4 py-1.5 text-xs text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {architectAnswerLoading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </div>

      {architectAnswerLoading && (
        <div className="flex items-center gap-2 text-xs text-sf-muted">
          <span className="h-3 w-3 animate-spin rounded-full border border-sf-accent border-t-transparent" />
          {architectAnswerProgress ?? 'Querying your org…'}
        </div>
      )}

      {architectAnswer && !architectAnswerLoading && (
        <div className="space-y-2 rounded-lg border border-sf-border bg-sf-bg-2 p-4">
          <p className="text-[10px] font-medium tracking-wider text-sf-accent uppercase">Answer</p>
          <pre className="font-sans text-xs leading-relaxed whitespace-pre-wrap text-sf-text">
            {architectAnswer}
          </pre>
        </div>
      )}

      {!architectAnswer && !architectAnswerLoading && (
        <div className="space-y-2">
          <p className="text-[10px] tracking-wider text-sf-muted uppercase">Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuestion(q)}
                className="rounded-full border border-sf-border px-2.5 py-1 text-[11px] text-sf-muted transition-colors hover:border-sf-accent hover:text-sf-text"
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
