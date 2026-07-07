import { useEffect } from 'react';
import { useOrgStore } from '@/store/slices/orgStore';
import { useAIStore } from '@/store/slices/aiStore';
import { useCTAStore } from '@/store/slices/ctaStore';
import { useFutureReadinessStore } from '@/store/slices/futureReadinessStore';
import { vscodeApi } from '@/hooks/useVSCode';
import type { AnalysisResult, CTAReview, FutureReadinessReport, ScanHistoryEntry } from '@/types';
import type { ProgressData } from '@/store/slices/orgStore';
import type { AIModel, AIExplanationData } from '@/store/slices/aiStore';

// ── Inbound messages (extension → webview) ────────────────────────────────
type InboundMessage =
  | { type: 'analysisResults'; data: AnalysisResult }
  | { type: 'orgHistory'; data: Record<string, ScanHistoryEntry[]> }
  | { type: 'availableModels'; data: AIModel[] }
  | { type: 'claudeAuthStatus'; authorized: boolean; count?: number; error?: string }
  | { type: 'copilotStatus'; available: boolean; count: number }
  | { type: 'analysisProgress'; step: number; label: string; meta?: Record<string, unknown> }
  | { type: 'loading'; data: boolean; step?: number }
  | { type: 'aiExplanationLoading'; data: boolean }
  | { type: 'aiExplanation'; data: AIExplanationData; error?: string }
  | { type: 'aiPdfSummary'; data: string | null }
  | { type: 'ctaReviewLoading' }
  | { type: 'ctaReview'; data: CTAReview }
  | { type: 'ctaReviewError'; message: string }
  | { type: 'architectAnswerLoading'; data: boolean }
  | { type: 'architectAnswer'; data: string; error?: string }
  | { type: 'futureReadinessLoading' }
  | { type: 'futureReadiness'; data: FutureReadinessReport }
  | { type: 'futureReadinessError'; message: string };

export function useExtensionMessages() {
  const setResults     = useOrgStore((s) => s.setResults);
  const setLoading     = useOrgStore((s) => s.setLoading);
  const setProgress    = useOrgStore((s) => s.setProgress);
  const setOrgHistory  = useOrgStore((s) => s.setOrgHistory);

  const setModels          = useAIStore((s) => s.setModels);
  const setClaudeAuth      = useAIStore((s) => s.setClaudeAuth);
  const setCopilotStatus   = useAIStore((s) => s.setCopilotStatus);
  const setAIExplanation   = useAIStore((s) => s.setAIExplanation);
  const setArchitectAnswer = useAIStore((s) => s.setArchitectAnswer);

  const setCTALoading = useCTAStore((s) => s.setCTALoading);
  const setCTAReview  = useCTAStore((s) => s.setCTAReview);
  const setCTAError   = useCTAStore((s) => s.setCTAError);

  const setFRReport  = useFutureReadinessStore((s) => s.setReport);
  const setFRLoading = useFutureReadinessStore((s) => s.setLoading);
  const setFRError   = useFutureReadinessStore((s) => s.setError);

  useEffect(() => {
    const handler = (event: MessageEvent<InboundMessage>) => {
      const msg = event.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case 'analysisResults':
          setResults(msg.data);
          // Seed the readiness slice from the deterministic result computed during analysis.
          if (msg.data.futureReadiness) { setFRReport(msg.data.futureReadiness); }
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

        case 'copilotStatus':
          setCopilotStatus(msg.available, msg.count);
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

        // aiPdfSummary handled directly in PDFConsentDialog if needed
      }
    };

    window.addEventListener('message', handler);
    vscodeApi.postMessage({ command: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [
    setResults, setLoading, setProgress, setOrgHistory,
    setModels, setClaudeAuth, setAIExplanation, setArchitectAnswer,
    setCTALoading, setCTAReview, setCTAError,
    setFRReport, setFRLoading, setFRError,
  ]);
}
