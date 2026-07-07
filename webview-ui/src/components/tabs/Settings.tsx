import { NavLink } from 'react-router-dom';
import { useAIStore } from '@/store/slices/aiStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-score-good/30 bg-score-good/15 px-2 py-0.5 text-[10px] font-semibold text-score-good">
      <span className="h-1.5 w-1.5 rounded-full bg-score-good" />
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-sf-border bg-sf-bg-3 px-2 py-0.5 text-[10px] font-semibold text-sf-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-sf-muted/60" />
      Not Connected
    </span>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

function Divider() {
  return <div className="my-4 h-px bg-sf-border" />;
}

// ── Main Settings tab ─────────────────────────────────────────────────────────

export default function Settings() {
  const { postMessage } = useVSCode();

  const copilotAvailable = useAIStore((s) => s.copilotAvailable);
  const copilotModelCount = useAIStore((s) => s.copilotModelCount);
  const claudeAuthorized = useAIStore((s) => s.claudeAuthorized);
  const claudeAuthError = useAIStore((s) => s.claudeAuthError);
  const claudeModelCount = useAIStore((s) => s.claudeModelCount);

  const anyProviderActive = copilotAvailable || claudeAuthorized;

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      {/* Page header */}
      <div>
        <h1 className="mb-1 text-base font-semibold text-sf-text">AI Provider Settings</h1>
        <p className="text-xs text-sf-muted">
          Connect an AI provider to enable the OrgPulse Advisory report and Ask Architect features.
          No org data, source code, or metadata leaves your machine without your consent.
        </p>
      </div>

      {/* Usage info banner */}
      <div className="flex items-center gap-3 rounded-lg border border-sf-accent/30 bg-sf-accent/5 px-4 py-2.5 text-xs">
        <span className="shrink-0 text-base text-sf-accent">ⓘ</span>
        <span className="leading-relaxed text-sf-muted">
          These providers power{' '}
          <NavLink to="/cta" className="text-sf-accent hover:underline">
            OrgPulse Advisory
          </NavLink>{' '}
          and{' '}
          <NavLink to="/askarchitect" className="text-sf-accent hover:underline">
            Ask Architect
          </NavLink>
          . When both are connected, Claude is preferred for richer output.
        </span>
      </div>

      {/* ── GitHub Copilot Card ── */}
      <GlassCard>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
              <span className="text-lg">🤖</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-sf-text">GitHub Copilot</p>
              <p className="text-[10px] text-sf-muted">via VS Code Language Model API</p>
            </div>
          </div>
          <StatusBadge connected={copilotAvailable} />
        </div>

        {copilotAvailable ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-score-good/20 bg-score-good/5 p-3">
              <span className="text-sm text-score-good">✓</span>
              <p className="text-xs text-sf-text-2">
                GitHub Copilot is active —{' '}
                <span className="font-medium text-sf-text">
                  {copilotModelCount} model{copilotModelCount !== 1 ? 's' : ''}
                </span>{' '}
                available (GPT-4o and others).
              </p>
            </div>
            <button
              type="button"
              onClick={() => postMessage({ command: 'getModels' })}
              className="rounded border border-sf-border px-3 py-1.5 text-xs text-sf-muted transition-colors hover:border-sf-accent/40 hover:text-sf-text"
            >
              Refresh Status
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-sf-muted">
              GitHub Copilot Chat is not detected. To enable it:
            </p>
            <ol className="space-y-1.5 text-xs text-sf-muted">
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-sf-border bg-sf-bg-3 text-[10px] font-semibold text-sf-text">
                  1
                </span>
                <span>
                  Install the <span className="font-medium text-sf-text">GitHub Copilot Chat</span>{' '}
                  extension from the VS Code Marketplace.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-sf-border bg-sf-bg-3 text-[10px] font-semibold text-sf-text">
                  2
                </span>
                <span>
                  Sign in with your GitHub account that has an active Copilot subscription.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-sf-border bg-sf-bg-3 text-[10px] font-semibold text-sf-text">
                  3
                </span>
                <span>
                  Click <span className="font-medium text-sf-text">Refresh Status</span> below to
                  confirm the connection.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => postMessage({ command: 'getModels' })}
              className="rounded border border-sf-border px-3 py-1.5 text-xs text-sf-muted transition-colors hover:border-sf-accent/40 hover:text-sf-text"
            >
              Refresh Status
            </button>
          </div>
        )}
      </GlassCard>

      {/* ── Claude (Anthropic) Card ── */}
      <GlassCard>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
              <span className="text-lg">✦</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-sf-text">Claude (Anthropic)</p>
              <p className="text-[10px] text-sf-muted">
                via Anthropic API key · stored in VS Code Secret Storage
              </p>
            </div>
          </div>
          <StatusBadge connected={claudeAuthorized} />
        </div>

        {claudeAuthorized ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-score-good/20 bg-score-good/5 p-3">
              <span className="text-sm text-score-good">✓</span>
              <p className="text-xs text-sf-text-2">
                Claude is connected —{' '}
                <span className="font-medium text-sf-text">
                  {claudeModelCount} model{claudeModelCount !== 1 ? 's' : ''}
                </span>{' '}
                available. Claude is preferred when both providers are active.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => postMessage({ command: 'authorizeClaude' })}
                className="rounded border border-sf-border px-3 py-1.5 text-xs text-sf-muted transition-colors hover:border-sf-accent/40 hover:text-sf-text"
              >
                Update API Key
              </button>
              <button
                type="button"
                onClick={() => postMessage({ command: 'disconnectClaude' })}
                className="rounded border border-sev-error/40 px-3 py-1.5 text-xs text-sev-error transition-colors hover:bg-sev-error/10"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {claudeAuthError && (
              <div className="flex items-start gap-2 rounded-lg border border-sev-error/20 bg-sev-error/5 p-3">
                <span className="shrink-0 text-sm text-sev-error">✗</span>
                <p className="text-xs leading-relaxed text-sev-error">{claudeAuthError}</p>
              </div>
            )}
            <p className="text-xs leading-relaxed text-sf-muted">
              Connect Claude using an Anthropic API key for the highest-quality architecture
              assessments. Your key is stored securely in VS Code Secret Storage and never leaves
              your machine.
            </p>
            <p className="text-[10px] text-sf-muted">
              Get a key at <span className="font-medium text-sf-accent">console.anthropic.com</span>{' '}
              → API Keys.
            </p>

            <Divider />

            <button
              type="button"
              onClick={() => postMessage({ command: 'authorizeClaude' })}
              className="flex items-center gap-2 rounded-lg bg-sf-accent px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              <span>🔑</span>
              Connect Claude
            </button>
          </div>
        )}
      </GlassCard>

      {/* ── No provider warning ── */}
      {!anyProviderActive && (
        <div className="flex items-start gap-3 rounded-lg border border-sev-warning/40 bg-sev-warning/5 p-4">
          <span className="shrink-0 text-base text-sev-warning">⚠</span>
          <div>
            <p className="mb-0.5 text-xs font-semibold text-sf-text">No AI provider connected</p>
            <p className="text-xs leading-relaxed text-sf-muted">
              OrgPulse Advisory and Ask Architect require at least one provider. Connect GitHub
              Copilot or Claude above to get started.
            </p>
          </div>
        </div>
      )}

      {/* ── Provider comparison ── */}
      <GlassCard title="Provider Comparison">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="font-medium text-sf-muted" />
          <div className="text-center">
            <p className="mb-0.5 font-semibold text-sf-text">GitHub Copilot</p>
            <p className="text-[10px] text-sf-muted">GPT-4o</p>
          </div>
          <div className="text-center">
            <p className="mb-0.5 font-semibold text-sf-text">Claude</p>
            <p className="text-[10px] text-sf-muted">Opus / Sonnet</p>
          </div>

          {[
            ['OrgPulse Advisory', '✓', '✓ Preferred'],
            ['Ask Architect', '✓', '✓ Preferred'],
            ['Issue Explanations', '✓', '✓'],
            ['Setup required', 'GitHub subscription', 'Anthropic API key'],
            ['Data privacy', 'Copilot policy', 'Anthropic policy'],
          ].map(([label, copilot, claude]) => (
            <div key={label} className="contents">
              <div className="border-t border-sf-border/50 py-2 text-sf-muted">{label}</div>
              <div className="border-t border-sf-border/50 py-2 text-center text-sf-text-2">
                {copilot}
              </div>
              <div className="border-t border-sf-border/50 py-2 text-center font-medium text-sf-accent">
                {claude}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
