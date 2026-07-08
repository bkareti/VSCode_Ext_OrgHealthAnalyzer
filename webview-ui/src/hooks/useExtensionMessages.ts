import { useEffect } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { useAIStore } from '@/store/slices/aiStore';
import { useCTAStore } from '@/store/slices/ctaStore';
import { useFutureReadinessStore } from '@/store/slices/futureReadinessStore';
import { useLicenseRecommendationsStore } from '@/store/slices/licenseRecommendationsStore';
import { useOrgInfoRecommendationsStore } from '@/store/slices/orgInfoRecommendationsStore';
import { useArchitectPromptsStore, type ArchitectPromptScope } from '@/store/slices/architectPromptsStore';
import { vscodeApi } from '@/hooks/useVSCode';
import type { AnalysisResult, CTAReview, FutureReadinessReport, LicenseRecommendationsReport, OrgInfoRecommendationsReport, ScanHistoryEntry } from '@/types';
import type { ProgressData } from '@/store/slices/orgStore';
import type { AIModel, AIExplanationData } from '@/store/slices/aiStore';

// ── Inbound messages (extension → webview) ────────────────────────────────
type InboundMessage =
  | { type: 'analysisResults'; data: AnalysisResult }
  | { type: 'orgHistory'; data: Record<string, ScanHistoryEntry[]> }
  | { type: 'availableModels'; data: AIModel[] }
  | { type: 'claudeAuthStatus'; authorized: boolean; count?: number; error?: string }
  | { type: 'openaiAuthStatus'; authorized: boolean; count?: number; error?: string }
  | { type: 'geminiAuthStatus'; authorized: boolean; count?: number; error?: string }
  | { type: 'copilotStatus'; available: boolean; count: number }
  | { type: 'preferredModel'; data: string }
  | { type: 'analysisProgress'; step: number; label: string; meta?: Record<string, unknown> }
  | { type: 'loading'; data: boolean; step?: number }
  | { type: 'aiExplanationLoading'; data: boolean }
  | { type: 'aiExplanation'; data: AIExplanationData; error?: string }
  | { type: 'aiPdfSummary'; data: string | null }
  | { type: 'ctaReviewLoading' }
  | { type: 'ctaReview'; data: CTAReview }
  | { type: 'ctaReviewError'; message: string }
  | { type: 'architectAnswerLoading'; data: boolean }
  | { type: 'architectAnswerProgress'; data: string }
  | { type: 'architectAnswer'; data: string; error?: string }
  | { type: 'futureReadinessLoading' }
  | { type: 'futureReadiness'; data: FutureReadinessReport }
  | { type: 'futureReadinessError'; message: string }
  | { type: 'licenseRecommendationsLoading' }
  | { type: 'licenseRecommendations'; data: LicenseRecommendationsReport }
  | { type: 'licenseRecommendationsError'; message: string }
  | { type: 'orgInfoRecommendationsLoading' }
  | { type: 'orgInfoRecommendations'; data: OrgInfoRecommendationsReport }
  | { type: 'orgInfoRecommendationsError'; message: string }
  | { type: 'architectPrompts'; data: { scopes: ArchitectPromptScope[]; overrides: Record<string, string> } };

