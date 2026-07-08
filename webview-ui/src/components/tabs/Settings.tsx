import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAIStore } from '@/store/slices/aiStore';
import { useArchitectPromptsStore } from '@/store/slices/architectPromptsStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';
import SegmentedTabs from '@/components/common/SegmentedTabs';
import ActiveProviderPicker from './settings/ActiveProviderPicker';
import ProviderCard from './settings/ProviderCard';
import ApiKeyProviderBody from './settings/ApiKeyProviderBody';

/** Scopes with a live AI call wired to their custom prompt today; the rest are stored for the planned multi-tab rollout. */
const WIRED_SCOPES = new Set(['futurereadiness', 'cta']);

// ── Main Settings tab ─────────────────────────────────────────────────────────

type SettingsTab = 'providers' | 'prompts';

export default function Settings() {
  const { postMessage } = useVSCode();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('providers');

  const copilotAvailable = useAIStore((s) => s.copilotAvailable);
  const copilotModelCount = useAIStore((s) => s.copilotModelCount);
  const claudeAuthorized = useAIStore((s) => s.claudeAuthorized);
  const claudeAuthError = useAIStore((s) => s.claudeAuthError);
  const claudeModelCount = useAIStore((s) => s.claudeModelCount);
  const openaiAuthorized = useAIStore((s) => s.openaiAuthorized);
  const openaiAuthError = useAIStore((s) => s.openaiAuthError);
  const openaiModelCount = useAIStore((s) => s.openaiModelCount);
  const geminiAuthorized = useAIStore((s) => s.geminiAuthorized);
  const geminiAuthError = useAIStore((s) => s.geminiAuthError);
  const geminiModelCount = useAIStore((s) => s.geminiModelCount);

  const anyProviderActive = copilotAvailable || claudeAuthorized || openaiAuthorized || geminiAuthorized;

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div>
        <h1 className="mb-1 text-base font-semibold text-sf-text">Settings</h1>
        <p className="text-xs text-sf-muted">
          Connect an AI provider and customize how OrgPulse prompts it for each tab's Architect
          Recommendations. No org data, source code, or metadata leaves your machine without your
          consent.
        </p>
      </div>

      <SegmentedTabs
        items={[
          { id: 'providers', label: 'AI Providers' },
          { id: 'prompts', label: 'Recommendation Prompts' },
        ]}
        active={settingsTab}
        onChange={setSettingsTab}
      />

      {settingsTab === 'prompts' && <RecommendationPromptsPane />}

      {settingsTab === 'providers' && (
      <>
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
          . Choose which one is active in "Active AI Provider" below.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ── GitHub Copilot Card ── */}
        <ProviderCard
          icon="🤖"
          iconBg="bg-blue-500/15"
          name="GitHub Copilot"
          description="via VS Code Language Model API"
          connected={copilotAvailable}
        >
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
        </ProviderCard>

        {/* ── Claude (Anthropic) Card ── */}
        <ProviderCard
          icon="✦"
          iconBg="bg-orange-500/15"
          name="Claude (Anthropic)"
          description="via Anthropic API key · Secret Storage"
          connected={claudeAuthorized}
        >
          <ApiKeyProviderBody
            providerName="Claude"
            authorized={claudeAuthorized}
            authError={claudeAuthError}
            modelCount={claudeModelCount}
            description="Connect Claude using an Anthropic API key for the highest-quality architecture assessments. Your key is stored securely in VS Code Secret Storage and never leaves your machine."
            getKeyLabel="console.anthropic.com → API Keys"
            authorizeCommand="authorizeClaude"
            disconnectCommand="disconnectClaude"
          />
        </ProviderCard>

        {/* ── ChatGPT (OpenAI) Card ── */}
        <ProviderCard
          icon="✨"
          iconBg="bg-emerald-500/15"
          name="ChatGPT (OpenAI)"
          description="via OpenAI API key · Secret Storage"
          connected={openaiAuthorized}
        >
          <ApiKeyProviderBody
            providerName="ChatGPT"
            authorized={openaiAuthorized}
            authError={openaiAuthError}
            modelCount={openaiModelCount}
            description="Connect ChatGPT using an OpenAI API key. Your key is stored securely in VS Code Secret Storage and never leaves your machine."
            getKeyLabel="platform.openai.com → API Keys"
            authorizeCommand="authorizeOpenAI"
            disconnectCommand="disconnectOpenAI"
          />
        </ProviderCard>

        {/* ── Gemini Card ── */}
        <ProviderCard
          icon="◆"
          iconBg="bg-sky-500/15"
          name="Gemini"
          description="via Google AI API key · Secret Storage"
          connected={geminiAuthorized}
        >
          <ApiKeyProviderBody
            providerName="Gemini"
            authorized={geminiAuthorized}
            authError={geminiAuthError}
            modelCount={geminiModelCount}
            description="Connect Gemini using a Google AI API key. Your key is stored securely in VS Code Secret Storage and never leaves your machine."
            getKeyLabel="aistudio.google.com/apikey"
            authorizeCommand="authorizeGemini"
            disconnectCommand="disconnectGemini"
          />
        </ProviderCard>
      </div>

      <ActiveProviderPicker />

      {/* ── No provider warning ── */}
      {!anyProviderActive && (
        <div className="flex items-start gap-3 rounded-lg border border-sev-warning/40 bg-sev-warning/5 p-4">
          <span className="shrink-0 text-base text-sev-warning">⚠</span>
          <div>
            <p className="mb-0.5 text-xs font-semibold text-sf-text">No AI provider connected</p>
            <p className="text-xs leading-relaxed text-sf-muted">
              OrgPulse Advisory and Ask Architect require at least one provider. Connect one of the
              providers above to get started.
            </p>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

// ── Recommendation Prompts pane ────────────────────────────────────────────────
// Lets an admin customize the guidance sent to the AI for each tab's Architect
// Recommendations. Stored in .orgpulse/architectPrompts.json via getArchitectPrompts /
// saveArchitectPrompt (src/services/architectPrompts.ts). Only 'futurereadiness' and 'cta'
// affect a live AI call today — the rest are stored for the planned multi-tab rollout.

function RecommendationPromptsPane() {
  const { postMessage } = useVSCode();
  const scopes = useArchitectPromptsStore((s) => s.scopes);
  const overrides = useArchitectPromptsStore((s) => s.overrides);
  const loaded = useArchitectPromptsStore((s) => s.loaded);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    postMessage({ command: 'getArchitectPrompts' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!savedFlash) { return; }
    const t = setTimeout(() => setSavedFlash(null), 2000);
    return () => clearTimeout(t);
  }, [savedFlash]);

  if (!loaded) {
    return (
      <GlassCard>
        <p className="text-xs text-sf-muted">Loading recommendation prompts…</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-sf-muted">
        Add guidance here to steer the Architect Recommendations AI generates for a tab — it's
        appended to that tab's built-in prompt, not a replacement for it. Leave blank to use the
        default shown below.
      </p>
      {scopes.map((scope) => {
        const currentValue = drafts[scope.id] ?? overrides[scope.id] ?? '';
        const isCustomized = !!overrides[scope.id];
        const isDirty = drafts[scope.id] !== undefined && drafts[scope.id] !== (overrides[scope.id] ?? '');
        const isWired = WIRED_SCOPES.has(scope.id);

        return (
          <GlassCard key={scope.id}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-sf-text">{scope.label}</p>
                {isCustomized && (
                  <span className="rounded-full bg-sf-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sf-accent">
                    Customized
                  </span>
                )}
                {!isWired && (
                  <span className="rounded-full bg-sf-bg-3 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sf-muted">
                    Coming soon
                  </span>
                )}
              </div>
            </div>
            <p className="mb-2 text-[10px] text-sf-muted">Default: {scope.defaultPrompt}</p>
            <textarea
              value={currentValue}
              onChange={(e) => setDrafts((d) => ({ ...d, [scope.id]: e.target.value }))}
              placeholder="Add custom guidance for this tab (optional)…"
              rows={3}
              className="w-full resize-y rounded-lg border border-sf-border bg-sf-bg-2 p-2.5 text-xs text-sf-text placeholder:text-sf-muted/60 focus:border-sf-accent/50 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={!isDirty}
                onClick={() => {
                  postMessage({ command: 'saveArchitectPrompt', data: { scopeId: scope.id, text: currentValue } });
                  setSavedFlash(scope.id);
                }}
                className="rounded bg-sf-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Save
              </button>
              {isCustomized && (
                <button
                  type="button"
                  onClick={() => {
                    postMessage({ command: 'saveArchitectPrompt', data: { scopeId: scope.id, text: '' } });
                    setDrafts((d) => ({ ...d, [scope.id]: '' }));
                    setSavedFlash(scope.id);
                  }}
                  className="rounded border border-sf-border px-3 py-1.5 text-xs text-sf-muted transition-colors hover:border-sev-error/40 hover:text-sev-error"
                >
                  Reset to default
                </button>
              )}
              {savedFlash === scope.id && <span className="text-[10px] text-score-good">Saved</span>}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
