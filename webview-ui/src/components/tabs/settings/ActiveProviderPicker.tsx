import { useEffect, useRef, useState } from 'react';
import { useAIStore, type AIModel } from '@/store/slices/aiStore';
import { useVSCode } from '@/hooks/useVSCode';
import GlassCard from '@/components/common/GlassCard';
import Tooltip from '@/components/common/Tooltip';
import { cn } from '@/lib/cn';

type ProviderId = 'copilot' | 'claude' | 'openai' | 'gemini' | 'custom';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'claude', label: 'Claude (Anthropic)' },
  { id: 'openai', label: 'ChatGPT (OpenAI)' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'custom', label: 'Custom Endpoint' },
];

/** Infer which provider a persisted preferredModel selector belongs to. */
function providerForSelector(selector: string): ProviderId | null {
  if (selector.startsWith('anthropic:')) { return 'claude'; }
  if (selector.startsWith('openai:')) { return 'openai'; }
  if (selector.startsWith('gemini:')) { return 'gemini'; }
  if (selector.startsWith('custom:')) { return 'custom'; }
  if (selector.includes('/')) { return 'copilot'; } // '<vendor>/<family>' — today always Copilot
  return null; // 'auto' or unrecognized
}

/** Scope the combined model list down to just one provider's bucket — never mix providers together. */
function modelsForProvider(models: AIModel[], provider: ProviderId): AIModel[] {
  if (provider === 'claude') { return models.filter((m) => m.backend === 'anthropic'); }
  if (provider === 'openai') { return models.filter((m) => m.backend === 'openai'); }
  if (provider === 'gemini') { return models.filter((m) => m.backend === 'gemini'); }
  if (provider === 'custom') { return models.filter((m) => m.backend === 'custom'); }
  return models.filter((m) => m.backend === 'vscode-lm');
}

/**
 * Lets the user pick exactly one active AI provider + model to drive every AI callout
 * (CTA Review, Future Readiness, Ask the Architect) — persisted to
 * sfHealthAnalyzer.ai.preferredModel via the 'setPreferredModel' message.
 */
export default function ActiveProviderPicker() {
  const { postMessage } = useVSCode();
  const availableModels = useAIStore((s) => s.availableModels);
  const copilotAvailable = useAIStore((s) => s.copilotAvailable);
  const claudeAuthorized = useAIStore((s) => s.claudeAuthorized);
  const openaiAuthorized = useAIStore((s) => s.openaiAuthorized);
  const geminiAuthorized = useAIStore((s) => s.geminiAuthorized);
  const preferredModelId = useAIStore((s) => s.preferredModelId);
  const setPreferredModelId = useAIStore((s) => s.setPreferredModelId);

  const customConnected = availableModels.some((m) => m.backend === 'custom');
  const connected: Record<ProviderId, boolean> = {
    copilot: copilotAvailable,
    claude: claudeAuthorized,
    openai: openaiAuthorized,
    gemini: geminiAuthorized,
    custom: customConnected,
  };
  const noProviderConnected = !copilotAvailable && !claudeAuthorized && !openaiAuthorized && !geminiAuthorized && !customConnected;

  const [active, setActive] = useState<ProviderId | null>(null);
  const initialized = useRef(false);

  // Visually pre-select based on the currently persisted selector (or, failing that,
  // whichever provider is connected) — read-only inference, runs once, never itself
  // writes back to preferredModel just because Settings was opened.
  useEffect(() => {
    if (initialized.current) { return; }
    const inferred = providerForSelector(preferredModelId)
      ?? (claudeAuthorized ? 'claude' : openaiAuthorized ? 'openai' : geminiAuthorized ? 'gemini' : copilotAvailable ? 'copilot' : customConnected ? 'custom' : null);
    if (inferred) {
      setActive(inferred);
      initialized.current = true;
    }
  }, [preferredModelId, claudeAuthorized, openaiAuthorized, geminiAuthorized, copilotAvailable, customConnected]);

  const scopedModels = active ? modelsForProvider(availableModels, active) : [];
  const selectedModelId = scopedModels.find((m) => m.id === preferredModelId)?.id ?? scopedModels[0]?.id ?? '';

  function applySelection(modelId: string, label?: string) {
    setPreferredModelId(modelId);
    postMessage({ command: 'setPreferredModel', data: { modelId, label } });
  }

  function selectProvider(provider: ProviderId) {
    if (!connected[provider]) { return; }
    setActive(provider);
    const models = modelsForProvider(availableModels, provider);
    if (models.length > 0) { applySelection(models[0].id, models[0].label); }
  }

  const activeLabel = noProviderConnected
    ? 'No AI provider connected'
    : availableModels.find((m) => m.id === preferredModelId)?.label
      ?? (preferredModelId === 'auto' ? 'Auto (best available)' : preferredModelId);

  return (
    <GlassCard title="Active AI Provider">
      <div className="mb-3 rounded-lg border border-sf-accent/30 bg-sf-accent/5 px-3 py-2 text-xs">
        <span className="text-sf-muted">Currently active for all AI callouts: </span>
        <span className="font-semibold text-sf-text">{activeLabel}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {PROVIDERS.map(({ id, label }) => {
          const isConnected = connected[id];
          const isActive = active === id;
          const button = (
            <button
              key={id}
              type="button"
              disabled={!isConnected}
              onClick={() => selectProvider(id)}
              className={cn(
                'px-3 py-1.5 rounded-full border text-xs font-medium transition-colors',
                !isConnected
                  ? 'bg-sf-bg-2 border-sf-border text-sf-muted/50 cursor-not-allowed'
                  : isActive
                    ? 'bg-sf-accent/15 border-sf-accent/30 text-sf-accent'
                    : 'bg-sf-bg-2 border-sf-border text-sf-muted hover:text-sf-text'
              )}
            >
              {label}
            </button>
          );
          return isConnected ? button : (
            <Tooltip key={id} content={`Connect ${label} above to select it`}>
              {button}
            </Tooltip>
          );
        })}
      </div>

      {active && (
        <select
          value={selectedModelId}
          onChange={(e) => {
            const model = scopedModels.find((m) => m.id === e.target.value);
            applySelection(e.target.value, model?.label);
          }}
          className="w-full rounded-lg border border-sf-border bg-sf-bg-2 px-2.5 py-1.5 text-xs text-sf-text focus:border-sf-accent/50 focus:outline-none"
        >
          {scopedModels.length === 0 && <option value="">No models discovered yet</option>}
          {scopedModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      )}
    </GlassCard>
  );
}