export function useExtensionMessages() {
  const setResults     = useOrgStore((s) => s.setResults);
  const setLoading     = useOrgStore((s) => s.setLoading);
  const setProgress    = useOrgStore((s) => s.setProgress);
  const setOrgHistory  = useOrgStore((s) => s.setOrgHistory);

  const setModels           = useAIStore((s) => s.setModels);
  const setClaudeAuth       = useAIStore((s) => s.setClaudeAuth);
  const setOpenAIAuth       = useAIStore((s) => s.setOpenAIAuth);
  const setGeminiAuth       = useAIStore((s) => s.setGeminiAuth);
  const setCopilotStatus    = useAIStore((s) => s.setCopilotStatus);
  const setPreferredModelId = useAIStore((s) => s.setPreferredModelId);
  const setAIExplanation    = useAIStore((s) => s.setAIExplanation);
  const setArchitectAnswer  = useAIStore((s) => s.setArchitectAnswer);
  const setArchitectAnswerProgress = useAIStore((s) => s.setArchitectAnswerProgress);

  const setCTALoading = useCTAStore((s) => s.setCTALoading);
  const setCTAReview  = useCTAStore((s) => s.setCTAReview);
  const setCTAError   = useCTAStore((s) => s.setCTAError);

  const setFRReport  = useFutureReadinessStore((s) => s.setReport);
  const setFRLoading = useFutureReadinessStore((s) => s.setLoading);
  const setFRError   = useFutureReadinessStore((s) => s.setError);

  const setLRReport  = useLicenseRecommendationsStore((s) => s.setReport);
  const setLRLoading = useLicenseRecommendationsStore((s) => s.setLoading);
  const setLRError   = useLicenseRecommendationsStore((s) => s.setError);

  const setOIRReport  = useOrgInfoRecommendationsStore((s) => s.setReport);
  const setOIRLoading = useOrgInfoRecommendationsStore((s) => s.setLoading);
  const setOIRError   = useOrgInfoRecommendationsStore((s) => s.setError);

  const setArchitectPrompts = useArchitectPromptsStore((s) => s.setPrompts);

  useEffect(() => {
    const handler = (event: MessageEvent<InboundMessage>) => {
      const msg = event.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case 'analysisResults':
          setResults(msg.data);
          // Seed the readiness slice from the deterministic result computed during analysis.
          if (msg.data.futureReadiness) { setFRReport(msg.data.futureReadiness); }
          if (msg.data.licenseRecommendations) { setLRReport(msg.data.licenseRecommendations); }
          if (msg.data.orgInfoRecommendations) { setOIRReport(msg.data.orgInfoRecommendations); }
          break;

        case 'orgHistory':
          setOrgHistory(msg.data);
          break;

        case 'availableModels':
          setModels(msg.data);
          break;

        case 'claudeAuthStatus':
          setClaudeAuth(msg.authorized, msg.count, msg.error);
          break;

        case 'openaiAuthStatus':
          setOpenAIAuth(msg.authorized, msg.count, msg.error);
          break;

        case 'geminiAuthStatus':
          setGeminiAuth(msg.authorized, msg.count, msg.error);
          break;

        case 'copilotStatus':
          setCopilotStatus(msg.available, msg.count);
          break;

        case 'preferredModel':
          setPreferredModelId(msg.data);
          break;

        case 'analysisProgress': {
          const progress: ProgressData = { step: msg.step, label: msg.label, meta: msg.meta };
          setProgress(progress);
          break;
        }

        case 'loading':
          setLoading(msg.data, msg.step);
          break;

        case 'aiExplanationLoading':
          setAIExplanation(null, msg.data);
          break;

        case 'aiExplanation':
          setAIExplanation(msg.error ? { error: msg.error } : msg.data, false);
          break;

        case 'ctaReviewLoading':
          setCTALoading(true);
          break;

        case 'ctaReview':
          setCTAReview(msg.data);
          break;

        case 'ctaReviewError':
          setCTAError(msg.message);
          break;

        case 'architectAnswerLoading':
          setArchitectAnswer(null, msg.data);
          break;

        case 'architectAnswerProgress':
          setArchitectAnswerProgress(msg.data);
          break;

        case 'architectAnswer':
          setArchitectAnswer(msg.error ? `Error: ${msg.error}` : msg.data, false);
          break;

        case 'futureReadinessLoading':
          setFRLoading(true);
          break;

        case 'futureReadiness':
          setFRReport(msg.data);
          break;

        case 'futureReadinessError':
          setFRError(msg.message);
          break;

        case 'licenseRecommendationsLoading':
          setLRLoading(true);
          break;

        case 'licenseRecommendations':
          setLRReport(msg.data);
          break;

        case 'licenseRecommendationsError':
          setLRError(msg.message);
          break;

        case 'orgInfoRecommendationsLoading':
          setOIRLoading(true);
          break;

        case 'orgInfoRecommendations':
          setOIRReport(msg.data);
          break;

        case 'orgInfoRecommendationsError':
          setOIRError(msg.message);
          break;

        case 'architectPrompts':
          setArchitectPrompts(msg.data.scopes, msg.data.overrides);
          break;

        // aiPdfSummary handled directly in PDFConsentDialog if needed
      }
    };

    window.addEventListener('message', handler);
    vscodeApi.postMessage({ command: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [
    setResults, setLoading, setProgress, setOrgHistory,
    setModels, setClaudeAuth, setOpenAIAuth, setGeminiAuth, setCopilotStatus, setPreferredModelId, setAIExplanation, setArchitectAnswer,
    setCTALoading, setCTAReview, setCTAError,
    setFRReport, setFRLoading, setFRError,
    setLRReport, setLRLoading, setLRError,
    setOIRReport, setOIRLoading, setOIRError,
    setArchitectPrompts,
  ]);
}
