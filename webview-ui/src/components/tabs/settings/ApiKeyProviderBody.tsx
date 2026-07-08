import { useVSCode } from '@/hooks/useVSCode';

type AuthCommand = 'authorizeClaude' | 'authorizeOpenAI' | 'authorizeGemini';
type DisconnectCommand = 'disconnectClaude' | 'disconnectOpenAI' | 'disconnectGemini';

function Divider() {
  return <div className="my-4 h-px bg-sf-border" />;
}

interface Props {
  providerName: string;
  authorized: boolean;
  authError: string | null;
  modelCount: number;
  /** Extra sentence appended after the model count when connected, e.g. a preference note. */
  connectedNote?: string;
  /** Shown above the "get a key" line when not connected. */
  description: string;
  /** e.g. "console.anthropic.com → API Keys". */
  getKeyLabel: string;
  authorizeCommand: AuthCommand;
  disconnectCommand: DisconnectCommand;
}

/** Shared connect/disconnect body for API-key-based providers (Claude, ChatGPT, Gemini). */
export default function ApiKeyProviderBody({
  providerName,
  authorized,
  authError,
  modelCount,
  connectedNote,
  description,
  getKeyLabel,
  authorizeCommand,
  disconnectCommand,
}: Props) {
  const { postMessage } = useVSCode();

  if (authorized) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-score-good/20 bg-score-good/5 p-3">
          <span className="text-sm text-score-good">✓</span>
          <p className="text-xs text-sf-text-2">
            {providerName} is connected —{' '}
            <span className="font-medium text-sf-text">
              {modelCount} model{modelCount !== 1 ? 's' : ''}
            </span>{' '}
            available.{connectedNote ? ` ${connectedNote}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => postMessage({ command: authorizeCommand })}
            className="rounded border border-sf-border px-3 py-1.5 text-xs text-sf-muted transition-colors hover:border-sf-accent/40 hover:text-sf-text"
          >
            Update API Key
          </button>
          <button
            type="button"
            onClick={() => postMessage({ command: disconnectCommand })}
            className="rounded border border-sev-error/40 px-3 py-1.5 text-xs text-sev-error transition-colors hover:bg-sev-error/10"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {authError && (
        <div className="flex items-start gap-2 rounded-lg border border-sev-error/20 bg-sev-error/5 p-3">
          <span className="shrink-0 text-sm text-sev-error">✗</span>
          <p className="text-xs leading-relaxed text-sev-error">{authError}</p>
        </div>
      )}
      <p className="text-xs leading-relaxed text-sf-muted">{description}</p>
      <p className="text-[10px] text-sf-muted">
        Get a key at <span className="font-medium text-sf-accent">{getKeyLabel}</span>.
      </p>

      <Divider />

      <button
        type="button"
        onClick={() => postMessage({ command: authorizeCommand })}
        className="flex items-center gap-2 rounded-lg bg-sf-accent px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
      >
        <span>🔑</span>
        Connect {providerName}
      </button>
    </div>
  );
}
